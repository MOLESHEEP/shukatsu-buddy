import "server-only";
import { generate } from "./provider";
import {
  EmailParseSchema,
  EsReviewSchema,
  ImportExtractSchema,
  PostDraftSchema,
  PostReviewSchema,
  ReplySchema,
  type EmailParse,
  type EsReview,
  type ImportExtract,
  type PostDraft,
  type PostReview,
  type ReplyDraft,
} from "./schemas";
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
}, userId: number | null): Promise<EsReview> {
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
    ctx: { userId, task: input.tighten ? "es_retry" : "es" },
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

export async function parseEmail(raw: string, userId: number | null): Promise<EmailParse> {
  return generate({
    system: EMAIL_SYSTEM,
    prompt: `今天是 ${todayLocal()}（时区 ${APP_TZ}）。\n\n【邮件原文】\n${raw}`,
    schema: EmailParseSchema,
    effort: "low",
    mock: () => mockEmailParse(raw),
    ctx: { userId, task: "email" },
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
}, userId: number | null): Promise<ReplyDraft> {
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
    ctx: { userId, task: "reply" },
  });
}

// ---------------- 经验分享 ----------------

const POST_SYSTEM = `你帮在日本求职、工作的中国人把自己的经历整理成一篇给后来者看的经验分享。
用户只会粗略描述，你负责组织语言、分小节，让内容清楚、具体、好读。
铁律：
- 只使用用户提供的事实，绝不补充、推测或美化任何细节、数字、评价。用户没提到的小节直接省略。
- 保持用户本人的观点和语气（第一人称），不要变成广告或客套话。
- 用简体中文写；面试中被问到的问题、公司内部用语保留日文原文（如「ガクチカ」「逆質問」）。
- 去掉或模糊化可识别个人的信息（面试官姓名、同事姓名、联系方式），以及明显属于公司机密的内容，并在 privacy_warnings_zh 中提醒。
- 正文适合手机阅读：每小节 1–4 段或要点列表，要点用"- "开头。`;

const POST_TEMPLATES: Record<"interview" | "work", string> = {
  interview: "小节模板（按需选用）：选考流程概览 / 面试形式与氛围 / 被问到的问题 / 我的回答要点 / 结果与感想 / 给后来者的建议",
  work: "小节模板（按需选用）：工作内容 / 团队与氛围 / 加班与工作生活平衡 / 薪资与福利（只写用户愿意公开的程度）/ 对外国人的友好度（签证、语言、晋升）/ 成长与职业发展 / 给想加入的人的建议",
};

export async function draftPost(input: {
  kind: "interview" | "work";
  company: string;
  role?: string;
  timeLabel: string;
  extra?: string;
  notes: string;
}, userId: number | null): Promise<PostDraft> {
  const prompt = [
    `【类型】${input.kind === "interview" ? "面试经验" : "工作体验"}`,
    `【公司】${input.company}`,
    input.role ? `【职种 / 岗位】${input.role}` : "",
    `【时间】${input.timeLabel}`,
    input.extra ? `【其他信息】${input.extra}` : "",
    POST_TEMPLATES[input.kind],
    `【用户的粗略描述】\n${input.notes}`,
  ]
    .filter(Boolean)
    .join("\n");
  return generate({
    system: POST_SYSTEM,
    prompt,
    schema: PostDraftSchema,
    effort: "medium",
    mock: () => mockPost(input.kind, input.company, input.notes),
    ctx: { userId, task: "post" },
  });
}

// ---------------- 管理员批量导入 ----------------

