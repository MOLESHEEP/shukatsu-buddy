import { z } from "zod";
import { readJson, withUser } from "@/lib/api";
import { markRead } from "@/lib/notifications";

/** POST {ids?} marks announcements as read ("知道了"); without ids marks everything. */
export const POST = withUser(async (req, user) => {
  const { ids } = await readJson(req, z.object({ ids: z.array(z.number().int()).max(200).optional() }));
  await markRead(user.id, ids);
  return { ok: true };
});
