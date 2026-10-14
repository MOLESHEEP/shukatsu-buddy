import { HttpError, idParam, withUser } from "@/lib/api";
import { addToTracker, getOpening } from "@/lib/openings";

type Ctx = { params: Promise<{ id: string }> };

/** Copies a public record into the user's tracker (company card + 开放 / 截止 events) and follows the company. */
export const POST = withUser<Ctx>(async (_req, user, { params }) => {
  const o = await getOpening(idParam((await params).id));
  if (!o) throw new HttpError(404, "这条记录已经不存在了");
  return { companyId: await addToTracker(user.id, o) };
});
