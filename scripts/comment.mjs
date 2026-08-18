/**
 * Write a COMMENT into the work feed — the channel that runs the other way.
 *
 * `post.mjs` is agents talking to the human. This is the human talking back,
 * into the same append-only file, so there is one stream and one ordering rather
 * than a feed plus a side-channel nobody reads.
 *
 * A comment differs from a post in three deliberate ways:
 *
 *   1. It is ADDRESSED. `@name` in the text (or --to) names who it is for;
 *      with no addressee it goes to everyone. `inbox.mjs` uses `to` to tell each
 *      agent "this one is yours, act on it" from "this one is somebody else's,
 *      read it and stay out of the way" — which is the whole point. A broadcast
 *      that every agent treats as an instruction is worse than no channel.
 *   2. It needs NO IMAGE. The image rule exists to stop agents filing text-only
 *      status pings; a human directive is not a status ping, and demanding a
 *      screenshot before you can say "stop, wrong building" would kill the
 *      channel on its first use.
 *   3. It is capped far higher (MAX_CHARS). The 250-character cap on posts makes
 *      an author lead with the finding instead of narrating; an instruction
 *      sometimes has to include the reasoning, and truncating it produces an
 *      agent that does half of what was asked.
 *
 * Delivery is NOT this file's job. It appends and exits; `inbox.mjs`, wired as a
 * PostToolUse hook, is what puts the comment in front of a running agent within
 * one tool call. Writing here and reading there are deliberately separate so a
 * comment survives an agent that is not running yet.
 *
 * THIS CHANNEL BELONGS TO THE HUMAN. An orchestrator relaying an instruction
 * talks to the agent DIRECTLY and then reports what it did in the feed with
 * `post.mjs`, under its own name. It does not write comments. The first version
 * of this told orchestrators to "relay the comment", and since the only relay
 * documented was this file, they wrote to builders under the human's name —
 * agents then received a paraphrase as `[FOR YOU] Human:` and could not tell it
 * from an order. Hence: `--author` is required, and every record carries `via`.
 *
 * Usage:
 *   node scripts/comment.mjs --author "Human" --text "@roof_deck The loft is overexposed; halve it"
 *   node scripts/comment.mjs --to roof_deck,neon --text "..." [--re <post id>] [--author "Who"]
 */

