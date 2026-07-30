/**
 * One post: who, how long ago, what happened, and — when the author attached
 * one — the screenshot that proves it.
 *
 * Memoised and keyed by post id upstream, so a poll that only appends a line
 * leaves every existing post's DOM (and its already-decoded image) untouched —
 * which is also what keeps the entrance animation honest: it runs on mount, so
 * only genuinely new posts animate in.
 */

import { memo, type ReactNode } from "react";
import { absoluteTime, relativeTime } from "../format";
import type { Post } from "../types";
import { PostBody } from "./PostBody";
import { PostMedia } from "./PostMedia";

interface Props {
  post: Post;
  /** Passed in rather than read from the clock so all posts age together. */
  now: number;
  nonce: number;
}

function FeedPostImpl({ post, now, nonce }: Props): ReactNode {
  return (
    <article className={`post post-${post.kind}`}>
      {/* One tight cluster — who, when, and only sometimes a flag. `done` is a
          5px dot before the name; `problem` is the only saturated thing on the
          page and trails the line where it cannot be missed. */}
      <div className="post-head">
        <span className="post-author">{post.author}</span>
        <time className="post-time" dateTime={post.at} title={absoluteTime(post.at)}>
          {relativeTime(post.at, now)}
        </time>
        {post.kind === "done" ? <span className="tag-done">done</span> : null}
        {post.kind === "problem" ? <span className="badge-problem">problem</span> : null}
      </div>
      <PostBody text={post.text} />
      {post.shot ? <PostMedia src={post.shot} author={post.author} nonce={nonce} /> : null}
      {/* The declared escape hatch, shown rather than merely recorded — an
          exception the reader never sees is one that stops being an exception. */}
      {!post.shot && post.nomedia ? (
        <p className="post-nomedia">no image — {post.nomedia}</p>
      ) : null}
    </article>
  );
}

export const FeedPost = memo(FeedPostImpl);
