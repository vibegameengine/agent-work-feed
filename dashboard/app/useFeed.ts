/** The append-only stream every agent posts to. Its URL is `FEED_URL` in `config.ts`. */

import { FEED_URL } from "./config";
import { toFeed } from "./parse";
import type { Post } from "./types";
import { usePolling, type Polled } from "./usePolling";

export function useFeed(nonce: number): Polled<Post[]> {
  return usePolling(FEED_URL, toFeed, nonce);
}
