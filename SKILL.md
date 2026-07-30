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
  "kind": "note" | "done" | "problem", "text": "...", "shot": "/path.png"? }
```

One command to post — keep it to one, because anything that takes two steps gets
skipped under load:

```bash
node tools/post.mjs --author "Who" --text "What happened" [--shot path.png] [--kind note|done|problem]
```

A reference implementation of the CLI and a React reading column that renders it
live at <https://github.com/vibegameengine/gauntlet-loop>.

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

**Images are attached, not linked.** A post is a thing you look at; a link is a
thing you promise to look at later, and nobody does.

## Cap the posts, and reject rather than truncate

Around 250 characters, **URLs excluded from the count** — a long path should
never be the reason a finding gets cut.

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
