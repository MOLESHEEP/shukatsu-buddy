import { z } from "zod";
import { idParam, readJson, withAdmin } from "@/lib/api";
import { approveReport, rejectReport } from "@/lib/openings";
import { OpeningInput } from "@/lib/openings-shared";

type Ctx = { params: Promise<{ id: string }> };

const Body = z.discriminatedUnion("action", [
  /** fields: the admin's corrected values; omitted = publish the report as submitted. */
  z.object({ action: z.literal("approve"), fields: OpeningInput.optional() }),
  z.object({ action: z.literal("reject"), note: z.string().trim().max(500).default("") }),
]);

export const PATCH = withAdmin<Ctx>(async (req, admin, { params }) => {
  const id = idParam((await params).id);
  const body = await readJson(req, Body);
  if (body.action === "approve") return approveReport(admin, id, body.fields);
  await rejectReport(admin, id, body.note);
  return { ok: true };
});
