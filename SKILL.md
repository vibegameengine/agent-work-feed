---
name: agent-work-feed
description: A live, Twitter-shaped feed that sub-agents post to themselves while they work, so a human can read a multi-agent session as it happens instead of waiting for a summary. Use when several agents run at once and the user wants to watch progress, asks for a dashboard or activity stream, says they cannot tell what the agents are doing, or wants agents to report their own findings rather than having them relayed.
version: 1.0.0
---

# Agent work feed

A running stream of short posts, written by the agents themselves, that a human
reads while the work is still happening.

The problem it solves is specific. Once several agents run at once, everything
the user learns arrives second-hand: they get the orchestrator's account of what
its agents found, minutes after the fact, shaped by what the orchestrator thought
was worth passing on. They can agree or disagree with that account and nothing
else. A feed removes the intermediary — each agent publishes its own findings the
moment it has them, and the user reads the raw thing.

## The mechanism

An append-only JSONL file. Every writer opens with `"a"` and emits exactly one
line, so concurrent agents can never clobber each other, and no locking or
coordination is needed.

```
{ "id": "...", "at": "<ISO timestamp>", "author": "...",
  "kind": "note" | "done" | "problem", "text": "...",
  "shot": "/path.png"? , "nomedia": "why there is no shot"? }
```

One command to post — keep it to one, because anything that takes two steps gets
skipped under load:

```bash
node scripts/post.mjs --author "Who" --text "What happened" [--shot path.png] [--kind note|done|problem]
```

## The comment channel

The feed is two-way. A human can write an addressed comment in the same JSONL
file, and an agent can immediately add a receipt to the comment it received:

```json
{ "kind": "comment", "author": "Human", "text": "@builder fix cover", "to": ["builder"], "via": "ui", "re": "post-id" }
{ "kind": "ack", "author": "builder", "re": "comment-id", "emoji": "👀", "text": "Got it" }
```

Copy `scripts/comment.mjs`, `scripts/ack.mjs`, `scripts/inbox.mjs`, and
`scripts/comment.d.mts` beside `scripts/post.mjs`. Comments from a terminal
require an explicit author — an agent must never write as the human:

```bash
node scripts/comment.mjs --author "Human" --text "@builder fix cover" --re <post-id>
node scripts/ack.mjs --author "builder" --re <comment-id> --emoji 👀 --text "Got it, fixing cover"
```

Configure `inbox.mjs` as an unconditional `PostToolUse` hook so a running agent
sees a new comment after its next tool call rather than having to remember to
poll the feed:

```json
{ "hooks": { "PostToolUse": [
  { "hooks": [{ "type": "command", "command": "node scripts/inbox.mjs", "timeout": 10 }] }
] } }
```

The hook learns an agent's name from its first `post.mjs --author` invocation.
It labels an addressed entry **[FOR YOU]** (acknowledge before doing more work)
or **[TO ANOTHER AGENT]** (context only). The dashboard composer and Vite
endpoint instructions are in `dashboard/README.md`; its endpoint is dev-only.

## Setting it up in a new project — do not reinvent it

This skill ships the implementation. Copy it; do not write your own, or every
project gets a different post format, a different cap and a different set of
rules quietly dropped.

There are two places the implementation can be sitting, and they are laid out
differently. Work out which you have before step 1:

| You have | `post.mjs` is at | the dashboard is at |
|---|---|---|
| the **skill** installed (`~/.claude/skills/agent-work-feed/`) | `post.mjs`, next to this SKILL.md | `dashboard/` |
| a **clone** of <https://github.com/vibegameengine/agent-work-feed> | `scripts/post.mjs` | `dashboard/` |

Below, `$SRC` means whichever of those two directories you are copying from.
For the skill route `$SRC` is `$CLAUDE_SKILL_DIR` — and if that variable is not
set, it is the directory this SKILL.md is in.

**1. The command.**

```bash
mkdir -p scripts
cp "$SRC/post.mjs" scripts/post.mjs         # skill route
cp "$SRC/scripts/post.mjs" scripts/post.mjs # repo route
```

It has no dependencies — plain Node, one file — and enforces the image
requirement, the character cap, the `--kind` union, and that a screenshot is
somewhere the dev server can actually serve.

Wherever you copy it, **call it `scripts/post.mjs` in the project**. That is the
name in the boilerplate below, in the command's own error messages, and in the
dashboard's empty state; renaming it means fixing three other places.

