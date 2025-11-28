/* =========================================================
 * 模块分类 · 网络信息 + 服务检测
 * 功能边界 · 展示 本地/入口/落地 信息，并并发检测常见服务可用性
 * 兼容环境 · Surge / Loon / Quantumult X / Egern（含 BoxJS 参数）
 * 合规说明 · clean-room 重新实现：不沿用第三方脚本的结构/常量/探测指纹
 * 免责声明 · 脚本按“原样”提供，使用风险自担
 * ========================================================= */

/* =========================
 * 模块分类 · 基础参数
 * ========================= */
const CFG = (() => {
  const args = parseArgs(typeof $argument !== "undefined" ? $argument : "");
  const box = readBoxPanelSettings();

  const env = (k, d) => {
    const av = args[k];
    if (av !== undefined && av !== null && String(av).trim() !== "") return av;
    const bv = box[k];
    if (bv !== undefined && bv !== null && String(bv).trim() !== "") return bv;
    return d;
  };

  const toBool = (v, d) => {
    if (v === undefined || v === null || v === "") return d;
    if (typeof v === "boolean") return v;
    const s = String(v).trim().toLowerCase();
    if (["1", "true", "on", "yes", "y"].includes(s)) return true;
    if (["0", "false", "off", "no", "n"].includes(s)) return false;
    return d;
  };

  const toNum = (v, d) => {
    const n = Number(v);
    return Number.isFinite(n) ? n : d;
  };

  const clamp = (n, a, b) => Math.max(a, Math.min(b, n));

  return {
    Update: clamp(toNum(env("Update", 10), 10), 5, 86400),
    Timeout: clamp(toNum(env("Timeout", 12), 12), 3, 60),

    IPv6: toBool(env("IPv6", true), true),
    MASK_IP: toBool(env("MASK_IP", true), true),
    MASK_POS: (() => {
      const raw = String(env("MASK_POS", "auto")).trim().toLowerCase();
      if (raw === "auto" || raw === "" || raw === "follow") return toBool(env("MASK_IP", true), true);
      return toBool(raw, true);
    })(),
    TW_FLAG_MODE: clamp(toNum(env("TW_FLAG_MODE", 1), 1), 0, 2),

    SUBTITLE_STYLE: String(env("SUBTITLE_STYLE", "line")).trim(),
    SUBTITLE_MINIMAL: toBool(env("SUBTITLE_MINIMAL", false), false),
    GAP_LINES: clamp(toNum(env("GAP_LINES", 1), 1), 0, 2),

    SD_STYLE: String(env("SD_STYLE", "icon")).trim().toLowerCase() === "text" ? "text" : "icon",
    SD_REGION_MODE: ["full", "abbr", "flag"].includes(String(env("SD_REGION_MODE", "full")).trim()) ? String(env("SD_REGION_MODE", "full")).trim() : "full",
    SD_ICON_THEME: ["check", "lock", "circle"].includes(String(env("SD_ICON_THEME", "check")).trim()) ? String(env("SD_ICON_THEME", "check")).trim() : "check",
    SD_ARROW: toBool(env("SD_ARROW", true), true),
    SD_SHOW_LAT: toBool(env("SD_SHOW_LAT", true), true),
    SD_SHOW_HTTP: toBool(env("SD_SHOW_HTTP", true), true),
    SD_CONCURRENCY: clamp(toNum(env("SD_CONCURRENCY", 6), 6), 1, 8),

    SD_LANG: String(env("SD_LANG", "zh-Hans")).toLowerCase() === "zh-hant" ? "zh-Hant" : "zh-Hans",

    SERVICES: String(env("SERVICES", "")).trim(),
    SERVICES_TEXT: String(env("SERVICES_TEXT", "")).trim(),

    IconPreset: String(env("IconPreset", "globe")).trim(),
    Icon: String(env("Icon", "")).trim(),
    IconColor: String(env("IconColor", "#1E90FF")).trim(),

    LOG: toBool(env("LOG", true), true),
    LOG_LEVEL: String(env("LOG_LEVEL", "info")).trim().toLowerCase(),
    LOG_TO_PANEL: toBool(env("LOG_TO_PANEL", false), false)
  };
})();

