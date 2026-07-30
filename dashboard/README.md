# The reading surface

A React column that renders `feed.jsonl` and nothing else.

You do not need it to start. The feed is a text file; `tail -f feed.jsonl` next
to an image viewer is a working version zero. Add this when someone is actually
watching.

If you have no project at all yet, do not start here — the "from scratch in five
minutes" block in [`../SKILL.md`](../SKILL.md) writes the `package.json`,
`vite.config.ts`, `tsconfig.json` and `index.html` for you, then comes back to
this list.

## Wiring it into a Vite project

1. Copy `app/` to `src/dashboard/` and `dashboard.html` to the project root.
2. `npm i -D react react-dom @types/react @types/react-dom @vitejs/plugin-react`
   — the `@types/*` two are not optional; `tsc` fails without them.
3. Add `@vitejs/plugin-react` to `vite.config.ts`, scoped to the dashboard so it
   does not process the rest of the project:
   `react({ include: [/src\/dashboard\/.*\.tsx?$/] })`
4. Set `"jsx": "react-jsx"` in `tsconfig.json`.
5. **Edit `src/dashboard/config.ts`.** It is the only file in `app/` that names a
   project: `BRAND` (the bar, top left), `TITLE`, `LEDE` (the line under the
   heading), `FEED_URL`, and `POST_COMMAND` (what the empty state tells people to
   run). Ship it unedited and your dashboard is branded "Your project".
6. Change the `<title>` in `dashboard.html` too — it is plain HTML and cannot
   import the config. It is the one piece of branding that lives outside it.
7. Check `FEED_URL` against `FEED` in `scripts/post.mjs`. They must resolve to the
   same file, and it must be under the dev server's root — Vite serves anything
   under the project directory in dev, including gitignored `tmp/`, which is
   exactly why the default pair (`tmp/dashboard/feed.jsonl` on disk,
   `/tmp/dashboard/feed.jsonl` over HTTP) works with no config. If the two
   disagree, the page shows "Nothing posted yet" forever and says nothing about
   why. If you would rather not rely on that, put the feed in `public/` instead
   and set both constants to match.

`dashboard.html` is a separate Vite entry, and `index.html` is the one `vite
build` ships — so your production bundle never includes React. You do need an
`index.html`: without one the build has no entry and fails.

**If the project already aliases `react` to a stub** — some Three.js projects do
this to keep React out of the bundle while using a library that imports it —
narrow the alias with a `customResolver` that only returns the stub when the
importer is that library, or your dashboard silently resolves React to an empty
module and fails in ways that make no sense.

## What it deliberately does not have

No metrics strip, no agent-ownership table, no live embeds of the build under
review, no before/after panel. Each is obviously useful in isolation, and
together they turn a thing people read into a thing people scan once and close.
Anything worth showing goes inside a post.
