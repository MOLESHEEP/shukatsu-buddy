import "server-only";
import { generate } from "./provider";
import { EmailParseSchema, EsReviewSchema, ReplySchema, type EmailParse, type EsReview, type ReplyDraft } from "./schemas";
import { REPLY_SCENARIOS } from "../constants";
import { todayLocal, APP_TZ } from "../time";

/** Japanese ES character count: every code point counts, including punctuation; newlines do not. */
export function countChars(text: string): number {
  return [...text.replace(/\r?\n/g, "")].length;
}

type Profile = { grad_year?: number | null; major?: string; jp_level?: string };

// ---------------- ES 添削 ----------------

const ES_SYSTEM = `你是一位熟悉日本新卒就活的 ES 辅导老师，学生是在日本留学、准备在日求职的中国人。
你的角色是"辅导和反馈"，不是代写：改写要保留学生自己的经历、事实和观点，不编造任何经历、数字或成果。
改写原则：
- 结论先行（PREP），第一句直接回答题目
- 具体事例：行动、数字、结果、学到的东西
- 与该公司的关联：事业内容、价值观、职种
- 自然的日本学生书面语（です・ます調），避免中式直译、过度敬语和空泛的形容词
- 留学生视角是优势：跨文化、日语学习、为何选择日本，但不要过度强调"外国人"
严格遵守字数上限（日文字符数，标点也算）。目标是上限的 85%–100%。
说明部分全部用简体中文，面向学生解释为什么这样改、日本人事会如何理解。`;

export async function reviewEs(input: {
  company: string;
  question: string;
  charLimit: number | null;
  draft: string;
  companyNotes?: string;
  profile?: Profile;
  tighten?: { previous: string; count: number };
}): Promise<EsReview> {
  const limitLine = input.charLimit ? `${input.charLimit} 字以内` : "无明确上限（建议 400 字左右）";
  const prompt = [
    `【公司】${input.company || "未指定"}`,
    input.companyNotes ? `【公司信息 / 用户备注】${input.companyNotes}` : "",
    `【ES 题目】${input.question}`,
    `【字数上限】${limitLine}`,
    input.profile ? `【学生背景】毕业年份 ${input.profile.grad_year ?? "未填"}，专业 ${input.profile.major || "未填"}，日语水平 ${input.profile.jp_level || "未填"}` : "",
    `【学生草稿（可能是中文或日文）】\n${input.draft}`,
    input.tighten
      ? `\n【注意】上一版改写稿有 ${input.tighten.count} 字，超过了上限 ${input.charLimit} 字。请在不丢失核心事例的前提下压缩到上限以内。上一版：\n${input.tighten.previous}`
      : "",
  ]
    .filter(Boolean)
    .join("\n");

  return generate({
    system: ES_SYSTEM,
    prompt,
    schema: EsReviewSchema,
    effort: "medium",
    mock: () => mockEsReview(input.question, input.draft, input.charLimit),
  });
}

// ---------------- 邮件识别 ----------------

const EMAIL_SYSTEM = `你负责解析日本企业发给求职学生的日文邮件（采用担当的通知、面试安排、笔试受检通知等）。
提取：公司名、事件（日期时间、地点或线上链接）、所需材料、回复期限，并用简体中文写一段简短摘要。
规则：
- 日期一律输出为 YYYY-MM-DDTHH:mm 的日本时间。邮件只写"3月5日"时，根据今天的日期推断年份（取最近的未来日期）。只有日期没有时间时用 23:59。
- 没有提到的信息填 null 或空数组，绝不编造。
- 如果是适性检查/笔试通知，根据措辞和链接推测类型：
  SPI（Recruit、"SPI3"、"テストセンター"、arorua、spi.recruit 链接）
  玉手箱（SHL、"玉手箱"、e-exams、"Web-CAB/GAB"以外的 SHL 链接）
  TG-WEB（ヒューマネージ、"TG-WEB"、assessment.c-personal 等）
  GAB / CAB（SHL 的 GAB、CAB、Web-GAB、Web-CAB）
  内田クレペリン、企业独自（自社作文、筆記）。
  形式：テストセンター=testcenter，自宅受检=web，企业内电脑=inhouse，纸笔=paper。
  confidence 为 0–1；没有明确线索时 type=unknown 且 confidence 较低，并在 reason_zh 说明。
- 有不确定的地方写进 uncertain_points_zh，提醒用户核对。`;

