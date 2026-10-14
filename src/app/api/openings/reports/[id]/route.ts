import { idParam, withUser } from "@/lib/api";
import { withdrawReport } from "@/lib/openings";

type Ctx = { params: Promise<{ id: string }> };

/** Withdraw one's own report while it is still pending. */
export const DELETE = withUser<Ctx>(async (_req, user, { params }) => {
  await withdrawReport(user.id, idParam((await params).id));
  return { ok: true };
});
