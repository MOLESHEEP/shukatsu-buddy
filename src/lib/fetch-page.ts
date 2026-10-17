import "server-only";
import { createHash } from "node:crypto";
import dns from "node:dns";
import http from "node:http";
import https from "node:https";
import net from "node:net";
import zlib from "node:zlib";
import { HttpError } from "./api";
import { publicUrl } from "./mail";

/**
 * Fetches a public web page for 网页监控 and turns it into plain text for the AI.
 * Safety: http(s) on ports 80/443 only; every address the host resolves to (also after redirects) must be public,
 * checked inside the socket's DNS lookup so a re-resolving host can't swap in an internal address; size and time capped;
 * robots.txt respected.
 */

const MAX_BYTES = 3 * 1024 * 1024;
const TIMEOUT_MS = 20_000;
const MAX_REDIRECTS = 5;
const MAX_TEXT = 15_000;
const UA_NAME = "ShukatsuBuddyBot";
const userAgent = () => `Mozilla/5.0 (compatible; ${UA_NAME}/1.0; +${publicUrl()})`;

// ---------- address checks ----------

function privateV4(ip: string) {
  const [a, b] = ip.split(".").map(Number);
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 192 && b === 0) ||
    (a === 198 && (b === 18 || b === 19)) ||
    a >= 224
  );
}

function isPublicAddress(ip: string): boolean {
  if (net.isIPv4(ip)) return !privateV4(ip);
  if (!net.isIPv6(ip)) return false;
  const v = ip.toLowerCase();
  const mapped = v.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (mapped) return !privateV4(mapped[1]);
  return !(v === "::" || v === "::1" || v.startsWith("fc") || v.startsWith("fd") || v.startsWith("fe8") || v.startsWith("fe9") || v.startsWith("fea") || v.startsWith("feb") || v.startsWith("ff"));
}

/** DNS lookup for the socket that refuses non-public addresses. */
const safeLookup: net.LookupFunction = (hostname, options, callback) => {
  dns.lookup(hostname, { ...options, all: true }, (err, addresses) => {
    if (err) return callback(err, "", 4);
    const list = addresses as dns.LookupAddress[];
    const bad = list.find((a) => !isPublicAddress(a.address));
    if (!list.length || bad) return callback(new Error("BLOCKED_ADDRESS"), "", 4);
    if ((options as dns.LookupAllOptions).all) return (callback as unknown as (e: null, a: dns.LookupAddress[]) => void)(null, list);
    callback(null, list[0].address, list[0].family);
  });
};

function checkUrl(raw: string): URL {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    throw new HttpError(400, "网址格式不对");
  }
  if (u.protocol !== "http:" && u.protocol !== "https:") throw new HttpError(400, "只支持 http / https 网址");
  if (u.username || u.password) throw new HttpError(400, "网址里不能带账号密码");
  if (u.port && u.port !== "80" && u.port !== "443") throw new HttpError(400, "只支持默认端口（80 / 443）的网址");
  const host = u.hostname.replace(/^\[|\]$/g, "");
  if (net.isIP(host) && !isPublicAddress(host)) throw new HttpError(400, "不能访问内网地址");
  if (/^(localhost|.*\.local|.*\.internal)$/i.test(host)) throw new HttpError(400, "不能访问内网地址");
  return u;
}

// ---------- raw request ----------

type Raw = { status: number; headers: http.IncomingHttpHeaders; body: Buffer };

function request(u: URL, maxBytes: number, timeout: number): Promise<Raw> {
  return new Promise((resolve, reject) => {
    const mod = u.protocol === "https:" ? https : http;
    const req = mod.request(
      u,
      {
        method: "GET",
        lookup: safeLookup,
        timeout,
        headers: {
          "user-agent": userAgent(),
          accept: "text/html,application/xhtml+xml,text/plain;q=0.9,*/*;q=0.5",
          "accept-language": "ja,en;q=0.5",
          "accept-encoding": "gzip, deflate, br",
        },
      },
      (res) => {
        const enc = String(res.headers["content-encoding"] ?? "").toLowerCase();
        const stream =
          enc === "gzip" ? res.pipe(zlib.createGunzip()) : enc === "deflate" ? res.pipe(zlib.createInflate()) : enc === "br" ? res.pipe(zlib.createBrotliDecompress()) : res;
        const chunks: Buffer[] = [];
        let size = 0;
        stream.on("data", (c: Buffer) => {
          size += c.length;
          if (size > maxBytes) {
            req.destroy(new Error("TOO_LARGE"));
            return;
          }
          chunks.push(c);
        });
        stream.on("end", () => resolve({ status: res.statusCode ?? 0, headers: res.headers, body: Buffer.concat(chunks) }));
        stream.on("error", reject);
      },
    );
    req.on("timeout", () => req.destroy(new Error("TIMEOUT")));
    req.on("error", reject);
    req.end();
  });
}

