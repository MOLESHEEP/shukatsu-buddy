import { randomBytes } from "node:crypto";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { NextResponse } from "next/server";
import { transaction } from "@/lib/db";
import { createSession } from "@/lib/auth";
import { errorResponse, HttpError, readJson } from "@/lib/api";
import { adminEmails } from "@/lib/db";
import { clientIp, getSignupSettings, hashIp } from "@/lib/signup";

const Body = z.object({
  email: z.string().trim().toLowerCase().email("邮箱格式不正确"),
  password: z.string().min(8, "密码至少 8 位"),
  display_name: z.string().trim().max(40).optional(),
  invite_code: z.string().trim().toUpperCase().max(20).optional(),
  /** Honeypot: hidden from humans, bots fill it in. */
  website: z.string().optional(),
});

export async function POST(req: Request) {
  try {
    const body = await readJson(req, Body);
    if (body.website) throw new HttpError(400, "注册失败，请刷新页面后重试");

    const s = await getSignupSettings();
    const isAdminEmail = adminEmails().includes(body.email);
    const ipHash = hashIp(clientIp(req));
    const hash = await bcrypt.hash(body.password, 10);

    const userId = await transaction(async (q) => {
      // Serialize sign-ups so the caps below can't be raced past.
      await q(`SELECT pg_advisory_xact_lock(7340001)`);
      if ((await q(`SELECT 1 FROM users WHERE email = $1`, [body.email])).length) throw new HttpError(409, "这个邮箱已经注册过了");

      let invite: string | null = null;
      if (!isAdminEmail) {
        if (s.mode === "closed") throw new HttpError(403, s.message || "目前暂停新用户注册。");
        if (s.maxUsers != null) {
          const [{ n }] = await q<{ n: number }>(`SELECT count(*)::int AS n FROM users WHERE role <> 'admin'`);
          if (n >= s.maxUsers) throw new HttpError(403, s.message || "注册名额已满，请稍后再来。");
        }
        if (s.dailyMax != null) {
          const [{ n }] = await q<{ n: number }>(`SELECT count(*)::int AS n FROM users WHERE created_at > now() - interval '1 day'`);
          if (n >= s.dailyMax) throw new HttpError(429, "今天的注册名额已满，请明天再来。");
        }
        if (s.perIpDaily != null) {
          const [{ n }] = await q<{ n: number }>(`SELECT count(*)::int AS n FROM users WHERE signup_ip_hash = $1 AND created_at > now() - interval '1 day'`, [ipHash]);
          if (n >= s.perIpDaily) throw new HttpError(429, "这个网络今天注册的账号太多了，请明天再试。");
        }
        if (s.mode === "invite") {
          if (!body.invite_code) throw new HttpError(403, "需要邀请码才能注册");
          const used = await q<{ code: string }>(
            `UPDATE invite_codes SET uses = uses + 1
              WHERE code = $1 AND NOT disabled AND (expires_at IS NULL OR expires_at > now()) AND (max_uses IS NULL OR uses < max_uses)
              RETURNING code`,
            [body.invite_code],
          );
          if (!used.length) throw new HttpError(403, "邀请码无效、已过期或已用完");
          invite = used[0].code;
        }
      }

      const [user] = await q<{ id: number }>(
        `INSERT INTO users (email, password_hash, display_name, ics_token, signup_ip_hash, invite_code) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
        [body.email, hash, body.display_name ?? "", randomBytes(24).toString("base64url"), ipHash, invite],
      );
      return user.id;
    });

    await createSession(userId);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return errorResponse(err);
  }
}
