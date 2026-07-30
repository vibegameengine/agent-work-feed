# The reading surface

A React column that renders `feed.jsonl` and nothing else.

You do not need it to start. The feed is a text file; `tail -f feed.jsonl` next
to an image viewer is a working version zero. Add this when someone is actually
watching.

## Wiring it into a Vite project

1. Copy `app/` to `src/dashboard/` and `dashboard.html` to the project root.
2. `npm i -D react react-dom @types/react @types/react-dom @vitejs/plugin-react`
3. Add `@vitejs/plugin-react` to `vite.config.ts`, scoped to the dashboard so it
   does not process the rest of the project:
   `react({ include: [/src\/dashboard\/.*\.tsx?$/] })`
4. Set `"jsx": "react-jsx"` in `tsconfig.json`.
5. Point `useFeed.ts` at wherever the dev server serves `feed.jsonl`.

`dashboard.html` is a separate Vite entry, so a production build that ships
`index.html` never includes React.

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
