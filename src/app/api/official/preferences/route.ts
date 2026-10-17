import { z } from "zod";
import { readJson, withUser } from "@/lib/api";
import { setShowOfficial } from "@/lib/watch";

/** Show / hide official schedules on one's calendar, dashboard and calendar feed. */
export const POST = withUser(async (req, user) => {
  const { show } = await readJson(req, z.object({ show: z.boolean() }));
  await setShowOfficial(user.id, show);
  return { ok: true };
});
