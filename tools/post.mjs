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
 *      has to be declared with --nomedia "<why>", which is recorded. Text-only
 *      updates are what a log looks like; a feed is something you look at.
 *   2. Posts are capped at MAX_CHARS, and the command REJECTS an over-long one
 *      rather than truncating it — truncation eats the last sentence, which is
 *      usually the conclusion, so the author decides what survives. Forced to
 *      cut, people lead with the finding and the number instead of narrating
 *      their approach.
 *
 * URLs do not count toward the limit: a long path should never be the reason a
 * finding gets cut.
 *
 * Usage:
 *   node scripts/post.mjs --author "Builder: light" --text "..." [--shot shots/x.png] [--kind note|done|problem]
 */

import { appendFileSync, existsSync, mkdirSync } from "node:fs";
import path from "node:path";

const FEED = "feed.jsonl";
const MAX_CHARS = 250;

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

/** Characters that count: URLs are free, so a long path never costs a finding. */
function countable(s) {
  return s.replace(/\bhttps?:\/\/\S+/g, "").replace(/(^|\s)\/\S+/g, "$1").trim();
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
  kind: arg("kind", "note"),
  text,
};

if (shot) {
  // Served by vite from the project root, so the feed stores a root-relative URL.
  post.shot = "/" + path.relative(process.cwd(), path.resolve(shot)).replace(/\\/g, "/");
} else {
  post.nomedia = nomedia;
}

mkdirSync(path.dirname(FEED), { recursive: true });
appendFileSync(FEED, JSON.stringify(post) + "\n");
console.log(`posted: [${post.kind}] ${author} — ${text.slice(0, 60)}${text.length > 60 ? "…" : ""}`);
