import { z } from "zod";
import { readJson, withAdmin } from "@/lib/api";
import { transaction } from "@/lib/db";
import { getSignupSettings, newInviteCode, saveSignupSettings } from "@/lib/signup";

const cap = z.number().int().min(0).max(1_000_000).nullable();

const Put = z.object({
  mode: z.enum(["open", "invite", "closed"]),
  maxUsers: cap,
  dailyMax: cap,
  perIpDaily: cap,
  message: z.string().trim().max(300).default(""),
});

export const GET = withAdmin(async () => getSignupSettings());

export const PUT = withAdmin(async (req) => {
  const s = await readJson(req, Put);
  await saveSignupSettings(s);
  return s;
});

const Create = z.object({
  count: z.number().int().min(1).max(100).default(1),
  max_uses: z.number().int().min(1).max(100000).nullable().default(1),
  expires_days: z.number().int().min(1).max(3650).nullable().default(null),
  note: z.string().trim().max(60).default(""),
});

/** Generate invite codes. */
export const POST = withAdmin(async (req, admin) => {
  const b = await readJson(req, Create);
  const codes = await transaction(async (q) => {
    const out: string[] = [];
    while (out.length < b.count) {
      const code = newInviteCode();
      const r = await q(
        `INSERT INTO invite_codes (code, note, max_uses, expires_at, created_by)
         VALUES ($1, $2, $3, CASE WHEN $4::int IS NULL THEN NULL ELSE now() + make_interval(days => $4::int) END, $5)
         ON CONFLICT (code) DO NOTHING RETURNING code`,
        [code, b.note, b.max_uses, b.expires_days, admin.id],
      );
      if (r.length) out.push(code);
    }
    return out;
  });
  return { codes };
});
