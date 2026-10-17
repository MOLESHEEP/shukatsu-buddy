import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { errorResponse } from "@/lib/api";
import { tickKey } from "@/lib/tick-key";
import { runDueChecks } from "@/lib/watch";

export const dynamic = "force-dynamic";

/**
 * Called every few minutes by the in-process scheduler (src/instrumentation.ts), or by any external cron with
 * header `x-tick-key` (see README). Checks the watched pages that are due.
 */
export async function POST(req: Request) {
  const got = Buffer.from(req.headers.get("x-tick-key") ?? "");
  const want = Buffer.from(tickKey());
  if (!process.env.AUTH_SECRET || got.length !== want.length || !timingSafeEqual(got, want)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  try {
    return NextResponse.json({ checked: await runDueChecks() });
  } catch (err) {
    return errorResponse(err);
  }
}