const IMPORT_SYSTEM = `你帮管理员把一大段收集来的原始材料（访谈记录、问卷回答、聊天记录等）拆分并整理成多篇独立的经验分享，供在日本求职、工作的中国人参考。
规则：
- 每段独立的经历（一个人在一家公司的一次面试经历，或一段工作经历）整理成一篇；同一人同一公司的多轮面试合成一篇。
- 只使用原文中的事实，绝不补充、推测或美化。原文没有的字段留空（字符串填 ""，数字填 null）。
- 时间必须来自原文：明确到年月时填 YYYY-MM；只有年份或完全没提到时 occurred_on 填 ""，交给管理员补充。
- kind：面试、笔试、说明会等选考经历为 interview；入职后的工作感受为 work。
- 正文 sections 按主题分小节（面试：选考流程 / 面试形式与氛围 / 被问到的问题 / 结果与感想 / 建议；工作：工作内容 / 团队与氛围 / 加班 / 对外国人的友好度 / 成长 / 建议），保留第一人称和原作者观点，用简体中文；面试问题等日文原文保留。
- 去掉或模糊化可识别个人的信息（面试官、同事、受访者的姓名和联系方式）。
- title 一句话概括，30 字以内。tags 3–5 个。
- 无法整理的片段（太短、不是经验、无法判断公司）写进 skipped_zh，不要硬凑。`;

export async function extractImportPosts(text: string, userId: number): Promise<ImportExtract> {
  return generate({
    system: IMPORT_SYSTEM,
    prompt: `今天是 ${todayLocal()}。\n\n【原始材料】\n${text}`,
    schema: ImportExtractSchema,
    effort: "medium",
    mock: () => mockImport(text),
    ctx: { userId, task: "import" },
  });
}

function mockImport(text: string): ImportExtract {
  const chunks = text
    .split(/\n\s*\n|^-{3,}$/m)
    .map((c) => c.trim())
    .filter((c) => c.length >= 15)
    .slice(0, 10);
  return {
    posts: chunks.map((c) => {
      const company = c.match(/(株式会社[^\s　、。，,\n]{1,20}|[^\s　、。，,\n]{1,20}(株式会社|銀行|商事|製薬))/)?.[0] ?? "";
      const ym = c.match(/(\d{4})\s*[年/.-]\s*(\d{1,2})\s*月?/);
      const work = /入职|在职|工作|上班|加班|同事/.test(c) && !/面试|面接/.test(c);
      return {
        kind: work ? "work" : "interview",
        company_name: company,
        industry: "",
        role: "",
        occurred_on: ym ? `${ym[1]}-${ym[2].padStart(2, "0")}` : "",
        ended_on: null,
        grad_year: null,
        stage: "",
        result: /通过|内定/.test(c) ? "passed" : "unknown",
        employment_type: "",
        rating: null,
        title: `【演示】${company || "某公司"}${work ? "工作体验" : "面试经验"}`,
        sections: [{ heading: work ? "工作体验" : "面试经历", content: c }],
        tags: ["演示模式"],
      };
    }),
    skipped_zh: ["【演示模式】按空行粗略拆分；配置 AI 后会真实理解并整理内容"],
  };
}

// ---------------- Demo-mode samples ----------------

function mockPost(kind: "interview" | "work", company: string, notes: string): PostDraft {
  const quote = notes.trim().slice(0, 80);
  return kind === "interview"
    ? {
        title: `${company} 一次面试：重视逻辑和入社动机`,
        sections: [
          { heading: "选考流程概览", content: "ES → 适性检查 → 一次面试（线上）→ 二次面试 → 最终面试" },
          { heading: "面试形式与氛围", content: `【演示模式】线上 30 分钟，面试官 1 人，氛围比较轻松。\n你的描述：「${quote}」` },
          { heading: "被问到的问题", content: "- 自己紹介を1分でお願いします\n- なぜ日本で働きたいのですか\n- ガクチカで一番苦労したことは\n- 逆質問" },
          { heading: "给后来者的建议", content: "- 准备好「为什么是日本、为什么是这家公司」的一贯逻辑\n- 逆質問准备 2–3 个与业务相关的问题" },
        ],
        tags: ["线上面试", "一次面试", "留学生"],
        questions_zh: ["面试大约多长时间？", "有没有被追问的问题？", "结果是多久后通知的？"],
        privacy_warnings_zh: ["【演示模式】配置 API Key 后，AI 会根据你的描述真实整理并检查隐私信息"],
      }
    : {
        title: `在 ${company} 工作一年：节奏快但成长多`,
        sections: [
          { heading: "工作内容", content: `【演示模式】你的描述：「${quote}」` },
          { heading: "团队与氛围", content: "- 团队 8 人左右，前辈愿意教\n- 会议以日语为主" },
          { heading: "加班与工作生活平衡", content: "旺季月加班 30 小时左右，平时可以准时下班。" },
          { heading: "对外国人的友好度", content: "- 公司协助办理签证更新\n- 有外籍员工晋升到管理层的例子" },
        ],
        tags: ["IT", "新卒入社", "外国人友好"],
        questions_zh: ["入社后有哪些培训？", "日语水平对工作的影响大吗？"],
        privacy_warnings_zh: ["【演示模式】配置 API Key 后，AI 会根据你的描述真实整理并检查隐私信息"],
      };
}

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

