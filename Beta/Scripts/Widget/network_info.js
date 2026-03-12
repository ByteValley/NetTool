/* =========================================================
 * 模块分类 · 网络信息 + 服务检测（Pure Egern Widget）
 * 作者 · ByteValley / OpenAI
 * 版本 · 2026-03-12R1
 *
 * 模块分类 · 说明
 * · 这是面向 Egern Generic Widget 的纯净版本，仅使用 ctx/env/device/http/storage/widgetFamily
 * · 尽量保持原脚本功能、参数、数据源、服务检测、风险评估与展示逻辑
 * · 受限于 Egern 当前公开 JavaScript API 未提供 recent-requests / policyName 回溯能力，
 *   “入口 IP / 代理策略 自动回溯”无法做到旧版那种 1:1 自动捕获；可通过 env 手动补齐：
 *   PROXY_POLICY / ENTRANCE4 / ENTRANCE6
 * ========================================================= */

const CONSTS = Object.freeze({
  SD_MIN_TIMEOUT: 2000,
  LOG_RING_MAX: 160,
  DEBUG_TAIL_LINES: 18,
  ENT_MIN_TTL: 30,
  ENT_MAX_TTL: 3600,
  V6_PROBE_TO_MS: 1200,
  BUDGET_HARD_MS: 10000,
  BUDGET_SOFT_GUARD_MS: 260
});

const SD_STR = {
  "zh-Hans": {
    panelTitle: "网络信息 𝕏",
    wifi: "Wi‑Fi",
    cellular: "蜂窝网络",
    unknownNet: "网络 | 未知",
    gen: (g, r) => `${g ? `${g} - ${r}` : r}`,
    policy: "代理策略",
    location: "位置",
    isp: "运营商",
    runAt: "执行时间",
    region: "区域",
    unlocked: "已解锁",
    partialUnlocked: "部分解锁",
    notReachable: "不可达",
    timeout: "超时",
    fail: "检测失败",
    regionBlocked: "区域受限",
    nfFull: "已完整解锁",
    nfOriginals: "仅解锁自制剧",
    debug: "调试"
  },
  "zh-Hant": {
    panelTitle: "網路資訊 𝕏",
    wifi: "Wi‑Fi",
    cellular: "行動服務",
    unknownNet: "網路 | 未知",
    gen: (g, r) => `${g ? `${g} - ${r}` : r}`,
    policy: "代理策略",
    location: "位置",
    isp: "運營商",
    runAt: "執行時間",
    region: "區域",
    unlocked: "已解鎖",
    partialUnlocked: "部分解鎖",
    notReachable: "不可達",
    timeout: "逾時",
    fail: "檢測失敗",
    regionBlocked: "區域受限",
    nfFull: "已完整解鎖",
    nfOriginals: "僅解鎖自製劇",
    debug: "除錯"
  }
};

function safeJSON(s, d = {}) { try { return JSON.parse(s || ""); } catch { return d; } }
function toBool(v, d = false) {
  if (v == null || v === "") return d;
  if (typeof v === "boolean") return v;
  const s = String(v).trim().toLowerCase();
  if (["1","true","on","yes","y"].includes(s)) return true;
  if (["0","false","off","no","n"].includes(s)) return false;
  return d;
}
function toNum(v, d) { const n = Number(v); return Number.isFinite(n) ? n : d; }
function joinNonEmpty(arr, sep = " ") { return (arr || []).filter(Boolean).join(sep); }
function clamp(n, min, max) { return Math.max(min, Math.min(max, n)); }
function parseArgs(raw) {
  if (!raw) return {};
  if (typeof raw === "object") return raw;
  return String(raw).split("&").reduce((acc, kv) => {
    if (!kv) return acc;
    const [k, v = ""] = kv.split("=");
    acc[decodeURIComponent(k || "")] = decodeURIComponent(String(v).replace(/\+/g, "%20"));
    return acc;
  }, {});
}

const SUBTITLE_STYLES = Object.freeze({
  line: (s) => `——${s}——`,
  cnBracket: (s) => `【${s}】`,
  cnQuote: (s) => `「${s}」`,
  square: (s) => `[${s}]`,
  curly: (s) => `{${s}}`,
  angle: (s) => `《${s}》`,
  pipe: (s) => `║${s}║`,
  bullet: (s) => `·${s}·`,
  plain: (s) => `${s}`
});
function normalizeSubStyle(v) { const k = String(v ?? "line").trim(); return SUBTITLE_STYLES[k] ? k : "line"; }
function makeSubTitleRenderer(styleKey, minimal = false) { const fn = SUBTITLE_STYLES[normalizeSubStyle(styleKey)] || SUBTITLE_STYLES.line; return minimal ? (s) => String(s) : (s) => fn(String(s)); }

const ICON_PRESET_MAP = Object.freeze({
  wifi: "wifi.router",
  globe: "globe.asia.australia",
  dots: "dot.radiowaves.left.and.right",
  antenna: "antenna.radiowaves.left.and.right",
  point: "point.3.connected.trianglepath.dotted"
});

const IPV4_RE = /^((25[0-5]|(2[0-4]|1\d|[1-9]|)\d)(\.(?!$)|$)){4}$/;
const IPV6_SRC = [
  "(([0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}|", "([0-9a-fA-F]{1,4}:){1,7}:|",
  "([0-9a-fA-F]{1,4}:){1,6}:[0-9a-fA-F]{1,4}|", "([0-9a-fA-F]{1,4}:){1,5}(:[0-9a-fA-F]{1,4}){1,2}|",
  "([0-9a-fA-F]{1,4}:){1,4}(:[0-9a-fA-F]{1,4}){1,3}|", "([0-9a-fA-F]{1,4}:){1,3}(:[0-9a-fA-F]{1,4}){1,4}|",
  "([0-9a-fA-F]{1,4}:){1,2}(:[0-9a-fA-F]{1,4}){1,5}|", "[0-9a-fA-F]{1,4}:((:[0-9a-fA-F]{1,4}){1,6})|",
  ":((:[0-9a-fA-F]{1,4}){1,7}|:)|", "::(ffff(:0{1,4}){0,1}:){0,1}(",
  "(25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])\\.){3,3}", "(25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])|",
  "([0-9a-fA-F]{1,4}:){1,4}:(", "(25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])\\.){3,3}",
  "(25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9]))"
].join("");
const IPV6_RE = new RegExp(`^${IPV6_SRC}$`);
const isIPv4 = (ip) => IPV4_RE.test(ip || "");
const isIPv6 = (ip) => IPV6_RE.test(ip || "");

const RISK_RULES = Object.freeze({
  dataCenterKeywords: ["datacenter","data center","hosting","cloud","cdn","edge","vps","colo","colocation","proxy","vpn","tunnel","relay","compute","server","amazon","aws","google","gcp","microsoft","azure","digitalocean","linode","ovh","hetzner","vultr","oracle","alibaba cloud","tencent cloud","cloudflare","fastly","akamai","leaseweb","choopa","dmit","racknerd"],
  homeBroadbandKeywords: ["china telecom","chinanet","ctcc","as4134","as4809","china mobile","cmcc","cmnet","cmi","as9808","china unicom","unicom","cucc","as4837","cernet","china education","comcast","xfinity","verizon","at&t","charter","spectrum","cox","rogers","bell canada","telus","bt","virgin media","sky broadband","deutsche telekom","telefonica","orange","vodafone","isp","broadband","fiber","ftth","residential","cable","docsis","pppoe","dsl","adsl","vdsl","pon","gpon","epon","cpe","dynamic","dyn","pool","subscriber","cust","customer","telecom","communications","chunghwa","cht","hinet","kbro","formosabroadband","formosa broadband","seednet","taiwan broadband","tbc","cable tv","cablemodem"],
  mobileKeywords: ["mobile","lte","4g","5g","cell","cellular","wireless","epc","ims","gprs","wimax"],
  rdnsDatacenterSuffix: ["amazonaws.com","compute.amazonaws.com","googleusercontent.com","cloudapp.azure.com","digitalocean.com","linodeusercontent.com","ovh.net","kimsufi.com","online.net","hetzner.de","hetzner.com","vultrusercontent.com","leaseweb.net","choopa.net","cloudflare.com","cloudflarenet.com","fastly.net","akamai.net"],
  rdnsHomeKeywords: ["dynamic","dyn","pppoe","dsl","adsl","vdsl","cable","docsis","fiber","ftth","fios","broadband","res","home","cust","customer","subscriber","pool","cpe","hinet","formosabroadband","kbro","cht","seednet"],
  rdnsMobileKeywords: ["lte","5g","4g","mobile","cell","wireless","epc"],
  highRiskCountries: ["俄罗斯","russia","印度","india","乌克兰","ukraine"]
});
const ASN_HOME_STRONG = new Set([38841]);

const SD_ALIAS = {
  yt: "youtube", youtube: "youtube", "youtube premium": "youtube", 油管: "youtube",
  nf: "netflix", netflix: "netflix", 奈飞: "netflix", 奈飛: "netflix",
  disney: "disney", "disney+": "disney", 迪士尼: "disney",
  chatgpt: "chatgpt_app", gpt: "chatgpt_app", openai: "chatgpt_app",
  chatgpt_web: "chatgpt_web", "chatgpt-web": "chatgpt_web", "chatgpt web": "chatgpt_web",
  hulu: "hulu_us", 葫芦: "hulu_us", 葫蘆: "hulu_us", huluus: "hulu_us", hulujp: "hulu_jp",
  hbo: "hbo", max: "hbo"
};