/* =========================
 * 模块分类 · 文案与样式
 * ========================= */
const I18N = {
  "zh-Hans": {
    title: "网络信息",
    wifi: "Wi-Fi",
    cellular: "蜂窝网络",
    unknownNet: "网络 | 未知",
    runAt: "执行时间",
    policy: "代理策略",
    local: "本地",
    entrance: "入口",
    landing: "落地",
    ip: "IP",
    location: "位置",
    isp: "运营商",
    services: "服务检测",
    ok: "已解锁",
    blocked: "不可达",
    region: "区域",
    timeout: "超时",
    fail: "失败",
    debug: "调试"
  },
  "zh-Hant": {
    title: "網路資訊",
    wifi: "Wi-Fi",
    cellular: "行動服務",
    unknownNet: "網路 | 未知",
    runAt: "執行時間",
    policy: "代理策略",
    local: "本地",
    entrance: "入口",
    landing: "落地",
    ip: "IP",
    location: "位置",
    isp: "運營商",
    services: "服務檢測",
    ok: "已解鎖",
    blocked: "不可達",
    region: "區域",
    timeout: "逾時",
    fail: "失敗",
    debug: "除錯"
  }
};

function T(key) {
  const pack = I18N[CFG.SD_LANG] || I18N["zh-Hans"];
  return pack[key] || key;
}

const SUB_STYLE = {
  line: (s) => `——${s}——`,
  cnBracket: (s) => `【${s}】`,
  cnQuote: (s) => `「${s}」`,
  square: (s) => `[${s}]`,
  curly: (s) => `{${s}}`,
  angle: (s) => `《${s}》`,
  pipe: (s) => `║${s}║`,
  bullet: (s) => `·${s}·`,
  plain: (s) => `${s}`
};

function subTitle(s) {
  const fn = SUB_STYLE[CFG.SUBTITLE_STYLE] || SUB_STYLE.line;
  return CFG.SUBTITLE_MINIMAL ? String(s) : fn(String(s));
}

/* =========================
 * 模块分类 · 日志
 * ========================= */
const LOG = (() => {
  const levels = {debug: 10, info: 20, warn: 30, error: 40};
  const thr = levels[CFG.LOG_LEVEL] ?? 20;
  const buf = [];

  const push = (l, msg) => {
    buf.push(msg);
    if (buf.length > 120) buf.shift();
    try { console.log(msg); } catch (_) {}
  };

  const emit = (level, ...args) => {
    if (!CFG.LOG) return;
    const lvl = levels[level] ?? 20;
    if (lvl < thr) return;
    const line = `[NI][${level.toUpperCase()}] ${args.map(x => typeof x === "string" ? x : JSON.stringify(x)).join(" ")}`;
    push(level, line);
  };

  return {
    debug: (...a) => emit("debug", ...a),
    info: (...a) => emit("info", ...a),
    warn: (...a) => emit("warn", ...a),
    error: (...a) => emit("error", ...a),
    tail: (n) => buf.slice(-n)
  };
})();

/* =========================
 * 模块分类 · 入口
 * ========================= */
(async () => {
  const started = Date.now();

  const title = netTitle();
  const lines = [];
  lines.push(`${T("runAt")}: ${hhmmss(new Date())}`);

  const {policyName, entrance4, entrance6} = await readEntranceFromSurge();
  lines.push(`${T("policy")}: ${policyName || "-"}`);

  gap(lines);
  lines.push(subTitle(T("local")));
  const local = await fetchGeoBundle({preferV6: false, v6Enabled: CFG.IPv6});
  pushGeoLines(lines, local);

  if (entrance4 || entrance6) {
    gap(lines);
    lines.push(subTitle(T("entrance")));
    if (entrance4) lines.push(`IPv4: ${maskIP(entrance4)}`);
    if (entrance6) lines.push(`IPv6: ${maskIP(entrance6)}`);
    const entGeo = await fetchGeoByIpPrefer(entrance4 || entrance6);
    pushGeoMeta(lines, entGeo);
  }

  gap(lines);
  lines.push(subTitle(T("landing")));
  const landing = await fetchLandingBundle({v6Enabled: CFG.IPv6});
  pushGeoLines(lines, landing);

  gap(lines);
  lines.push(subTitle(T("services")));
  const svcLines = await runServiceChecks({landingCC: landing.cc || ""});
  lines.push(...svcLines);

  if (CFG.LOG_TO_PANEL) {
    gap(lines);
    lines.push(subTitle(T("debug")));
    lines.push(LOG.tail(18).join("\n"));
  }

  const cost = Date.now() - started;
  LOG.info("Done", `${cost}ms`);

  $done({
    title: `${title}`,
    content: lines.join("\n"),
    icon: pickIconName(),
    "icon-color": CFG.IconColor
  });
})().catch((e) => {
  const msg = `ERR: ${String(e)}`;
  LOG.error(msg);
  $done({title: T("title"), content: msg, icon: pickIconName(), "icon-color": CFG.IconColor});
});

