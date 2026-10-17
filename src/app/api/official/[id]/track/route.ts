import { idParam, withUser } from "@/lib/api";
import { trackOfficial } from "@/lib/watch";

type Ctx = { params: Promise<{ id: string }> };

/** Copies an official schedule into the user's own tracker. */
export const POST = withUser<Ctx>(async (_req, user, { params }) => trackOfficial(user, idParam((await params).id)));
