/**
 * Everything about this dashboard that is specific to YOUR project.
 *
 * Edit this file after copying the dashboard in; nothing else in `app/` names a
 * project. (The one thing that cannot live here is the `<title>` in
 * `dashboard.html` — plain HTML, no imports — so change that too.)
 */

/** Shown in the floating bar, top left. Your project's name. */
export const BRAND = "Your project";

/** The page's own heading. "Work feed" is usually right; it is what this is. */
export const TITLE = "Work feed";

/** One line under the heading, telling a first-time reader what they are looking at. */
export const LEDE = "Everyone working on this project posts here as they go — the finding first, then the fix.";

/**
 * Where the browser fetches the feed. MUST resolve to the same file
 * `scripts/post.mjs` appends to (its `FEED` constant), and must be under the dev
 * server's root — a path outside it 404s and the page sits on its empty state
 * with nothing to say why. Default pair: `tmp/dashboard/feed.jsonl` on disk,
 * this URL over HTTP.
 */
export const FEED_URL = "/tmp/dashboard/feed.jsonl";

/** How the empty state tells a reader to post. Keep it copy-pasteable. */
export const POST_COMMAND = "scripts/post.mjs";