/* =========================
 * 模块分类 · 网络展示工具
 * ========================= */
function gap(arr) {
  for (let i = 0; i < CFG.GAP_LINES; i++) arr.push("");
}

function hhmmss(d) {
  const p = (n) => String(n).padStart(2, "0");
  return `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

function netTitle() {
  try {
    const n = $network || {};
    const ssid = n.wifi && n.wifi.ssid;
    if (ssid) return `${T("wifi")} | ${ssid}`;
    const radio = (n.cellular && n.cellular.radio) || (n["cellular-data"] && n["cellular-data"].radio);
    if (radio) return `${T("cellular")} | ${String(radio).toUpperCase()}`;
  } catch (_) {}
  return T("unknownNet");
}

function maskIP(ip) {
  const s = String(ip || "").trim();
  if (!CFG.MASK_IP) return s;
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(s)) {
    const p = s.split(".");
    return `${p[0]}.${p[1]}.*.*`;
  }
  if (s.includes(":")) {
    const p = s.split(":");
    return [...p.slice(0, 4), "*", "*", "*", "*"].join(":");
  }
  return s;
}

function applyTW(flag) {
  if (flag !== "🇹🇼") return flag;
  if (CFG.TW_FLAG_MODE === 0) return "🇨🇳";
  if (CFG.TW_FLAG_MODE === 2) return "🇼🇸";
  return "🇹🇼";
}

function flagOf(cc) {
  const c = String(cc || "").trim().toUpperCase();
  if (!/^[A-Z]{2}$/.test(c)) return "";
  try {
    const base = [...c].map(ch => 127397 + ch.charCodeAt(0));
    const f = String.fromCodePoint(...base);
    return applyTW(f);
  } catch (_) {
    return "";
  }
}

function showLoc(flag, text) {
  const f = applyTW(flag || "");
  const t = String(text || "").trim();
  if (!t) return f || "-";
  if (CFG.MASK_POS) return f || "-";
  return (f ? `${f} ` : "") + t;
}

function pushGeoMeta(lines, geo) {
  if (!geo) return;
  const loc = showLoc(geo.flag, geo.loc);
  if (loc) lines.push(`${T("location")}: ${loc}`);
  if (geo.isp) lines.push(`${T("isp")}: ${geo.isp}`);
}

function pushGeoLines(lines, geo) {
  if (!geo) return;
  if (geo.ip4) lines.push(`IPv4: ${maskIP(geo.ip4)}`);
  if (geo.ip6) lines.push(`IPv6: ${maskIP(geo.ip6)}`);
  pushGeoMeta(lines, geo);
}

/* =========================
 * 模块分类 · HTTP & 解析
 * ========================= */
function httpGet(url, headers, timeoutMs) {
  return new Promise((resolve, reject) => {
    if (!$httpClient || !$httpClient.get) return reject(new Error("no-$httpClient"));
    const req = {url, headers: headers || {}, timeout: timeoutMs || CFG.Timeout * 1000};
    $httpClient.get(req, (err, resp, body) => {
      if (err || !resp) return reject(err || new Error("no-resp"));
      resolve({
        status: resp.status || resp.statusCode || 0,
        headers: resp.headers || {},
        body: body || ""
      });
    });
  });
}

function tryJSON(s) {
  try { return JSON.parse(s); } catch { return null; }
}

async function fetchGeoBundle({preferV6, v6Enabled}) {
  const trace = await fetchCfTrace().catch(() => null);
  const ip4 = trace && trace.ip && trace.ip.includes(".") ? trace.ip : "";
  const cc = trace && trace.loc ? trace.loc : "";
  const hintFlag = cc ? flagOf(cc) : "";

  const geo = await fetchLandingGeo().catch(() => ({}));
  return {
    ip4: ip4 || geo.ip4 || "",
    ip6: v6Enabled ? (geo.ip6 || "") : "",
    cc: cc || geo.cc || "",
    flag: hintFlag || geo.flag || "",
    loc: geo.loc || "",
    isp: geo.isp || ""
  };
}

async function fetchLandingBundle({v6Enabled}) {
  const geo = await fetchLandingGeo().catch(() => ({}));
  return {
    ip4: geo.ip4 || "",
    ip6: v6Enabled ? (geo.ip6 || "") : "",
    cc: geo.cc || "",
    flag: geo.flag || "",
    loc: geo.loc || "",
    isp: geo.isp || ""
  };
}

async function fetchCfTrace() {
  // Cloudflare trace：常见且稳定，不涉及第三方脚本的“指纹级实现”
  const r = await httpGet("https://1.1.1.1/cdn-cgi/trace", {"Accept-Language": "en"}, 2500);
  const body = String(r.body || "");
  const ip = (body.match(/ip=([^\n]+)/) || [])[1] || "";
  const loc = (body.match(/loc=([A-Z]{2})/) || [])[1] || "";
  return {ip: ip.trim(), loc: loc.trim()};
}

async function fetchLandingGeo() {
  // 1) ip.sb geoip（v4/v6 都可）
  // 2) ipinfo 兜底
  const a = await httpGet("https://api.ip.sb/geoip", {"Accept-Language": "en"}, 3500)
    .then(r => ({ok: r.status === 200, r})).catch(() => ({ok: false}));
  if (a.ok) {
    const j = tryJSON(a.r.body) || {};
    const cc = String(j.country_code || "").toUpperCase();
    const flag = cc ? flagOf(cc) : "";
    const loc = [j.country, j.region, j.city].filter(Boolean).join(" ");
    return {
      ip4: String(j.ip || ""),
      ip6: "",
      cc,
      flag,
      loc: loc.trim(),
      isp: String(j.isp || j.organization || "")
    };
  }

  const b = await httpGet("https://ipinfo.io/json", {"Accept-Language": "en"}, 3500);
  const j = tryJSON(b.body) || {};
  const cc = String(j.country || "").toUpperCase();
  const flag = cc ? flagOf(cc) : "";
  const loc = [j.country, j.region, j.city].filter(Boolean).join(" ");
  return {
    ip4: String(j.ip || ""),
    ip6: "",
    cc,
    flag,
    loc: loc.trim(),
    isp: String(j.org || "")
  };
}

async function fetchGeoByIpPrefer(ip) {
  const s = String(ip || "").trim();
  if (!s) return null;
  // ip.sb 单 IP 查询
  const r = await httpGet(`https://api.ip.sb/geoip/${encodeURIComponent(s)}`, {"Accept-Language": "en"}, 3500).catch(() => null);
  if (r && r.status === 200) {
    const j = tryJSON(r.body) || {};
    const cc = String(j.country_code || "").toUpperCase();
    return {
      cc,
      flag: cc ? flagOf(cc) : "",
      loc: [j.country, j.region, j.city].filter(Boolean).join(" "),
      isp: String(j.isp || j.organization || "")
    };
  }
  return null;
}

