/**
 * The work feed — open /dashboard.html while a multi-agent pass is running.
 *
 * The page is one column of posts and nothing else. Every agent appends to the
 * feed file itself, so the user reads the work as it happens rather than waiting
 * for the manager to relay it. Anything a post needs to show, the post carries:
 * the screenshot is attached, not linked.
 *
 * The project's name and the feed's URL live in `config.ts`, not here.
 */

import { useCallback, useState, type ReactNode } from "react";
import { Feed } from "./components/Feed";
import { Header } from "./components/Header";
import { LEDE, TITLE } from "./config";
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
          <h1>{TITLE}</h1>
          <p className="lede">{LEDE}</p>
        </div>
        <Feed posts={feed.data} error={feed.error} now={now} nonce={nonce} />
      </main>
    </>
  );
}
