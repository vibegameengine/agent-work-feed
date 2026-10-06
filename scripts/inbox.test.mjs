import assert from "node:assert/strict";
import { appendFileSync, mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const testRoot = path.join(root, "tmp/inbox-tests");
mkdirSync(testRoot, { recursive: true });
const LONG = " слово".repeat(100);

function fixture() {
  const directory = mkdtempSync(path.join(testRoot, "run-"));
  const feed = path.join(directory, "feed.jsonl");
  writeFileSync(feed, "");
  const env = { ...process.env, FEED_FILE: feed, FEED_INBOX_DIR: path.join(directory, "inbox") };
  const append = (...entries) => appendFileSync(feed, entries.map((entry) => JSON.stringify(entry) + "\n").join(""));
  const hook = (payload) => {
    const result = spawnSync(process.execPath, [path.join(root, "scripts/inbox.mjs")], {
      cwd: root, env, encoding: "utf8", timeout: 10000,
      input: JSON.stringify({ cwd: root, hook_event_name: "PostToolUse", ...payload }),
    });
    assert.equal(result.status, 0, result.stderr);
    return result.stdout.trim() ? JSON.parse(result.stdout).hookSpecificOutput.additionalContext : "";
  };
  return { append, hook };
}

function comment(id, extra) {
  return { id, kind: "comment", at: new Date().toISOString(), author: "Agent", text: id + LONG, ...extra };
}

const asSubAgent = { session_id: "s", agent_id: "child", tool_name: "Bash", tool_input: { command: 'node scripts/post.mjs --author "Reader"' } };
const lineOf = (context, id) => context.split("\n").find((line) => line.includes(": " + id + " "));

test("a long agent comment to another agent reaches a sub-agent cut, with the way to read it whole", () => {
  const f = fixture();
  f.append(comment("aside", { to: ["Other"] }));
  const context = f.hook(asSubAgent);
  assert.ok(lineOf(context, "aside").length < 250);
  assert.match(lineOf(context, "aside"), /…/);
  assert.match(context, /feed-history\.mjs --id aside/);
});

test("comments for you and comments from the human always arrive whole", () => {
  const f = fixture();
  f.append(comment("mine", { to: ["Reader"] }), comment("human", { to: ["Other"], author: "Human", via: "ui" }));
  const context = f.hook(asSubAgent);
  assert.ok(lineOf(context, "mine").includes(LONG.trim()));
  assert.ok(lineOf(context, "human").includes(LONG.trim()));
});

test("the orchestrator reads every comment whole, because it has to route it", () => {
  const f = fixture();
  f.append(comment("route-me", { to: ["Other"] }));
  const context = f.hook({ session_id: "main", tool_name: "Read" });
  assert.ok(lineOf(context, "route-me").includes(LONG.trim()));
});