const DIRECT_V4_SOURCES = Object.freeze({
  ipip: { url: "https://myip.ipip.net/json", parse: (j) => {
    const d = safeJSON(j, {}); const loc = d?.data?.location || []; const c0 = loc[0]; const flag = flagOfGlobal(c0 === "中国" ? "CN" : c0);
    let isp = ""; if (Array.isArray(loc)) { if (loc.length >= 5) isp = loc[4] || ""; else if (loc.length >= 4) isp = loc[3] || ""; }
    return { ip: d?.data?.ip || "", loc: joinNonEmpty([flag, loc[0], loc[1], loc[2]], " ").replace(/\s*中国\s*/, ""), isp: String(isp || "").trim() };
  } },
  cip: { url: "http://cip.cc/", parse: (b) => {
    const s = String(b || ""); const ip = (s.match(/IP.*?:\s*(\S+)/) || [])[1] || ""; const addr = (s.match(/地址.*?:\s*(.+)/) || [])[1] || ""; const isp = (s.match(/运营商.*?:\s*(.+)/) || [])[1] || ""; const isCN = /中国/.test(addr);
    return { ip, loc: joinNonEmpty([flagOfGlobal(isCN ? "CN" : ""), addr.replace(/中国\s*/, "")], " "), isp: isp.replace(/中国\s*/, "") };
  } },
  "163": { url: "https://dashi.163.com/fgw/mailsrv-ipdetail/detail", parse: (b) => { const d = safeJSON(b, {})?.result || {}; return { ip: d.ip || "", loc: joinNonEmpty([flagOfGlobal(d.countryCode), d.country, d.province, d.city], " ").replace(/\s*中国\s*/, ""), isp: d.isp || d.org || "" }; } },
  bilibili: { url: "https://api.bilibili.com/x/web-interface/zone", parse: (b) => { const d = safeJSON(b, {})?.data || {}; const flag = flagOfGlobal(d.country === "中国" ? "CN" : d.country); return { ip: d.addr || "", loc: joinNonEmpty([flag, d.country, d.province, d.city], " ").replace(/\s*中国\s*/, ""), isp: d.isp || "" }; } },
  "126": { url: "https://ipservice.ws.126.net/locate/api/getLocByIp", parse: (b) => { const d = safeJSON(b, {})?.result || {}; return { ip: d.ip || "", loc: joinNonEmpty([flagOfGlobal(d.countrySymbol), d.country, d.province, d.city], " ").replace(/\s*中国\s*/, ""), isp: d.operator || "" }; } },
  pingan: { url: "https://rmb.pingan.com.cn/itam/mas/linden/ip/request", parse: (b) => { const d = safeJSON(b, {})?.data || {}; return { ip: d.ip || "", loc: joinNonEmpty([flagOfGlobal(d.countryIsoCode), d.country, d.region, d.city], " ").replace(/\s*中国\s*/, ""), isp: d.isp || d.ispName || d.operator || d.org || d.as || "" }; } }
});

const LANDING_V4_SOURCES = Object.freeze({
  ipapi: { url: "http://ip-api.com/json?lang=zh-CN", parse: (b) => { const j = safeJSON(b, {}); return { ip: j.query || "", loc: joinNonEmpty([flagOfGlobal(j.countryCode), j.country?.replace(/\s*中国\s*/, ""), j.regionName?.split(/\s+or\s+/)[0], j.city], " "), isp: j.isp || j.org || "", org: j.org || "", as: j.as || "", country: j.country || "", countryCode: String(j.countryCode || "").toUpperCase() }; } },
  ipwhois: { url: "https://ipwhois.app/widget.php?lang=zh-CN", parse: (b) => { const j = safeJSON(b, {}); const asn = j.asn || j.as || (j?.connection?.asn) || ""; return { ip: j.ip || "", loc: joinNonEmpty([flagOfGlobal(j.country_code), j.country?.replace(/\s*中国\s*/, ""), j.region, j.city], " "), isp: (j?.connection?.isp) || "", org: j.org || (j?.connection?.org) || "", as: asn || "", country: j.country || "", countryCode: String(j.country_code || "").toUpperCase() }; } },
  ipsb: { url: "https://api-ipv4.ip.sb/geoip", parse: (b) => { const j = safeJSON(b, {}); const as = j.asn ? (`AS${j.asn}` + (j.asn_organization ? ` ${j.asn_organization}` : "")) : ""; return { ip: j.ip || "", loc: joinNonEmpty([flagOfGlobal(j.country_code), j.country, j.region, j.city], " ").replace(/\s*中国\s*/, ""), isp: j.isp || j.organization || "", org: j.organization || j.asn_organization || "", as, country: j.country || "", countryCode: String(j.country_code || "").toUpperCase() }; } }
});

const IPV6_IP_ENDPOINTS = Object.freeze({ ddnspod: "https://ipv6.ddnspod.com", neu6: "https://speed.neu6.edu.cn/getIP.php", ipsb: "https://api-ipv6.ip.sb/ip", ident: "https://v6.ident.me", ipify: "https://api6.ipify.org" });
const ORDER = Object.freeze({ directV4: ["cip", "163", "126", "bilibili", "pingan", "ipip"], landingV4: ["ipapi", "ipwhois", "ipsb"], directV6: ["ddnspod", "neu6"], landingV6: ["ipsb", "ident", "ipify"] });

function buildState(ctx) {
  const compatArgs = parseArgs(ctx.env?._compat?.$argument || ctx.env?._compat?.argument || ctx.env?._compat_$argument || ctx.env?._compatArgument || "");
  const readBoxSettings = () => {
    const raw = ctx.storage?.get?.("Panel");
    if (raw == null || raw === "") return {};
    const panel = typeof raw === "string" ? safeJSON(raw, {}) : raw;
    if (panel?.NetworkInfo?.Settings && typeof panel.NetworkInfo.Settings === "object") return panel.NetworkInfo.Settings;
    if (panel?.Settings && typeof panel.Settings === "object") return panel.Settings;
    return {};
  };
  const BOX = readBoxSettings();
  const readBoxKey = (key) => {
    if (!BOX || typeof BOX !== "object") return undefined;
    if (!Object.prototype.hasOwnProperty.call(BOX, key)) return undefined;
    const v = BOX[key]; return v === "" || v == null ? undefined : v;
  };
  const readArgRaw = (name) => Object.prototype.hasOwnProperty.call(compatArgs, name) ? compatArgs[name] : undefined;
  const ENV = (key, defVal, opt = {}) => {
    const typeHint = typeof defVal;
    const argKeys = [key].concat(opt.argAlias || []);
    const boxKeys = [key].concat(opt.boxAlias || []);
    let envRaw; let hasEnv = false;
    for (const k of argKeys) {
      if (ctx.env && Object.prototype.hasOwnProperty.call(ctx.env, k)) {
        const v = ctx.env[k]; if (v !== undefined && v !== null && v !== "") { envRaw = v; hasEnv = true; break; }
      }
    }
    let argRaw; let hasArg = false;
    for (const k of argKeys) {
      const v = readArgRaw(k); if (v !== undefined && v !== null && v !== "") { argRaw = v; hasArg = true; break; }
    }
    let boxRaw; let hasBox = false;
    for (const bk of boxKeys) {
      const v = readBoxKey(bk); if (v !== undefined && v !== null && v !== "") { boxRaw = v; hasBox = true; break; }
    }
    const convert = (val) => typeHint === "number" ? toNum(val, defVal) : typeHint === "boolean" ? toBool(val, defVal) : val;
    const canon = (val) => typeHint === "number" ? String(toNum(val, defVal)) : typeHint === "boolean" ? (toBool(val, defVal) ? "true" : "false") : String(val);
    const changed = (raw) => canon(raw) !== canon(defVal);
    if (hasEnv && changed(envRaw)) return convert(envRaw);
    if (hasArg && changed(argRaw)) return convert(argRaw);
    if (hasBox) return convert(boxRaw);
    if (hasEnv) return convert(envRaw);
    if (hasArg) return convert(argRaw);
    return defVal;
  };

  const CFG = {
    Update: toNum(ENV("Update", 10), 10),
    Timeout: toNum(ENV("Timeout", 12), 12),
    BUDGET_SEC_RAW: ENV("BUDGET", 0),
    MASK_IP: toBool(ENV("MASK_IP", true), true),
    MASK_POS_MODE: ENV("MASK_POS", "auto"),
    IPv6: toBool(ENV("IPv6", true), true),
    DOMESTIC_IPv4: (() => { const v = ENV("DOMESTIC_IPv4", "ipip"); return v !== "" && v != null ? v : ctx.env?.DOMIC_IPv4 || compatArgs.DOMIC_IPv4 || "ipip"; })(),
    DOMESTIC_IPv6: (() => { const v = ENV("DOMESTIC_IPv6", "ddnspod"); return v !== "" && v != null ? v : ctx.env?.DOMIC_IPv6 || compatArgs.DOMIC_IPv6 || "ddnspod"; })(),
    LANDING_IPv4: ENV("LANDING_IPv4", "ipapi"),
    LANDING_IPv6: ENV("LANDING_IPv6", "ipsb"),
    TW_FLAG_MODE: toNum(ENV("TW_FLAG_MODE", 1), 1),
    IconPreset: ENV("IconPreset", "globe"),
    Icon: ENV("Icon", ""),
    IconColor: ENV("IconColor", "#1E90FF"),
    SUBTITLE_STYLE: normalizeSubStyle(ENV("SUBTITLE_STYLE", "line")),
    SUBTITLE_MINIMAL: toBool(ENV("SUBTITLE_MINIMAL", false), false),
    GAP_LINES: clamp(toNum(ENV("GAP_LINES", 1), 1), 0, 2),
    SD_STYLE: ENV("SD_STYLE", "icon"),
    SD_REGION_MODE: ENV("SD_REGION_MODE", "full"),
    SD_ICON_THEME: ENV("SD_ICON_THEME", "check"),
    SD_ARROW: toBool(ENV("SD_ARROW", true), true),
    SD_SHOW_LAT: toBool(ENV("SD_SHOW_LAT", true), true),
    SD_SHOW_HTTP: toBool(ENV("SD_SHOW_HTTP", true), true),
    SD_LANG: String(ENV("SD_LANG", "zh-Hans")).toLowerCase() === "zh-hant" ? "zh-Hant" : "zh-Hans",
    SD_TIMEOUT_SEC_RAW: ENV("SD_TIMEOUT", 0),
    SD_CONCURRENCY: toNum(ENV("SD_CONCURRENCY", 6), 6),
    SERVICES_BOX_CHECKED_RAW: (() => { const v = readBoxKey("SERVICES"); if (v == null) return null; if (Array.isArray(v)) return v.length ? JSON.stringify(v) : null; const s = String(v).trim(); return !s || s === "[]" ? null : s; })(),
    SERVICES_BOX_TEXT: (() => { const v = readBoxKey("SERVICES_TEXT"); return v != null ? String(v).trim() : ""; })(),
    SERVICES_ARG_TEXT: (() => { let v = ctx.env?.SERVICES; if (Array.isArray(v)) return JSON.stringify(v); if (v == null || v === "") v = readArgRaw("SERVICES"); return v != null ? String(v).trim() : ""; })(),
    LOG: toBool(ENV("LOG", true), true),
    LOG_LEVEL: (ENV("LOG_LEVEL", "info") + "").toLowerCase(),
    LOG_TO_PANEL: toBool(ENV("LOG_TO_PANEL", false), false),
    LOG_PUSH: toBool(ENV("LOG_PUSH", true), true),
    PROXY_POLICY: ENV("PROXY_POLICY", ""),
    ENTRANCE4: ENV("ENTRANCE4", ""),
    ENTRANCE6: ENV("ENTRANCE6", "")
  };

  const WANT_V6 = !!CFG.IPv6;
  const HAS_V6 = !!ctx.device?.ipv6?.address;
  const IPV6_EFF = WANT_V6 && HAS_V6;
  const _maskPosMode = String(CFG.MASK_POS_MODE ?? "auto").trim().toLowerCase();
  CFG.MASK_POS = (_maskPosMode === "" || _maskPosMode === "auto" || _maskPosMode === "follow" || _maskPosMode === "same") ? !!CFG.MASK_IP : toBool(_maskPosMode, true);
  const SD_TIMEOUT_MS = (() => { const baseSec = Number(CFG.Timeout) || 8; const secRaw = Number(CFG.SD_TIMEOUT_SEC_RAW); const sec = (Number.isFinite(secRaw) && secRaw > 0) ? secRaw : baseSec; return Math.max(CONSTS.SD_MIN_TIMEOUT, sec * 1000); })();
  const BUDGET_MS = (() => { const raw = Number(CFG.BUDGET_SEC_RAW); const base = Math.max(1, Number(CFG.Timeout) || 8) * 1000; if (Number.isFinite(raw) && raw > 0) return Math.max(3500, raw * 1000); return Math.min(CONSTS.BUDGET_HARD_MS, Math.max(5500, base)); })();
  const V6_TO = Math.min(Math.max(CONSTS.SD_MIN_TIMEOUT, SD_TIMEOUT_MS), 2500);
  const LOG_LEVELS = { debug: 10, info: 20, warn: 30, error: 40 };
  const SD_STYLE = String(CFG.SD_STYLE).toLowerCase() === "text" ? "text" : "icon";
  const SD_REGION_MODE = ["full","abbr","flag"].includes(String(CFG.SD_REGION_MODE)) ? CFG.SD_REGION_MODE : "full";
  const SD_ICON_THEME = ["lock","circle","check"].includes(String(CFG.SD_ICON_THEME)) ? CFG.SD_ICON_THEME : "check";
  const SD_ICONS = SD_ICON_THEME === "lock" ? { full: "🔓", partial: "🔐", blocked: "🔒" } : SD_ICON_THEME === "circle" ? { full: "⭕️", partial: "⛔️", blocked: "🚫" } : { full: "✅", partial: "❇️", blocked: "❎" };

  return {
    ctx, BOX, readBoxKey, CFG, WANT_V6, HAS_V6, IPV6_EFF, SD_TIMEOUT_MS, BUDGET_MS, DEADLINE: Date.now() + BUDGET_MS, V6_TO,
    LOG_LEVELS, DEBUG_LINES: [], ENT_CACHE: { ip: "", t: 0, data: null }, SD_STYLE, SD_REGION_MODE, SD_ICON_THEME, SD_ICONS,
    TW_FLAG_MODE: Number(CFG.TW_FLAG_MODE) || 0, ICON_NAME: (CFG.Icon || "").trim() || ICON_PRESET_MAP[String(CFG.IconPreset).trim()] || "globe.asia.australia", ICON_COLOR: CFG.IconColor
  };
}

