import { readJson, withUser } from "@/lib/api";
import { listOpenings, submitReport } from "@/lib/openings";
import { OpeningReportInput } from "@/lib/openings-shared";

export const GET = withUser(async (req, user) => {
  const sp = new URL(req.url).searchParams;
  const grad = Number(sp.get("grad")) || undefined;
  return { openings: await listOpenings(user.id, { q: sp.get("q")?.trim() || undefined, scope: sp.get("scope") === "following" ? "following" : "all", grad }) };
});

/** A user's report. Public → review queue; private → only the user's own tracker. */
export const POST = withUser(async (req, user) => submitReport(user, await readJson(req, OpeningReportInput)));
