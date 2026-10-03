import { existsSync, statSync } from "node:fs";
import { createInterface } from "node:readline/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { archiveDirOf, archiveFeed } from "./lib/feedArchive.mjs";

const DAY_MS = 86_400_000;
const DEFAULT_KEEP_DAYS = 2;
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const feedFile = process.env.FEED_FILE ?? path.join(root, "tmp/dashboard/feed.jsonl");
const inboxDir = process.env.FEED_INBOX_DIR ?? path.join(path.dirname(feedFile), "inbox");

function option(name, fallback) {
  const at = process.argv.indexOf(`--${name}`);
  return at >= 0 && process.argv[at + 1] ? process.argv[at + 1] : fallback;
}

if (!process.stdin.isTTY || !process.stdout.isTTY) {
  console.error("feed-archive is run by a person at a terminal, never by an agent or a script. Ask the person to run: node scripts/feed-archive.mjs");
  process.exit(1);
}
if (!existsSync(feedFile)) {
  console.error(`no feed at ${feedFile}`);
  process.exit(1);
}

const keepDays = Number(option("keep-days", DEFAULT_KEEP_DAYS));
const keepFrom = new Date(Date.now() - keepDays * DAY_MS);
const before = statSync(feedFile).size;
const prompt = createInterface({ input: process.stdin, output: process.stdout });
const answer = await prompt.question(`Feed ${Math.round(before / 1024)} KB. Move entries older than ${keepFrom.toISOString().slice(0, 16)} (${keepDays} days) to ${archiveDirOf(feedFile)}? [y/N] `);
prompt.close();
if (answer.trim().toLowerCase() !== "y") {
  console.log("nothing archived");
  process.exit(0);
}
const result = archiveFeed({ feedFile, inboxDir, keepFrom });
if (result.archived === 0) {
  console.log(`nothing older than ${keepDays} days; the feed keeps ${result.kept} entries`);
} else {
  console.log(`archived ${result.archived} entries to ${result.file}; the feed keeps ${result.kept} entries, ${Math.round(statSync(feedFile).size / 1024)} KB; ${result.readersShifted} agent cursors moved`);
  console.log("read old entries with: node scripts/feed-history.mjs --search <text> | --author <name> | --id <id>");
}