import { appendFileSync, existsSync, mkdirSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";


/**
 * The project root: the nearest directory at or above `from` holding a
 * package.json or a .git. The feed path is relative, and resolving it against
 * whatever directory the command happened to run in wrote the post to a shadow
 * feed under that subdirectory — reported as posted, exit 0, read by nobody.
 * Returns null when there is no marker above `from`, so the caller can decide:
 * a path handed in from outside may simply be wrong, and walking from a wrong
 * place must not look like walking from the right one.
 */
function projectRoot(from = process.cwd()) {
  let dir = path.resolve(from);
  for (;;) {
    if (existsSync(path.join(dir, "package.json")) || existsSync(path.join(dir, ".git"))) return dir;
    const up = path.dirname(dir);
    if (up === dir) return null;
    dir = up;
  }
}

const ROOT = projectRoot() ?? process.cwd();
const FEED = process.env.FEED_FILE ?? path.join(ROOT, "tmp/dashboard/feed.jsonl");

/** Ten times the post cap. An instruction may carry its reasoning; a post may not. */
const MAX_CHARS = 2000;

/**
 * Addressee tokens that mean "everybody", in both languages the feed is read in.
 * The Russian ones are here because they were typed at it: `@всем не трогайте
 * Content/Materials` has to broadcast. Drop them and that comment addresses a
 * literal agent named "всем", reaches nobody, and is delivered to everyone else
 * as context they must not act on — silently, which is the exact failure this
 * channel exists to prevent.
 */
const EVERYONE = new Set(["all", "everyone", "все", "всем", "всех"]);

/**
 * Comparison form for an addressee. Authors are written for humans ("Builder:
 * roof_deck", "roof-deck", "Roof Deck") and addressed in a hurry ("@roofdeck"),
 * so both sides collapse to letters and digits before they are compared and a
 * substring counts as a hit. Deliberately forgiving: a comment delivered to one
 * agent too many is a distraction, one delivered to nobody is a lost
 * instruction, and those two costs are not close.
 */
export function normalizeName(s) {
  return String(s ?? "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, "");
}

/**
 * Substring matching is only safe once a name is long enough to be meaningful.
 * Without a floor, an agent posting as "P" matches "probe_agent", "pcg_pass"
 * and everything else with a p in it — and it matches as `[FOR YOU]`, so the wrong
 * agent is handed the instruction. Four characters is short enough for "neon"
 * and long enough that a collision has to be earned.
 */
const MIN_PARTIAL = 4;

/** True when a comment addressed to `to` is meant for the agent posting as `author`. */
export function addressedTo(to, author) {
  if (!Array.isArray(to) || to.length === 0) return true;
  if (to.some((t) => EVERYONE.has(String(t).toLowerCase()))) return true;
  const me = normalizeName(author);
  if (!me) return false;
  return to.some((t) => {
    const them = normalizeName(t);
    if (!them) return false;
    if (them === me) return true;
    const shorter = Math.min(them.length, me.length);
    return shorter >= MIN_PARTIAL && (me.includes(them) || them.includes(me));
  });
}

/** `@name` anywhere in the body. The mention stays in the text — it is how the reader sees who it is for. */
export function mentionsIn(text) {
  return [...String(text).matchAll(/@([\p{L}\p{N}][\p{L}\p{N}_.\-]*)/gu)].map((m) => m[1]);
}

/**
 * Append one comment. Returns the written record.
 * Throws with a human-readable message on anything the caller got wrong — the
 * CLI prints it, the dev-server endpoint returns it as the response body.
 */
export function writeComment({ author, text, to, re, via = "cli", feedFile = FEED } = {}) {
  const body = String(text ?? "").trim();
  if (!body) throw new Error("a comment needs --text");
  const who = String(author ?? "").trim();
  if (!who) {
    // No default, deliberately. This used to fall back to "Human", and the
    // consequence was not cosmetic: an orchestrator relaying an instruction
    // wrote it under the human's name, agents received it as `[FOR YOU] Human:`,
    // and there was no way — for them or for the human reading the feed — to
    // tell an order from the human apart from an agent's paraphrase of one.
    throw new Error(
      'a comment needs --author. Post under your own name; never under the human\'s.\n' +
        'If you are relaying an instruction, say so in the text: --author "Orchestrator" --text "@builder from the human: ..."',
    );
  }
  if (body.length > MAX_CHARS) {
    throw new Error(`comment is ${body.length} characters; the limit is ${MAX_CHARS}`);
  }

  const explicit = (Array.isArray(to) ? to : String(to ?? "").split(","))
    .map((t) => String(t).trim())
    .filter(Boolean);
  const named = [...explicit, ...mentionsIn(body)];

  // Deduplicated by comparison form, but STORED as written, so the dashboard can
  // show the addressee the way the human typed it.
  const seen = new Set();
  const addressees = [];
  for (const name of named) {
    const key = normalizeName(name);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    addressees.push(name);
  }
  const everyone = addressees.length === 0 || addressees.some((n) => EVERYONE.has(n.toLowerCase()));

  const record = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    at: new Date().toISOString(),
    author: who,
    kind: "comment",
    text: body,
    to: everyone ? ["all"] : addressees,
    // Where it was written. `ui` can only be set by the dev server's endpoint,
    // so it is the mark of the human's own dashboard; anything else is a
    // command line, which in this repo means an agent. A convention, not
    // authentication — but it is the difference between an order and a
    // paraphrase of one, and the reader has to be able to see which.
    via: via === "ui" ? "ui" : "cli",
    ...(re ? { re: String(re) } : {}),
  };

  mkdirSync(path.dirname(feedFile), { recursive: true });
  appendFileSync(feedFile, JSON.stringify(record) + "\n");
  return record;
}

// ---- CLI -----------------------------------------------------------------
// Only when run directly: the dev server imports writeComment from this file,
// and an import must not parse argv or exit the process.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const arg = (name) => {
    const i = process.argv.indexOf(`--${name}`);
    return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : undefined;
  };

  try {
    const record = writeComment({
      author: arg("author"),
      text: arg("text"),
      to: arg("to"),
      re: arg("re"),
    });
    const who = record.to.includes("all") ? "everyone" : record.to.map((t) => `@${t}`).join(", ");
    console.log(`commented → ${who}: ${record.text.slice(0, 70)}${record.text.length > 70 ? "…" : ""}`);
  } catch (err) {
    console.error(String(err.message ?? err));
    console.error(
      '\nusage: node scripts/comment.mjs --author "Who" --text "@who what to change" [--to a,b] [--re <post id>]',
    );
    process.exit(1);
  }
}
