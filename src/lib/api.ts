import "server-only";
import { NextResponse } from "next/server";
import { z } from "zod";
import { getUser, type User } from "./auth";

export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

/** Wraps a route handler: resolves the signed-in user and turns errors into JSON responses. */
export function withUser<Ctx>(handler: (req: Request, user: User, ctx: Ctx) => Promise<Response | unknown>) {
  return async (req: Request, ctx: Ctx) => {
    try {
      const user = await getUser();
      if (!user) throw new HttpError(401, "请先登录");
      const out = await handler(req, user, ctx);
      return out instanceof Response ? out : NextResponse.json(out ?? { ok: true });
    } catch (err) {
      return errorResponse(err);
    }
  };
}

export function withAdmin<Ctx>(handler: (req: Request, user: User, ctx: Ctx) => Promise<Response | unknown>) {
  return withUser<Ctx>(async (req, user, ctx) => {
    if (user.role !== "admin") throw new HttpError(403, "需要管理员权限");
    return handler(req, user, ctx);
  });
}

export function errorResponse(err: unknown) {
  if (err instanceof HttpError) return NextResponse.json({ error: err.message }, { status: err.status });
  if (err instanceof z.ZodError) {
    return NextResponse.json({ error: "输入不完整：" + err.issues.map((i) => i.path.join(".")).join(", ") }, { status: 400 });
  }
  console.error(err);
  const msg = err instanceof Error ? err.message : "服务器错误";
  return NextResponse.json({ error: msg }, { status: 500 });
}

export async function readJson<T extends z.ZodType>(req: Request, schema: T): Promise<z.infer<T>> {
  const body = await req.json().catch(() => {
    throw new HttpError(400, "请求格式错误");
  });
  return schema.parse(body);
}

export function idParam(value: string): number {
  const id = Number(value);
  if (!Number.isInteger(id) || id <= 0) throw new HttpError(400, "无效的 id");
  return id;
}