export async function parseEmail(raw: string): Promise<EmailParse> {
  return generate({
    system: EMAIL_SYSTEM,
    prompt: `今天是 ${todayLocal()}（时区 ${APP_TZ}）。\n\n【邮件原文】\n${raw}`,
    schema: EmailParseSchema,
    effort: "low",
    mock: () => mockEmailParse(raw),
  });
}

// ---------------- 回信辅助 ----------------

const REPLY_SYSTEM = `你帮在日本求职的中国留学生写给企业人事的日文商务邮件。
要求：符合日本商务邮件格式（宛名、挨拶、名乗り、本文、結び、署名），敬语准确而不过度，简洁。
不确定的信息用【　】占位让学生自己填写，不要编造日期或理由。
notes_zh 用简体中文说明 2–4 个写法要点或需要学生确认的地方。`;

export async function draftReply(input: {
  scenario: string;
  company: string;
  contact?: string;
  original?: string;
  details?: string;
  name?: string;
  school?: string;
}): Promise<ReplyDraft> {
  const prompt = [
    `【场景】${REPLY_SCENARIOS[input.scenario] ?? input.scenario}`,
    `【公司】${input.company || "【会社名】"}`,
    input.contact ? `【担当者】${input.contact}` : "",
    `【学生姓名】${input.name || "【氏名】"}　【学校】${input.school || "【大学名・学部】"}`,
    input.details ? `【学生补充（中文或日文）】${input.details}` : "",
    input.original ? `【对方来信】\n${input.original}` : "",
  ]
    .filter(Boolean)
    .join("\n");
  return generate({
    system: REPLY_SYSTEM,
    prompt,
    schema: ReplySchema,
    effort: "low",
    mock: () => mockReply(input.scenario, input.company, input.name),
  });
}

// ---------------- Demo-mode samples ----------------

function mockEsReview(question: string, draft: string, limit: number | null): EsReview {
  const base =
    "私が学生時代に最も力を入れたことは、留学生と日本人学生の交流イベントの企画です。参加者が固定化しているという課題に対し、20名にヒアリングを行い、言語の壁が参加をためらう原因だと分かりました。そこで「やさしい日本語」での案内と少人数制のテーマ別テーブルを導入した結果、参加者は前年の1.5倍に増えました。この経験から、相手の立場で課題を捉え、仕組みで解決する力を身につけました。";
  const rewritten = limit ? [...base].slice(0, limit).join("") : base;
  return {
    rewritten,
    summary_zh: "【演示模式】结构清楚，但开头没有直接回答题目，事例缺少数字。下面是示范改写，配置 API Key 后会根据你的草稿真实生成。",
    notes: [
      {
        original: draft.split(/[。\n]/)[0]?.slice(0, 60) || "（第一句）",
        revised: "私が学生時代に最も力を入れたことは、留学生と日本人学生の交流イベントの企画です。",
        issue_zh: "第一句没有直接回答“最努力的事是什么”，日本 ES 习惯结论先行。",
        hr_view_zh: "人事每份 ES 只看几十秒，开头看不到结论会觉得逻辑不清楚。",
      },
      {
        original: "たくさんの人が参加してくれました。",
        revised: "参加者は前年の1.5倍に増えました。",
        issue_zh: "“たくさん”太模糊，换成具体数字更有说服力。",
        hr_view_zh: "数字能让成果可以被验证，读起来更可信。",
      },
    ],
    scores: {
      conclusion_first: { score: 3, comment_zh: "结论在第二段才出现，建议移到第一句。" },
      specificity: { score: 3, comment_zh: "有事例但缺少数字和自己的具体行动。" },
      company_fit: { score: 2, comment_zh: `还没有和公司联系起来。题目：「${question.slice(0, 30)}」` },
    },
    next_steps_zh: ["补充一个能体现你个人行动的细节", "最后一句写出这份能力如何在该公司发挥"],
  };
}

