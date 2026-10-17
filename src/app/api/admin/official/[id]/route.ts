import { z } from "zod";
import { idParam, readJson, withAdmin } from "@/lib/api";
import { setWithdrawn, updateSchedule } from "@/lib/watch";
import { PublishOptions, ScheduleInput } from "@/lib/watch-shared";

type Ctx = { params: Promise<{ id: string }> };

const Body = z.union([
  z.object({ schedule: ScheduleInput, options: PublishOptions }),
  /** 撤回 hides it from every calendar; false restores it. */
  z.object({ withdrawn: z.boolean() }),
]);

export const PATCH = withAdmin<Ctx>(async (req, admin, { params }) => {
  const id = idParam((await params).id);
  const b = await readJson(req, Body);
  if ("withdrawn" in b) {
    await setWithdrawn(admin, id, b.withdrawn);
    return { ok: true };
  }
  return updateSchedule(admin, id, b.schedule, b.options);
});
