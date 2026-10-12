// Client-safe helpers for the 经验分享 community.

export type PostKind = "interview" | "work";

export const POST_KINDS: Record<PostKind, { label: string; emoji: string; tone: string }> = {
  interview: { label: "面试经验", emoji: "🎤", tone: "violet" },
  work: { label: "工作体验", emoji: "💼", tone: "mint" },
};

export const POST_RESULTS: Record<string, { label: string; tone: string }> = {
  passed: { label: "通过", tone: "mint" },
  failed: { label: "未通过", tone: "rose" },
  pending: { label: "等待结果", tone: "lemon" },
  unknown: { label: "未说明", tone: "stone" },
};

export const INTERVIEW_STAGES = ["说明会 / 座谈会", "GD（小组讨论）", "笔试", "一次面试", "二次面试", "三次面试", "最终面试", "实习选考", "全流程"] as const;
export const EMPLOYMENT_TYPES = ["新卒", "中途（转职）", "实习 / インターン", "派遣・契約", "アルバイト"] as const;

export type Post = {
  id: number;
  user_id: number;
  kind: PostKind;
  status: "draft" | "published";
  company_name: string;
  industry: string;
  role: string;
  occurred_on: string; // YYYY-MM
  ended_on: string | null; // YYYY-MM or null (至今)
  grad_year: number | null;
  stage: string;
  result: string;
  employment_type: string;
  rating: number | null;
  title: string;
  body: string;
  tags: string[];
  anonymous: boolean;
  created_at: string;
  updated_at: string;
  published_at: string | null;
  author: string;
  votes: number;
  voted: boolean;
};

const ym = (s: string) => {
  const [y, m] = s.split("-").map(Number);
  return { y, m };
};

/** The time label every post carries, e.g. "2027年3月 · 28届" or "2028年4月 – 至今（1年7个月）". */
export function timeLabel(p: Pick<Post, "kind" | "occurred_on" | "ended_on" | "grad_year">, now = new Date()): string {
  const a = ym(p.occurred_on);
  if (p.kind === "interview") {
    return `${a.y}年${a.m}月${p.grad_year ? ` · ${String(p.grad_year).slice(-2)}届` : ""}`;
  }
  const end = p.ended_on ? ym(p.ended_on) : { y: now.getFullYear(), m: now.getMonth() + 1 };
  const months = Math.max(0, (end.y - a.y) * 12 + (end.m - a.m));
  const dur = months >= 12 ? `${Math.floor(months / 12)}年${months % 12 ? `${months % 12}个月` : ""}` : `${Math.max(1, months)}个月`;
  return `${a.y}年${a.m}月 – ${p.ended_on ? `${end.y}年${end.m}月` : "至今"}（${dur}）`;
}

/** How long ago the experience happened (end of employment for work posts), in months. */
export function ageInMonths(p: Pick<Post, "kind" | "occurred_on" | "ended_on">, now = new Date()): number {
  if (p.kind === "work" && !p.ended_on) return 0;
  const ref = ym(p.kind === "work" ? p.ended_on! : p.occurred_on);
  return (now.getFullYear() - ref.y) * 12 + (now.getMonth() + 1 - ref.m);
}

export function staleness(p: Pick<Post, "kind" | "occurred_on" | "ended_on">): string | null {
  const months = ageInMonths(p);
  if (months < 24) return null;
  const years = Math.floor(months / 12);
  return p.kind === "interview"
    ? `这是约 ${years} 年前的面试经验，选考流程和问题可能已经变化`
    : `作者约 ${years} 年前离开该公司，现在的情况可能不同`;
}

/** Sections <-> body text. Body format: "## 小标题\n内容\n\n## 小标题\n内容". */
export function sectionsToBody(sections: { heading: string; content: string }[]): string {
  return sections.map((s) => `## ${s.heading.trim()}\n${s.content.trim()}`).join("\n\n");
}

export type BodyBlock = { type: "h"; text: string } | { type: "ul"; items: string[] } | { type: "p"; text: string };

export function parseBody(body: string): BodyBlock[] {
  const blocks: BodyBlock[] = [];
  for (const chunk of body.replace(/\r\n/g, "\n").split(/\n{2,}|\n(?=## )/)) {
    const lines = chunk.split("\n");
    let para: string[] = [];
    const flush = () => {
      if (para.length) blocks.push({ type: "p", text: para.join("\n") });
      para = [];
    };
    for (const line of lines) {
      if (line.startsWith("## ")) {
        flush();
        blocks.push({ type: "h", text: line.slice(3).trim() });
      } else if (/^\s*[-・•]\s+/.test(line)) {
        flush();
        const item = line.replace(/^\s*[-・•]\s+/, "");
        const last = blocks[blocks.length - 1];
        if (last?.type === "ul") last.items.push(item);
        else blocks.push({ type: "ul", items: [item] });
      } else if (line.trim()) {
        para.push(line);
      }
    }
    flush();
  }
  return blocks;
}

export function excerpt(body: string, len = 90): string {
  const text = parseBody(body)
    .filter((b) => b.type !== "h")
    .map((b) => (b.type === "ul" ? b.items.join("；") : b.text))
    .join(" ");
  return text.length > len ? text.slice(0, len) + "…" : text;
}
