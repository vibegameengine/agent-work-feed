import assert from "node:assert/strict";
import { appendFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { archiveFeed, feedHistory } from "./lib/feedArchive.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const testRoot = path.join(root, "tmp/feed-archive-tests");
mkdirSync(testRoot, { recursive: true });
const DAY = 86_400_000;

function fixture() {
  const directory = mkdtempSync(path.join(testRoot, "run-"));
  const feed = path.join(directory, "feed.jsonl");
  const inbox = path.join(directory, "inbox");
  const archive = path.join(directory, "archive");
  writeFileSync(feed, "");
  const env = { ...process.env, FEED_FILE: feed, FEED_INBOX_DIR: inbox, FEED_ARCHIVE_DIR: archive, FEED_AGENTS_DIR: path.join(directory, "agents") };
  const append = (...entries) => appendFileSync(feed, entries.map((entry) => JSON.stringify(entry) + "\n").join(""));
  const hook = (sessionId) => {
    const result = spawnSync(process.execPath, [path.join(root, "scripts/inbox.mjs")], {
      cwd: root, env, encoding: "utf8", timeout: 10000,
      input: JSON.stringify({ cwd: root, hook_event_name: "PostToolUse", session_id: sessionId, tool_name: "Read" }),
    });
    assert.equal(result.status, 0, result.stderr);
    return result.stdout.trim() ? JSON.parse(result.stdout) : null;
  };
  return { feed, inbox, archive, env, append, hook };
}

function entry(id, daysAgo, extra = {}) {
  return { id, kind: "comment", at: new Date(Date.now() - daysAgo * DAY).toISOString(), author: "Human", text: "entry " + id, ...extra };
}

function delivered(output) {
  return output ? [...output.hookSpecificOutput.additionalContext.matchAll(/^  id: (\S+)/gm)].map((match) => match[1]) : [];
}

test("moves entries older than the cut into the archive and keeps the newer ones in the feed", () => {
  const { feed, archive, append, inbox } = fixture();
  append(entry("old-1", 5), entry("old-2", 4), entry("new-1", 1), entry("new-2", 0));
  const result = archiveFeed({ feedFile: feed, archiveDir: archive, inboxDir: inbox, keepFrom: new Date(Date.now() - 2 * DAY) });
  assert.deepEqual(result.archived, 2);
  assert.deepEqual(readFileSync(feed, "utf8").trim().split("\n").map((line) => JSON.parse(line).id), ["new-1", "new-2"]);
  const files = readdirSync(archive);
  assert.equal(files.length, 1);
  assert.deepEqual(readFileSync(path.join(archive, files[0]), "utf8").trim().split("\n").map((line) => JSON.parse(line).id), ["old-1", "old-2"]);
});

test("a session that had read the whole feed gets nothing again after archiving, and only what comes later", () => {
  const { feed, archive, append, inbox, hook } = fixture();
  hook("reader");
  append(entry("old-1", 5), entry("new-1", 1));
  assert.deepEqual(delivered(hook("reader")), ["old-1", "new-1"]);
  archiveFeed({ feedFile: feed, archiveDir: archive, inboxDir: inbox, keepFrom: new Date(Date.now() - 2 * DAY) });
  assert.deepEqual(delivered(hook("reader")), []);
  append(entry("new-2", 0));
  assert.deepEqual(delivered(hook("reader")), ["new-2"]);
});

test("a session halfway through the archived part continues with the first entry it has not read", () => {
  const { feed, archive, append, inbox, hook } = fixture();
  hook("reader");
  append(entry("old-1", 5));
  hook("reader");
  append(entry("old-2", 4), entry("new-1", 1));
  archiveFeed({ feedFile: feed, archiveDir: archive, inboxDir: inbox, keepFrom: new Date(Date.now() - 2 * DAY) });
  assert.deepEqual(delivered(hook("reader")), ["new-1"]);
});

test("keeps whatever was appended while archiving", () => {
  const { feed, archive, append, inbox } = fixture();
  append(entry("old-1", 5), entry("new-1", 1));
  archiveFeed({ feedFile: feed, archiveDir: archive, inboxDir: inbox, keepFrom: new Date(Date.now() - 2 * DAY), beforeSwap: () => append(entry("late", 0)) });
  assert.deepEqual(readFileSync(feed, "utf8").trim().split("\n").map((line) => JSON.parse(line).id), ["new-1", "late"]);
});

test("reads the archive and the live feed as one history, oldest first", () => {
  const { feed, archive, append, inbox } = fixture();
  append(entry("old-1", 5), entry("new-1", 1));
  archiveFeed({ feedFile: feed, archiveDir: archive, inboxDir: inbox, keepFrom: new Date(Date.now() - 2 * DAY) });
  append(entry("new-2", 0));
  assert.deepEqual([...feedHistory({ feedFile: feed, archiveDir: archive })].map((item) => item.id), ["old-1", "new-1", "new-2"]);
});

test("an acknowledgement may answer a comment that is now in the archive", () => {
  const { feed, archive, append, inbox, env } = fixture();
  append(entry("old-comment", 5, { kind: "comment", to: ["Builder"] }), entry("new-1", 1));
  archiveFeed({ feedFile: feed, archiveDir: archive, inboxDir: inbox, keepFrom: new Date(Date.now() - 2 * DAY) });
  const result = spawnSync(process.execPath, [path.join(root, "scripts/ack.mjs"), "--author", "Builder", "--re", "old-comment", "--emoji", "👀"], { cwd: root, env, encoding: "utf8", timeout: 10000 });
  assert.equal(result.status, 0, result.stderr + result.stdout);
});

test("the archive command refuses to run without a person at a terminal", () => {
  const { env } = fixture();
  const result = spawnSync(process.execPath, [path.join(root, "scripts/feed-archive.mjs")], { cwd: root, env, encoding: "utf8", timeout: 10000, stdio: ["pipe", "pipe", "pipe"] });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /person/);
});

test("warns a session once when the feed a new agent must read passes the limit, and names the archive command", () => {
  const { append, hook, env } = fixture();
  hook("reader");
  const filler = "x".repeat(2000);
  for (let index = 0; index < 50; index++) append(entry("big-" + index, 1, { text: filler }));
  const first = hook("reader");
  assert.match(first.systemMessage, /feed-archive\.mjs/);
  append(entry("small", 0));
  const second = hook("reader");
  assert.doesNotMatch(second.systemMessage, /feed-archive\.mjs/);
  assert.ok(existsSync(env.FEED_FILE));
});
