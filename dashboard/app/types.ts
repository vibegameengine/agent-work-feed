/**
 * The one file the dashboard reads — `FEED_URL` in `config.ts`.
 *
 * It is appended to by several processes at once while a pass runs, so nothing
 * here may be assumed valid — see `parse.ts`, the only place this shape is
 * constructed.
 */

export type PostKind = "note" | "done" | "problem";

export interface Post {
  id: string;
  /** ISO timestamp. */
  at: string;
  author: string;
  kind: PostKind;
  /** Capped at ~250 characters by the poster, so every post is a few lines. */
  text: string;
  /** Root-relative screenshot URL, e.g. `/tmp/shots/road-check.png`. */
  shot?: string;
  /**
   * Why this post has no screenshot, from `--nomedia`. Rendered, not just
   * recorded: an exception nobody sees is an exception nobody keeps rare.
   */
  nomedia?: string;
}