function friendly(err: unknown): HttpError {
  if (err instanceof HttpError) return err;
  const m = err instanceof Error ? err.message : String(err);
  if (m.includes("BLOCKED_ADDRESS")) return new HttpError(400, "这个网址指向内网地址，不能访问");
  if (m.includes("TOO_LARGE")) return new HttpError(422, "页面太大（超过 3MB）");
  if (m.includes("TIMEOUT")) return new HttpError(504, "页面加载超时");
  if (/ENOTFOUND|EAI_AGAIN/.test(m)) return new HttpError(502, "找不到这个网站（域名解析失败）");
  if (/ECONNREFUSED|ECONNRESET|EHOSTUNREACH/.test(m)) return new HttpError(502, "连接不上这个网站");
  if (/certificate|SSL|TLS/i.test(m)) return new HttpError(502, "网站的 HTTPS 证书有问题");
  return new HttpError(502, `抓取失败：${m.slice(0, 120)}`);
}

/** GET with redirects; each hop is re-checked. */
async function get(raw: string, maxBytes = MAX_BYTES, timeout = TIMEOUT_MS): Promise<Raw & { url: string }> {
  let u = checkUrl(raw);
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    let res: Raw;
    try {
      res = await request(u, maxBytes, timeout);
    } catch (err) {
      throw friendly(err);
    }
    if (res.status >= 300 && res.status < 400 && res.headers.location) {
      u = checkUrl(new URL(String(res.headers.location), u).toString());
      continue;
    }
    return { ...res, url: u.toString() };
  }
  throw new HttpError(502, "重定向次数太多");
}

// ---------- robots.txt ----------

type Rule = { allow: boolean; path: string };
type RobotsEntry = { rules: Rule[]; at: number };
const robotsCache = globalThis as unknown as { robots?: Map<string, RobotsEntry> };

function parseRobots(text: string) {
  type Group = { agents: string[]; rules: { allow: boolean; path: string }[] };
  const groups: Group[] = [];
  let cur: Group | null = null;
  let lastWasAgent = false;
  for (const line of text.split(/\r?\n/)) {
    const m = line.replace(/#.*/, "").trim().match(/^([A-Za-z-]+)\s*:\s*(.*)$/);
    if (!m) continue;
    const key = m[1].toLowerCase();
    const val = m[2].trim();
    if (key === "user-agent") {
      if (!cur || !lastWasAgent) groups.push((cur = { agents: [], rules: [] }));
      cur.agents.push(val.toLowerCase());
      lastWasAgent = true;
    } else {
      lastWasAgent = false;
      if (cur && (key === "allow" || key === "disallow") && val) cur.rules.push({ allow: key === "allow", path: val });
    }
  }
  const mine = groups.filter((g) => g.agents.some((a) => a !== "*" && UA_NAME.toLowerCase().includes(a)));
  return (mine.length ? mine : groups.filter((g) => g.agents.includes("*"))).flatMap((g) => g.rules);
}

function ruleMatches(pattern: string, path: string) {
  const re = new RegExp("^" + pattern.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*").replace(/\\\$$/, "$"));
  return re.test(path);
}

async function robotsAllows(u: URL): Promise<boolean> {
  const cache = (robotsCache.robots ??= new Map<string, RobotsEntry>());
  let entry = cache.get(u.origin);
  if (!entry || Date.now() - entry.at > 12 * 3600_000) {
    let rules: Rule[] = [];
    try {
      const r = await get(`${u.origin}/robots.txt`, 512 * 1024, 8_000);
      if (r.status === 200) rules = parseRobots(r.body.toString("utf8"));
    } catch {
      // No robots.txt (or unreachable): allowed.
    }
    entry = { rules, at: Date.now() };
    cache.set(u.origin, entry);
  }
  const path = u.pathname + u.search;
  const hits = entry.rules.filter((r: Rule) => ruleMatches(r.path, path)).sort((a, b) => b.path.length - a.path.length || Number(b.allow) - Number(a.allow));
  return !hits.length || hits[0].allow;
}

// ---------- HTML → text ----------

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", yen: "¥", copy: "©", hellip: "…", mdash: "—", ndash: "–" };

function decodeEntities(s: string) {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e: string) => {
    if (e[0] === "#") {
      const n = e[1].toLowerCase() === "x" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(n) && n > 0 && n < 0x110000 ? String.fromCodePoint(n) : m;
    }
    return ENTITIES[e.toLowerCase()] ?? m;
  });
}

