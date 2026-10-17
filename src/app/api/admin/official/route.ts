import { z } from "zod";
import { readJson, withAdmin } from "@/lib/api";
import { publishSchedule } from "@/lib/watch";
import { PublishOptions, ScheduleInput } from "@/lib/watch-shared";

const Body = z.object({
  schedule: ScheduleInput,
  options: PublishOptions,
  /** The AI reading this was confirmed from, if any. */
  detection_id: z.number().int().positive().nullable().optional(),
});

export const POST = withAdmin(async (req, admin) => {
  const b = await readJson(req, Body);
  return publishSchedule(admin, b.schedule, b.options, b.detection_id);
});
