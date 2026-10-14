import { z } from "zod";
import { HttpError, readJson, withAdmin } from "@/lib/api";
import { saveOpening } from "@/lib/openings";
import { OpeningInput } from "@/lib/openings-shared";

const Body = z.union([
  z.object({ item: OpeningInput, notify: z.boolean().default(true) }),
  /** Bulk paste: each row is saved on its own, so one bad row doesn't block the rest. */
  z.object({ items: z.array(z.unknown()).min(1).max(200), notify: z.boolean().default(true) }),
]);

export const POST = withAdmin(async (req, admin) => {
  const body = await readJson(req, Body);
  if ("item" in body) return saveOpening(admin, body.item, { notify: body.notify });

  const results: { row: number; ok: boolean; created?: boolean; notified?: number; error?: string }[] = [];
  for (const [i, raw] of body.items.entries()) {
    try {
      const item = OpeningInput.parse(raw);
      const r = await saveOpening(admin, item, { notify: body.notify });
      results.push({ row: i + 1, ok: true, created: r.created, notified: r.notified });
    } catch (err) {
      const error =
        err instanceof z.ZodError ? err.issues.map((x) => x.message).join("；") : err instanceof HttpError ? err.message : "保存失败";
      results.push({ row: i + 1, ok: false, error });
    }
  }
  return { results };
});
