# Agent work feed

Use the shared feed at `tmp/dashboard/feed.jsonl`. Every agent posts under one
stable `--author` name when it starts, when it finds a cause, when it changes
the result, when blocked, and when done:

```bash
node scripts/post.mjs --author "<your name>" --text "<finding first>" --shot <path.png> --kind note|done|problem
```

Human comments arrive automatically through the `PostToolUse` hook. Treat
`[FOR YOU]` as an instruction: before another tool call, acknowledge it with
`scripts/ack.mjs`, then act on it immediately. Treat `[TO ANOTHER AGENT]` as
context only. Agents must not use `comment.mjs`; that channel belongs to the
human.

```bash
node scripts/ack.mjs --author "<your name>" --re <comment-id> --emoji 👀 --text "Got it, <action>"
```
