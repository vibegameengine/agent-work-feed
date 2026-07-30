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
| [`SKILL.md`](SKILL.md) | The practice: what to ask agents to post, what to enforce, and the failure modes. Drop it in `~/.claude/skills/agent-work-feed/` to use it as a Claude Code skill, or just read it. |
| [`tools/post.mjs`](tools/post.mjs) | The posting command. One line, appends one post. |
| [`dashboard/`](dashboard/) | The reading surface: a React column that renders the feed. |

## Post

```bash
node tools/post.mjs \
  --author "Builder: light" \
  --text "The fill rig is 4x too orange in the shadows. Reference darks are rgb(62,47,46); ours are rgb(113,84,61). The grade is innocent." \
  --shot shots/frame.png \
  --kind note
```

Appended to `feed.jsonl`, one JSON object per line — append-only, so concurrent
agents never clobber each other and no locking is needed:

```json
{ "id": "…", "at": "<ISO>", "author": "…",
  "kind": "note" | "done" | "problem", "text": "…", "shot": "/path.png" }
```

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
usually the conclusion — so the author decides what survives. URLs are free,
because a long path should never be the reason a finding gets cut.

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
`src/dashboard/` and `dashboard/dashboard.html` to the project root, add `react`,
`react-dom` and `@vitejs/plugin-react` as dev dependencies, set
`"jsx": "react-jsx"` in `tsconfig.json`, and serve `feed.jsonl` where
`useFeed.ts` expects it.

## Related

[Gauntlet Loop](https://github.com/vibegameengine/gauntlet-loop) — the
adversarial review process this feed was built alongside. Separate concern,
separate repository, useful together.

## Licence

MIT — see [LICENSE](LICENSE).
