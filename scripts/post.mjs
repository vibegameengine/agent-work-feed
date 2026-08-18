/**
 * Post an update to the work feed — the dashboard's timeline of what is
 * happening, written to by the manager AND by every sub-agent directly.
 *
 * A fan-out of agents is opaque: several file sets change at once for minutes,
 * and everything the user learns arrives second-hand through the manager. Letting
 * each agent post for itself turns that into a live feed the user can read
 * without waiting for anyone to finish.
 *
 * Append-only JSONL so concurrent writers cannot clobber each other — every
 * writer opens with "a" and emits exactly one line.
 *
 * Two rules the command ENFORCES, because asking nicely produced a feed of
 * unreadable, useless posts:
 *
 *   1. Every post carries an image. A post without one is the rare exception and
 *      has to be declared with --nomedia "<why>", which is recorded AND rendered.
 *      Text-only updates are what a log looks like; a feed is something you look
 *      at.
 *   2. Posts are capped at MAX_CHARS, and the command REJECTS an over-long one
 *      rather than truncating it — truncation eats the last sentence, which is
 *      usually the conclusion, so the author decides what survives. Forced to
 *      cut, people lead with the finding and the number instead of narrating
 *      their approach.
 *
 * URLs and file paths do not count toward the limit: a long path should never be
 * the reason a finding gets cut. That exemption is itself capped at MAX_FREE
 * characters per post, so nobody can smuggle a paragraph past the limit by
 * writing it as a list of paths.
 *
 * WHERE THE FEED IS WRITTEN. `FEED` below must name the same file the reading
 * surface fetches (`src/dashboard/config.ts`, `FEED_URL`), and it must sit under
 * the dev server's root so the browser can GET it. The shipped pair is
 * `tmp/dashboard/feed.jsonl` on disk and `/tmp/dashboard/feed.jsonl` over HTTP.
 * Override the disk side with FEED_FILE=... if you move it, and change FEED_URL
 * to match — if the two disagree the dashboard shows its empty state forever and
 * nothing tells you why.
 *
 * Usage:
 *   node scripts/post.mjs --author "Builder: light" --text "..." [--shot shots/x.png] [--kind note|done|problem]
 */

import { appendFileSync, existsSync, mkdirSync } from "node:fs";
import path from "node:path";


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
const MAX_CHARS = 250;
/** Total characters of URL and path one post may carry for free. */
const MAX_FREE = 500;
const KINDS = ["note", "done", "problem"];

function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

const author = arg("author");
const text = arg("text");
if (!author || !text) {
  console.error('usage: node scripts/post.mjs --author "Who" --text "What happened" [--shot path.png] [--kind note|done|problem]');
  process.exit(1);
}

/**
 * Characters that count: URLs and file paths are free, so a long path never
 * costs a finding — up to MAX_FREE characters of them per post, after which they
 * pay like anything else. A path qualifies only if it starts a token and names a
 * file (`/tmp/shots/x.png`); a bare `/usr` costs what it weighs.
 */
function countable(s) {
  let freed = 0;
  const free = (token, lead = "") => {
    const room = Math.max(0, MAX_FREE - freed);
    freed += token.length;
    // Past the allowance the token pays for itself, character for character.
    return lead + (token.length <= room ? "" : token.slice(room));
  };
  return s
    .replace(/https?:\/\/\S+/g, (m) => free(m))
    .replace(/(^|\s)(\/[\w.\-/]*\.[A-Za-z0-9]{1,8}(?:[?#]\S*)?)/g, (_m, lead, tok) => free(tok, lead))
    .trim();
}

const counted = countable(text).length;
if (counted > MAX_CHARS) {
  console.error(
    `post is ${counted} characters (URLs excluded); the limit is ${MAX_CHARS}.\n` +
      `Cut it rather than splitting it across two posts — lead with the finding and the ` +
      `number, drop the narration of how you got there.`,
  );
  process.exit(1);
}

const kind = arg("kind", "note");
if (!KINDS.includes(kind)) {
  console.error(
    `--kind ${kind} is not one of: ${KINDS.join(", ")}.\n` +
      `The reading surface knows only those three and would silently show this as a "note".`,
  );
  process.exit(1);
}

const shot = arg("shot");
const nomedia = arg("nomedia");
if (!shot && !nomedia) {
  console.error(
    "every post needs an image: pass --shot <path.png>.\n" +
      "A feed is something you look at; a column of text is a log, and nobody reads a log.\n" +
      "If this genuinely cannot have one — it should be rare — say why: --nomedia \"<reason>\"",
  );
  process.exit(1);
}
if (shot && !existsSync(shot)) {
  console.error(`--shot ${shot} does not exist. Take the screenshot first.`);
  process.exit(1);
}

const post = {
  id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
  at: new Date().toISOString(),
  author,
  kind,
  text,
};

if (shot) {
  // Served by the dev server from the project root, so the feed stores a
  // root-relative URL. A shot outside that root has no URL at all — the browser
  // would ask for `/../../private/tmp/...` and render a broken image — so it is
  // refused here rather than written and discovered by eye.
  const rel = path.relative(ROOT, path.resolve(shot));
  if (rel.startsWith("..") || path.isAbsolute(rel)) {
    console.error(
      `--shot ${shot} is outside the project root (${ROOT}).\n` +
        `The dashboard can only load images the dev server serves. Copy it inside first — ` +
        `tmp/shots/ is the usual place — and pass that path.`,
    );
    process.exit(1);
  }
  post.shot = "/" + rel.replace(/\\/g, "/");
} else {
  post.nomedia = nomedia;
}

mkdirSync(path.dirname(FEED), { recursive: true });
appendFileSync(FEED, JSON.stringify(post) + "\n");
console.log(`posted: [${post.kind}] ${author} — ${text.slice(0, 60)}${text.length > 60 ? "…" : ""}`);
