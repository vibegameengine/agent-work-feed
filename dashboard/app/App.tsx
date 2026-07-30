/**
 * The work feed — open /dashboard.html while a multi-agent pass is running.
 *
 * The page is one column of posts and nothing else. Every agent appends to
 * `tmp/dashboard/feed.jsonl` itself, so the user reads the work as it happens
 * rather than waiting for the manager to relay it. Anything a post needs to
 * show, the post carries: a screenshot, or a link to a page you can open.
 */

import { useCallback, useState, type ReactNode } from "react";
import { Feed } from "./components/Feed";
import { Header } from "./components/Header";
import { useFeed } from "./useFeed";
import { useNow } from "./useNow";

export function App(): ReactNode {
  // One nonce for the file and every <img>: bumping it re-reads the feed and
  // re-fetches the screenshots, which are overwritten in place as the loop runs.
  const [nonce, setNonce] = useState(() => Date.now());
  const reload = useCallback(() => setNonce(Date.now()), []);
  const now = useNow();
  const feed = useFeed(nonce);
  const count = feed.data?.length ?? 0;

  return (
    <>
      <Header count={count} error={feed.data ? null : feed.error} onReload={reload} />
      <main className="page">
        <div className="page-head">
          <h1>Work feed</h1>
          <p className="lede">
            Everyone building Zoo Drift posts here as they work — the finding first, then the fix.
          </p>
        </div>
        <Feed posts={feed.data} error={feed.error} now={now} nonce={nonce} />
      </main>
    </>
  );
}