**2. Where the feed lives.** `post.mjs` appends to `tmp/dashboard/feed.jsonl` and
the dashboard fetches `/tmp/dashboard/feed.jsonl`. Those two must name the same
file. If you change one, change the other — `FEED` in `scripts/post.mjs` (or the
`FEED_FILE` env var) and `FEED_URL` in `src/dashboard/config.ts`. When they
disagree the page sits on its empty state forever and nothing tells you why.

The feed file, and any screenshots posts point at, **must live under the dev
server's root** — for Vite, that is the project directory itself. That is the
one genuinely load-bearing assumption in the design, and it is worth saying out
loud because it sounds wrong: `tmp/` is gitignored *and* served. Vite serves any
file under the root that is not excluded, so `tmp/dashboard/feed.jsonl` is
readable at `/tmp/dashboard/feed.jsonl` in dev with no config at all. Gitignored
and served are unrelated properties; the feed is session state, so it wants both.

If your server does not serve the root that way — or you want the feed to
survive a production build — put it under `public/` instead (`public/feed/feed.jsonl`
on disk, `/feed/feed.jsonl` over HTTP) and set both constants to match.

**3. Put the rule in the project's instructions file.** This is the step that
actually matters (see below). Paste this into `CLAUDE.md` / `AGENTS.md`:

> ## The work feed
>
> There is a shared feed at `tmp/dashboard/feed.jsonl`. **If you are an agent
> working in this repo, you post to it yourself** — a running stream, not a
> summary at the end, so the human can read what is happening without waiting
> for anyone to finish.
>
> ```
> node scripts/post.mjs --author "<who you are>" --text "..." --shot <path.png> [--kind note|done|problem]
> ```
>
> Post when you start; **when you work out WHY something is wrong — the finding
> and the number, before you fix it**; when you land something that changes the
> picture; immediately with `--kind problem` when blocked or when the fix belongs
> in a file you do not own; and at the end with the measured result.
>
> **Every post carries an image** — the command refuses without one. If a post
> genuinely cannot have one, and that should be rare, say why with
> `--nomedia "<reason>"`. Posts are capped at 250 characters, URLs excluded.
> Concrete, with numbers, no status pings.

**4. A reading surface.** `$SRC/dashboard/` is a React column that renders the
feed; wiring instructions are in `dashboard/README.md`, and the five-minute
version is below. You do not need it to start — the feed is a text file, and
`tail -f` plus an image viewer is a working version-zero. Add the surface when
someone is actually watching.

Whatever route you took, **edit `src/dashboard/config.ts`** afterwards: it holds
the project name, the page's lede, and `FEED_URL`. Ship it unedited and your
dashboard is branded "Your project".

A published copy of all of this, with its own README:
<https://github.com/vibegameengine/agent-work-feed>.

## From scratch in five minutes

Everything above assumes a project to put the feed in. If there is no project —
you just want the feed standing up — this is the whole of it. Run it literally.

It is bash. On Windows run it in git-bash or WSL: brace expansion, `mkdir -p` and
`printf` are not cmd or PowerShell, and PowerShell fails on the braces at parse
time, so the whole block dies before its first command.

```bash
# Point SRC at what you actually have, as an absolute path — the block cd's, and
# a relative one stops resolving on the next line.
SRC=~/projects/agent-work-feed            # a clone: the commands live in $SRC/scripts/
# SRC=~/.claude/skills/agent-work-feed    # the skill: they sit next to SKILL.md

mkdir feed-project && cd feed-project
npm init -y && npm pkg set type=module
npm i -D vite typescript react react-dom @types/react @types/react-dom @vitejs/plugin-react @types/node
mkdir -p scripts src/dashboard dashboard tmp/dashboard tmp/shots .claude
cp "$SRC/scripts/"{post,comment,inbox,ack}.mjs "$SRC/scripts/comment.d.mts" scripts/
# skill route instead:  cp "$SRC/"{post,comment,inbox,ack}.mjs "$SRC/comment.d.mts" scripts/
cp -R "$SRC/dashboard/app/." src/dashboard/
cp "$SRC/dashboard/vite.feed-comments.ts" dashboard/
cp "$SRC/dashboard/dashboard.html" .
printf 'node_modules/\ndist/\ntmp/\n' > .gitignore
```

Five files you have to write. `vite.config.ts`:

