import { z } from "zod";
import { HttpError, idParam, readJson, withAdmin } from "@/lib/api";
import { approvePost, rejectPost } from "@/lib/review";

type Ctx = { params: Promise<{ id: string }> };

const Body = z.object({
  action: z.enum(["approve", "reject"]),
  /** Shown to the author when rejecting. */
  note: z.string().trim().max(500).default(""),
});

/** Manual review: approve (publishes + rewards a point once) or reject a pending / rejected post. */
export const PATCH = withAdmin<Ctx>(async (req, admin, { params }) => {
  const id = idParam((await params).id);
  const { action, note } = await readJson(req, Body);
  const out =
    action === "approve"
      ? await approvePost(id, { by: "admin", reviewerId: admin.id, note })
      : await rejectPost(id, { by: "admin", reviewerId: admin.id, note: note || "不符合社区规则" });
  if (!out) throw new HttpError(409, "这篇分享的状态已经变了（可能已被处理或作者撤回），请刷新");
  return out;
});
