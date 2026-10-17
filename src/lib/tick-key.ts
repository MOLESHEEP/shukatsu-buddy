import { createHmac } from "node:crypto";

/**
 * Key for the internal scheduler endpoint, derived from AUTH_SECRET so there is nothing extra to configure.
 * No "server-only" import: instrumentation.ts uses it too. It only ever runs on the server.
 */
export function tickKey(): string {
  return createHmac("sha256", process.env.AUTH_SECRET ?? "").update("watch-tick").digest("base64url");
}
