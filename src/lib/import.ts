// Client-safe helpers for the admin bulk import of 经验分享 posts.
import { z } from "zod";
import { PostInput } from "./validators";

export type PostDraftRow = {
  kind: string;
  company_name: string;
  industry: string;
  role: string;
  occurred_on: string;
  ended_on: string | null;
  grad_year: number | null;
  stage: string;
  result: string;
  employment_type: string;
  rating: number | null;
  title: string;
  body: string;
  tags: string[];
  anonymous: boolean;
  source: string;
};

export type ImportRow = { key: string; data: PostDraftRow; errors: string[] };

// ---------- CSV ----------

/** RFC 4180-ish CSV parser: quoted fields, escaped quotes, newlines inside quotes, CRLF, BOM. Also accepts TSV. */
export function parseCsv(text: string): string[][] {
  const src = text.replace(/^﻿/, "");
  const firstLine = src.slice(0, src.indexOf("\n") >>> 0);
  const delim = firstLine.split("\t").length > firstLine.split(",").length ? "\t" : ",";
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (quoted) {
      if (ch === '"') {
        if (src[i + 1] === '"') {
          field += '"';
          i++;
        } else quoted = false;
      } else field += ch;
    } else if (ch === '"' && field === "") quoted = true;
    else if (ch === delim) {
      row.push(field);
      field = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && src[i + 1] === "\n") i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else field += ch;
  }
  if (field !== "" || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => r.some((c) => c.trim() !== ""));
}

const HEADER_ALIASES: Record<keyof PostDraftRow, string[]> = {
  kind: ["kind", "type", "类型", "種類"],
  company_name: ["company_name", "company", "公司", "企业", "企業", "会社"],
  industry: ["industry", "行业", "業界"],
  role: ["role", "职种", "岗位", "職種", "position"],
  occurred_on: ["occurred_on", "date", "time", "时间", "面试时间", "开始", "入职", "入职时间", "开始时间", "start"],
  ended_on: ["ended_on", "end", "结束", "离职", "离职时间", "结束时间"],
  grad_year: ["grad_year", "届", "届数", "毕业年份", "卒年"],
  stage: ["stage", "阶段", "選考段階"],
  result: ["result", "结果", "結果"],
  employment_type: ["employment_type", "雇佣形式", "雇用形態"],
  rating: ["rating", "评分", "評価"],
  title: ["title", "标题", "タイトル"],
  body: ["body", "content", "正文", "内容", "本文"],
  tags: ["tags", "标签", "タグ"],
  anonymous: ["anonymous", "匿名"],
  source: ["source", "来源", "出典"],
};

function headerKey(h: string): keyof PostDraftRow | null {
  const n = h.trim().toLowerCase().replace(/\s+/g, "");
  for (const [key, aliases] of Object.entries(HEADER_ALIASES)) if (aliases.some((a) => a.toLowerCase() === n)) return key as keyof PostDraftRow;
  return null;
}

// ---------- value normalization ----------

/** "2027-3", "2027/03", "2027年3月", "2027.3", "2027-03-15" -> "2027-03"; "至今"/"现在" -> null; otherwise unchanged (validation reports it). */
export function normalizeMonth(v: unknown): string | null {
  const s = String(v ?? "").trim();
  if (!s || /^(至今|现在|現在|在职|在職|present|now|-)$/i.test(s)) return null;
  const m = s.match(/^(\d{4})\s*[-/.年]\s*(\d{1,2})/);
  return m ? `${m[1]}-${m[2].padStart(2, "0")}` : s;
}

function normalizeKind(v: unknown): string {
  const s = String(v ?? "").trim().toLowerCase();
  if (/^(interview|面试|面接|面试经验|选考|選考)/.test(s)) return "interview";
  if (/^(work|工作|工作体验|职场|在职|働)/.test(s)) return "work";
  return s;
}

function normalizeResult(v: unknown): string {
  const s = String(v ?? "").trim().toLowerCase();
  if (/^(passed|通过|通過|合格|内定|pass)/.test(s)) return "passed";
  if (/^(failed|未通过|不通过|不合格|落|お祈り|fail)/.test(s)) return "failed";
  if (/^(pending|等待|待定|結果待ち)/.test(s)) return "pending";
  return "unknown";
}

function toInt(v: unknown): number | null {
  const s = String(v ?? "").replace(/[^\d]/g, "");
  if (!s) return null;
  const n = Number(s);
  // "28" / "28届" -> 2028
  return n < 100 ? 2000 + n : n;
}

function toBool(v: unknown, fallback: boolean) {
  const s = String(v ?? "").trim().toLowerCase();
  if (!s) return fallback;
  return !/^(false|0|no|否|不|实名|実名)$/.test(s);
}

