/**
 * The one piece of chrome: a translucent bar that floats over the column.
 *
 * It carries only what the feed cannot say itself — that the page is still
 * reading the file, how much is in it, and a way to re-read it now.
 */

import type { ReactNode } from "react";
import { POLL_MS } from "../usePolling";

interface Props {
  count: number;
  /** Set while the last read of feed.jsonl failed. */
  error: string | null;
  onReload: () => void;
}

export function Header({ count, error, onReload }: Props): ReactNode {
  return (
    <header className="chrome">
      <div className="chrome-inner">
        <span className="chrome-brand">Zoo Drift</span>
        <span
          className={error ? "status status-off" : "status"}
          title={`feed.jsonl is re-read every ${Math.round(POLL_MS / 1000)} seconds`}
        >
          <i className="status-dot" aria-hidden="true" />
          {error ? "not reading feed.jsonl" : `live · ${count} ${count === 1 ? "post" : "posts"}`}
        </span>
        <button type="button" className="btn" onClick={onReload}>
          Refresh
        </button>
      </div>
    </header>
  );
}
