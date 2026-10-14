import { z } from "zod";
import { readJson, withUser } from "@/lib/api";
import { follow, followTracker, unfollow } from "@/lib/openings";

const Body = z.union([
  z.object({ company_name: z.string().trim().min(1, "公司必填").max(100) }),
  /** Follow every active company in the tracker at once. */
  z.object({ from_tracker: z.literal(true) }),
]);

export const POST = withUser(async (req, user) => {
  const body = await readJson(req, Body);
  if ("from_tracker" in body) return { added: await followTracker(user.id) };
  await follow(user.id, body.company_name);
  return { ok: true };
});

export const DELETE = withUser(async (req, user) => {
  const { key } = await readJson(req, z.object({ key: z.string().min(1).max(200) }));
  await unfollow(user.id, key);
  return { ok: true };
});
