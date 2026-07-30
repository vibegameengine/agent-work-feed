/**
 * Defensive reader for the feed file.
 *
 * `feed.jsonl` is appended to by several processes at once, so a half-written
 * trailing line or a missing key is normal rather than exceptional. Nothing here
 * throws: bad input degrades to a shorter list, never to a blank page.
 */

import type { Post, PostKind } from "./types";

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

const str = (v: unknown, fallback = ""): string => (typeof v === "string" ? v : fallback);

const POST_KINDS: readonly PostKind[] = ["note", "done", "problem"];

function postKind(v: unknown): PostKind {
  return POST_KINDS.find((k) => k === v) ?? "note";
}

/** One JSON object per line; a malformed or half-flushed line is skipped. */
export function toFeed(text: string): Post[] {
  const posts: Post[] = [];
  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    let raw: unknown;
    try {
      raw = JSON.parse(trimmed);
    } catch {
      continue;
    }
    if (!isRecord(raw)) continue;
    const id = str(raw.id);
    const textBody = str(raw.text);
    if (!id || !textBody) continue;
    const shot = str(raw.shot);
    const nomedia = str(raw.nomedia);
    posts.push({
      id,
      at: str(raw.at),
      author: str(raw.author, "anonymous"),
      kind: postKind(raw.kind),
      text: textBody,
      ...(shot ? { shot } : {}),
      ...(!shot && nomedia ? { nomedia } : {}),
    });
  }
  // The file is append-only, so it is oldest-first on disk. The feed reads newest-first.
  return posts.reverse();
}