/* =========================
 * 模块分类 · Surge 入口/策略读取
 * ========================= */
async function readEntranceFromSurge() {
  if (typeof $httpAPI !== "function") return {policyName: "", entrance4: "", entrance6: ""};

  const data = await new Promise((res) => {
    $httpAPI("GET", "/v1/requests/recent", null, (x) => res(x || {}));
  });

  const reqs = Array.isArray(data.requests) ? data.requests : [];
  const max = 160;
  let policyName = "";
  let entrance4 = "";
  let entrance6 = "";

  for (const it of reqs.slice(0, max)) {
    if (!policyName && it.policyName) policyName = it.policyName;

    const ra = String(it.remoteAddress || "");
    const ip = extractIP(ra);
    if (!ip) continue;

    if (ip.includes(":")) {
      if (!entrance6) entrance6 = ip;
    } else {
      if (!entrance4) entrance4 = ip;
    }

    if (policyName && entrance4 && entrance6) break;
  }

  return {policyName, entrance4, entrance6};
}

function extractIP(s) {
  const str = String(s || "").replace(/\(Proxy\)/i, "");
  const m6 = str.match(/\[([0-9a-fA-F:]+)]/);
  if (m6 && m6[1] && m6[1].includes(":")) return m6[1];
  const m4 = str.match(/(\d{1,3}(?:\.\d{1,3}){3})/);
  if (m4 && m4[1]) return m4[1];
  return "";
}

