/**
 * Deliver feed comments INTO a running agent. Wired as a PostToolUse hook, so it
 * fires after every tool call in every session — orchestrator and sub-agents
 * alike — and a comment reaches its addressee within one tool call of being
 * written.
 *
 * WHY A HOOK AND NOT A POLL. The obvious design is "agents read the feed between
 * steps". It is the same design as "instruct each agent to post when you
 * dispatch it", and it fails the same way: it works for the first two agents and
 * is forgotten by the rest, exactly when a fan-out is busiest and the human most
 * needs to be able to redirect it. A hook is not something an agent can forget.
 *
 * WHO AM I. The hook is handed ids, not a name, and the feed is addressed by
 * name — so the two have to be tied together. An agent ties them itself, by its
 * first post: this same script watches Bash calls go past, and when it sees
 * `post.mjs --author "X"` it records that agent → X. The repo already requires a
 * post on arrival, so no new obligation is created. Until an agent has posted it
 * is anonymous and receives only comments addressed to everyone.
 *
 * The orchestrator needs no name at all: it is the session with no `agent_id`,
 * and it receives every comment — see the note on the state key below.
 *
 * WHAT EACH AGENT SEES. Mine and not-mine are both delivered, and labelled:
 *
 *   - addressed to me      → act on it now, or answer in the feed why not
 *   - addressed to another → context only, explicitly not an instruction
 *
 * Withholding other people's comments looks tidier and is worse. "@roof_deck
 * don't touch the shared material" is the most useful thing the OTHER eight
 * agents could read, and an agent that never sees it walks into the collision it
 * was warning about.
 *
 * State: tmp/dashboard/inbox/<session>.json — the author this session posts as,
 * and how many bytes of the feed it has already been shown.
 */

import { closeSync, existsSync, mkdirSync, openSync, readFileSync, readSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { addressedTo } from "./comment.mjs";

const FEED = process.env.FEED_FILE ?? "tmp/dashboard/feed.jsonl";
const STATE_DIR = process.env.FEED_INBOX_DIR ?? "tmp/dashboard/inbox";

/**
 * How far back a session looks the first time it is seen. An agent's first hook
 * fires seconds after it starts, but a human who wrote "everyone: do not touch
 * Content/Materials" ten minutes ago meant it for the agents starting now too.
 * Starting every new session at end-of-file would drop exactly those.
 */
const BACKLOG_MS = 15 * 60 * 1000;

async function readStdin() {
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  return Buffer.concat(chunks).toString("utf8");
}

const statePath = (sessionId) =>
  path.join(STATE_DIR, `${String(sessionId).replace(/[^\w.-]+/g, "_") || "unknown"}.json`);

function loadState(sessionId) {
  try {
    return JSON.parse(readFileSync(statePath(sessionId), "utf8"));
  } catch {
    return {};
  }
}

function saveState(sessionId, state) {
  mkdirSync(STATE_DIR, { recursive: true });
  writeFileSync(statePath(sessionId), JSON.stringify(state));
}

/**
 * The author this agent posts under, learned from its own `post.mjs` call.
 * Quoted or bare, `--author` is the only form the repo documents.
 *
 * The search starts AFTER `post.mjs`, not at the start of the command. A shell
 * line often mentions several `--author` flags — a `comment.mjs` call earlier in
 * the same chain, a heredoc, a grep — and taking the first one adopts somebody
 * else's name, after which every addressed comment is delivered to the wrong
 * agent as an instruction.
 */
function authorFromCommand(command) {
  if (typeof command !== "string") return undefined;
  const at = command.indexOf("post.mjs");
  if (at < 0) return undefined;
  const m = command.slice(at).match(/--author\s+(?:"([^"]*)"|'([^']*)'|(\S+))/);
  return m ? (m[1] ?? m[2] ?? m[3]) : undefined;
}

/**
 * Bytes [from, size) of the feed, truncated at the last newline.
 *
 * Several processes append while this reads, so the tail can be a half-written
 * line. Stopping at the last complete line leaves the remainder for the next
 * call — which is why the returned length, not the file size, is what gets
 * stored as the new offset.
 */
function readTail(from) {
  const size = statSync(FEED).size;
  if (size <= from) return { text: "", end: from };
  const fd = openSync(FEED, "r");
  try {
    const buf = Buffer.alloc(size - from);
    const got = readSync(fd, buf, 0, buf.length, from);
    const text = buf.subarray(0, got).toString("utf8");
    const cut = text.lastIndexOf("\n");
    if (cut < 0) return { text: "", end: from };
    return { text: text.slice(0, cut + 1), end: from + Buffer.byteLength(text.slice(0, cut + 1)) };
  } finally {
    closeSync(fd);
  }
}

function parseComments(text) {
  const out = [];
  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    let raw;
    try {
      raw = JSON.parse(trimmed);
    } catch {
      continue;
    }
    if (raw?.kind === "comment" && typeof raw.text === "string") out.push(raw);
  }
  return out;
}