function toTags(v: unknown): string[] {
  if (Array.isArray(v)) return v.map(String).map((t) => t.trim()).filter(Boolean).slice(0, 8);
  return String(v ?? "")
    .split(/[、,，;；#|\s]+/)
    .map((t) => t.trim())
    .filter(Boolean)
    .slice(0, 8);
}

/** Literal "\n" in spreadsheet cells becomes a real newline so "## 小标题" sections work. */
const unescapeBody = (s: string) => s.replace(/\\n/g, "\n");

export function normalizeRow(raw: Record<string, unknown>, defaults: { anonymous: boolean; source: string }): PostDraftRow {
  const kind = normalizeKind(raw.kind);
  const rating = raw.rating == null || raw.rating === "" ? null : Math.round(Number(String(raw.rating).replace(/[^\d.]/g, ""))) || null;
  return {
    kind,
    company_name: String(raw.company_name ?? "").trim(),
    industry: String(raw.industry ?? "").trim(),
    role: String(raw.role ?? "").trim(),
    occurred_on: normalizeMonth(raw.occurred_on) ?? "",
    ended_on: kind === "work" ? normalizeMonth(raw.ended_on) : null,
    grad_year: kind === "interview" ? toInt(raw.grad_year) : null,
    stage: String(raw.stage ?? "").trim(),
    result: kind === "interview" ? normalizeResult(raw.result) : "unknown",
    employment_type: String(raw.employment_type ?? "").trim(),
    rating: kind === "work" && rating && rating >= 1 && rating <= 5 ? rating : null,
    title: String(raw.title ?? "").trim(),
    body: unescapeBody(String(raw.body ?? "")).trim(),
    tags: toTags(raw.tags),
    anonymous: toBool(raw.anonymous, defaults.anonymous),
    source: String(raw.source ?? "").trim() || defaults.source,
  };
}

/** Human-readable problems for one row (empty = ready to import). */
export function validateRow(d: PostDraftRow): string[] {
  const r = PostInput.safeParse({ ...d, notes: "" });
  if (r.success) return [];
  const label: Record<string, string> = { occurred_on: "时间", ended_on: "结束时间", grad_year: "届数", rating: "评分", tags: "标签", body: "正文", kind: "类型", industry: "行业", role: "职种", source: "来源" };
  // Our own messages are Chinese and self-explanatory; prefix zod's generic (English) ones with the field name.
  return [...new Set(r.error.issues.map((i) => (/[一-鿿]/.test(i.message) ? i.message : `${label[String(i.path[0])] ?? String(i.path[0])}格式不正确`)))];
}

let seq = 0;
export function toImportRows(raws: Record<string, unknown>[], defaults: { anonymous: boolean; source: string }): ImportRow[] {
  return raws.map((r) => {
    const data = normalizeRow(r, defaults);
    return { key: `r${++seq}`, data, errors: validateRow(data) };
  });
}

/** CSV/TSV text -> raw objects keyed by canonical field names. Unknown columns are ignored. */
export function csvToObjects(text: string): { rows: Record<string, unknown>[]; unknownHeaders: string[] } {
  const [header, ...lines] = parseCsv(text);
  if (!header) return { rows: [], unknownHeaders: [] };
  const keys = header.map(headerKey);
  const unknownHeaders = header.filter((_, i) => !keys[i]);
  const rows = lines.map((cells) => {
    const o: Record<string, unknown> = {};
    keys.forEach((k, i) => {
      if (k) o[k] = cells[i] ?? "";
    });
    return o;
  });
  return { rows, unknownHeaders };
}

/** JSON array (or {posts:[…]}) with either canonical or Chinese keys. */
export function jsonToObjects(text: string): Record<string, unknown>[] {
  const parsed = JSON.parse(text);
  const arr: unknown[] = Array.isArray(parsed) ? parsed : Array.isArray(parsed?.posts) ? parsed.posts : [];
  return arr.map((item) => {
    const o: Record<string, unknown> = {};
    for (const [k, v] of Object.entries((item ?? {}) as Record<string, unknown>)) {
      const key = headerKey(k);
      if (key) o[key] = v;
    }
    return o;
  });
}

export const CSV_TEMPLATE = [
  "类型,公司,行业,职种,时间,结束,届,阶段,结果,雇佣形式,评分,标题,正文,标签,匿名,来源",
  '面试,株式会社さくらテック,IT,SE,2027-03,,28,一次面试,通过,,,"さくらテック一面：重视为什么来日本","## 面试形式\n线上 30 分钟，面试官 2 人。\n\n## 被问到的问题\n- 自己紹介\n- なぜ日本で働きたいのか\n- 逆質問",线上面试、IT,是,2027 年春季前辈访谈',
  '工作,みどり商事株式会社,商社,営業,2024-04,至今,,,,新卒,4,"在みどり商事做营业的两年","## 工作内容\n- 法人营业，每天拜访 3 家客户\n\n## 加班\n月 20 小时左右，旺季会多一些。",商社、营业,是,',
].join("\r\n");

export const AI_IMPORT_LIMIT = 30;

export const importCommitSchema = z.object({
  rows: z.array(z.unknown()).min(1).max(200),
  publish: z.boolean(),
  confirmed: z.boolean().optional(),
  batchLabel: z.string().max(60).default(""),
  method: z.enum(["table", "ai"]).default("table"),
});