/* =========================
 * 模块分类 · 服务检测
 * ========================= */
const SD_ICON = (() => {
  if (CFG.SD_ICON_THEME === "lock") return {ok: "🔓", bad: "🔒"};
  if (CFG.SD_ICON_THEME === "circle") return {ok: "⭕️", bad: "🚫"};
  return {ok: "✅", bad: "❎"};
})();

const SD_ALIAS = {
  yt: "youtube", youtube: "youtube", "youtube premium": "youtube", 油管: "youtube",
  nf: "netflix", netflix: "netflix", 奈飞: "netflix", 奈飛: "netflix",
  disney: "disney", "disney+": "disney", 迪士尼: "disney",
  hulu: "hulu_us", huluus: "hulu_us", hulujp: "hulu_jp",
  hbo: "max", max: "max",
  chatgpt: "chatgpt_app", gpt: "chatgpt_app",
  chatgpt_web: "chatgpt_web", "chatgpt web": "chatgpt_web", "chatgpt-web": "chatgpt_web"
};

const SD_NAME = {
  youtube: "YouTube",
  netflix: "Netflix",
  disney: "Disney+",
  hulu_us: "Hulu(US)",
  hulu_jp: "Hulu(JP)",
  max: "Max(HBO)",
  chatgpt_web: "ChatGPT Web",
  chatgpt_app: "ChatGPT(API)"
};

const SD_DEFAULT = ["youtube", "netflix", "disney", "hulu_us", "hulu_jp", "max", "chatgpt_web", "chatgpt_app"];

function parseServices() {
  const pickRaw = (CFG.SERVICES || CFG.SERVICES_TEXT || "").trim();
  if (!pickRaw) return SD_DEFAULT.slice();

  try {
    const arr = JSON.parse(pickRaw);
    if (Array.isArray(arr)) return normalizeSvc(arr);
  } catch (_) {}

  return normalizeSvc(pickRaw.split(/[,\uFF0C;|\/ \t\r\n]+/));
}

function normalizeSvc(list) {
  const out = [];
  for (let x of list) {
    let k = String(x || "").trim().toLowerCase();
    if (!k) continue;
    k = SD_ALIAS[k] || k;
    if (!SD_NAME[k]) continue;
    if (!out.includes(k)) out.push(k);
  }
  return out.length ? out : SD_DEFAULT.slice();
}

function renderSvcLine({key, ok, cc, cost, status, tag}) {
  const name = SD_NAME[key] || key;
  const icon = ok ? SD_ICON.ok : SD_ICON.bad;

  const region = prettyCC(cc);
  const head = CFG.SD_STYLE === "text"
    ? `${name}: ${ok ? T("ok") : T("blocked")}`
    : `${icon} ${name}`;

  const mid = CFG.SD_ARROW ? ` ➟ ${region}` : ` ｜ ${region}`;
  const tail = [
    tag || "",
    CFG.SD_SHOW_LAT && typeof cost === "number" ? `${cost}ms` : "",
    CFG.SD_SHOW_HTTP && status ? `HTTP ${status}` : ""
  ].filter(Boolean).join(" ｜ ");

  return tail ? `${head}${mid} ｜ ${tail}` : `${head}${mid}`;
}

