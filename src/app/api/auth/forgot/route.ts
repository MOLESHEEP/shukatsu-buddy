import { z } from "zod";
import { NextResponse } from "next/server";
import { errorResponse, HttpError, readJson } from "@/lib/api";
import { queryOne } from "@/lib/db";
import { mailEnabled, sendMail } from "@/lib/mail";
import { createResetLink } from "@/lib/password-reset";
import { clientIp } from "@/lib/signup";
import { hit, hits } from "@/lib/throttle";

const Body = z.object({ email: z.string().trim().toLowerCase().email("邮箱格式不正确"), website: z.string().optional() });

const DONE = { ok: true, message: "如果这个邮箱注册过，我们已经发送了重置链接，请在 1 小时内查收（也看看垃圾邮件箱）。" };

const esc = (s: string) => s.replace(/[<>&"]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;" })[c]!);

/**
 * Always answers the same way whether or not the email exists, so it can't be used to discover accounts.
 * Limits: 10 requests per IP per hour, 3 emails per address per hour.
 */
export async function POST(req: Request) {
  try {
    if (!mailEnabled()) throw new HttpError(400, "本站未开启邮件找回，请联系管理员重置密码");
    const b = await readJson(req, Body);
    if (b.website) return NextResponse.json(DONE);
    const ip = clientIp(req);
    if ((await hits("forgot_ip", ip, 60)) >= 10) throw new HttpError(429, "请求太频繁，请稍后再试");
    await hit("forgot_ip", ip);

    if ((await hits("forgot_email", b.email, 60)) >= 3) return NextResponse.json(DONE);
    await hit("forgot_email", b.email);

    const user = await queryOne<{ id: number; display_name: string }>(`SELECT id, display_name FROM users WHERE email = $1 AND status = 'active'`, [b.email]);
    if (user) {
      const link = await createResetLink(user.id, "email", 60);
      const name = user.display_name || "同学";
      // Fire and forget: the response must not reveal whether a mail was sent (or how long SMTP took).
      void sendMail(
        b.email,
        "【就活小助手】重置密码",
        `${name}，你好：\n\n我们收到了重置密码的请求。请在 1 小时内打开下面的链接设置新密码（只能使用一次）：\n${link}\n\n如果不是你本人操作，忽略这封邮件即可，你的密码不会改变。`,
        `<div style="font-family:system-ui,'PingFang SC','Microsoft YaHei',sans-serif;max-width:480px;margin:auto;padding:24px;color:#2f2a36">
          <h2 style="margin:0 0 12px">重置密码</h2>
          <p>${esc(name)}，你好：</p>
          <p>我们收到了重置密码的请求。请在 <b>1 小时内</b>点击下面的按钮设置新密码（只能使用一次）。</p>
          <p style="margin:24px 0"><a href="${link}" style="background:#ef6f8a;color:#fff;padding:12px 24px;border-radius:999px;text-decoration:none">设置新密码</a></p>
          <p style="font-size:12px;color:#7d768a">按钮打不开的话，复制这个链接到浏览器：<br>${link}</p>
          <p style="font-size:12px;color:#7d768a">如果不是你本人操作，忽略这封邮件即可，你的密码不会改变。</p>
        </div>`,
      ).catch((err) => console.error("[mail] reset email failed:", err instanceof Error ? err.message : err));
    }
    return NextResponse.json(DONE);
  } catch (err) {
    return errorResponse(err);
  }
}
