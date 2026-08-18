import type { Plugin } from "vite";
import { writeComment } from "../scripts/comment.mjs";

/** Dev-only endpoint for the dashboard's human comment composer. */
export function feedComments(): Plugin {
  return { name: "feed-comments", apply: "serve", configureServer(server) {
    server.middlewares.use("/__feed/comment", (req, res, next) => {
      if (req.method !== "POST") return next();
      let body = "";
      req.on("data", (chunk) => { body += chunk; if (body.length > 100_000) req.destroy(); });
      req.on("end", () => { try {
        const input = JSON.parse(body || "{}");
        const record = writeComment({ author: String(input.author ?? "").trim() || "Human", text: input.text, to: input.to, re: input.re, via: "ui" });
        res.setHeader("content-type", "application/json"); res.end(JSON.stringify(record));
      } catch (error) { res.statusCode = 400; res.end(error instanceof Error ? error.message : String(error)); } });
    });
  }};
}