function prettyCC(cc) {
  const c = String(cc || "").trim().toUpperCase();
  if (!/^[A-Z]{2}$/.test(c)) return "—";
  const f = flagOf(c);
  if (CFG.SD_REGION_MODE === "flag") return f || "—";
  if (CFG.SD_REGION_MODE === "abbr") return `${f ? f + " " : ""}${c}`;
  return `${f ? f + " " : ""}${c}`;
}

async function runServiceChecks({landingCC}) {
  const order = parseServices();
  const conc = CFG.SD_CONCURRENCY;
  const timeoutMs = Math.max(2000, CFG.Timeout * 1000);

  const tasks = order.map((key) => async () => {
    const started = Date.now();
    const ccFallback = landingCC || "";
    const safe = async (fn) => {
      try { return await fn(); } catch (e) { return {ok: false, cc: ccFallback, status: 0, tag: T("fail"), err: String(e)}; }
    };

    const res = await withTimeout(safe(() => svcTest(key, ccFallback, timeoutMs)), timeoutMs + 200, null);
    if (!res) return renderSvcLine({key, ok: false, cc: ccFallback, cost: Date.now() - started, status: 0, tag: T("timeout")});

    return renderSvcLine({
      key,
      ok: !!res.ok,
      cc: res.cc || ccFallback,
      cost: Date.now() - started,
      status: res.status || 0,
      tag: res.tag || ""
    });
  });

  return await runPool(tasks, conc);
}

async function svcTest(key, ccFallback, timeoutMs) {
  // 注意：这里刻意采用“公开主页/trace”检测，避免第三方脚本那类指纹探测
  const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0 Safari/537.36";
  const H = {"User-Agent": UA, "Accept-Language": "en"};

  if (key === "youtube") {
    const r = await httpGet("https://www.youtube.com/premium?hl=en", H, timeoutMs);
    const ok = r.status === 200;
    const cc = parseCountryCodeFromHtml(r.body) || ccFallback;
    return {ok, cc, status: r.status, tag: ""};
  }

  if (key === "netflix") {
    const r = await httpGet("https://www.netflix.com/", H, timeoutMs);
    const body = String(r.body || "");
    const blocked = /not available in your region|unavailable/i.test(body);
    const ok = r.status >= 200 && r.status < 500 && !blocked;
    const cc = parseNetflixCountryHint(body) || ccFallback;
    return {ok, cc, status: r.status, tag: blocked ? "GeoBlocked" : ""};
  }

  if (key === "disney") {
    const r = await httpGet("https://www.disneyplus.com/", H, timeoutMs);
    const body = String(r.body || "");
    const blocked = /not available|Sorry,\s*Disney\+\s*is\s*not\s*available/i.test(body);
    const ok = r.status === 200 && !blocked;
    const cc = parseCountryCodeFromHtml(body) || ccFallback;
    return {ok, cc, status: r.status, tag: blocked ? "GeoBlocked" : ""};
  }

  if (key === "hulu_us") {
    const r = await httpGet("https://www.hulu.com/", H, timeoutMs);
    const body = String(r.body || "");
    const blocked = /not available in your region/i.test(body);
    return {ok: r.status === 200 && !blocked, cc: blocked ? "" : "US", status: r.status, tag: blocked ? "GeoBlocked" : ""};
  }

  if (key === "hulu_jp") {
    const r = await httpGet("https://www.hulu.jp/", H, timeoutMs);
    const body = String(r.body || "");
    const blocked = /ご利用いただけません|not available/i.test(body);
    return {ok: r.status === 200 && !blocked, cc: blocked ? "" : "JP", status: r.status, tag: blocked ? "GeoBlocked" : ""};
  }

  if (key === "max") {
    const r = await httpGet("https://www.max.com/", H, timeoutMs);
    const body = String(r.body || "");
    const blocked = /not available in your region|country not supported/i.test(body);
    const cc = parseCountryCodeFromHtml(body) || ccFallback;
    return {ok: r.status === 200 && !blocked, cc: blocked ? "" : cc, status: r.status, tag: blocked ? "GeoBlocked" : ""};
  }

  if (key === "chatgpt_web") {
    const r = await httpGet("https://chatgpt.com/cdn-cgi/trace", H, timeoutMs);
    const loc = (String(r.body || "").match(/loc=([A-Z]{2})/) || [])[1] || ccFallback;
    return {ok: r.status === 200, cc: loc, status: r.status, tag: ""};
  }

  if (key === "chatgpt_app") {
    // 不带 key 获取 models 会 401，但可用性仍可判断
    const r = await httpGet("https://api.openai.com/v1/models", H, timeoutMs);
    const ok = r.status === 200 || r.status === 401 || r.status === 403;
    const h = r.headers || {};
    const cf = String(h["cf-ipcountry"] || h["CF-IPCountry"] || "").toUpperCase();
    const cc = /^[A-Z]{2}$/.test(cf) ? cf : ccFallback;
    return {ok, cc, status: r.status, tag: r.status === 401 ? "401" : ""};
  }

  return {ok: false, cc: ccFallback, status: 0, tag: T("fail")};
}

