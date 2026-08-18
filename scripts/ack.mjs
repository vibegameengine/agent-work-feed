/**
 * Acknowledge a comment. The receipt, not the answer.
 *
 * The problem this fixes is the one the whole channel was built to fix, one
 * level down: the human writes "@roof_deck the loft is blown out", and then
 * stares at a feed that looks exactly as it did before. They cannot tell
 * whether the agent got it, whether the agent is running at all, or whether the
 * hook silently dropped it. The work will show up eventually — minutes later,
 * as a post — and until then the only honest reading of the screen is "nothing
 * happened". That is the state that gets a run killed.
 *
 * So an ack is deliberately the cheapest thing an agent can do, and it happens
 * BEFORE the work rather than after it:
 *
 *   - no image, unlike a post — the whole point is that it costs nothing;
 *   - no addressing, unlike a comment — it belongs to the entry it answers;
 *   - a short text at most, capped, because "Got it, working on it" is the message and
 *     anything longer is a post pretending to be a receipt.
 *
 * It is also NOT a comment: agents do not write in the human's channel. An ack
 * carries `re` and nothing else, so it can only ever hang under something that
 * already exists.
 *
 * Usage:
 *   node scripts/ack.mjs --author "roof_deck" --re 1786812555810-6x5srw
 *   node scripts/ack.mjs --author "roof_deck" --re <id> --emoji ✅ --text "Got it, fixing exposure"
 */

import { appendFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
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

/** Long enough for "Got it, fixing exposure, ~5 min"; short enough that it cannot become a report. */
const MAX_CHARS = 120;

/**
 * Seen / working / done / cannot. Four states is all a receipt needs, and a
 * fixed set means the reader learns the glyphs once instead of decoding a new
 * emoji per agent.
 */
const EMOJI = { seen: "👀", work: "🔧", done: "✅", no: "❌" };

/** Appends one ack. Returns the record. Throws with a readable message on bad input. */
export function writeAck({ author, re, emoji, text, feedFile = FEED } = {}) {
  const who = String(author ?? "").trim();
  if (!who) throw new Error("an ack needs --author: it is a receipt, and a receipt needs a signer");
  const target = String(re ?? "").trim();
  if (!target) throw new Error("an ack needs --re <id of the comment you are acknowledging>");

  const note = String(text ?? "").trim();
  if (note.length > MAX_CHARS) {
    throw new Error(
      `ack text is ${note.length} characters; the limit is ${MAX_CHARS}. ` +
        "An ack says you got it and what you are about to do. The result goes in a post.",
    );
  }

  const mark = String(emoji ?? "").trim() || EMOJI.seen;
  // The set is fixed, so it has to be enforced: a reader who has learned four
  // glyphs should not have to decode a fifth invented by one agent.
  if (!Object.values(EMOJI).includes(mark)) {
    throw new Error(
      `--emoji ${mark} is not one of the four: ${Object.values(EMOJI).join(" ")} ` +
        "(seen, working, done, cannot). An ack is read at a glance, not parsed.",
    );
  }

  const record = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    at: new Date().toISOString(),
    author: who,
    kind: "ack",
    re: target,
    emoji: mark,
    ...(note ? { text: note } : {}),
  };

  mkdirSync(path.dirname(feedFile), { recursive: true });
  appendFileSync(feedFile, JSON.stringify(record) + "\n");
  return record;
}

// ---- CLI -----------------------------------------------------------------
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  // A flag is never a value: `--text --re x` used to post the string "--re".
  const arg = (name) => {
    const i = process.argv.indexOf(`--${name}`);
    const value = i >= 0 ? process.argv[i + 1] : undefined;
    return value && !value.startsWith("--") ? value : undefined;
  };

  try {
    const re = arg("re");
    // A typo in the id produces an ack that hangs under nothing and is invisible
    // — which looks exactly like not having acknowledged at all, the one failure
    // this command exists to prevent. So it is caught here.
    if (re) {
      // Guarding this with existsSync made it dead where it mattered most: with
      // no feed yet, every id is unknown, and the check waved them all through.
      // No feed is not a reason to skip the check — it is the same failure.
      if (!existsSync(FEED)) {
        throw new Error(
          `there is no feed at ${FEED} yet, so an ack cannot point at anything. ` +
            "An ack answers a comment that exists; post or comment first.",
        );
      }
      const known = readFileSync(FEED, "utf8").includes(`"id":"${re}"`);
      if (!known) {
        throw new Error(
          `no entry with id ${re} in the feed. Copy the id from the delivered comment — ` +
            "an ack pointing at nothing renders nowhere, and reads as silence.",
        );
      }
    }
    const record = writeAck({ author: arg("author"), re, emoji: arg("emoji"), text: arg("text") });
    console.log(`acked ${record.re}: ${record.emoji}${record.text ? ` ${record.text}` : ""}`);
  } catch (err) {
    console.error(String(err.message ?? err));
    console.error(
      '\nusage: node scripts/ack.mjs --author "Who" --re <id> [--emoji 👀|🔧|✅|❌] [--text "Got it, working on it"]',
    );
    process.exit(1);
  }
}