let S = null;
function t(key, ...args) { const pack = SD_STR[S?.CFG?.SD_LANG || "zh-Hans"] || SD_STR["zh-Hans"]; const v = pack[key]; return typeof v === "function" ? v(...args) : (v != null ? v : key); }
function flagOfGlobal(code) { return flagOf(code); }

function budgetLeft() { return Math.max(0, S.DEADLINE - Date.now()); }
function capByBudget(capMs, floorMs = 220) { const left = budgetLeft(); if (left <= CONSTS.BUDGET_SOFT_GUARD_MS) return Math.max(120, floorMs); const room = Math.max(120, left - CONSTS.BUDGET_SOFT_GUARD_MS); return Math.max(120, Math.min(Number(capMs) || room, room)); }
async function withTimeout(promise, ms, onTimeoutValue) { const lim = Math.max(120, Number(ms) || 0); let tmr; try { return await Promise.race([Promise.resolve(promise), new Promise((resolve) => { tmr = setTimeout(() => resolve(onTimeoutValue), lim); })]); } finally { if (tmr) clearTimeout(tmr); } }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function log(level, ...args) {
  if (!S.CFG.LOG) return;
  const L = S.LOG_LEVELS[level] ?? 20;
  if (L < (S.LOG_LEVELS[S.CFG.LOG_LEVEL] ?? 20)) return;
  const line = `[NI][${level.toUpperCase()}] ` + args.map((x) => typeof x === "string" ? x : JSON.stringify(x)).join(" ");
  try { console.log(line); } catch {}
  S.DEBUG_LINES.push(line);
  if (S.DEBUG_LINES.length > CONSTS.LOG_RING_MAX) S.DEBUG_LINES.shift();
}

function normStr(x) { return String(x == null ? "" : x).replace(/\s+/g, " ").replace(/[（(].*?[）)]/g, " ").trim().toLowerCase(); }
function parseASNNumber(s) { const str = String(s || ""); const m = str.match(/\bAS(\d{1,10})\b/i); if (m) return Number(m[1]) || 0; const m2 = str.match(/\b(\d{1,10})\b/); return m2 ? (Number(m2[1]) || 0) : 0; }
function _hasAny(hay, list) { const H = normStr(hay); if (!H) return false; for (const kw of (list || [])) { const K = normStr(kw); if (K && H.includes(K)) return true; } return false; }
function _rdnsLooksDatacenter(ptrHost) { const host = normStr(ptrHost).replace(/\.$/, ""); if (!host) return false; return RISK_RULES.rdnsDatacenterSuffix.some((suf) => host.endsWith(normStr(suf))); }
function calculateRiskValueSafe(isp, org, country, asField, rdnsHost) {
  const ISP = normStr(isp), ORG = normStr(org), CTRY = normStr(country), AS = normStr(asField); const hay = joinNonEmpty([ISP, ORG, AS], " | "); const asn = parseASNNumber(asField); const reasons = []; let riskValue = 0;
  const rdnsHitDC = _rdnsLooksDatacenter(rdnsHost), rdnsHitHB = _hasAny(rdnsHost, RISK_RULES.rdnsHomeKeywords), rdnsHitMobile = _hasAny(rdnsHost, RISK_RULES.rdnsMobileKeywords);
  if (rdnsHitDC) { riskValue += 75; reasons.push("PTR 命中机房域名后缀"); }
  if (rdnsHitHB) { const delta = rdnsHitDC ? -6 : -26; riskValue += delta; reasons.push(`PTR 命中住宅/接入网关键词(${delta})`); }
  if (rdnsHitMobile) { const delta = rdnsHitDC ? 0 : -8; riskValue += delta; reasons.push(`PTR 命中移动网络关键词(${delta})`); }
  const dcHit = _hasAny(hay, RISK_RULES.dataCenterKeywords), hbHit = _hasAny(hay, RISK_RULES.homeBroadbandKeywords), mobileHit = _hasAny(hay, RISK_RULES.mobileKeywords);
  if (dcHit) { riskValue += 55; reasons.push("ORG/ISP/AS 命中机房/云/托管关键词(+55)"); }
  if (hbHit) { const delta = (rdnsHitDC || dcHit) ? -10 : -22; riskValue += delta; reasons.push(`ORG/ISP/AS 命中家宽/接入关键词(${delta})`); }
  if (mobileHit) { const delta = (rdnsHitDC || dcHit) ? 0 : -10; riskValue += delta; reasons.push(`ORG/ISP/AS 命中移动网络关键词(${delta})`); }
  if (RISK_RULES.highRiskCountries.some((x) => CTRY.includes(normStr(x)))) { riskValue += 18; reasons.push("国家风险加成(+18)"); }
  if (!ORG && !AS && ISP.length <= 3) { riskValue += 10; reasons.push("信息不足惩罚(+10)"); }
  riskValue = clamp(Math.round(riskValue), 0, 100);
  const hbEvidence = [hbHit, rdnsHitHB].filter(Boolean).length + (ASN_HOME_STRONG.has(asn) ? 1 : 0);
  const dcEvidence = [dcHit, rdnsHitDC].filter(Boolean).length;
  const isHant = S.CFG.SD_LANG === "zh-Hant"; const zh = (h, t2) => isHant ? t2 : h;
  const tunnelLike = (dcEvidence >= 2) || (riskValue >= 70) || rdnsHitDC;
  const homeLikeStrong = (hbEvidence >= 2) && !tunnelLike && (riskValue <= 50);
  const homeLikeSoft = (hbEvidence >= 1) && (dcEvidence === 0) && !tunnelLike && (riskValue <= 38);
  const isHomeBroadband = homeLikeStrong || homeLikeSoft;
  return {
    riskValue,
    lineType: isHomeBroadband ? zh("家宽", "家寬") : zh("非家宽", "非家寬"),
    subtype: rdnsHitMobile || mobileHit ? zh("移动网络", "行動網路") : (tunnelLike || dcEvidence >= 1) ? zh("机房/专线特征", "機房/專線特徵") : isHomeBroadband ? zh("住宅/接入特征", "住宅/接入特徵") : (hbEvidence >= 1 ? zh("运营商/接入", "運營商/接入") : zh("普通 ISP", "一般 ISP")),
    isHomeBroadband,
    nativeHint: (!tunnelLike && riskValue < 55) ? zh("更像原生", "更像原生") : zh("可能非原生", "可能非原生"),
    tunnelHint: tunnelLike ? zh("机房/代理特征偏强", "機房/代理特徵偏強") : zh("机房/代理特征偏弱", "機房/代理特徵偏弱"),
    reasons,
    _raw: { asn, rdnsHost: rdnsHost || "", dcHit, hbHit, mobileHit, rdnsHitDC, rdnsHitHB, rdnsHitMobile, hbEvidence, dcEvidence }
  };
}