function parseCountryCodeFromHtml(html) {
  const s = String(html || "");
  const m1 = s.match(/"countryCode"\s*:\s*"([A-Z]{2})"/i);
  if (m1) return m1[1].toUpperCase();
  const m2 = s.match(/data-country=["']([A-Z]{2})["']/i);
  if (m2) return m2[1].toUpperCase();
  return "";
}

function parseNetflixCountryHint(html) {
  // 仅做“弱提示”，不依赖特定 title id
  const s = String(html || "");
  const m = s.match(/"country"\s*:\s*"([A-Z]{2})"/i);
  if (m) return m[1].toUpperCase();
  return parseCountryCodeFromHtml(s);
}

async function runPool(tasks, concurrency) {
  const out = new Array(tasks.length);
  let i = 0;

  const worker = async () => {
    while (i < tasks.length) {
      const idx = i++;
      out[idx] = await tasks[idx]();
    }
  };

  const workers = [];
  for (let k = 0; k < concurrency; k++) workers.push(worker());
  await Promise.all(workers);
  return out.filter(Boolean);
}

async function withTimeout(promise, ms, fallback) {
  const lim = Math.max(200, Number(ms) || 0);
  let t;
  try {
    return await Promise.race([
      Promise.resolve(promise),
      new Promise((res) => { t = setTimeout(() => res(fallback), lim); })
    ]);
  } finally {
    if (t) clearTimeout(t);
  }
}

/* =========================
 * 模块分类 · BoxJS / 参数解析
 * ========================= */
function parseArgs(raw) {
  if (!raw) return {};
  if (typeof raw === "object") return raw;
  const s = String(raw);
  return s.split("&").reduce((acc, kv) => {
    if (!kv) return acc;
    const p = kv.split("=");
    const k = decodeURIComponent(p[0] || "");
    const v = decodeURIComponent(String(p[1] || "").replace(/\+/g, "%20"));
    acc[k] = v;
    return acc;
  }, {});
}

function readBoxPanelSettings() {
  try {
    const store = getStore();
    const raw = store.read("Panel");
    if (!raw) return {};
    const obj = typeof raw === "string" ? JSON.parse(raw) : raw;
    const set = obj && obj.NetworkInfo && obj.NetworkInfo.Settings ? obj.NetworkInfo.Settings : null;
    return (set && typeof set === "object") ? set : {};
  } catch (_) {
    return {};
  }
}

function getStore() {
  if (typeof $prefs !== "undefined" && $prefs.valueForKey) {
    return {read: (k) => $prefs.valueForKey(k), write: (v, k) => $prefs.setValueForKey(v, k)};
  }
  if (typeof $persistentStore !== "undefined" && $persistentStore.read) {
    return {read: (k) => $persistentStore.read(k), write: (v, k) => $persistentStore.write(v, k)};
  }
  return {read: () => null, write: () => {}};
}

/* =========================
 * 模块分类 · 图标
 * ========================= */
function pickIconName() {
  if (CFG.Icon) return CFG.Icon;
  const map = {
    wifi: "wifi.router",
    globe: "globe.asia.australia",
    dots: "dot.radiowaves.left.and.right",
    antenna: "antenna.radiowaves.left.and.right",
    point: "point.3.connected.trianglepath.dotted"
  };
  return map[CFG.IconPreset] || map.globe;
}
