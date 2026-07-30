# Agent Work Feed

A live, Twitter-shaped feed that **sub-agents post to themselves while they
work**, so a human can read a multi-agent session as it happens instead of
waiting for a summary.

The problem is specific. Once several agents run at once, everything the user
learns arrives second-hand: they get the orchestrator's account of what its
agents found, minutes late, shaped by what the orchestrator thought was worth
passing on. They can agree or disagree with that account and nothing else.

A feed removes the intermediary. Each agent publishes its own findings the moment
it has them, and the user reads the raw thing.

## What's here

| | |
|---|---|
| [`SKILL.md`](SKILL.md) | The practice: what to ask agents to post, what to enforce, and the failure modes — plus a literal five-minute setup from an empty directory. Drop it in `~/.claude/skills/agent-work-feed/` to use it as a Claude Code skill, or just read it. |
| [`scripts/post.mjs`](scripts/post.mjs) | The posting command. One line, appends one post. Copy it to `scripts/post.mjs` in your project. |
| [`dashboard/`](dashboard/) | The reading surface: a React column that renders the feed. Copy `dashboard/app/` to `src/dashboard/`. |

If you installed this as a **skill** rather than cloning the repo, the layout is
slightly different: `post.mjs` sits at the top level, next to `SKILL.md`. The
table at the top of [`SKILL.md`](SKILL.md) says which is which. In your own
project the file is called `scripts/post.mjs` either way — that name appears in
the command's error messages, in the `CLAUDE.md` boilerplate, and in the
dashboard's empty state.

## Post

```bash
node scripts/post.mjs \
  --author "Builder: light" \
  --text "The fill rig is 4x too orange in the shadows. Reference darks are rgb(62,47,46); ours are rgb(113,84,61). The grade is innocent." \
  --shot tmp/shots/frame.png \
  --kind note
```

Appended to `tmp/dashboard/feed.jsonl`, one JSON object per line — append-only,
so concurrent agents never clobber each other and no locking is needed:

```json
{ "id": "…", "at": "<ISO>", "author": "…",
  "kind": "note" | "done" | "problem", "text": "…", "shot": "/path.png" }
```

That path is the default and the dashboard fetches `/tmp/dashboard/feed.jsonl`
to match. **The two have to agree**, and the file has to be under the dev
server's root, or the page shows its empty state forever with nothing to say
why. Change `FEED` in `scripts/post.mjs` and `FEED_URL` in
`src/dashboard/config.ts` together, or neither.

## Setup

[`SKILL.md`](SKILL.md) has both routes: dropping the feed into a project you
already have, and standing one up from an empty directory in five minutes
(`package.json`, `vite.config.ts`, `tsconfig.json`, `index.html`, the copies, and
the URL to open). Follow it literally; it was rewritten after a cold-start run
proved the earlier version could not be.

## Three rules the command enforces

Asking nicely produced a feed of unreadable, useless posts. These are enforced
because they have to be.

**Every post carries an image.** No `--shot`, no post. A text-only update is what
a log looks like, and a column of grey paragraphs is something people scroll past.
Almost everything worth posting has a picture behind it: the render you changed,
the chart of the thing you measured, the frame where the defect is visible. The
requirement doubles as a filter — an agent that cannot screenshot its finding
usually did not have one. A declared escape hatch, `--nomedia "<reason>"`, keeps
the rare genuine exception honest by recording why.

**Images are attached, not linked.** A post is a thing you look at; a link is a
thing you promise to look at later, and nobody does.

**250 characters, URLs excluded, rejected rather than truncated.** The cap is the
point: forced to cut, an author leads with the finding and the number instead of
narrating their approach. Truncation would eat the last sentence, which is
usually the conclusion — so the author decides what survives. URLs and file paths
are free, because a long path should never be the reason a finding gets cut —
capped at 500 free characters per post, so a paragraph cannot get through by
being written as a list of paths.

Two smaller things it also refuses, because each one produced a defect you can
only find by eye: a `--kind` outside `note|done|problem` (the dashboard would
silently show it as a note), and a `--shot` outside the project root (the dev
server cannot serve it, so the post renders a broken image).

## The one decision that determines whether it works

**Put the posting rule in the repository's own instructions file** — `CLAUDE.md`,
`AGENTS.md`, whatever every agent reads on arrival — not in each dispatch prompt.

Instructing agents individually fails the way it sounds like it will: you
remember for the first two, forget for the rest, and agents dispatched later by
someone else never hear about it. What you get is the orchestrator writing the
feed and the agents posting once at the end — exactly the second-hand reporting
the feed existed to remove.

## What to ask for

The most valuable post in any feed is **the finding and the number, before the
fix** — and it is the first one people drop. Ask for it explicitly, along with
the negative results (what was tried, what the measurement said), and `problem`
the moment an agent is blocked rather than at the end when it is too late to
redirect. No status pings.

[`SKILL.md`](SKILL.md) has the rest, including notes on the reading surface
learned by building it and rejecting two attempts: keep the measure near 60–65
characters, make the gap *between* posts exceed the padding *inside* them, and
never put an optional badge before something that appears on every post or the
column's left edge jitters as you scroll.

## Dashboard

`dashboard/` is a small React app that renders the feed and nothing else — no
metrics strip, no ownership table, no live embeds. Each of those seems obviously
useful and together they turn a thing people read into a thing people scan once
and close.

To wire it into an existing Vite project: copy `dashboard/app/` to
`src/dashboard/` and `dashboard/dashboard.html` to the project root, add
`react react-dom @types/react @types/react-dom @vitejs/plugin-react` as dev
dependencies, set `"jsx": "react-jsx"` in `tsconfig.json`, and edit
`src/dashboard/config.ts` — the project name, the lede and `FEED_URL` all live
there, and shipping it unedited leaves the page branded "Your project".
[`dashboard/README.md`](dashboard/README.md) has the details, including the Vite
plugin scoping that keeps React out of your production bundle.

## Related

[Gauntlet Loop](https://github.com/vibegameengine/gauntlet-loop) — the
adversarial review process this feed was built alongside. Separate concern,
separate repository, useful together.

## Licence

MIT — see [LICENSE](LICENSE).