function pad2(n) { return String(n).padStart(2, "0"); }
function now() { const d = new Date(); return `${pad2(d.getMonth()+1)}-${pad2(d.getDate())} ${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}`; }
function maskIP(ip) { if (!ip || !S.CFG.MASK_IP) return ip || ""; if (isIPv4(ip)) { const p = ip.split("."); return [p[0], p[1], "*", "*"].join("."); } if (isIPv6(ip)) { const p = ip.split(":"); return [...p.slice(0,4),"*","*","*","*"].join(":"); } return ip; }
function ipLine(label, ip) { if (!ip) return null; const s = String(ip).trim(); if (!s) return null; if (/ipv4/i.test(label) && !isIPv4(s)) return null; if (/ipv6/i.test(label) && !isIPv6(s)) return null; return `${label}: ${maskIP(s)}`; }
function hasCityLevel(loc) { if (!loc) return false; try { const s = String(loc).replace(/^[\u{1F1E6}-\u{1F1FF}]{2}\s*/u, "").trim(); if (/市|区|縣|县|州|市辖/.test(s)) return true; return s.split(/\s+/).filter(Boolean).length >= 3; } catch { return false; } }

function splitFlagRaw(s) { const re = /^[\u{1F1E6}-\u{1F1FF}]{2}\s*/u; const m = String(s || "").match(re); let flag = m ? m[0] : ""; const text = String(s || "").replace(re, ""); if (flag.includes("🇹🇼")) { if (S.TW_FLAG_MODE === 0) flag = "🇨🇳"; else if (S.TW_FLAG_MODE === 2) flag = "🇼🇸"; } return { flag, text }; }
const onlyFlag = (loc) => splitFlagRaw(loc).flag || "-";
const flagFirst = (loc) => { const { flag, text } = splitFlagRaw(loc); return (flag || "") + (text || ""); };
function flagOf(code) { let cc = String(code || "").trim(); if (!cc) return ""; if (/^中国$|^CN$/i.test(cc)) cc = "CN"; if (cc.length !== 2 || !/^[A-Za-z]{2}$/.test(cc)) return ""; try { if (cc.toUpperCase() === "TW") { if (S.TW_FLAG_MODE === 0) return "🇨🇳"; if (S.TW_FLAG_MODE === 2) return "🇼🇸"; } return String.fromCodePoint(...[...cc.toUpperCase()].map((ch) => 127397 + ch.charCodeAt(0))); } catch { return ""; } }
function fmtISP(isp, locStr) { const raw = String(isp || "").trim(); if (!raw) return ""; const txt = String(locStr || ""); const isMainland = /^🇨🇳/.test(txt) || /(^|\s)中国(?!香港|澳门|台湾)/.test(txt); if (!isMainland) return raw; const norm = raw.replace(/\s*\(中国\)\s*/, "").replace(/\s+/g, " ").trim(); const s = norm.toLowerCase(); if (/(^|[\s-])(cmcc|cmnet|cmi)\b/.test(s) || /china\s*mobile/.test(s) || /移动/.test(norm)) return "中国移动"; if (/(^|[\s-])(chinanet|china\s*telecom|ctcc|ct)\b/.test(s) || /电信/.test(norm)) return "中国电信"; if (/(^|[\s-])(china\s*unicom|cncgroup|netcom)\b/.test(s) || /联通/.test(norm)) return "中国联通"; if (/(^|[\s-])(cbn|china\s*broadcast)/.test(s) || /广电/.test(norm)) return "中国广电"; if (/cernet|china\s*education/.test(s) || /教育网/.test(norm)) return "中国教育网"; if (/^中国(移动|联通|电信|广电)$/.test(norm)) return norm; return raw; }

async function httpGet(url, headers = {}, timeoutMs = null, followRedirect = false, ext = {}) {
  const start = Date.now();
  const resp = await S.ctx.http.get(url, { headers, timeout: timeoutMs == null ? capByBudget(3500) : Math.min(Number(timeoutMs) || 3500, capByBudget(3500)), redirect: followRedirect ? "follow" : "manual", policy: ext.policy, policyDescriptor: ext.policyDescriptor, insecureTls: !!ext.insecureTls, credentials: ext.credentials || "include" });
  return { status: resp.status || 0, headers: resp.headers || {}, body: await resp.text(), cost: Date.now() - start };
}
async function httpPost(url, headers = {}, body = "", timeoutMs = null, ext = {}) {
  const start = Date.now();
  const resp = await S.ctx.http.post(url, { headers, body, timeout: timeoutMs == null ? capByBudget(3500) : Math.min(Number(timeoutMs) || 3500, capByBudget(3500)), redirect: "follow", policy: ext.policy, policyDescriptor: ext.policyDescriptor, insecureTls: !!ext.insecureTls, credentials: ext.credentials || "include" });
  return { status: resp.status || 0, headers: resp.headers || {}, body: await resp.text(), cost: Date.now() - start };
}

function radioToGen(r) { if (!r) return ""; const x = String(r).toUpperCase().replace(/\s+/g, ""); const alias = { NR5G: "NR", NRSA: "NR", NRNSA: "NRNSA", LTEA: "LTE", "LTE+": "LTE", LTEPLUS: "LTE" }; const k = alias[x] || x; const MAP = { GPRS: "2.5G", EDGE: "2.75G", CDMA1X: "2.5G", WCDMA: "3G", HSDPA: "3.5G", HSUPA: "3.75G", EHRPD: "3.9G", LTE: "4G", NRNSA: "5G", NR: "5G" }; return MAP[k] || ""; }
function netTypeLine() { try { const n = S.ctx.device || {}; const ssid = n.wifi?.ssid, bssid = n.wifi?.bssid; if (ssid || bssid) return `${t("wifi")} | ${ssid || "-"}`; const radio = n.cellular?.radio; if (radio) return `${t("cellular")} | ${t("gen", radioToGen(radio), radio)}`; const iface = n.ipv4?.interface || n.ipv6?.interface || ""; if (/^pdp/i.test(iface)) return `${t("cellular")} | -`; if (/^(en|eth|wlan)/i.test(iface)) return `${t("wifi")} | -`; } catch {} return t("unknownNet"); }

function ipToPtrName(ip) {
  const s = String(ip || "").trim();
  if (isIPv4(s)) return s.split(".").reverse().join(".") + ".in-addr.arpa";
  if (isIPv6(s)) {
    const raw = s.toLowerCase().split("%")[0]; const halves = raw.split("::"); const left = (halves[0] || "").split(":").filter(Boolean); const right = (halves[1] || "").split(":").filter(Boolean); const missing = (halves.length === 2) ? Math.max(0, 8 - (left.length + right.length)) : 0;
    const groups = []; for (const g of left) groups.push(g.padStart(4, "0")); for (let i = 0; i < missing; i++) groups.push("0000"); for (const g of right) groups.push(g.padStart(4, "0")); while (groups.length < 8) groups.push("0000");
    return groups.slice(0, 8).join("").split("").reverse().join(".") + ".ip6.arpa";
  }
  return "";
}
async function queryPTR(ip) { const name = ipToPtrName(ip); if (!name) return ""; const r = await httpGet("https://dns.google/resolve?name=" + encodeURIComponent(name) + "&type=PTR", { "Accept": "application/dns-json" }, Math.min(900, capByBudget(900)), true).catch(() => null); if (!r || r.status !== 200) return ""; try { const j = safeJSON(r.body, {}); const ans = Array.isArray(j.Answer) ? j.Answer : []; const first = ans.find((x) => x && (x.type === 12 || String(x.type) === "12") && x.data); return first ? String(first.data).trim().replace(/\.$/, "") : ""; } catch { return ""; } }
async function queryPTRMaybe(ip) { if (!ip || budgetLeft() <= 800) return ""; return await withTimeout(queryPTR(ip), Math.min(950, capByBudget(950)), ""); }

