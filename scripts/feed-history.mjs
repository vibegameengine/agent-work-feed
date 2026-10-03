import path from "node:path";
import { fileURLToPath } from "node:url";
import { feedHistory } from "./lib/feedArchive.mjs";

const DEFAULT_LIMIT = 20;
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const feedFile = process.env.FEED_FILE ?? path.join(root, "tmp/dashboard/feed.jsonl");

function option(name) {
  const at = process.argv.indexOf(`--${name}`);
  return at >= 0 ? process.argv[at + 1] : undefined;
}

const search = option("search")?.toLowerCase();
const author = option("author")?.toLowerCase();
const id = option("id");
const since = option("since") ? Date.parse(option("since")) : -Infinity;
const limit = Number(option("limit") ?? DEFAULT_LIMIT);

const matches = [];
for (const entry of feedHistory({ feedFile })) {
  if (id && entry.id !== id && entry.re !== id) continue;
  if (author && !String(entry.author ?? "").toLowerCase().includes(author)) continue;
  if (search && !JSON.stringify(entry).toLowerCase().includes(search)) continue;
  if (Date.parse(entry.at) < since) continue;
  matches.push(entry);
}

for (const entry of matches.slice(-limit)) {
  const to = Array.isArray(entry.to) ? ` → ${entry.to.join(", ")}` : "";
  console.log(`[${entry.at ?? ""}] ${entry.author ?? ""} · ${entry.kind}${to} · ${entry.id}${entry.re ? ` re ${entry.re}` : ""}`);
  if (entry.text) console.log(entry.text);
  if (entry.emoji) console.log(entry.emoji);
  if (entry.shot) console.log(`image: ${entry.shot}`);
  console.log("");
}
console.log(`${matches.length} matching entries${matches.length > limit ? `, the last ${limit} shown (--limit to see more)` : ""}`);
