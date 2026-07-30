/**
 * The feed — the whole product.
 *
 * A fan-out of agents is opaque by construction: several file sets change at
 * once for minutes and everything the user hears arrives second-hand. Every
 * agent appends to the feed file itself, so this reads newest-first and the user
 * follows the work live instead of waiting for a summary.
 */

import type { ReactNode } from "react";
import { POST_COMMAND } from "../config";
import { dayKey, dayLabel } from "../format";
import type { Post } from "../types";
import { FeedPost } from "./FeedPost";

interface Props {
  posts: Post[] | null;
  error: string | null;
  now: number;
  nonce: number;
}

export function Feed({ posts, error, now, nonce }: Props): ReactNode {
  if (!posts) {
    return (
      <p className="empty">{error ? `feed.jsonl unavailable — ${error}` : "Reading the feed…"}</p>
    );
  }
  if (posts.length === 0) {
    return <p className="empty">Nothing posted yet. Agents write here with {POST_COMMAND}.</p>;
  }

  let day = "";
  return (
    <div className="feed">
      {posts.map((post) => {
        const key = dayKey(post.at);
        const opensDay = key !== day;
        day = key;
        return (
          <div className="feed-run" key={post.id}>
            {opensDay ? <h2 className="day">{dayLabel(post.at, now)}</h2> : null}
            <FeedPost post={post} now={now} nonce={nonce} />
          </div>
        );
      })}
      <p className="feed-end">That is everything posted so far.</p>
    </div>
  );
}
