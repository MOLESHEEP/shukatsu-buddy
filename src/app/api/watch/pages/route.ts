import { readJson, withUser } from "@/lib/api";
import { addPage, listPages, requireWatch } from "@/lib/watch";
import { WatchPageInput } from "@/lib/watch-shared";

export const GET = withUser(async (_req, user) => {
  requireWatch(user);
  return { pages: await listPages(user) };
});

export const POST = withUser(async (req, user) => ({ id: await addPage(user, await readJson(req, WatchPageInput)) }));