```ts
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { feedComments } from "./dashboard/vite.feed-comments.ts";

// Scoped so the plugin only touches the dashboard, and `dashboard.html` is a
// separate entry, so a production build of index.html never pulls React in.
// `feedComments()` is the dev-only endpoint the reply box posts to. Leave it
// out and the box still renders and still accepts typing — it 404s on send,
// which is the failure nobody catches, because the page looks finished.
export default defineConfig({
  plugins: [react({ include: [/src\/dashboard\/.*\.tsx?$/] }), feedComments()],
});
```

`tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "moduleResolution": "bundler",
    "jsx": "react-jsx",
    "strict": true,
    "noEmit": true,
    "allowImportingTsExtensions": true,
    "skipLibCheck": true,
    "isolatedModules": true,
    "verbatimModuleSyntax": true,
    "types": ["vite/client"]
  },
  "include": ["src", "vite.config.ts"]
}
```

`"types": ["vite/client"]` is load-bearing: `main.tsx` imports a stylesheet for
its side effect, and without those declarations TypeScript 7 fails with
`TS2882: Cannot find module or type declarations for side-effect import of
'./dashboard.css'`.

`@types/node` is load-bearing too, but in the install line and not here. The
comment endpoint handles a raw `IncomingMessage`, and without the package `tsc`
fails with four `TS2339`s on `req.method` and `req.on`; Vite does not bring it
in on its own. It does **not** belong in `types` — all four states were measured,
and with the package installed the array makes no difference, while `"node"`
listed *without* the package installed turns the four errors into
`TS2688: Cannot find type definition file for 'node'`, which is worse than what
it was meant to prevent.

`index.html` — **not optional.** Vite needs it as the build entry; without it
`vite build` fails outright, and `/` in dev has nothing to show:

```html
<!doctype html>
<html lang="en">
  <head><meta charset="utf-8" /><title>feed-project</title></head>
  <body><p>The work feed is at <a href="/dashboard.html">/dashboard.html</a>.</p></body>
</html>
```

`.claude/settings.json`, so a comment reaches a running agent after its next
tool call rather than whenever someone remembers to look at the feed:

```json
{ "hooks": { "PostToolUse": [
  { "hooks": [{ "type": "command", "command": "node scripts/inbox.mjs", "timeout": 10,
                "statusMessage": "Checking work-feed comments" }] }
] } }
```
And `CLAUDE.md`, containing the block from step 3 above — the step that decides
whether any of this works.

Then edit `src/dashboard/config.ts` (project name, lede) and the `<title>` in
`dashboard.html`, and:

```bash
npx vite
```

The feed is at **<http://localhost:5173/dashboard.html>** — but read the URL Vite
prints rather than assuming that one. If 5173 is taken it silently moves to the
next free port, and you will spend a while looking at somebody else's dashboard
wondering why your posts are not in it. `--port 5211 --strictPort` makes it fail
loudly instead, which is what you want when another agent is already serving.

The page says "Nothing posted yet" until the first post lands. Leave it open,
put a real screenshot in `tmp/shots/`, and post from another shell — it picks the
post up within fifteen seconds, or immediately on Refresh:

```bash
node scripts/post.mjs --author "You" --text "Feed is up." --shot tmp/shots/proof.png
```

## Put the rule in the repo, not in the prompts

This is the single decision that determines whether the feed works.

Instructing each agent to post when you dispatch it fails in the way it sounds
like it will: you remember for the first two, forget for the rest, and agents
dispatched later by someone else never hear about it at all. What you get is the
orchestrator writing the feed and the agents posting once at the end — which is
exactly the second-hand reporting the feed existed to remove.

Put it in the repository's own instructions file (`CLAUDE.md`, `AGENTS.md`,
`CONTRIBUTING.md` — whatever every agent reads on arrival). Then it applies
automatically, to everyone, forever, including agents you did not launch.

## What to ask for

- **One line when you start**: what you are taking on and what you own.
- **The finding and the number, BEFORE the fix.** This is the most valuable post
  in any feed and the first one people drop. "The fill rig is 4× too orange in
  the shadows, reference darks are rgb(62,47,46), ours are rgb(113,84,61)" is
  worth more than the commit that follows it.
- **Negative results.** What you tried that did not work, and the measurement
  that told you so. Nobody posts these unless asked, and they are what stops the
  next agent repeating the attempt.
- **A screenshot** whenever an image makes the point better than words.
- **`problem`, immediately**, when blocked or when the fix belongs in a file the
  agent does not own — not at the end, when it is too late to redirect.
