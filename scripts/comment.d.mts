/**
 * Types for `comment.mjs`, which `vite.config.ts` imports so the dev-only
 * comment endpoint and the CLI share one implementation. Hand-written because
 * the script itself is plain Node with no build step — and it stays that way so
 * an agent can run it without anything being compiled first.
 */

export interface CommentRecord {
  id: string;
  at: string;
  author: string;
  kind: "comment";
  text: string;
  /** `["all"]` for a broadcast; otherwise the agents named by `@name` or `--to`. */
  to: string[];
  /** Id of the post being answered, when this is a reply. */
  re?: string;
  /** `ui` = written in the dashboard, so the human's own hand; `cli` = a command line, so an agent. */
  via: "ui" | "cli";
}

export interface CommentInput {
  /** Required. There is no default — a missing author used to become the human's name. */
  author?: string;
  text?: string;
  /** Array, or a comma-separated string. Merged with any `@name` found in `text`. */
  to?: string[] | string;
  re?: string;
  /** Only the dev server's endpoint may pass `"ui"`. Defaults to `"cli"`. */
  via?: "ui" | "cli";
  /** Defaults to `tmp/dashboard/feed.jsonl`, or `$FEED_FILE`. */
  feedFile?: string;
}

/** Appends one comment to the feed. Throws with a readable message on bad input. */
export function writeComment(input?: CommentInput): CommentRecord;

/** Lowercased, letters and digits only — how author names are compared. */
export function normalizeName(value: unknown): string;

/** Whether a comment addressed to `to` is meant for the agent posting as `author`. */
export function addressedTo(to: unknown, author: unknown): boolean;

/** The `@name` mentions in a body, in order. */
export function mentionsIn(text: string): string[];
