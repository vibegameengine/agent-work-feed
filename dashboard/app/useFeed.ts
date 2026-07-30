/** `tmp/dashboard/feed.jsonl` — the append-only stream every agent posts to. */

import { toFeed } from "./parse";
import type { Post } from "./types";
import { usePolling, type Polled } from "./usePolling";

const URL = "/tmp/dashboard/feed.jsonl";

export function useFeed(nonce: number): Polled<Post[]> {
  return usePolling(URL, toFeed, nonce);
}