export function htmlToText(html: string, base: string): { title: string; text: string } {
  const title = decodeEntities((html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? "").replace(/\s+/g, " ").trim());
  let s = html
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<(script|style|noscript|svg|template|iframe)\b[\s\S]*?<\/\1>/gi, " ")
    .replace(/<head\b[\s\S]*?<\/head>/i, " ");
  // Keep link targets: "文字 [链接 https://…]".
  s = s.replace(/<a\b[^>]*?href\s*=\s*(["'])(.*?)\1[^>]*>([\s\S]*?)<\/a>/gi, (_m, _q, href: string, inner: string) => {
    const label = inner.replace(/<[^>]+>/g, " ").trim();
    let abs = "";
    try {
      const u = new URL(decodeEntities(href.trim()), base);
      if (u.protocol === "http:" || u.protocol === "https:") abs = u.toString();
    } catch {
      /* ignore */
    }
    // Square brackets, not <…>: the tag stripping below would eat angle brackets.
    return abs ? ` ${label} [链接 ${abs}] ` : ` ${label} `;
  });
  s = s
    .replace(/<(br|hr)\b[^>]*>/gi, "\n")
    .replace(/<\/(p|div|li|tr|h[1-6]|section|article|dd|dt|table|ul|ol|header|footer)>/gi, "\n")
    .replace(/<(td|th)\b[^>]*>/gi, " | ")
    .replace(/<[^>]+>/g, " ");
  const text = decodeEntities(s)
    .replace(/[ \t　 ]+/g, " ")
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .join("\n");
  return { title, text };
}

function decodeBody(body: Buffer, contentType: string) {
  const sniff = body.subarray(0, 4096).toString("latin1");
  const charset = (contentType.match(/charset=["']?([\w-]+)/i)?.[1] ?? sniff.match(/<meta[^>]+charset=["']?([\w-]+)/i)?.[1] ?? "utf-8").toLowerCase();
  const label = /sjis|shift.?jis|windows-31j|cp932|x-sjis/.test(charset) ? "shift_jis" : /euc.?jp/.test(charset) ? "euc-jp" : charset;
  try {
    return new TextDecoder(label).decode(body);
  } catch {
    return new TextDecoder("utf-8").decode(body);
  }
}

export type FetchedPage = { url: string; title: string; text: string; hash: string; thin: boolean };

/** Same text → same hash, so unchanged pages skip the AI call. */
export function textHash(text: string) {
  return createHash("sha256").update(text).digest("hex");
}

export async function fetchPage(rawUrl: string): Promise<FetchedPage> {
  const u = checkUrl(rawUrl);
  if (!(await robotsAllows(u))) throw new HttpError(403, "这个网站的 robots.txt 不允许自动抓取这个页面，可以改用「粘贴页面内容识别」");
  const res = await get(u.toString());
  if (res.status === 403 || res.status === 401) throw new HttpError(502, `网站拒绝访问（HTTP ${res.status}），可以改用「粘贴页面内容识别」`);
  if (res.status >= 400) throw new HttpError(502, `网站返回错误（HTTP ${res.status}）`);
  const type = String(res.headers["content-type"] ?? "");
  if (type && !/text\/html|application\/xhtml|text\/plain/i.test(type)) throw new HttpError(422, `不是网页（${type.split(";")[0]}），PDF 等文件请复制文字后粘贴识别`);
  const decoded = decodeBody(res.body, type);
  const { title, text } = /text\/plain/i.test(type) ? { title: "", text: decoded.trim() } : htmlToText(decoded, res.url);
  const clipped = (title ? `# ${title}\n` : "") + text.slice(0, MAX_TEXT);
  return { url: res.url, title, text: clipped, hash: textHash(clipped), thin: text.length < 200 };
}
