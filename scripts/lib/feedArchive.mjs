import { appendFileSync, closeSync, existsSync, mkdirSync, openSync, readFileSync, readSync, readdirSync, renameSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";

export const FEED_WARNING_BYTES = 80 * 1024;
export const BYTES_PER_TOKEN = 4;

export function archiveDirOf(feedFile) {
  return process.env.FEED_ARCHIVE_DIR ?? path.join(path.dirname(feedFile), "archive");
}

function bytesFrom(file, from) {
  const size = statSync(file).size;
  if (size <= from) return Buffer.alloc(0);
  const fd = openSync(file, "r");
  try {
    const buffer = Buffer.alloc(size - from);
    const got = readSync(fd, buffer, 0, buffer.length, from);
    return buffer.subarray(0, got);
  } finally {
    closeSync(fd);
  }
}

function archivedPrefix(text, keepFrom) {
  let cut = 0;
  let count = 0;
  const entries = [];
  while (cut < text.length) {
    const end = text.indexOf("\n", cut);
    if (end < 0) break;
    let entry;
    try { entry = JSON.parse(text.slice(cut, end)); }
    catch { entry = null; }
    const at = entry ? Date.parse(entry.at) : NaN;
    if (Number.isFinite(at) && at >= keepFrom.getTime()) break;
    if (entry) entries.push(entry);
    count++;
    cut = end + 1;
  }
  return { bytes: Buffer.byteLength(text.slice(0, cut), "utf8"), lines: count, entries };
}

function archiveFileName(archiveDir, entries) {
  const stamp = (entry) => String(entry?.at ?? "unknown").slice(0, 16).replace(/[:]/g, "");
  const base = `feed-${stamp(entries[0])}_${stamp(entries[entries.length - 1])}`;
  let name = base + ".jsonl";
  for (let copy = 2; existsSync(path.join(archiveDir, name)); copy++) name = `${base}-${copy}.jsonl`;
  return path.join(archiveDir, name);
}

function shiftReaders(inboxDir, removedBytes) {
  if (!existsSync(inboxDir)) return 0;
  let shifted = 0;
  for (const name of readdirSync(inboxDir)) {
    if (!name.endsWith(".json")) continue;
    const file = path.join(inboxDir, name);
    let state;
    try { state = JSON.parse(readFileSync(file, "utf8")); }
    catch { continue; }
    if (typeof state.offset !== "number") continue;
    state.offset = Math.max(0, state.offset - removedBytes);
    writeFileSync(file, JSON.stringify(state));
    shifted++;
  }
  return shifted;
}

export function archiveFeed({ feedFile, archiveDir = archiveDirOf(feedFile), inboxDir, keepFrom, beforeSwap = () => {} }) {
  const original = readFileSync(feedFile);
  const text = original.toString("utf8");
  const prefix = archivedPrefix(text, keepFrom);
  if (prefix.lines === 0) return { archived: 0, kept: text.split("\n").filter(Boolean).length, file: null, readersShifted: 0 };
  mkdirSync(archiveDir, { recursive: true });
  const file = archiveFileName(archiveDir, prefix.entries);
  writeFileSync(file, original.subarray(0, prefix.bytes));
  const temp = feedFile + ".archiving";
  writeFileSync(temp, original.subarray(prefix.bytes));
  beforeSwap();
  appendFileSync(temp, bytesFrom(feedFile, original.length));
  renameSync(temp, feedFile);
  const readersShifted = shiftReaders(inboxDir, prefix.bytes);
  const kept = readFileSync(feedFile, "utf8").split("\n").filter(Boolean).length;
  return { archived: prefix.lines, kept, file, readersShifted };
}

function* entriesOf(file) {
  for (const line of readFileSync(file, "utf8").split("\n")) {
    if (!line) continue;
    try { yield JSON.parse(line); }
    catch { continue; }
  }
}

export function* feedHistory({ feedFile, archiveDir = archiveDirOf(feedFile) }) {
  if (existsSync(archiveDir)) {
    for (const name of readdirSync(archiveDir).filter((file) => file.endsWith(".jsonl")).sort()) yield* entriesOf(path.join(archiveDir, name));
  }
  if (existsSync(feedFile)) yield* entriesOf(feedFile);
}

export function knownInHistory(feedFile, id) {
  for (const entry of feedHistory({ feedFile })) if (entry.id === id) return true;
  return false;
}

export function feedWarning(feedFile, warnedAtBytes, costOf = everyNewAgentReadsIt) {
  if (!existsSync(feedFile)) return null;
  const bytes = statSync(feedFile).size;
  if (bytes < FEED_WARNING_BYTES) return null;
  if (typeof warnedAtBytes === "number" && bytes < warnedAtBytes + FEED_WARNING_BYTES / 2) return null;
  return {
    bytes,
    text: `Feed is ${Math.round(bytes / 1024)} KB: ${costOf(bytes)}. ` +
      "Only a person archives it: node scripts/feed-archive.mjs (old entries stay readable with node scripts/feed-history.mjs).",
  };
}

export function everyNewAgentReadsIt(bytes) {
  return `every new agent reads all of it on its first tool call (~${Math.round(bytes / BYTES_PER_TOKEN / 1000)}k tokens)`;
}

export function theDashboardRedrawsIt() {
  return "the dashboard downloads and redraws all of it on every post";
}