function makeTryOrder(prefer, fallbackList) { return [prefer, ...fallbackList].filter((x, i, a) => x && a.indexOf(x) === i); }
async function trySources(order, sourceMap, { preferLogTag, needCityPrefer = false, acceptIp = null, ext = {} }) {
  let firstOK = null;
  for (const key of order) {
    if (budgetLeft() <= 300) break;
    const def = sourceMap[key]; if (!def) continue;
    try {
      const r = await httpGet(def.url, {}, null, false, ext);
      const res = def.parse(r.body) || {}; const ip = String(res.ip || "").trim(); const ok = acceptIp ? acceptIp(ip) : !!ip; const cityOK = ok && hasCityLevel(res.loc);
      if (ok) { res.ip = ip; if (!firstOK) firstOK = res; if (!needCityPrefer || cityOK) return res; }
    } catch (e) { log("warn", `${preferLogTag} fail`, key, String(e)); }
  }
  return firstOK || {};
}
async function tryIPv6Ip(order, opt = {}, ext = {}) { const timeoutMs = (opt.timeoutMs != null) ? opt.timeoutMs : S.V6_TO; const maxTries = Math.max(1, Math.min(Number(opt.maxTries || order.length), order.length)); for (const key of order.slice(0, maxTries)) { if (budgetLeft() <= 260) break; const url = IPV6_IP_ENDPOINTS[key]; if (!url) continue; try { const r = await httpGet(url, {}, timeoutMs, false, ext); const ip = String(r.body || "").trim(); if (isIPv6(ip)) return { ip }; } catch {} } return {}; }
async function fillDirectIspSameIp(targetIp, skipKey, ext = {}) { const ip = String(targetIp || "").trim(); if (!ip) return ""; const order = (ORDER.directV4 || []).filter((k) => k && k !== skipKey); for (const key of order) { if (budgetLeft() <= 320) break; const def = DIRECT_V4_SOURCES[key]; if (!def) continue; try { const r = await httpGet(def.url, {}, null, false, ext); const x = def.parse(r.body) || {}; if (String(x.ip || "").trim() === ip && String(x.isp || "").trim()) return String(x.isp || "").trim(); } catch {} } return ""; }
async function getDirectV4(preferKey) { const ext = { policy: "DIRECT" }; const res = await trySources(makeTryOrder(preferKey, ORDER.directV4), DIRECT_V4_SOURCES, { preferLogTag: "DirectV4", needCityPrefer: true, acceptIp: isIPv4, ext }); if (!res || !res.ip) return {}; if (!String(res.isp || "").trim()) { const filled = await fillDirectIspSameIp(res.ip, preferKey, ext).catch(() => ""); if (filled) res.isp = filled; } return res; }
async function getDirectV6(preferKey) { return await tryIPv6Ip(makeTryOrder(preferKey, ORDER.directV6), { timeoutMs: S.V6_TO }, { policy: "DIRECT" }); }
async function getLandingV4(preferKey) { return await trySources(makeTryOrder(preferKey, ORDER.landingV4), LANDING_V4_SOURCES, { preferLogTag: "LandingV4", needCityPrefer: false, acceptIp: isIPv4, ext: { policy: S.CFG.PROXY_POLICY || undefined } }); }
async function probeLandingV6(preferKey) { const r = await tryIPv6Ip(makeTryOrder(preferKey, ORDER.landingV6), { timeoutMs: Math.min(CONSTS.V6_PROBE_TO_MS, 900), maxTries: 2 }, { policy: S.CFG.PROXY_POLICY || undefined }); return { ok: !!r.ip, ip: r.ip || "" }; }

const ENT_LOC_CHAIN = Object.freeze({
  pingan: async (ip, ext = {}) => { const r = await httpGet("https://rmb.pingan.com.cn/itam/mas/linden/ip/request?ip=" + encodeURIComponent(ip), {}, Math.min(2200, Math.max(1200, S.SD_TIMEOUT_MS || 0)), false, ext); const d = safeJSON(r.body, {})?.data || {}; if (!d || (!d.countryIsoCode && !d.country)) throw new Error("pingan-empty"); return { loc: joinNonEmpty([flagOf(d.countryIsoCode), d.country, d.region, d.city], " ").replace(/\s*中国\s*/, ""), isp: String(d.isp || d.ispName || d.operator || d.org || d.as || "").trim() }; },
  ipapi: async (ip, ext = {}) => { const r = await httpGet(`http://ip-api.com/json/${encodeURIComponent(ip)}?lang=zh-CN`, {}, Math.min(2200, Math.max(1200, S.SD_TIMEOUT_MS || 0)), false, ext); const j = safeJSON(r.body, {}); return { loc: joinNonEmpty([flagOf(j.countryCode), j.country?.replace(/\s*中国\s*/, ""), j.regionName?.split(/\s+or\s+/)[0], j.city], " "), isp: String(j.isp || j.org || j.as || "").trim() }; },
  ipwhois: async (ip, ext = {}) => { const r = await httpGet(`https://ipwhois.app/json/${encodeURIComponent(ip)}?lang=zh-CN`, {}, Math.min(2200, Math.max(1200, S.SD_TIMEOUT_MS || 0)), false, ext); const j = safeJSON(r.body, {}); return { loc: joinNonEmpty([flagOf(j.country_code), j.country?.replace(/\s*中国\s*/, ""), j.region, j.city], " "), isp: String((j.connection && j.connection.isp) || j.org || "").trim() }; },
  ipsb: async (ip, ext = {}) => { const r = await httpGet(`https://api.ip.sb/geoip/${encodeURIComponent(ip)}`, {}, Math.min(2200, Math.max(1200, S.SD_TIMEOUT_MS || 0)), false, ext); const j = safeJSON(r.body, {}); return { loc: joinNonEmpty([flagOf(j.country_code), j.country, j.region, j.city], " ").replace(/\s*中国\s*/, ""), isp: String(j.isp || j.organization || "").trim() }; }
});
function _sameLoc(a, b) { const A = String(a || "").trim(), B = String(b || "").trim(); if (!A || !B) return false; const strip = (s) => String(s).replace(/^[\u{1F1E6}-\u{1F1FF}]{2}\s*/u, "").trim(); return strip(A) === strip(B); }
async function getEntranceBundle(ip) { const nowT = Date.now(); const fresh = (nowT - S.ENT_CACHE.t) < Math.max(CONSTS.ENT_MIN_TTL, Math.min(Number(S.CFG.Update) || 10, CONSTS.ENT_MAX_TTL)) * 1000; if (S.ENT_CACHE.ip === ip && fresh && S.ENT_CACHE.data) return S.ENT_CACHE.data; const ext = { policy: "DIRECT" }; const [p, a, w, s] = await Promise.allSettled([ENT_LOC_CHAIN.pingan(ip, ext), ENT_LOC_CHAIN.ipapi(ip, ext), ENT_LOC_CHAIN.ipwhois(ip, ext), ENT_LOC_CHAIN.ipsb(ip, ext)]); const pick = (arr) => { for (const x of arr) if (x.status === "fulfilled") return x.value || {}; return {}; }; const p1 = p.status === "fulfilled" ? (p.value || {}) : {}; const c2 = pick([a, w, s]); let loc1 = String(p1.loc || "").trim(), isp1 = String(p1.isp || "").trim(), loc2 = String(c2.loc || "").trim(), isp2 = String(c2.isp || "").trim(); if (!loc1 && loc2) { loc1 = loc2; isp1 = isp2; loc2 = ""; isp2 = ""; } if (loc1 && !isp1 && isp2) isp1 = isp2; if (_sameLoc(loc1, loc2)) loc2 = ""; const res = { ip, loc1, isp1, loc2, isp2 }; S.ENT_CACHE = { ip, t: nowT, data: res }; return res; }

function parseServices(raw) { if (raw == null) return []; let s = String(raw).trim(); if (!s || s === "[]" || s === "{}" || /^null$/i.test(s) || /^undefined$/i.test(s)) return []; try { const arr = JSON.parse(s); if (Array.isArray(arr)) return normSvcList(arr); } catch {} return normSvcList(s.split(/[,\uFF0C;|\/ \t\r\n]+/)); }
function normSvcList(list) { const out = []; for (let x of list) { let k = String(x ?? "").trim().toLowerCase(); if (!k) continue; k = SD_ALIAS[k] || k; if (!["youtube","netflix","disney","chatgpt_web","chatgpt_app","hulu_us","hulu_jp","hbo"].includes(k)) continue; if (!out.includes(k)) out.push(k); } return out; }
function selectServices() { const argList = parseServices(S.CFG.SERVICES_ARG_TEXT); if (argList.length) return argList; const boxCheckedList = parseServices(S.CFG.SERVICES_BOX_CHECKED_RAW); if (boxCheckedList.length) return boxCheckedList; const boxTextList = parseServices(S.CFG.SERVICES_BOX_TEXT); if (boxTextList.length) return boxTextList; return ["youtube", "netflix", "disney", "chatgpt_web", "chatgpt_app", "hulu_us", "hulu_jp", "hbo"]; }
function SD_I18N() { return { youTube: "YouTube", chatgpt_app: "ChatGPT", chatgpt: "ChatGPT Web", netflix: "Netflix", disney: "Disney+", huluUS: "Hulu(美)", huluJP: "Hulu(日)", hbo: "Max(HBO)" }; }
function sd_nameOfKey(key) { const i = SD_I18N(); return key === "youtube" ? i.youTube : key === "netflix" ? i.netflix : key === "disney" ? i.disney : key === "hulu_us" ? i.huluUS : key === "hulu_jp" ? i.huluJP : key === "hbo" ? i.hbo : key === "chatgpt_web" ? i.chatgpt : key === "chatgpt_app" ? i.chatgpt_app : key; }
const SD_UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";
const SD_BASE_HEADERS = { "User-Agent": SD_UA, "Accept-Language": "en" };
async function sd_httpGet(url, headers = {}, followRedirect = true) { const start = Date.now(); return await httpGet(url, { ...SD_BASE_HEADERS, ...headers }, S.SD_TIMEOUT_MS, followRedirect, { policy: S.CFG.PROXY_POLICY || undefined }).then((r) => ({ ok: true, status: r.status, headers: r.headers || {}, data: r.body || "", cost: Date.now() - start })).catch((e) => ({ ok: false, status: 0, headers: {}, data: "", cost: Date.now() - start, err: String(e || "") })); }
async function sd_httpPost(url, headers = {}, body = "") { const start = Date.now(); return await httpPost(url, { ...SD_BASE_HEADERS, ...headers }, body, S.SD_TIMEOUT_MS, { policy: S.CFG.PROXY_POLICY || undefined }).then((r) => ({ ok: true, status: r.status, headers: r.headers || {}, data: r.body || "", cost: Date.now() - start })).catch((e) => ({ ok: false, status: 0, headers: {}, data: "", cost: Date.now() - start, err: String(e || "") })); }

