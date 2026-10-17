import { z } from "zod";
import { idParam, readJson, withUser } from "@/lib/api";
import { setDetectionStatus, trackDetection } from "@/lib/watch";
import { ScheduleInput } from "@/lib/watch-shared";

type Ctx = { params: Promise<{ id: string }> };

/** Dismiss (忽略) or restore a reading. */
export const PATCH = withUser<Ctx>(async (req, user, { params }) => {
  const { status } = await readJson(req, z.object({ status: z.enum(["new", "dismissed"]) }));
  await setDetectionStatus(user, idParam((await params).id), status);
  return { ok: true };
});

/** Copy the (corrected) reading into one's own tracker. */
export const POST = withUser<Ctx>(async (req, user, { params }) => trackDetection(user, idParam((await params).id), await readJson(req, ScheduleInput)));