function timeOf(at) {
  const t = Date.parse(at ?? "");
  return Number.isFinite(t) ? t : 0;
}

const nComments = (n) => `${n} comment${n === 1 ? "" : "s"}`;

/**
 * Where a comment was written. The dashboard endpoint is the human's own hand;
 * anything else in this repo is an agent at a command line. Stating it on every
 * line is the difference between an order and somebody's paraphrase of one —
 * and without it an agent relaying an instruction is indistinguishable from the
 * person who gave it.
 */
const source = (c) => (c.via === "ui" ? " (human, dashboard)" : " (agent, CLI)");

/**
 * The block of text the reader is made to read. Instruction and context are
 * never mixed up, and the second half is framed differently for the
 * orchestrator: a comment aimed at one agent is not trivia it may note, it is
 * work it has to route.
 */
function render(mine, others, { anonymous, isMain }) {
  const lines = [];
  const total = mine.length + others.length;
  // Not "from the human": an agent can write here too, and the header must not
  // make a claim this delivery cannot prove.
  lines.push(`=== FEED: ${nComments(total)} ===`);

  for (const c of mine) {
    lines.push("");
    lines.push(`[FOR YOU] ${c.author}${source(c)}: ${c.text}`);
    if (c.re) lines.push(`  (re: post ${c.re})`);
    // The id, spelled out, because the acknowledgement needs it and an agent
    // that has to go and find it will skip the acknowledgement.
    lines.push(`  id: ${c.id}`);
  }
  if (mine.length > 0) {
    lines.push("");
    lines.push(
      "^ ACKNOWLEDGE FIRST — one command for each item, BEFORE work or any other tool call:",
    );
    for (const c of mine) {
      lines.push(
        `  node scripts/ack.mjs --author "<you>" --re ${c.id} --emoji 👀 --text "Got it, <what you are doing>"`,
      );
    }
    lines.push(
      "The human is watching the feed. Until you acknowledge, the screen does not change and they cannot distinguish a working agent from a dead one. " +
        "It takes a second; the result takes minutes. States: 👀 seen · 🔧 working · ✅ done · ❌ cannot.",
    );
    lines.push(
      "Then act now, before continuing the current step. If you cannot, acknowledge ❌ and explain with: " +
        'node scripts/post.mjs --author "<you>" --kind problem --text "..." --shot <png>',
    );
  }

  for (const c of others) {
    lines.push("");
    const to = Array.isArray(c.to) ? c.to.join(", ") : "?";
    lines.push(`[${isMain ? "TO AGENT" : "TO ANOTHER AGENT"} → ${to}] ${c.author}${source(c)}: ${c.text}`);
    if (c.re) lines.push(`  (re: post ${c.re})`);
  }
  if (others.length > 0) {
    lines.push("");
    lines.push(
      isMain
        ? "^ You are the orchestrator. This is work, not trivia: route it to its owner, amend a running brief, or open a new task. If it changes current work, tell the agent immediately.\n" +
            "Message the agent DIRECTLY, never through comment.mjs: that channel belongs to the human. Report your action with a post under your own name."
        : "^ This is NOT addressed to you. Treat it as context; do not redo another agent's work, but account for ownership boundaries and reversed decisions.",
    );
  }

  if (anonymous) {
    lines.push("");
    lines.push(
      "NB: you have not posted yet, so only broadcasts reach you. Post once with --author \"<who you are>\" and addressed comments will start arriving.",
    );
  }
  return lines.join("\n");
}

