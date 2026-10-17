import { z } from "zod";
import { idParam, readJson, withUser } from "@/lib/api";
import { checkPageNow, deletePage, updatePage } from "@/lib/watch";
import { WatchPageInput } from "@/lib/watch-shared";

type Ctx = { params: Promise<{ id: string }> };

export const PATCH = withUser<Ctx>(async (req, user, { params }) => {
  await updatePage(user, idParam((await params).id), await readJson(req, WatchPageInput));
  return { ok: true };
});

export const DELETE = withUser<Ctx>(async (_req, user, { params }) => {
  await deletePage(user, idParam((await params).id));
  return { ok: true };
});

/** 立即检查. force: read with AI even if the page text has not changed. */
export const POST = withUser<Ctx>(async (req, user, { params }) => {
  const { force } = await readJson(req, z.object({ force: z.boolean().default(false) }));
  return checkPageNow(user, idParam((await params).id), force);
});
