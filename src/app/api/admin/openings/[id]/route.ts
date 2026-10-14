import { z } from "zod";
import { idParam, readJson, withAdmin } from "@/lib/api";
import { deleteOpening, saveOpening } from "@/lib/openings";
import { OpeningInput } from "@/lib/openings-shared";

type Ctx = { params: Promise<{ id: string }> };

export const PATCH = withAdmin<Ctx>(async (req, admin, { params }) => {
  const id = idParam((await params).id);
  const { item, notify } = await readJson(req, z.object({ item: OpeningInput, notify: z.boolean().default(true) }));
  return saveOpening(admin, item, { id, notify });
});

export const DELETE = withAdmin<Ctx>(async (_req, _admin, { params }) => {
  await deleteOpening(idParam((await params).id));
  return { ok: true };
});