const raw = await readStdin();
let hook = {};
try {
  hook = JSON.parse(raw || "{}");
} catch {
  process.exit(0);
}

/**
 * WHICH AGENT THIS IS — measured, not assumed.
 *
 * A sub-agent shares its parent's `session_id`. Keying state on the session
 * alone therefore gives an orchestrator and all of its children ONE inbox: the
 * first to run overwrites the identity, and whoever fires first consumes the
 * comments for everyone else. That is not a corner case — it is every fan-out,
 * which is the only situation this channel exists for.
 *
 * `agent_id` is present only on a sub-agent's payload. So it separates the
 * inboxes, and its ABSENCE identifies the main session — which is the
 * orchestrator by construction, with no naming convention to get wrong.
 */
const sessionId = hook.session_id ?? "unknown";
const agentId = hook.agent_id;
const isMain = !agentId;
const stateKey = agentId ? `${sessionId}.${agentId}` : sessionId;
const state = loadState(stateKey);

// Identity, learned in passing from the session's own posting command.
if (hook.tool_name === "Bash" || hook.tool_name === "PowerShell") {
  const found = authorFromCommand(hook.tool_input?.command);
  if (found && found !== state.author) state.author = found;
}

if (!existsSync(FEED)) {
  saveState(stateKey, state);
  process.exit(0);
}

const firstRun = typeof state.offset !== "number";
const { text, end } = firstRun ? { text: readFileSync(FEED, "utf8"), end: statSync(FEED).size } : readTail(state.offset);

let comments = parseComments(text);
if (firstRun) {
  const floor = Date.now() - BACKLOG_MS;
  comments = comments.filter((c) => timeOf(c.at) >= floor);
}

// A session is never shown its own comment — the orchestrator writes these too.
const me = state.author;
if (me) comments = comments.filter((c) => c.author !== me);

state.offset = end;
saveState(stateKey, state);

if (comments.length === 0) process.exit(0);

const mine = comments.filter((c) => addressedTo(c.to, me));
const others = comments.filter((c) => !mine.includes(c));

/**
 * An anonymous sub-agent matches nothing but a broadcast, so `mine` is already
 * safe; what it must not get is the not-for-you pile, because without a name it
 * cannot tell whether one of those is in fact for it, and a misread instruction
 * is worse than a missed one.
 *
 * The orchestrator is the opposite case. Every comment is its business — a
 * comment aimed at one agent may mean another agent's brief has to change — so
 * it is never filtered, only framed differently.
 */
const anonymous = !isMain && !me;
const deliverOthers = anonymous ? [] : others;
if (mine.length + deliverOthers.length === 0) process.exit(0);

const summary =
  mine.length > 0
    ? `📨 ${nComments(mine.length)} for you` +
      (deliverOthers.length ? ` + ${deliverOthers.length} ${isMain ? "for agents" : "for context"}` : "")
    : `📨 ${nComments(deliverOthers.length)} ${isMain ? "for agents" : "for context"}`;

process.stdout.write(
  JSON.stringify({
    systemMessage: summary,
    hookSpecificOutput: {
      hookEventName: hook.hook_event_name ?? "PostToolUse",
      additionalContext: render(mine, deliverOthers, { anonymous, isMain }),
    },
  }),
);