const SD_CC_NAME = { "zh-Hans": { CN: "中国", TW: "台湾", HK: "中国香港", MO: "中国澳门", JP: "日本", KR: "韩国", US: "美国", SG: "新加坡", MY: "马来西亚", TH: "泰国", VN: "越南", PH: "菲律宾", ID: "印度尼西亚", IN: "印度", AU: "澳大利亚", NZ: "新西兰", CA: "加拿大", GB: "英国", DE: "德国", FR: "法国", NL: "荷兰", ES: "西班牙", IT: "意大利", BR: "巴西", AR: "阿根廷", MX: "墨西哥", RU: "俄罗斯" }, "zh-Hant": { CN: "中國", TW: "台灣", HK: "中國香港", MO: "中國澳門", JP: "日本", KR: "南韓", US: "美國", SG: "新加坡", MY: "馬來西亞", TH: "泰國", VN: "越南", PH: "菲律賓", ID: "印尼", IN: "印度", AU: "澳洲", NZ: "紐西蘭", CA: "加拿大", GB: "英國", DE: "德國", FR: "法國", NL: "荷蘭", ES: "西班牙", IT: "義大利", BR: "巴西", AR: "阿根廷", MX: "墨西哥", RU: "俄羅斯" } };
function sd_flagFromCC(cc) { cc = (cc || "").toUpperCase(); if (!/^[A-Z]{2}$/.test(cc)) return ""; if (cc === "TW") { if (S.TW_FLAG_MODE === 0) return "🇨🇳"; if (S.TW_FLAG_MODE === 2) return "🇼🇸"; } try { return String.fromCodePoint(...[...cc].map((c) => 0x1F1E6 + (c.charCodeAt(0) - 65))); } catch { return ""; } }
function sd_ccPretty(cc) { cc = (cc || "").toUpperCase(); const flag = sd_flagFromCC(cc); const name = SD_CC_NAME[S.CFG.SD_LANG][cc]; if (!cc) return "—"; if (S.SD_REGION_MODE === "flag") return flag || "—"; if (S.SD_REGION_MODE === "abbr") return (flag || "") + cc; if (flag && name) return `${flag} ${cc} | ${name}`; if (flag) return `${flag} ${cc}`; return cc; }
const isPartial = (tag) => /自制|自製|original/i.test(String(tag || "")) || /部分/i.test(String(tag || ""));
function sd_renderLine({ name, ok, cc, cost, status, tag, state }) { const st = state ? state : (ok ? (isPartial(tag) ? "partial" : "full") : "blocked"); const icon = S.SD_ICONS[st]; const regionText = cc ? sd_ccPretty(cc) : "-"; const blockedText = t("notReachable"); const isNetflix = /netflix/i.test(String(name)); const stateTextLong = (st === "full") ? t("nfFull") : (st === "partial") ? t("nfOriginals") : blockedText; const stateTextShort = (st === "blocked") ? blockedText : t("unlocked"); const showTag = (isNetflix && S.SD_STYLE === "text" && !S.CFG.SD_ARROW) ? "" : (tag || ""); if (S.SD_STYLE === "text" && !S.CFG.SD_ARROW) { const left = `${name}: ${isNetflix ? stateTextLong : stateTextShort}`; const head = `${left}，${t("region")}: ${regionText}`; const tail = [showTag, (S.CFG.SD_SHOW_LAT && cost != null) ? `${cost}ms` : "", (S.CFG.SD_SHOW_HTTP && status > 0) ? `HTTP ${status}` : ""].filter(Boolean).join(" ｜ "); return tail ? `${head} ｜ ${tail}` : head; } if (S.SD_STYLE === "text") { const left = `${name}: ${st === "full" ? t("unlocked") : st === "partial" ? t("partialUnlocked") : t("notReachable")}`; const head = S.CFG.SD_ARROW ? `${left} ➟ ${regionText}` : `${left} ｜ ${regionText}`; const tail = [showTag, (S.CFG.SD_SHOW_LAT && cost != null) ? `${cost}ms` : "", (S.CFG.SD_SHOW_HTTP && status > 0) ? `HTTP ${status}` : ""].filter(Boolean).join(" ｜ "); return tail ? `${head} ｜ ${tail}` : head; } const head = S.CFG.SD_ARROW ? `${icon} ${name} ➟ ${regionText}` : `${icon} ${name} ｜ ${regionText}`; const tail = [showTag, (S.CFG.SD_SHOW_LAT && cost != null) ? `${cost}ms` : "", (S.CFG.SD_SHOW_HTTP && status > 0) ? `HTTP ${status}` : ""].filter(Boolean).join(" ｜ "); return tail ? `${head} ｜ ${tail}` : head; }