- Roughly one post per few minutes of real work. **No status pings**: "starting
  work", "still going", "making progress" are noise that trains people to stop
  reading.

## Every post carries an image

Enforce this in the command: no image, no post. A text-only update is what a log
looks like, and the failure mode this fixes is a feed nobody reads — a column of
grey paragraphs that the user scrolls past because nothing in it rewards
stopping.

Almost everything worth posting has a picture behind it. The render you just
changed. The graph of the thing you measured. The frame where the defect is
visible. If an agent cannot produce one, that is usually a sign the post is a
status ping rather than a finding.

Allow a declared escape hatch — `--nomedia "<reason>"` — and record the reason in
the post. Making the exception deliberate keeps it rare; making it impossible
just gets the rule ignored.

**Render the reason.** An exception the reader never sees is not an exception, it
is a text-only post with extra steps, and the rule quietly stops costing
anything. The dashboard prints it under the body: *no image — <reason>*.

**Images are attached, not linked.** A post is a thing you look at; a link is a
thing you promise to look at later, and nobody does.

## Cap the posts, and reject rather than truncate

Around 250 characters, **URLs and file paths excluded from the count** — a long
path should never be the reason a finding gets cut.

That exemption needs a bound of its own, or it is a hole rather than a kindness:
a post written entirely as `/a/b/c.ts /d/e/f.ts …` counts as zero and sails
through at any length. The command frees the first 500 characters of URL and
path per post; past that they cost like ordinary text. A path only qualifies if
it starts a token and names a file, so a bare `/usr` pays its way.

The cap is the point, not a technicality. Forced to cut, an author leads with the
finding and the number and drops the narration of their approach. Given room,
they write a paragraph, and a feed of paragraphs is a log.

Reject the over-long post instead of truncating it. Truncation silently eats the
last sentence, which is almost always the conclusion; rejection makes the author
decide what survives.

## The feed is the whole page

When you build a surface for it, build only the feed.

The temptation is a dashboard: a metrics strip, a table of which agent owns which
files, live embeds of the running build, a before/after comparison. Each is
obviously useful in isolation. Together they turn a thing people *read* into a
thing people scan once and close, and the posts — the only part that is actually
live — become a column in somebody's admin panel.

Anything worth showing goes inside a post: the screenshot attachment, or a link
to the page that proves it. Linkify bare URLs so an agent can drop a path and the
reader can click it.

(If you do embed a live view, mount exactly one. A 3D or video embed per panel
will out-cost the work being watched.)

## Design notes for the reading surface

Learned by building one and rejecting two attempts at it:

- A column of short posts is a **harder** typographic problem than a page of
  panels, not an easier one. With the panels gone, the rhythm, the line measure,
  and the way author/time/kind sit relative to the body *are* the design.
- Keep the measure near 60–65 characters. A 250-character post set to full window
  width reads badly.
- The gap **between** posts must exceed the padding **inside** them, or fifteen
  cards read as one receipt roll.
- Anything that only appears on some posts (a `done` marker, a badge) must not
  sit before something that appears on all of them, or the column's left edge
  jitters as you scroll.
- Exactly one thing may be saturated. Make it `problem`; demote `done` to
  something quiet.
- Separate posts by surface tone and one soft shadow, not by borders.

## Pitfalls
<!-- APPEND whenever the feed surfaces a new one. -->

- **The orchestrator ends up writing the feed.** Cause: the posting rule lived in
  dispatch prompts instead of the repo's instructions file. Symptom: a feed of
  the orchestrator's summaries quoting agents — its own blog. Rule: the repo file.
- **Agents post only when they finish.** Cause: the brief said "post your
  results". Symptom: silence for twenty minutes, then a wall. Rule: ask for the
  diagnosis before the fix, and for the failed attempts.
- **Posts grow into reports.** Cause: no cap, or a cap that truncates so nobody
  notices it. Rule: reject, and say the count.
- **Nobody dogfoods it.** Cause: whoever builds the surface never reads it as a
  user. Rule: have the agent building it publish its own progress through it.
- **The feed fills with unreadable, useless posts.** Cause: text-only updates are
  frictionless to write and worthless to read, so they crowd out the ones that
  matter. Rule: require an image on every post, enforced by the tool. The
  requirement doubles as a filter — an agent that cannot screenshot its finding
  usually did not have one.