function mockEmailParse(raw: string): EmailParse {
  const company = raw.match(/(株式会社[^\s　、。\n【】「」:：]{1,20}|[^\s　、。\n【】「」:：]{1,20}株式会社)/)?.[0] ?? null;
  const date = raw.match(/(\d{1,2})月(\d{1,2})日/);
  const time = raw.match(/(\d{1,2})[:：時](\d{2})?/);
  const today = todayLocal();
  let start = `${today.slice(0, 4)}-03-05T14:00`;
  if (date) {
    const year = Number(today.slice(0, 4));
    const mm = date[1].padStart(2, "0");
    const dd = date[2].padStart(2, "0");
    const candidate = `${year}-${mm}-${dd}`;
    start = `${candidate < today ? year + 1 : year}-${mm}-${dd}T${time ? time[1].padStart(2, "0") + ":" + (time[2] ?? "00") : "23:59"}`;
  }
  const isTest = /適性|SPI|玉手箱|受検|テスト/.test(raw);
  return {
    company_name: company,
    category: isTest ? "test" : "interview",
    summary_zh: "【演示模式】这是一封" + (isTest ? "笔试受检通知" : "面试安排通知") + "。配置 API Key 后将由 AI 真实解析邮件内容。",
    events: [
      {
        kind: isTest ? "test" : "interview",
        title_zh: isTest ? "适性检查受检期限" : "一次面试",
        start_local: start,
        location_or_url: /zoom|teams|meet/i.test(raw) ? "线上（见邮件链接）" : null,
        prep_zh: isTest ? "提前确认受检环境和题型" : "准备自我介绍（1 分钟）和志望動機",
      },
    ],
    required_materials: /履歴書/.test(raw) ? ["履歴書"] : [],
    reply_deadline_local: null,
    needs_reply: /返信|ご連絡|ご回答/.test(raw),
    test: isTest
      ? { type: /玉手箱/.test(raw) ? "tamatebako" : /SPI/i.test(raw) ? "spi" : "unknown", format: /テストセンター/.test(raw) ? "testcenter" : "web", deadline_local: start, confidence: 0.6, reason_zh: "根据邮件中的关键词推测（演示模式）" }
      : null,
    uncertain_points_zh: ["演示模式仅做关键词匹配，请核对日期时间"],
  };
}

function mockReply(scenario: string, company: string, name?: string): ReplyDraft {
  return {
    subject: `${REPLY_SCENARIOS[scenario] ? "Re: " : ""}面接日程のご連絡につきまして（${name || "【氏名】"}）`,
    body: `${company || "【会社名】"}\n人事部　【ご担当者様】\n\nお世話になっております。\n【大学名・学部】の${name || "【氏名】"}です。\n\nこの度は面接のご案内をいただき、誠にありがとうございます。\nご提示いただいた日程にて、ぜひ参加させていただきたく存じます。\n\n当日はどうぞよろしくお願い申し上げます。\n\n――――――――――\n${name || "【氏名】"}\n【大学名・学部・学年】\nTEL：【電話番号】\nMail：【メールアドレス】\n――――――――――`,
    notes_zh: ["【演示模式】配置 API Key 后会根据场景和来信真实生成", "回信标题保留对方原标题前的“Re:”，方便人事查找", "署名档写全学校、电话、邮箱"],
  };
}