// ---------------- 经验分享发布审核 ----------------

const REVIEW_SYSTEM = `你是「就活小助手」经验分享社区的内容审核员。社区面向在日本求职、工作的中国人，用户分享面试经验和在日工作体验。
请判断一篇投稿能否发布，规则如下（violations 用括号里的代码）：
1. 有效经验（not_experience）：必须是作者自己的、与求职或在日工作相关的具体经历，例如选考流程、被问到的问题、工作内容、职场氛围、待遇感受等。
   空洞水文、与求职/工作无关、明显复制粘贴的模板文字、只有一两句无信息量的内容、测试内容，都算不是有效经验。
2. 反动 / 政治煽动（political）：煽动颠覆、分裂国家、极端主义、宣扬仇恨的政治内容。正常提及公司所在国家、签证政策等不算。
3. 色情（sexual）：色情、性暗示露骨的内容。
4. 暴力（violence）：宣扬或详细描写暴力、威胁他人。
5. 营销（marketing）：广告、引流、推销课程/中介/代写、留联系方式（微信号、QQ、电话、外部群）、推广链接。
6. 诋毁（defamation）：没有具体事实依据、恶意抹黑公司或他人的言论。对公司如实的负面评价（加班多、面试官态度差、待遇低）是有价值的经验，不算诋毁。
7. 人身攻击（personal_attack）：辱骂、侮辱、歧视特定的人或群体。
8. 隐私（privacy）：写出面试官、同事等个人的真实姓名或联系方式，或明显的公司机密。
判断原则：
- 只有在明确违反规则时才 reject，并在 reason_zh 里告诉作者具体哪里有问题、怎么改后可以重新提交。
- 内容正常时 approve，不要因为文笔、篇幅较短但信息真实、观点负面而驳回。
- 实在拿不准（例如可能是诋毁但也可能是真实经历）时选 unsure，交给人工审核。`;

export async function reviewPost(post: {
  kind: "interview" | "work";
  company_name: string;
  role: string;
  title: string;
  body: string;
  tags: string[];
}): Promise<PostReview> {
  const prompt = [
    `【类型】${post.kind === "interview" ? "面试经验" : "工作体验"}`,
    `【公司】${post.company_name}${post.role ? ` · ${post.role}` : ""}`,
    `【标题】${post.title}`,
    post.tags.length ? `【标签】${post.tags.join("、")}` : "",
    `【正文】\n${post.body}`,
  ]
    .filter(Boolean)
    .join("\n");
  return generate({
    system: REVIEW_SYSTEM,
    prompt,
    schema: PostReviewSchema,
    effort: "low",
    mock: () => ({ decision: "unsure" as const, violations: [], reason_zh: "演示模式没有配置 AI，等待管理员人工审核。" }),
    // Moderation is a site cost, not the author's AI use: no user id, so it never touches their daily limit.
    ctx: { userId: null, task: "review" },
  });
}
