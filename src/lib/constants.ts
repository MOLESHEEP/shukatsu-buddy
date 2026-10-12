// Shared, client-safe constants: selection flow, test types, ES templates.

export const DEFAULT_STAGES = [
  "エントリー",
  "说明会",
  "ES提交",
  "笔试",
  "一次面试",
  "二次面试",
  "最终面试",
  "内定",
] as const;

export const COMPANY_STATUS: Record<string, { label: string; tone: string }> = {
  active: { label: "进行中", tone: "sky" },
  offer: { label: "内定", tone: "mint" },
  rejected: { label: "未通过", tone: "rose" },
  withdrawn: { label: "已辞退", tone: "stone" },
};

export const STAGE_RESULTS: Record<string, string> = {
  pending: "待定",
  passed: "通过",
  failed: "未通过",
};

export const EVENT_KINDS: Record<string, { label: string; tone: string }> = {
  deadline: { label: "截止", tone: "rose" },
  interview: { label: "面试", tone: "violet" },
  briefing: { label: "说明会", tone: "sky" },
  test: { label: "笔试", tone: "lemon" },
  other: { label: "其他", tone: "stone" },
};

export type TestTypeKey = "spi" | "tamatebako" | "tgweb" | "gab" | "cab" | "kraepelin" | "custom" | "unknown";

export const TEST_TYPES: Record<
  TestTypeKey,
  { label: string; vendor: string; summary: string; tips: string[]; pitfalls: string[]; resources: { label: string; url: string }[] }
> = {
  spi: {
    label: "SPI",
    vendor: "Recruit",
    summary: "言语、非言语，部分含英语、结构把握，另有性格检查。最常见的适性检查。",
    tips: [
      "非言语（推论、损益算、速度算）题型固定，刷一本对策书 2 遍即可稳定得分",
      "言语题考二语关系、词义、长文阅读，平时多读日文新闻提速",
      "テストセンター会根据正答率调整难度：越往后越难通常是好事",
    ],
    pitfalls: ["言语题的日语阅读速度是留学生最大失分点", "熟语、慣用句的意思要专门背", "性格检查前后矛盾会被标记，按真实情况一致作答"],
    resources: [{ label: "SPI 官方介绍 (Recruit)", url: "https://www.spi.recruit.co.jp/" }],
  },
  tamatebako: {
    label: "玉手箱",
    vendor: "SHL",
    summary: "计数（图表读取、四则逆算、表推测）、言语（GAB形式、IMAGES形式）、英语。同一题型连续出现，限时极紧。",
    tips: ["每种题型约 1 题 1 分钟以内，提前练计时", "四則逆算用计算器（WEB 版允许），熟练度决定成败", "一种题型会连续出很多道，先认出题型再套方法"],
    pitfalls: ["言语长文判断“本文から論理的に導けるか”三选一，容易混淆", "时间不够时不要空着，按题数计分"],
    resources: [{ label: "SHL Japan 官网", url: "https://www.shl.co.jp/" }],
  },
  tgweb: {
    label: "TG-WEB",
    vendor: "ヒューマネージ",
    summary: "题型偏难偏怪，有传统型（暗号、展开图、数列）和新型（题量多、难度低）之分。",
    tips: ["传统型：暗号、図形问题需要专门见过题型，否则很难当场想到", "新型：速度优先，接近 SPI 难度", "收到通知后先确认是哪一种"],
    pitfalls: ["只准备 SPI 会在 TG-WEB 传统型上吃亏", "言语长文难度高，需要提前练阅读"],
    resources: [{ label: "ヒューマネージ 官网", url: "https://www.humanage.co.jp/" }],
  },
  gab: {
    label: "GAB",
    vendor: "SHL",
    summary: "偏综合职、商社和金融常用。言语、计数（图表读取），与玉手箱同源但题量更大。",
    tips: ["计数图表题：先看问题再看表，只找需要的数字", "可与玉手箱对策共用"],
    pitfalls: ["题量大、时间紧，需大量练习"],
    resources: [{ label: "SHL Japan 官网", url: "https://www.shl.co.jp/" }],
  },
  cab: {
    label: "CAB",
    vendor: "SHL",
    summary: "偏 IT 职：暗算、法则性、命令表、暗号，测逻辑和信息处理能力。",
    tips: ["法则性、命令表题型固定，刷题见效快", "暗算部分要练心算速度"],
    pitfalls: ["题型独特，完全没见过的话很难拿分"],
    resources: [{ label: "SHL Japan 官网", url: "https://www.shl.co.jp/" }],
  },
  kraepelin: {
    label: "内田クレペリン",
    vendor: "日本・精神技術研究所",
    summary: "连续一位数加法作业（前后半各 15 分钟），看工作节奏与稳定性。",
    tips: ["重点是曲线形状稳定，不是绝对速度", "前半与后半之间有休息，后半开头通常会提速"],
    pitfalls: ["中途大幅波动或出错多会被认为不稳定"],
    resources: [{ label: "日本・精神技術研究所", url: "https://www.nsgk.co.jp/" }],
  },
  custom: {
    label: "企业独自 / 其他",
    vendor: "各公司",
    summary: "自定义题目或作文。常见于外资、媒体、广告。",
    tips: ["查看往年体验记（就活会议、ONE CAREER 等）了解形式", "作文类提前准备 400–800 字的日文模板"],
    pitfalls: ["作文要注意日文书面语（である調）的一致性"],
    resources: [],
  },
  unknown: {
    label: "未确定",
    vendor: "—",
    summary: "还不知道这家公司用哪种笔试。收到受检通知后粘贴到「邮件识别」，AI 会帮你判断。",
    tips: ["先按 SPI 准备，覆盖面最广"],
    pitfalls: [],
    resources: [],
  },
};

export const TEST_FORMATS: Record<string, string> = {
  testcenter: "テストセンター",
  web: "WEBテスティング（在家）",
  inhouse: "インハウスCBT",
  paper: "ペーパー",
  unknown: "未确定",
};

export const TEST_STATUS: Record<string, string> = {
  todo: "未受检",
  done: "已受检",
  passed: "通过",
  failed: "未通过",
};

export const ES_TEMPLATES = [
  { tag: "志望動機", question: "当社を志望する理由を教えてください。" },
  { tag: "ガクチカ", question: "学生時代に最も力を入れて取り組んだことを教えてください。" },
  { tag: "自己PR", question: "あなたの強みを、具体的なエピソードを交えて教えてください。" },
  { tag: "日本就職", question: "なぜ日本で就職したいのですか。" },
  { tag: "キャリア", question: "入社後、将来どのようなキャリアを築きたいですか。" },
  { tag: "日本語", question: "日本語をどのように学んできましたか。苦労した点と工夫を教えてください。" },
] as const;

export const MATERIAL_TAGS = ["ガクチカ", "自己PR", "志望動機", "日本就職", "キャリア", "日本語", "其他"] as const;

export const REPLY_SCENARIOS: Record<string, string> = {
  accept: "接受面试 / 说明会日程",
  reschedule: "申请调整面试日程",
  decline_interview: "辞退选考",
  decline_offer: "辞退内定",
  thanks: "面试后感谢信",
  question: "向人事咨询问题",
};