const SD_NF_ORIGINAL = "80018499", SD_NF_NONORIG = "81280792";
const sd_nfGet = (id) => sd_httpGet(`https://www.netflix.com/title/${id}`, {}, true);
function sd_parseNFRegion(resp) { try { const xo = resp?.headers?.["x-originating-url"] || resp?.headers?.["X-Originating-URL"] || resp?.headers?.get?.("x-originating-url"); if (xo) { const m = String(xo).match(/\/([A-Z]{2})(?:[-/]|$)/i); if (m) return m[1].toUpperCase(); } const m2 = String(resp?.data || "").match(/"countryCode"\s*:\s*"([A-Z]{2})"/i); if (m2) return m2[1].toUpperCase(); } catch {} return ""; }
async function sd_queryLandingCC() { const r = await sd_httpGet("http://ip-api.com/json", {}, true); if (r.ok && r.status === 200) { try { const j = safeJSON(r.data, {}); return (j.countryCode || "").toUpperCase(); } catch {} } return ""; }
async function sd_queryLandingCCMulti() { let cc = await sd_queryLandingCC(); if (cc) return cc; for (const url of ["https://api.ip.sb/geoip", "https://ipinfo.io/json", "https://ifconfig.co/json"]) { const r = await sd_httpGet(url, { "Accept-Language": "en" }, true); if (r.ok && r.status === 200) { try { const j = safeJSON(r.data, {}); cc = (j.country_code || j.country || j.country_iso || "").toUpperCase(); if (/^[A-Z]{2}$/.test(cc)) return cc; } catch {} } } return ""; }
async function sd_testYouTube() { const r = await sd_httpGet("https://www.youtube.com/premium?hl=en", {}, true); if (!r.ok) return sd_renderLine({ name: sd_nameOfKey("youtube"), ok: false, cc: "", cost: r.cost, status: r.status, tag: t("notReachable") }); let cc = "US"; try { let m = r.data.match(/"countryCode":"([A-Z]{2})"/); if (!m) m = r.data.match(/["']GL["']\s*:\s*["']([A-Z]{2})["']/); if (m) cc = m[1]; } catch {} return sd_renderLine({ name: sd_nameOfKey("youtube"), ok: true, cc, cost: r.cost, status: r.status, tag: "" }); }
async function sd_testChatGPTWeb() { const r = await sd_httpGet("https://chatgpt.com/cdn-cgi/trace", {}, true); if (!r.ok) return sd_renderLine({ name: sd_nameOfKey("chatgpt_web"), ok: false, cc: "", cost: r.cost, status: r.status, tag: t("notReachable") }); let cc = ""; try { const m = r.data.match(/loc=([A-Z]{2})/); if (m) cc = m[1]; } catch {} return sd_renderLine({ name: sd_nameOfKey("chatgpt_web"), ok: true, cc, cost: r.cost, status: r.status, tag: "" }); }
async function sd_testChatGPTAppAPI() { const r = await sd_httpGet("https://api.openai.com/v1/models", {}, true); if (!r.ok) return sd_renderLine({ name: sd_nameOfKey("chatgpt_app"), ok: false, cc: "", cost: r.cost, status: r.status, tag: t("notReachable") }); let cc = ""; try { const h = r.headers || {}; cc = (h["cf-ipcountry"] || h["CF-IPCountry"] || h["Cf-IpCountry"] || h.get?.("cf-ipcountry") || "").toString().toUpperCase(); if (!/^[A-Z]{2}$/.test(cc)) cc = ""; } catch {} if (!cc) cc = await sd_queryLandingCCMulti(); return sd_renderLine({ name: sd_nameOfKey("chatgpt_app"), ok: true, cc, cost: r.cost, status: r.status, tag: "" }); }
async function sd_testNetflix() { const r1 = await sd_nfGet(SD_NF_NONORIG); if (!r1.ok) return sd_renderLine({ name: sd_nameOfKey("netflix"), ok: false, cc: "", cost: r1.cost, status: r1.status, tag: t("fail") }); if (r1.status === 403) return sd_renderLine({ name: sd_nameOfKey("netflix"), ok: false, cc: "", cost: r1.cost, status: r1.status, tag: t("regionBlocked") }); if (r1.status === 404) { const r2 = await sd_nfGet(SD_NF_ORIGINAL); if (!r2.ok) return sd_renderLine({ name: sd_nameOfKey("netflix"), ok: false, cc: "", cost: r2.cost, status: r2.status, tag: t("fail") }); if (r2.status === 404) return sd_renderLine({ name: sd_nameOfKey("netflix"), ok: false, cc: "", cost: r2.cost, status: r2.status, tag: t("regionBlocked") }); return sd_renderLine({ name: sd_nameOfKey("netflix"), ok: true, cc: sd_parseNFRegion(r2) || "", cost: r2.cost, status: r2.status, tag: t("nfOriginals"), state: "partial" }); } if (r1.status === 200) return sd_renderLine({ name: sd_nameOfKey("netflix"), ok: true, cc: sd_parseNFRegion(r1) || "", cost: r1.cost, status: r1.status, tag: t("nfFull"), state: "full" }); return sd_renderLine({ name: sd_nameOfKey("netflix"), ok: false, cc: "", cost: r1.cost, status: r1.status, tag: `HTTP ${r1.status}` }); }
async function sd_testDisney() { const rHome = await sd_httpGet("https://www.disneyplus.com/", { "Accept-Language": "en" }, true); if (!rHome.ok || rHome.status !== 200 || /Sorry,\s*Disney\+\s*is\s*not\s*available/i.test(rHome.data || "")) return sd_renderLine({ name: sd_nameOfKey("disney"), ok: false, cc: "", cost: rHome.cost, status: rHome.status, tag: (!rHome.ok) ? t("timeout") : t("regionBlocked") }); let homeCC = ""; try { const m = rHome.data.match(/"countryCode"\s*:\s*"([A-Z]{2})"/i) || rHome.data.match(/data-country=["']([A-Z]{2})["']/i); if (m) homeCC = m[1].toUpperCase(); } catch {} const headers = { "Accept-Language": "en", "Authorization": "ZGlzbmV5JmJyb3dzZXImMS4wLjA.Cu56AgSfBTDag5NiRA81oLHkDZfu5L3CKadnefEAY84", "Content-Type": "application/json", "User-Agent": SD_UA }; const body = JSON.stringify({ query: "mutation registerDevice($input: RegisterDeviceInput!) { registerDevice(registerDevice: $input) { grant { grantType assertion } } }", variables: { input: { applicationRuntime: "chrome", attributes: { browserName: "chrome", browserVersion: "120.0.0.0", manufacturer: "apple", model: null, operatingSystem: "macintosh", operatingSystemVersion: "10.15.7", osDeviceIds: [] }, deviceFamily: "browser", deviceLanguage: "en", deviceProfile: "macosx" } } }); const rBam = await sd_httpPost("https://disney.api.edge.bamgrid.com/graph/v1/device/graphql", headers, body); if (!rBam.ok || rBam.status !== 200) { const cc = homeCC || (await sd_queryLandingCCMulti()) || ""; return sd_renderLine({ name: sd_nameOfKey("disney"), ok: true, cc, cost: rHome.cost, status: rHome.status, tag: "" }); } const d = safeJSON(rBam.data, {}); if (d?.errors) { const cc = homeCC || (await sd_queryLandingCCMulti()) || ""; return sd_renderLine({ name: sd_nameOfKey("disney"), ok: true, cc, cost: rHome.cost, status: rHome.status, tag: "" }); } const inLoc = d?.extensions?.sdk?.session?.inSupportedLocation; const bamCC = d?.extensions?.sdk?.session?.location?.countryCode; const blocked = (inLoc === false); const cc = blocked ? "" : ((bamCC || homeCC || (await sd_queryLandingCCMulti()) || "").toUpperCase()); return sd_renderLine({ name: sd_nameOfKey("disney"), ok: !blocked, cc, cost: Math.min(rHome.cost || 0, rBam.cost || 0) || (rBam.cost || rHome.cost || 0), status: rBam.status || rHome.status || 0, tag: blocked ? t("regionBlocked") : "" }); }
async function sd_testHuluUS() { const r = await sd_httpGet("https://www.hulu.com/", {}, true); if (!r.ok) return sd_renderLine({ name: sd_nameOfKey("hulu_us"), ok: false, cc: "", cost: r.cost, status: r.status, tag: t("notReachable") }); const blocked = /not\s+available\s+in\s+your\s+region/i.test(r.data || ""); return sd_renderLine({ name: sd_nameOfKey("hulu_us"), ok: !blocked, cc: blocked ? "" : "US", cost: r.cost, status: r.status, tag: blocked ? t("regionBlocked") : "" }); }
async function sd_testHuluJP() { const r = await sd_httpGet("https://www.hulu.jp/", { "Accept-Language": "ja" }, true); if (!r.ok) return sd_renderLine({ name: sd_nameOfKey("hulu_jp"), ok: false, cc: "", cost: r.cost, status: r.status, tag: t("notReachable") }); const blocked = /ご利用いただけません|サービスをご利用いただけません|not available/i.test(r.data || ""); return sd_renderLine({ name: sd_nameOfKey("hulu_jp"), ok: !blocked, cc: blocked ? "" : "JP", cost: r.cost, status: r.status, tag: blocked ? t("regionBlocked") : "" }); }
async function sd_testHBO() { const r = await sd_httpGet("https://www.max.com/", {}, true); if (!r.ok) return sd_renderLine({ name: sd_nameOfKey("hbo"), ok: false, cc: "", cost: r.cost, status: r.status, tag: t("notReachable") }); const blocked = /not\s+available\s+in\s+your\s+region|country\s+not\s+supported/i.test(r.data || ""); let cc = ""; try { const m = String(r.data || "").match(/"countryCode"\s*:\s*"([A-Z]{2})"/i); if (m) cc = m[1].toUpperCase(); } catch {} if (!cc) cc = await sd_queryLandingCCMulti(); return sd_renderLine({ name: sd_nameOfKey("hbo"), ok: !blocked, cc: blocked ? "" : cc, cost: r.cost, status: r.status, tag: blocked ? t("regionBlocked") : "" }); }
function buildServiceTests() { return { youtube: () => sd_testYouTube(), netflix: () => sd_testNetflix(), disney: () => sd_testDisney(), chatgpt_web: () => sd_testChatGPTWeb(), chatgpt_app: () => sd_testChatGPTAppAPI(), hulu_us: () => sd_testHuluUS(), hulu_jp: () => sd_testHuluJP(), hbo: () => sd_testHBO() }; }
async function runServiceChecks() { const order = selectServices(); if (!order.length) return []; const map = buildServiceTests(); const conc = clamp(Number(S.CFG.SD_CONCURRENCY) || 6, 1, 8); const stageCap = Math.max(800, Math.min(5200, capByBudget(5200))); const results = new Array(order.length); let cursor = 0, inflight = 0, finished = 0, doneFlag = false; const finish = () => { doneFlag = true; }; const tryLaunch = () => { while (!doneFlag && inflight < conc && cursor < order.length) { if (budgetLeft() <= 320) break; const idx = cursor++; const key = order[idx]; const fn = map[key]; if (!fn) { results[idx] = sd_renderLine({ name: sd_nameOfKey(key), ok: false, cc: "", cost: 0, status: 0, tag: t("fail") }); finished++; continue; } inflight++; Promise.resolve(fn()).then((line) => { results[idx] = line; }).catch(() => { results[idx] = sd_renderLine({ name: sd_nameOfKey(key), ok: false, cc: "", cost: null, status: 0, tag: t("fail") }); }).finally(() => { inflight--; finished++; if (finished >= order.length) finish(); else tryLaunch(); }); } }; tryLaunch(); await withTimeout(new Promise((r) => { const tick = () => { if (doneFlag || finished >= order.length || budgetLeft() <= 260) return r(true); setTimeout(tick, 30); }; tick(); }), stageCap, false); finish(); for (let i = 0; i < results.length; i++) if (!results[i]) results[i] = sd_renderLine({ name: sd_nameOfKey(order[i]), ok: false, cc: "", cost: null, status: 0, tag: t("timeout") }); return results.filter(Boolean); }

function zhHansToHantOnce(s) { if (!s) return s; const phraseMap = [["网络信息","網路資訊"],["服务检测","服務檢測"],["执行时间","執行時間"],["蜂窝网络","行動服務"],["蜂窝","行動"],["网络","網路"],["运营商","運營商"],["区域受限","區域受限"],["区域","區域"],["不可达","不可達"],["检测失败","檢測失敗"],["超时","逾時"],["已完整解锁","已完整解鎖"],["仅解锁自制剧","僅解鎖自製劇"],["部分解锁","部分解鎖"],["已解锁","已解鎖"],["风险值","風險值"],["网络类型","網路類型"],["家宽","家寬"],["非家宽","非家寬"],["中国香港","中國香港"],["中国澳门","中國澳門"],["中国移动","中國移動"],["中国联通","中國聯通"],["中国电信","中國電信"],["中国广电","中國廣電"],["中国教育网","中國教育網"]]; for (const [hans, hant] of phraseMap) s = s.replace(new RegExp(hans, "g"), hant); const charMap = { "网": "網", "络": "絡", "执": "執", "时": "時", "运": "運", "营": "營", "区": "區", "险": "險", "类": "類", "态": "態", "检": "檢", "测": "測", "达": "達" }; return s.replace(/[\u4E00-\u9FFF]/g, (ch) => charMap[ch] || ch); }
function maybeTifyLine(line) { if (S.CFG.SD_LANG !== "zh-Hant") return line; const prefix = t("policy") + ": "; if (String(line || "").startsWith(prefix)) return line; return zhHansToHantOnce(line); }

function pushGroupTitle(parts, title) { for (let i = 0; i < S.CFG.GAP_LINES; i++) parts.push(""); const render = makeSubTitleRenderer(S.CFG.SUBTITLE_STYLE, S.CFG.SUBTITLE_MINIMAL); parts.push(render(title)); }

function txt(text, font, color, opts = {}) { return { type: "text", text: String(text ?? ""), font, ...(color ? { textColor: color } : {}), ...opts }; }
function icon(name, size = 14, color = null, opts = {}) { return { type: "image", src: `sf-symbol:${name}`, width: size, height: size, ...(color ? { color } : {}), ...opts }; }
function vstack(children, opts = {}) { return { type: "stack", direction: "column", alignItems: opts.alignItems || "start", children, ...opts }; }
function hstack(children, opts = {}) { return { type: "stack", direction: "row", alignItems: opts.alignItems || "center", children, ...opts }; }
function spacer(length) { return length == null ? { type: "spacer" } : { type: "spacer", length }; }

function buildLineWidget(title, parts, family) {
  const shown = parts.filter((x) => x != null).map((x) => String(x));
  if (family === "accessoryInline") {
    return { type: "widget", children: [icon(S.ICON_NAME, 11, S.ICON_COLOR), txt((shown[0] || title).slice(0, 36), { size: 11, weight: "medium" }, null, { maxLines: 1, minScale: 0.6 })], refreshAfter: new Date(Date.now() + Math.max(60, Number(S.CFG.Update) || 10) * 1000).toISOString() };
  }
  if (family === "accessoryCircular") {
    return { type: "widget", gap: 2, children: [spacer(), icon(S.ICON_NAME, 16, S.ICON_COLOR), txt(maskIP(S.ctx.device?.ipv4?.address || "-"), { size: 10, weight: "semibold" }, null, { maxLines: 1, minScale: 0.5, textAlign: "center" }), txt((shown.find((x) => x.includes("风险值")) || shown.find((x) => x.includes("風險值")) || "").replace(/^.*?:\s*/, ""), { size: 9, weight: "medium" }, null, { maxLines: 1, minScale: 0.5, textAlign: "center" }), spacer()], refreshAfter: new Date(Date.now() + Math.max(60, Number(S.CFG.Update) || 10) * 1000).toISOString() };
  }
  if (family === "accessoryRectangular") {
    const lines = shown.slice(0, 4).map((line) => txt(line, { size: 11, weight: "regular" }, null, { maxLines: 1, minScale: 0.6 }));
    return { type: "widget", gap: 2, children: [txt(title, { size: "caption1", weight: "bold" }, null, { maxLines: 1 }), ...lines], refreshAfter: new Date(Date.now() + Math.max(60, Number(S.CFG.Update) || 10) * 1000).toISOString() };
  }
  const maxLines = family === "systemSmall" ? 8 : family === "systemMedium" ? 16 : 24;
  const lineViews = shown.slice(0, maxLines).map((line) => txt(line || " ", { size: 11, weight: line.includes("——") || line.includes("【") ? "semibold" : "regular" }, "#E5E7EB", { maxLines: line.includes("\n") ? 3 : 1, minScale: 0.7 }));
  return {
    type: "widget",
    padding: [12, 14],
    gap: 4,
    backgroundGradient: { type: "linear", colors: ["#0F172A", "#132238", "#1E293B"], startPoint: { x: 0, y: 0 }, endPoint: { x: 1, y: 1 } },
    children: [
      hstack([icon(S.ICON_NAME, 16, S.ICON_COLOR), txt(title, { size: "headline", weight: "bold" }, "#FFFFFF", { maxLines: 1, minScale: 0.7 }), spacer(), { type: "date", date: new Date().toISOString(), format: "time", font: { size: "caption2", weight: "medium" }, textColor: "#94A3B8" }], { gap: 6 }),
      ...lineViews
    ],
    refreshAfter: new Date(Date.now() + Math.max(60, Number(S.CFG.Update) || 10) * 1000).toISOString()
  };
}

async function runMain(ctx) {
  S = buildState(ctx);
  log("info", "Start", JSON.stringify({ Update: S.CFG.Update, Timeout: S.CFG.Timeout, Budget_ms: S.BUDGET_MS, IPv6_local: S.IPV6_EFF, WANT_V6: S.WANT_V6, HAS_V6: S.HAS_V6, SD_TIMEOUT_MS: S.SD_TIMEOUT_MS, SD_STYLE: S.SD_STYLE, SD_REGION_MODE: S.SD_REGION_MODE, TW_FLAG_MODE: S.TW_FLAG_MODE }));

  const sdPromise = runServiceChecks().catch(() => []);
  const cn = await getDirectV4(S.CFG.DOMESTIC_IPv4).catch(() => ({}));
  const probe = await probeLandingV6(S.CFG.LANDING_IPv6).catch(() => ({ ok: false, ip: "" }));
  const V6_READY = probe.ok;
  const cn6 = S.IPV6_EFF ? await getDirectV6(S.CFG.DOMESTIC_IPv6).catch(() => ({})) : {};
  const px = await getLandingV4(S.CFG.LANDING_IPv4).catch(() => ({}));
  const px6 = (V6_READY && probe && probe.ip) ? { ip: probe.ip } : {};

  const policyName = S.CFG.PROXY_POLICY || "-";
  const entrance4 = S.CFG.ENTRANCE4 || "";
  const entrance6 = V6_READY ? (S.CFG.ENTRANCE6 || "") : "";
  const ent4 = isIPv4(entrance4 || "") ? await getEntranceBundle(entrance4).catch(() => ({ ip: entrance4 })) : {};
  const ent6 = (V6_READY && isIPv6(entrance6 || "")) ? await getEntranceBundle(entrance6).catch(() => ({ ip: entrance6 })) : {};

  const rdnsHost = await queryPTRMaybe(px.ip).catch(() => "");
  const asField = px && (px.as || px.asn) ? (px.as || px.asn) : "";
  const risk = calculateRiskValueSafe(px.isp, px.org, px.country, asField, rdnsHost);

  const title = netTypeLine() || t("unknownNet");
  const parts = [];
  parts.push(`${t("runAt")}: ${now()}`);
  parts.push(`${t("policy")}: ${policyName || "-"}`);
  if (!S.CFG.PROXY_POLICY) parts.push(S.CFG.SD_LANG === "zh-Hant" ? "提示: Egern 無 recent-requests 回溯，策略名請用 PROXY_POLICY 手動填入" : "提示: Egern 无 recent-requests 回溯，策略名请用 PROXY_POLICY 手动填入");

  pushGroupTitle(parts, "本地");
  const directIPv4 = ipLine("IPv4", cn.ip); const directIPv6 = ipLine("IPv6", cn6.ip); if (directIPv4) parts.push(directIPv4); if (directIPv6) parts.push(directIPv6);
  parts.push(`${t("location")}: ${cn.loc ? (S.CFG.MASK_POS ? onlyFlag(cn.loc) : flagFirst(cn.loc)) : "-"}`);
  if (cn.isp) parts.push(`${t("isp")}: ${fmtISP(cn.isp, cn.loc)}`);

  if ((ent4 && (ent4.ip || ent4.loc1 || ent4.loc2 || ent4.isp1 || ent4.isp2)) || (ent6 && (ent6.ip || ent6.loc1 || ent6.loc2 || ent6.isp1 || ent6.isp2))) {
    pushGroupTitle(parts, "入口");
    const entIPv4 = ipLine("IPv4", ent4.ip && isIPv4(ent4.ip) ? ent4.ip : "");
    const entIPv6 = ipLine("IPv6", ent6.ip && isIPv6(ent6.ip) ? ent6.ip : "");
    if (entIPv4) parts.push(entIPv4); if (entIPv6) parts.push(entIPv6);
    const entShow = (ent4 && (ent4.loc1 || ent4.loc2 || ent4.isp1 || ent4.isp2)) ? ent4 : ent6;
    if (entShow?.loc1) parts.push(`${t("location")}¹: ${flagFirst(entShow.loc1)}`);
    if (entShow?.isp1) parts.push(`${t("isp")}¹: ${fmtISP(entShow.isp1, entShow.loc1)}`);
    if (entShow?.loc2) parts.push(`${t("location")}²: ${flagFirst(entShow.loc2)}`);
    if (entShow?.isp2) parts.push(`${t("isp")}²: ${String(entShow.isp2).trim()}`);
  }

  if (px && (px.ip || (px6 && px6.ip) || px.loc || px.isp)) {
    pushGroupTitle(parts, "落地");
    const landIPv4 = ipLine("IPv4", px.ip); const landIPv6 = ipLine("IPv6", (px6 && px6.ip) ? px6.ip : "");
    if (landIPv4) parts.push(landIPv4); if (landIPv6) parts.push(landIPv6);
    if (px.loc) parts.push(`${t("location")}: ${flagFirst(px.loc)}`);
    if (px.isp) parts.push(`${t("isp")}: ${fmtISP(px.isp, px.loc)}`);
    parts.push(`网络类型: ${risk.lineType} · ${risk.nativeHint}`);
    parts.push(`代理特征: ${risk.tunnelHint}`);
    parts.push(`证据: ${(risk.reasons || []).slice(0, 4).join("；") || "-"}`);
    const rv = Number(risk.riskValue); const riskValue = Number.isFinite(rv) ? clamp(Math.round(rv), 0, 100) : 0; const riskWarn = riskValue >= 80 ? " 🚨" : riskValue >= 50 ? " ⚠️" : "";
    parts.push(`风险值: ${riskValue}%${riskWarn}`);
  }

  const sdLines = await sdPromise;
  if (sdLines.length) { pushGroupTitle(parts, "服务检测"); parts.push(...sdLines); }
  if (S.CFG.LOG_TO_PANEL && S.DEBUG_LINES.length) { pushGroupTitle(parts, t("debug")); parts.push(...S.DEBUG_LINES.slice(-CONSTS.DEBUG_TAIL_LINES)); }

  const shown = S.CFG.SD_LANG === "zh-Hant" ? parts.map(maybeTifyLine) : parts;
  return buildLineWidget(title, shown, ctx.widgetFamily || "systemMedium");
}

export default async function(ctx) {
  try {
    return await runMain(ctx);
  } catch (err) {
    const msg = String(err && err.stack ? err.stack : err);
    try { ctx.notify?.({ title: "网络信息 𝕏", body: msg.slice(0, 200), sound: false, duration: 5 }); } catch {}
    return {
      type: "widget",
      padding: 14,
      backgroundColor: "#1F2937",
      children: [
        { type: "text", text: "网络信息 𝕏", font: { size: "headline", weight: "bold" }, textColor: "#FFFFFF" },
        { type: "text", text: "脚本错误", font: { size: "caption1", weight: "semibold" }, textColor: "#FCA5A5" },
        { type: "text", text: msg.slice(0, 300), font: { size: "caption2", weight: "regular" }, textColor: "#E5E7EB", maxLines: 8, minScale: 0.7 }
      ]
    };
  }
}
