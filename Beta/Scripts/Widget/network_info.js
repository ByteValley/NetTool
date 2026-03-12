/* =========================================================
 * 模块分类 · 网络信息小组件
 * 作者 · ByteValley
 * 版本 · 2026-03-12R2
 *
 * 模块分类 · 说明
 * · 纯 Egern Generic Script 版本
 * · 适配小组件卡片式布局，不再沿用旧 Panel 的长文本堆叠风格
 * · 保留：本地 / 入口 / 落地 / 风险 / 服务检测 / BoxJS / 参数优先级
 * · 限制：Egern 公共 JS API 无 recent-requests 回溯能力，策略名与入口 IP 需通过 env 手动传入
 * ========================================================= */

const CONSTS = Object.freeze({
  SD_MIN_TIMEOUT: 2000,
  V6_PROBE_TO_MS: 1200,
  BUDGET_HARD_MS: 10000,
  BUDGET_SOFT_GUARD_MS: 260,
  ENT_MIN_TTL: 30,
  ENT_MAX_TTL: 3600,
  LOG_RING_MAX: 120
});

const SD_STR = {
  "zh-Hans": {
    title: "网络信息 𝕏",
    wifi: "Wi‑Fi",
    cellular: "蜂窝",
    unknownNet: "未知网络",
    policy: "策略",
    local: "本地",
    entrance: "入口",
    landing: "落地",
    location: "位置",
    isp: "运营商",
    runAt: "执行时间",
    risk: "风险",
    services: "服务",
    unlocked: "已解锁",
    partialUnlocked: "部分解锁",
    notReachable: "不可达",
    timeout: "超时",
    fail: "检测失败",
    regionBlocked: "区域受限",
    nfFull: "完整",
    nfOriginals: "自制",
    home: "家宽",
    nonHome: "非家宽",
    nativeLike: "更像原生",
    maybeNonNative: "可能非原生",
    tunnelWeak: "机房特征弱",
    tunnelStrong: "机房特征强",
    debug: "调试",
    noEntranceHint: "Egern 无 recent-requests 回溯，请用 PROXY_POLICY / ENTRANCE4 / ENTRANCE6 手动补齐"
  },
  "zh-Hant": {
    title: "網路資訊 𝕏",
    wifi: "Wi‑Fi",
    cellular: "行動",
    unknownNet: "未知網路",
    policy: "策略",
    local: "本地",
    entrance: "入口",
    landing: "落地",
    location: "位置",
    isp: "運營商",
    runAt: "執行時間",
    risk: "風險",
    services: "服務",
    unlocked: "已解鎖",
    partialUnlocked: "部分解鎖",
    notReachable: "不可達",
    timeout: "逾時",
    fail: "檢測失敗",
    regionBlocked: "區域受限",
    nfFull: "完整",
    nfOriginals: "自製",
    home: "家寬",
    nonHome: "非家寬",
    nativeLike: "更像原生",
    maybeNonNative: "可能非原生",
    tunnelWeak: "機房特徵弱",
    tunnelStrong: "機房特徵強",
    debug: "除錯",
    noEntranceHint: "Egern 無 recent-requests 回溯，請用 PROXY_POLICY / ENTRANCE4 / ENTRANCE6 手動補齊"
  }
};

let G = null;
function S() { return G; }
function t(key) {
  const lang = S()?.CFG?.SD_LANG || "zh-Hans";
  const pack = SD_STR[lang] || SD_STR["zh-Hans"];
  return pack[key] ?? key;
}

function safeJSON(s, d = {}) { try { return JSON.parse(s || ""); } catch (_) { return d; } }
const toBool = (v, d = false) => {
  if (v == null || v === "") return d;
  if (typeof v === "boolean") return v;
  const s = String(v).trim().toLowerCase();
  if (["1", "true", "on", "yes", "y"].includes(s)) return true;
  if (["0", "false", "off", "no", "n"].includes(s)) return false;
  return d;
};
const toNum = (v, d) => {
  if (v == null || v === "") return d;
  const n = Number(v);
  return Number.isFinite(n) ? n : d;
};
const clamp = (n, min, max) => Math.max(min, Math.min(max, n));
const joinNonEmpty = (arr, sep = " ") => arr.filter(Boolean).join(sep);

function parseArgs(raw) {
  if (!raw) return {};
  if (typeof raw === "object") return raw;
  if (typeof raw === "string") {
    return raw.split("&").reduce((acc, kv) => {
      if (!kv) return acc;
      const [k, v = ""] = kv.split("=");
      acc[decodeURIComponent(k || "")] = decodeURIComponent(String(v).replace(/\+/g, "%20"));
      return acc;
    }, {});
  }
  return {};
}

function normalizeHeadersObject(h) {
  const src = h || {};
  return new Proxy(src, {
    get(target, prop) {
      const key = String(prop || "").toLowerCase();
      for (const k of Object.keys(target)) {
        if (String(k).toLowerCase() === key) return target[k];
      }
      return undefined;
    }
  });
}

function makeStorage(ctx) {
  return {
    get(k) {
      try {
        if (typeof ctx.storage?.get === "function") return ctx.storage.get(k);
        if (typeof ctx.storage?.valueForKey === "function") return ctx.storage.valueForKey(k);
      } catch (_) {}
      return null;
    },
    set(k, v) {
      try {
        if (typeof ctx.storage?.set === "function") return ctx.storage.set(k, v);
        if (typeof ctx.storage?.setValueForKey === "function") return ctx.storage.setValueForKey(v, k);
      } catch (_) {}
    },
    getJSON(k) {
      try {
        if (typeof ctx.storage?.getJSON === "function") return ctx.storage.getJSON(k);
      } catch (_) {}
      return safeJSON(this.get(k), null);
    },
    setJSON(k, v) {
      try {
        if (typeof ctx.storage?.setJSON === "function") return ctx.storage.setJSON(k, v);
      } catch (_) {}
      this.set(k, JSON.stringify(v));
    }
  };
}

function readBoxSettings(storage) {
  const raw = storage.get("Panel");
  if (raw == null || raw === "") return {};
  let panel = raw;
  if (typeof raw === "string") panel = safeJSON(raw, {});
  if (!panel || typeof panel !== "object") return {};
  if (panel.NetworkInfo?.Settings && typeof panel.NetworkInfo.Settings === "object") return panel.NetworkInfo.Settings;
  if (panel.Settings && typeof panel.Settings === "object") return panel.Settings;
  return {};
}

function buildCFG(ctx, storage) {
  const env = ctx.env || {};
  const compat = parseArgs(env._compat?.$argument || env["_compat.$argument"] || "");
  const BOX = readBoxSettings(storage);
  const readBoxKey = (key) => {
    if (!BOX || typeof BOX !== "object") return undefined;
    if (!Object.prototype.hasOwnProperty.call(BOX, key)) return undefined;
    const v = BOX[key];
    if (v === "" || v == null) return undefined;
    return v;
  };

  function ENV(key, defVal, opt = {}) {
    const typeHint = typeof defVal;
    const argKeys = [key].concat(opt.argAlias || []);
    const boxKeys = [key].concat(opt.boxAlias || []);
    let argRaw, hasArg = false;
    for (const k of argKeys) {
      if (Object.prototype.hasOwnProperty.call(env, k) && env[k] !== "" && env[k] != null) {
        argRaw = env[k]; hasArg = true; break;
      }
      if (Object.prototype.hasOwnProperty.call(compat, k) && compat[k] !== "" && compat[k] != null) {
        argRaw = compat[k]; hasArg = true; break;
      }
    }
    let boxRaw, hasBox = false;
    for (const bk of boxKeys) {
      const v = readBoxKey(bk);
      if (v !== undefined && v !== null && v !== "") { boxRaw = v; hasBox = true; break; }
    }
    const convert = (val) => {
      if (typeHint === "number") return toNum(val, defVal);
      if (typeHint === "boolean") return toBool(val, defVal);
      return val;
    };
    const canon = (val) => {
      if (typeHint === "number") return String(toNum(val, defVal));
      if (typeHint === "boolean") return toBool(val, defVal) ? "true" : "false";
      return String(val);
    };
    const argChanged = hasArg && !opt.skipArgDiff && canon(argRaw) !== canon(defVal);
    if (argChanged) return convert(argRaw);
    if (hasBox) return convert(boxRaw);
    if (hasArg) return convert(argRaw);
    return defVal;
  }

  const cfg = {
    Update: toNum(ENV("Update", 10), 10),
    Timeout: toNum(ENV("Timeout", 12), 12),
    BUDGET_SEC_RAW: ENV("BUDGET", 0),
    MASK_IP: toBool(ENV("MASK_IP", true), true),
    MASK_POS_MODE: ENV("MASK_POS", "auto"),
    IPv6: toBool(ENV("IPv6", true), true),
    DOMESTIC_IPv4: ENV("DOMESTIC_IPv4", "ipip"),
    DOMESTIC_IPv6: ENV("DOMESTIC_IPv6", "ddnspod"),
    LANDING_IPv4: ENV("LANDING_IPv4", "ipapi"),
    LANDING_IPv6: ENV("LANDING_IPv6", "ipsb"),
    TW_FLAG_MODE: toNum(ENV("TW_FLAG_MODE", 1), 1),
    IconPreset: ENV("IconPreset", "globe"),
    Icon: ENV("Icon", ""),
    IconColor: ENV("IconColor", "#1E90FF"),
    SD_STYLE: ENV("SD_STYLE", "icon"),
    SD_REGION_MODE: ENV("SD_REGION_MODE", "full"),
    SD_ICON_THEME: ENV("SD_ICON_THEME", "check"),
    SD_ARROW: toBool(ENV("SD_ARROW", true), true),
    SD_SHOW_LAT: toBool(ENV("SD_SHOW_LAT", true), true),
    SD_SHOW_HTTP: toBool(ENV("SD_SHOW_HTTP", true), true),
    SD_LANG: String(ENV("SD_LANG", "zh-Hans")).toLowerCase() === "zh-hant" ? "zh-Hant" : "zh-Hans",
    SD_TIMEOUT_SEC_RAW: ENV("SD_TIMEOUT", 0),
    SD_CONCURRENCY: toNum(ENV("SD_CONCURRENCY", 6), 6),
    LOG: toBool(ENV("LOG", true), true),
    LOG_LEVEL: (ENV("LOG_LEVEL", "info") + "").toLowerCase(),
    LOG_TO_PANEL: toBool(ENV("LOG_TO_PANEL", false), false),
    LOG_PUSH: toBool(ENV("LOG_PUSH", true), true),
    PROXY_POLICY: ENV("PROXY_POLICY", ""),
    ENTRANCE4: ENV("ENTRANCE4", ""),
    ENTRANCE6: ENV("ENTRANCE6", ""),
    SERVICES_BOX_CHECKED_RAW: (() => {
      const v = readBoxKey("SERVICES");
      if (v == null) return null;
      if (Array.isArray(v)) return v.length ? JSON.stringify(v) : null;
      const s = String(v).trim();
      return (!s || s === "[]") ? null : s;
    })(),
    SERVICES_BOX_TEXT: (() => {
      const v = readBoxKey("SERVICES_TEXT");
      return v != null ? String(v).trim() : "";
    })(),
    SERVICES_ARG_TEXT: (() => {
      let v = env.SERVICES;
      if (Array.isArray(v)) return JSON.stringify(v);
      if (v == null || v === "") v = compat.SERVICES;
      return v != null ? String(v).trim() : "";
    })()
  };

  cfg.MASK_POS = (() => {
    const mode = String(cfg.MASK_POS_MODE ?? "auto").trim().toLowerCase();
    if (["", "auto", "follow", "same"].includes(mode)) return !!cfg.MASK_IP;
    return toBool(mode, true);
  })();
  cfg.SD_CONCURRENCY = clamp(toNum(cfg.SD_CONCURRENCY, 6), 1, 8);
  return cfg;
}

function buildState(ctx) {
  const storage = makeStorage(ctx);
  const CFG = buildCFG(ctx, storage);
  const SD_TIMEOUT_MS = (() => {
    const baseSec = Number(CFG.Timeout) || 8;
    const secRaw = Number(CFG.SD_TIMEOUT_SEC_RAW);
    const sec = (Number.isFinite(secRaw) && secRaw > 0) ? secRaw : baseSec;
    return Math.max(CONSTS.SD_MIN_TIMEOUT, sec * 1000);
  })();
  const BUDGET_MS = (() => {
    const raw = Number(CFG.BUDGET_SEC_RAW);
    const base = Math.max(1, Number(CFG.Timeout) || 8) * 1000;
    if (Number.isFinite(raw) && raw > 0) return Math.max(3500, raw * 1000);
    return Math.min(CONSTS.BUDGET_HARD_MS, Math.max(5500, base));
  })();
  const SD_ICONS = (() => {
    switch (String(CFG.SD_ICON_THEME)) {
      case "lock": return { full: "🔓", partial: "🔐", blocked: "🔒" };
      case "circle": return { full: "⭕️", partial: "⛔️", blocked: "🚫" };
      default: return { full: "✅", partial: "❇️", blocked: "❎" };
    }
  })();
  const ICON_PRESET_MAP = Object.freeze({
    wifi: "wifi.router",
    globe: "globe.asia.australia",
    dots: "dot.radiowaves.left.and.right",
    antenna: "antenna.radiowaves.left.and.right",
    point: "point.3.connected.trianglepath.dotted"
  });
  const LOG_LEVELS = { debug: 10, info: 20, warn: 30, error: 40 };
  return {
    ctx,
    storage,
    CFG,
    DEADLINE: Date.now() + BUDGET_MS,
    BUDGET_MS,
    SD_TIMEOUT_MS,
    V6_TO: Math.min(Math.max(CONSTS.SD_MIN_TIMEOUT, SD_TIMEOUT_MS), 2500),
    SD_ICONS,
    ICON_NAME: (CFG.Icon || "").trim() || ICON_PRESET_MAP[String(CFG.IconPreset).trim()] || "globe.asia.australia",
    ICON_COLOR: CFG.IconColor,
    LOG_LEVELS,
    LOG_THRESH: LOG_LEVELS[CFG.LOG_LEVEL] ?? 20,
    DEBUG_LINES: [],
    ENT_CACHE: { ip: "", t: 0, data: null }
  };
}

function log(level, ...args) {
  if (!S().CFG.LOG) return;
  const L = S().LOG_LEVELS[level] ?? 20;
  if (L < S().LOG_THRESH) return;
  const line = `[NI][${level.toUpperCase()}] ` + args.map(x => typeof x === "string" ? x : JSON.stringify(x)).join(" ");
  try { console.log(line); } catch (_) {}
  S().DEBUG_LINES.push(line);
  if (S().DEBUG_LINES.length > CONSTS.LOG_RING_MAX) S().DEBUG_LINES.shift();
}

function budgetLeft() { return Math.max(0, S().DEADLINE - Date.now()); }
function capByBudget(capMs, floorMs = 220) {
  const left = budgetLeft();
  if (left <= CONSTS.BUDGET_SOFT_GUARD_MS) return Math.max(120, floorMs);
  const room = Math.max(120, left - CONSTS.BUDGET_SOFT_GUARD_MS);
  return Math.max(120, Math.min(Number(capMs) || room, room));
}
async function withTimeout(promise, ms, onTimeoutValue) {
  const lim = Math.max(120, Number(ms) || 0);
  let tmr;
  try {
    return await Promise.race([
      Promise.resolve(promise),
      new Promise((resolve) => { tmr = setTimeout(() => resolve(onTimeoutValue), lim); })
    ]);
  } finally { if (tmr) clearTimeout(tmr); }
}

async function httpGetRT(url, headers = {}, timeoutMs = null, followRedirect = false) {
  const start = Date.now();
  const resp = await S().ctx.http.get(url, {
    headers,
    timeout: timeoutMs == null ? capByBudget(3500) : Math.min(Number(timeoutMs) || 3500, capByBudget(3500)),
    redirect: followRedirect ? "follow" : "manual",
    policy: S().CFG.PROXY_POLICY || undefined,
    credentials: "include"
  });
  return {
    status: resp.status || 0,
    headers: normalizeHeadersObject(resp.headers || {}),
    body: await resp.text(),
    cost: Date.now() - start
  };
}

async function httpPostRT(url, headers = {}, body = "", timeoutMs = null) {
  const start = Date.now();
  const resp = await S().ctx.http.post(url, {
    headers,
    body,
    timeout: timeoutMs == null ? capByBudget(3500) : Math.min(Number(timeoutMs) || 3500, capByBudget(3500)),
    redirect: "follow",
    policy: S().CFG.PROXY_POLICY || undefined,
    credentials: "include"
  });
  return {
    status: resp.status || 0,
    headers: normalizeHeadersObject(resp.headers || {}),
    body: await resp.text(),
    cost: Date.now() - start
  };
}

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
function pad2(n) { return String(n).padStart(2, "0"); }
function now() { const d = new Date(); return `${pad2(d.getMonth()+1)}-${pad2(d.getDate())} ${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}`; }
function maskIP(ip) {
  if (!ip || !S().CFG.MASK_IP) return ip || "";
  if (isIPv4(ip)) { const p = ip.split("."); return [p[0], p[1], "*", "*"].join("."); }
  if (isIPv6(ip)) { const p = ip.split(":"); return [...p.slice(0, 4), "*", "*", "*", "*"].join(":"); }
  return ip;
}
function shortIP(ip) {
  const s = maskIP(ip || "");
  if (!s) return "-";
  return s.length > 19 ? s.slice(0, 19) + "…" : s;
}
function hasCityLevel(loc) {
  if (!loc) return false;
  try {
    const s = String(loc).replace(/^[\u{1F1E6}-\u{1F1FF}]{2}\s*/u, "").trim();
    if (/市|区|縣|县|州|市辖/.test(s)) return true;
    return s.split(/\s+/).filter(Boolean).length >= 3;
  } catch (_) { return false; }
}

function splitFlagRaw(s) {
  const re = /^[\u{1F1E6}-\u{1F1FF}]{2}\s*/u;
  const m = String(s || "").match(re);
  let flag = m ? m[0] : "";
  const text = String(s || "").replace(re, "");
  if (flag.includes("🇹🇼")) {
    if (S().CFG.TW_FLAG_MODE === 0) flag = "🇨🇳";
    else if (S().CFG.TW_FLAG_MODE === 2) flag = "🇼🇸";
  }
  return { flag, text };
}
const onlyFlag = (loc) => splitFlagRaw(loc).flag || "-";
const flagFirst = (loc) => { const { flag, text } = splitFlagRaw(loc); return (flag || "") + (text || ""); };
function flagOf(code) {
  let cc = String(code || "").trim();
  if (!cc) return "";
  if (/^中国$|^CN$/i.test(cc)) cc = "CN";
  if (cc.length !== 2 || !/^[A-Za-z]{2}$/.test(cc)) return "";
  try {
    if (cc.toUpperCase() === "TW") {
      if (S().CFG.TW_FLAG_MODE === 0) return "🇨🇳";
      if (S().CFG.TW_FLAG_MODE === 2) return "🇼🇸";
    }
    return String.fromCodePoint(...[...cc.toUpperCase()].map((ch) => 127397 + ch.charCodeAt(0)));
  } catch (_) { return ""; }
}
function fmtISP(isp, locStr) {
  const raw = String(isp || "").trim();
  if (!raw) return "";
  const txt = String(locStr || "");
  const isMainland = /^🇨🇳/.test(txt) || /(^|\s)中国(?!香港|澳门|台湾)/.test(txt);
  if (!isMainland) return raw;
  const norm = raw.replace(/\s*\(中国\)\s*/, "").replace(/\s+/g, " ").trim();
  const s = norm.toLowerCase();
  if (/(^|[\s-])(cmcc|cmnet|cmi)\b/.test(s) || /china\s*mobile/.test(s) || /移动/.test(norm)) return S().CFG.SD_LANG === "zh-Hant" ? "中國移動" : "中国移动";
  if (/(^|[\s-])(chinanet|china\s*telecom|ctcc|ct)\b/.test(s) || /电信/.test(norm)) return S().CFG.SD_LANG === "zh-Hant" ? "中國電信" : "中国电信";
  if (/(^|[\s-])(china\s*unicom|cncgroup|netcom)\b/.test(s) || /联通/.test(norm)) return S().CFG.SD_LANG === "zh-Hant" ? "中國聯通" : "中国联通";
  return raw;
}

function radioToGen(r) {
  if (!r) return "";
  const x = String(r).toUpperCase().replace(/\s+/g, "");
  const alias = { NR5G: "NR", NRSA: "NR", NRNSA: "NRNSA", LTEA: "LTE", "LTE+": "LTE", LTEPLUS: "LTE" };
  const k = alias[x] || x;
  const MAP = { GPRS: "2.5G", EDGE: "2.75G", CDMA1X: "2.5G", WCDMA: "3G", HSDPA: "3.5G", HSUPA: "3.75G", EHRPD: "3.9G", LTE: "4G", NRNSA: "5G", NR: "5G" };
  return MAP[k] || "";
}
function netTypeLine() {
  try {
    const n = S().ctx.device || {};
    const ssid = n.wifi?.ssid, bssid = n.wifi?.bssid;
    if (ssid || bssid) return `${t("wifi")} · ${ssid || "-"}`;
    const radio = n.cellular?.radio;
    if (radio) return `${t("cellular")} · ${radioToGen(radio) || radio}`;
    const iface = n.ipv4?.interface || n.ipv6?.interface || "";
    if (/^pdp/i.test(iface)) return `${t("cellular")} · -`;
    if (/^(en|eth|wlan)/i.test(iface)) return `${t("wifi")} · -`;
  } catch (_) {}
  return t("unknownNet");
}

function normStr(x) { return String(x == null ? "" : x).replace(/\s+/g, " ").replace(/[（(].*?[）)]/g, " ").trim().toLowerCase(); }
function parseASNNumber(s) {
  const str = String(s || "");
  const m = str.match(/\bAS(\d{1,10})\b/i);
  if (m) return Number(m[1]) || 0;
  const m2 = str.match(/\b(\d{1,10})\b/);
  return m2 ? (Number(m2[1]) || 0) : 0;
}
function _hasAny(hay, list) {
  const H = normStr(hay);
  if (!H) return false;
  for (const kw of (list || [])) {
    const K = normStr(kw);
    if (K && H.includes(K)) return true;
  }
  return false;
}
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
function _rdnsLooksDatacenter(ptrHost) {
  const host = normStr(ptrHost).replace(/\.$/, "");
  if (!host) return false;
  return RISK_RULES.rdnsDatacenterSuffix.some((suf) => host.endsWith(normStr(suf)));
}
function calculateRiskValueSafe(isp, org, country, asField, rdnsHost) {
  const ISP = normStr(isp), ORG = normStr(org), CTRY = normStr(country), AS = normStr(asField);
  const hay = joinNonEmpty([ISP, ORG, AS], " | ");
  const asn = parseASNNumber(asField);
  const reasons = [];
  let riskValue = 0;
  const rdnsHitDC = _rdnsLooksDatacenter(rdnsHost);
  const rdnsHitHB = _hasAny(rdnsHost, RISK_RULES.rdnsHomeKeywords);
  const rdnsHitMobile = _hasAny(rdnsHost, RISK_RULES.rdnsMobileKeywords);
  if (rdnsHitDC) { riskValue += 75; reasons.push("PTR-DC"); }
  if (rdnsHitHB) { const delta = rdnsHitDC ? -6 : -26; riskValue += delta; reasons.push(`PTR-HB${delta}`); }
  if (rdnsHitMobile) { const delta = rdnsHitDC ? 0 : -8; riskValue += delta; reasons.push(`PTR-M${delta}`); }
  const dcHit = _hasAny(hay, RISK_RULES.dataCenterKeywords);
  const hbHit = _hasAny(hay, RISK_RULES.homeBroadbandKeywords);
  const mobileHit = _hasAny(hay, RISK_RULES.mobileKeywords);
  if (dcHit) { riskValue += 55; reasons.push("ORG-DC"); }
  if (hbHit) { const delta = (rdnsHitDC || dcHit) ? -10 : -22; riskValue += delta; reasons.push(`ORG-HB${delta}`); }
  if (mobileHit) { const delta = (rdnsHitDC || dcHit) ? 0 : -10; riskValue += delta; reasons.push(`ORG-M${delta}`); }
  if (RISK_RULES.highRiskCountries.some((x) => CTRY.includes(normStr(x)))) { riskValue += 18; reasons.push("Country+18"); }
  if (!ORG && !AS && ISP.length <= 3) { riskValue += 10; reasons.push("Sparse+10"); }
  riskValue = clamp(Math.round(riskValue), 0, 100);
  const hbEvidence = [hbHit, rdnsHitHB].filter(Boolean).length + (ASN_HOME_STRONG.has(asn) ? 1 : 0);
  const dcEvidence = [dcHit, rdnsHitDC].filter(Boolean).length;
  const tunnelLike = (dcEvidence >= 2) || (riskValue >= 70) || rdnsHitDC;
  const homeLikeStrong = (hbEvidence >= 2) && !tunnelLike && (riskValue <= 50);
  const homeLikeSoft = (hbEvidence >= 1) && (dcEvidence === 0) && !tunnelLike && (riskValue <= 38);
  const isHomeBroadband = homeLikeStrong || homeLikeSoft;
  return {
    riskValue,
    lineType: isHomeBroadband ? t("home") : t("nonHome"),
    isHomeBroadband,
    nativeHint: (!tunnelLike && riskValue < 55) ? t("nativeLike") : t("maybeNonNative"),
    tunnelHint: tunnelLike ? t("tunnelStrong") : t("tunnelWeak"),
    reasons
  };
}

function ipToPtrName(ip) {
  const s = String(ip || "").trim();
  if (isIPv4(s)) return s.split(".").reverse().join(".") + ".in-addr.arpa";
  if (isIPv6(s)) {
    const raw = s.toLowerCase().split("%")[0];
    const halves = raw.split("::");
    const left = (halves[0] || "").split(":").filter(Boolean);
    const right = (halves[1] || "").split(":").filter(Boolean);
    const missing = (halves.length === 2) ? Math.max(0, 8 - (left.length + right.length)) : 0;
    const groups = [];
    for (const g of left) groups.push(g.padStart(4, "0"));
    for (let i = 0; i < missing; i++) groups.push("0000");
    for (const g of right) groups.push(g.padStart(4, "0"));
    while (groups.length < 8) groups.push("0000");
    return groups.slice(0, 8).join("").split("").reverse().join(".") + ".ip6.arpa";
  }
  return "";
}
async function queryPTRMaybe(ip) {
  if (!ip || budgetLeft() <= 800) return "";
  const name = ipToPtrName(ip);
  if (!name) return "";
  const url = "https://dns.google/resolve?name=" + encodeURIComponent(name) + "&type=PTR";
  const r = await withTimeout(httpGetRT(url, { "Accept": "application/dns-json" }, Math.min(900, capByBudget(900)), true).catch(() => null), Math.min(950, capByBudget(950)), null);
  if (!r || r.status !== 200) return "";
  try {
    const j = safeJSON(r.body, {});
    const ans = Array.isArray(j.Answer) ? j.Answer : [];
    const first = ans.find((x) => x && (x.type === 12 || String(x.type) === "12") && x.data);
    return first ? String(first.data).trim().replace(/\.$/, "") : "";
  } catch (_) { return ""; }
}

const DIRECT_V4_SOURCES = Object.freeze({
  ipip: { url: "https://myip.ipip.net/json", parse: (r) => { const j = safeJSON(r.body, {}); const loc = j?.data?.location || []; const c0 = loc[0]; const flag = flagOf(c0 === "中国" ? "CN" : c0); let isp = ""; if (Array.isArray(loc)) { if (loc.length >= 5) isp = loc[4] || ""; else if (loc.length >= 4) isp = loc[3] || ""; } return { ip: j?.data?.ip || "", loc: joinNonEmpty([flag, loc[0], loc[1], loc[2]], " ").replace(/\s*中国\s*/, ""), isp: String(isp || "").trim() }; } },
  cip: { url: "http://cip.cc/", parse: (r) => { const b = String(r.body || ""); const ip = (b.match(/IP.*?:\s*(\S+)/) || [])[1] || ""; const addr = (b.match(/地址.*?:\s*(.+)/) || [])[1] || ""; const isp = (b.match(/运营商.*?:\s*(.+)/) || [])[1] || ""; const isCN = /中国/.test(addr); return { ip, loc: joinNonEmpty([flagOf(isCN ? "CN" : ""), addr.replace(/中国\s*/, "")], " "), isp: isp.replace(/中国\s*/, "") }; } },
  "163": { url: "https://dashi.163.com/fgw/mailsrv-ipdetail/detail", parse: (r) => { const d = safeJSON(r.body, {})?.result || {}; return { ip: d.ip || "", loc: joinNonEmpty([flagOf(d.countryCode), d.country, d.province, d.city], " ").replace(/\s*中国\s*/, ""), isp: d.isp || d.org || "" }; } },
  bilibili: { url: "https://api.bilibili.com/x/web-interface/zone", parse: (r) => { const d = safeJSON(r.body, {})?.data || {}; const flag = flagOf(d.country === "中国" ? "CN" : d.country); return { ip: d.addr || "", loc: joinNonEmpty([flag, d.country, d.province, d.city], " ").replace(/\s*中国\s*/, ""), isp: d.isp || "" }; } },
  "126": { url: "https://ipservice.ws.126.net/locate/api/getLocByIp", parse: (r) => { const d = safeJSON(r.body, {})?.result || {}; return { ip: d.ip || "", loc: joinNonEmpty([flagOf(d.countrySymbol), d.country, d.province, d.city], " ").replace(/\s*中国\s*/, ""), isp: d.operator || "" }; } },
  pingan: { url: "https://rmb.pingan.com.cn/itam/mas/linden/ip/request", parse: (r) => { const d = safeJSON(r.body, {})?.data || {}; return { ip: d.ip || "", loc: joinNonEmpty([flagOf(d.countryIsoCode), d.country, d.region, d.city], " ").replace(/\s*中国\s*/, ""), isp: d.isp || d.ispName || d.operator || d.org || d.as || "" }; } }
});
const LANDING_V4_SOURCES = Object.freeze({
  ipapi: { url: "http://ip-api.com/json?lang=zh-CN", parse: (r) => { const j = safeJSON(r.body, {}); return { ip: j.query || "", loc: joinNonEmpty([flagOf(j.countryCode), j.country?.replace(/\s*中国\s*/, ""), j.regionName?.split(/\s+or\s+/)[0], j.city], " "), isp: j.isp || j.org || "", org: j.org || "", as: j.as || "", country: j.country || "", countryCode: String(j.countryCode || "").toUpperCase() }; } },
  ipwhois: { url: "https://ipwhois.app/widget.php?lang=zh-CN", parse: (r) => { const j = safeJSON(r.body, {}); const asn = j.asn || j.as || (j?.connection?.asn) || ""; return { ip: j.ip || "", loc: joinNonEmpty([flagOf(j.country_code), j.country?.replace(/\s*中国\s*/, ""), j.region, j.city], " "), isp: (j?.connection?.isp) || "", org: j.org || (j?.connection?.org) || "", as: asn || "", country: j.country || "", countryCode: String(j.country_code || "").toUpperCase() }; } },
  ipsb: { url: "https://api-ipv4.ip.sb/geoip", parse: (r) => { const j = safeJSON(r.body, {}); const as = j.asn ? (`AS${j.asn}` + (j.asn_organization ? ` ${j.asn_organization}` : "")) : ""; return { ip: j.ip || "", loc: joinNonEmpty([flagOf(j.country_code), j.country, j.region, j.city], " ").replace(/\s*中国\s*/, ""), isp: j.isp || j.organization || "", org: j.organization || j.asn_organization || "", as, country: j.country || "", countryCode: String(j.country_code || "").toUpperCase() }; } }
});
const IPV6_IP_ENDPOINTS = Object.freeze({ ddnspod: "https://ipv6.ddnspod.com", neu6: "https://speed.neu6.edu.cn/getIP.php", ipsb: "https://api-ipv6.ip.sb/ip", ident: "https://v6.ident.me", ipify: "https://api6.ipify.org" });
const ORDER = Object.freeze({ directV4: ["cip", "163", "126", "bilibili", "pingan", "ipip"], landingV4: ["ipapi", "ipwhois", "ipsb"], directV6: ["ddnspod", "neu6"], landingV6: ["ipsb", "ident", "ipify"] });
function makeTryOrder(prefer, fallbackList) { return [prefer, ...fallbackList].filter((x, i, a) => x && a.indexOf(x) === i); }
async function trySources(order, sourceMap, { needCityPrefer = false, acceptIp = null, policy = "DIRECT" }) {
  let firstOK = null;
  for (const key of order) {
    if (budgetLeft() <= 300) break;
    const def = sourceMap[key];
    if (!def) continue;
    try {
      const r = await S().ctx.http.get(def.url, { timeout: capByBudget(3500), redirect: "follow", policy, credentials: "include" }).then(async resp => ({ status: resp.status || 0, headers: resp.headers || {}, body: await resp.text() }));
      const res = def.parse(r) || {};
      const ip = String(res.ip || "").trim();
      const ok = acceptIp ? acceptIp(ip) : !!ip;
      const cityOK = ok && hasCityLevel(res.loc);
      if (ok) {
        res.ip = ip;
        if (!firstOK) firstOK = res;
        if (!needCityPrefer || cityOK) return res;
      }
    } catch (_) {}
  }
  return firstOK || {};
}
async function tryIPv6Ip(order, opt = {}, policy = "DIRECT") {
  const timeoutMs = (opt.timeoutMs != null) ? opt.timeoutMs : S().V6_TO;
  const maxTries = Math.max(1, Math.min(Number(opt.maxTries || order.length), order.length));
  for (const key of order.slice(0, maxTries)) {
    if (budgetLeft() <= 260) break;
    const url = IPV6_IP_ENDPOINTS[key];
    if (!url) continue;
    try {
      const r = await S().ctx.http.get(url, { timeout: timeoutMs, redirect: "follow", policy, credentials: "include" });
      const ip = String(await r.text()).trim();
      if (isIPv6(ip)) return { ip };
    } catch (_) {}
  }
  return {};
}
async function getDirectV4(preferKey) {
  return await trySources(makeTryOrder(preferKey, ORDER.directV4), DIRECT_V4_SOURCES, { needCityPrefer: true, acceptIp: isIPv4, policy: "DIRECT" });
}
async function getDirectV6(preferKey) {
  return await tryIPv6Ip(makeTryOrder(preferKey, ORDER.directV6), { timeoutMs: S().V6_TO }, "DIRECT");
}
async function getLandingV4(preferKey) {
  return await trySources(makeTryOrder(preferKey, ORDER.landingV4), LANDING_V4_SOURCES, { needCityPrefer: false, acceptIp: isIPv4, policy: S().CFG.PROXY_POLICY || undefined });
}
async function probeLandingV6(preferKey) {
  const r = await tryIPv6Ip(makeTryOrder(preferKey, ORDER.landingV6), { timeoutMs: Math.min(CONSTS.V6_PROBE_TO_MS, 900), maxTries: 2 }, S().CFG.PROXY_POLICY || undefined);
  return { ok: !!r.ip, ip: r.ip || "" };
}

const SD_UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";
const SD_BASE_HEADERS = { "User-Agent": SD_UA, "Accept-Language": "en" };
function sd_httpGet(url, headers = {}, followRedirect = true) {
  const start = Date.now();
  return httpGetRT(url, { ...SD_BASE_HEADERS, ...headers }, S().SD_TIMEOUT_MS, followRedirect)
    .then((r) => ({ ok: true, status: r.status, cost: Date.now() - start, headers: r.headers || {}, data: r.body || "" }))
    .catch((e) => ({ ok: false, status: 0, cost: Date.now() - start, headers: {}, data: "", err: String(e || "") }));
}
function sd_httpPost(url, headers = {}, body = "") {
  const start = Date.now();
  return httpPostRT(url, { ...SD_BASE_HEADERS, ...headers }, body, S().SD_TIMEOUT_MS)
    .then((r) => ({ ok: true, status: r.status, cost: Date.now() - start, headers: r.headers || {}, data: r.body || "" }))
    .catch((e) => ({ ok: false, status: 0, cost: Date.now() - start, headers: {}, data: "", err: String(e || "") }));
}
const SD_I18N = () => ({ youTube: "YouTube", chatgpt_app: "ChatGPT", chatgpt: "ChatGPT Web", netflix: "Netflix", disney: "Disney+", huluUS: "Hulu(美)", huluJP: "Hulu(日)", hbo: "Max(HBO)" });
const SD_ALIAS = { yt: "youtube", youtube: "youtube", "youtube premium": "youtube", 油管: "youtube", nf: "netflix", netflix: "netflix", 奈飞: "netflix", 奈飛: "netflix", disney: "disney", "disney+": "disney", 迪士尼: "disney", chatgpt: "chatgpt_app", gpt: "chatgpt_app", openai: "chatgpt_app", chatgpt_web: "chatgpt_web", "chatgpt-web": "chatgpt_web", "chatgpt web": "chatgpt_web", hulu: "hulu_us", 葫芦: "hulu_us", 葫蘆: "hulu_us", huluus: "hulu_us", hulujp: "hulu_jp", hbo: "hbo", max: "hbo" };
function parseServices(raw) {
  if (raw == null) return [];
  let s = String(raw).trim();
  if (!s || s === "[]" || s === "{}" || /^null$/i.test(s) || /^undefined$/i.test(s)) return [];
  try { const arr = JSON.parse(s); if (Array.isArray(arr)) return normSvcList(arr); } catch (_) {}
  return normSvcList(s.split(/[,\uFF0C;|\/ \t\r\n]+/));
}
function normSvcList(list) {
  const out = [];
  for (let x of list) {
    let k = String(x ?? "").trim().toLowerCase();
    if (!k) continue;
    k = SD_ALIAS[k] || k;
    if (!["youtube","netflix","disney","chatgpt_web","chatgpt_app","hulu_us","hulu_jp","hbo"].includes(k)) continue;
    if (!out.includes(k)) out.push(k);
  }
  return out;
}
function selectServices() {
  const argList = parseServices(S().CFG.SERVICES_ARG_TEXT);
  if (argList.length) return argList;
  const boxCheckedList = parseServices(S().CFG.SERVICES_BOX_CHECKED_RAW);
  if (boxCheckedList.length) return boxCheckedList;
  const boxTextList = parseServices(S().CFG.SERVICES_BOX_TEXT);
  if (boxTextList.length) return boxTextList;
  return ["youtube", "netflix", "disney", "chatgpt_web", "chatgpt_app", "hulu_us", "hulu_jp", "hbo"];
}
function sd_flagFromCC(cc) {
  cc = (cc || "").toUpperCase();
  if (!/^[A-Z]{2}$/.test(cc)) return "";
  if (cc === "TW") {
    if (S().CFG.TW_FLAG_MODE === 0) return "🇨🇳";
    if (S().CFG.TW_FLAG_MODE === 2) return "🇼🇸";
  }
  try { return String.fromCodePoint(...[...cc].map((c) => 0x1F1E6 + (c.charCodeAt(0) - 65))); } catch (_) { return ""; }
}
const SD_CC_NAME = {
  "zh-Hans": { CN: "中国", TW: "台湾", HK: "中国香港", MO: "中国澳门", JP: "日本", KR: "韩国", US: "美国", SG: "新加坡", MY: "马来西亚", TH: "泰国", VN: "越南", PH: "菲律宾", ID: "印度尼西亚", IN: "印度", AU: "澳大利亚", NZ: "新西兰", CA: "加拿大", GB: "英国", DE: "德国", FR: "法国", NL: "荷兰", ES: "西班牙", IT: "意大利", BR: "巴西", AR: "阿根廷", MX: "墨西哥", RU: "俄罗斯" },
  "zh-Hant": { CN: "中國", TW: "台灣", HK: "中國香港", MO: "中國澳門", JP: "日本", KR: "南韓", US: "美國", SG: "新加坡", MY: "馬來西亞", TH: "泰國", VN: "越南", PH: "菲律賓", ID: "印尼", IN: "印度", AU: "澳洲", NZ: "紐西蘭", CA: "加拿大", GB: "英國", DE: "德國", FR: "法國", NL: "荷蘭", ES: "西班牙", IT: "義大利", BR: "巴西", AR: "阿根廷", MX: "墨西哥", RU: "俄羅斯" }
};
function sd_ccPretty(cc) {
  cc = (cc || "").toUpperCase();
  const flag = sd_flagFromCC(cc);
  const name = SD_CC_NAME[S().CFG.SD_LANG][cc];
  if (!cc) return "—";
  if (S().CFG.SD_REGION_MODE === "flag") return flag || "—";
  if (S().CFG.SD_REGION_MODE === "abbr") return (flag || "") + cc;
  if (flag && name) return `${flag} ${cc}`;
  if (flag) return `${flag} ${cc}`;
  return cc;
}
const isPartial = (tag) => /自制|自製|original/i.test(String(tag || "")) || /部分/i.test(String(tag || ""));
function sd_renderShort({ name, ok, cc, tag, state }) {
  const st = state ? state : (ok ? (isPartial(tag) ? "partial" : "full") : "blocked");
  const icon = S().SD_ICONS[st];
  const region = cc ? sd_ccPretty(cc) : "—";
  const badge = (st === "full") ? "OK" : (st === "partial") ? t("nfOriginals") : "X";
  return { name, state: st, icon, region, badge };
}
async function sd_queryLandingCC() {
  const r = await sd_httpGet("http://ip-api.com/json", {}, true);
  if (r.ok && r.status === 200) { try { const j = safeJSON(r.data, {}); return (j.countryCode || "").toUpperCase(); } catch (_) {} }
  return "";
}
async function sd_queryLandingCCMulti() {
  let cc = await sd_queryLandingCC();
  if (cc) return cc;
  for (const url of ["https://api.ip.sb/geoip", "https://ipinfo.io/json", "https://ifconfig.co/json"]) {
    const r = await sd_httpGet(url, { "Accept-Language": "en" }, true);
    if (r.ok && r.status === 200) {
      try { const j = safeJSON(r.data, {}); cc = (j.country_code || j.country || j.country_iso || "").toUpperCase(); if (/^[A-Z]{2}$/.test(cc)) return cc; } catch (_) {}
    }
  }
  return "";
}
async function sd_testYouTube() { const r = await sd_httpGet("https://www.youtube.com/premium?hl=en", {}, true); if (!r.ok) return sd_renderShort({ name: SD_I18N().youTube, ok: false, cc: "", tag: t("notReachable") }); let cc = "US"; try { let m = r.data.match(/"countryCode":"([A-Z]{2})"/); if (!m) m = r.data.match(/["']GL["']\s*:\s*["']([A-Z]{2})["']/); if (m) cc = m[1]; } catch (_) {} return sd_renderShort({ name: SD_I18N().youTube, ok: true, cc, tag: "" }); }
async function sd_testChatGPTWeb() { const r = await sd_httpGet("https://chatgpt.com/cdn-cgi/trace", {}, true); if (!r.ok) return sd_renderShort({ name: SD_I18N().chatgpt, ok: false, cc: "", tag: t("notReachable") }); let cc = ""; try { const m = r.data.match(/loc=([A-Z]{2})/); if (m) cc = m[1]; } catch (_) {} return sd_renderShort({ name: SD_I18N().chatgpt, ok: true, cc, tag: "" }); }
async function sd_testChatGPTAppAPI() { const r = await sd_httpGet("https://api.openai.com/v1/models", {}, true); if (!r.ok) return sd_renderShort({ name: SD_I18N().chatgpt_app, ok: false, cc: "", tag: t("notReachable") }); let cc = ""; try { const h = r.headers || {}; cc = (h["cf-ipcountry"] || h["CF-IPCountry"] || h["Cf-IpCountry"] || "").toString().toUpperCase(); if (!/^[A-Z]{2}$/.test(cc)) cc = ""; } catch (_) {} if (!cc) cc = await sd_queryLandingCCMulti(); return sd_renderShort({ name: SD_I18N().chatgpt_app, ok: true, cc, tag: "" }); }
const SD_NF_ORIGINAL = "80018499"; const SD_NF_NONORIG = "81280792";
const sd_nfGet = (id) => sd_httpGet(`https://www.netflix.com/title/${id}`, {}, true);
function sd_parseNFRegion(resp) { try { const xo = resp?.headers?.["x-originating-url"] || resp?.headers?.["X-Originating-URL"]; if (xo) { const m = String(xo).match(/\/([A-Z]{2})(?:[-/]|$)/i); if (m) return m[1].toUpperCase(); } const m2 = String(resp?.data || "").match(/"countryCode"\s*:\s*"([A-Z]{2})"/i); if (m2) return m2[1].toUpperCase(); } catch (_) {} return ""; }
async function sd_testNetflix() { const r1 = await sd_nfGet(SD_NF_NONORIG); if (!r1.ok) return sd_renderShort({ name: SD_I18N().netflix, ok: false, cc: "", tag: t("fail") }); if (r1.status === 403) return sd_renderShort({ name: SD_I18N().netflix, ok: false, cc: "", tag: t("regionBlocked") }); if (r1.status === 404) { const r2 = await sd_nfGet(SD_NF_ORIGINAL); if (!r2.ok) return sd_renderShort({ name: SD_I18N().netflix, ok: false, cc: "", tag: t("fail") }); if (r2.status === 404) return sd_renderShort({ name: SD_I18N().netflix, ok: false, cc: "", tag: t("regionBlocked") }); const cc = sd_parseNFRegion(r2) || ""; return sd_renderShort({ name: SD_I18N().netflix, ok: true, cc, tag: t("nfOriginals"), state: "partial" }); } if (r1.status === 200) { const cc = sd_parseNFRegion(r1) || ""; return sd_renderShort({ name: SD_I18N().netflix, ok: true, cc, tag: t("nfFull"), state: "full" }); } return sd_renderShort({ name: SD_I18N().netflix, ok: false, cc: "", tag: `HTTP ${r1.status}` }); }
async function sd_testDisney() {
  const rHome = await sd_httpGet("https://www.disneyplus.com/", { "Accept-Language": "en" }, true);
  if (!rHome.ok || rHome.status !== 200 || /Sorry,\s*Disney\+\s*is\s*not\s*available/i.test(rHome.data || "")) return sd_renderShort({ name: SD_I18N().disney, ok: false, cc: "", tag: (!rHome.ok) ? t("timeout") : t("regionBlocked") });
  let homeCC = ""; try { const m = rHome.data.match(/"countryCode"\s*:\s*"([A-Z]{2})"/i) || rHome.data.match(/data-country=["']([A-Z]{2})["']/i); if (m) homeCC = m[1].toUpperCase(); } catch (_) {}
  const headers = { "Accept-Language": "en", "Authorization": "ZGlzbmV5JmJyb3dzZXImMS4wLjA.Cu56AgSfBTDag5NiRA81oLHkDZfu5L3CKadnefEAY84", "Content-Type": "application/json", "User-Agent": SD_UA };
  const body = JSON.stringify({ query: "mutation registerDevice($input: RegisterDeviceInput!) { registerDevice(registerDevice: $input) { grant { grantType assertion } } }", variables: { input: { applicationRuntime: "chrome", attributes: { browserName: "chrome", browserVersion: "120.0.0.0", manufacturer: "apple", model: null, operatingSystem: "macintosh", operatingSystemVersion: "10.15.7", osDeviceIds: [] }, deviceFamily: "browser", deviceLanguage: "en", deviceProfile: "macosx" } } });
  const rBam = await sd_httpPost("https://disney.api.edge.bamgrid.com/graph/v1/device/graphql", headers, body);
  if (!rBam.ok || rBam.status !== 200) return sd_renderShort({ name: SD_I18N().disney, ok: true, cc: homeCC || (await sd_queryLandingCCMulti()) || "", tag: "" });
  const d = safeJSON(rBam.data, {}); if (d?.errors) return sd_renderShort({ name: SD_I18N().disney, ok: true, cc: homeCC || (await sd_queryLandingCCMulti()) || "", tag: "" });
  const inLoc = d?.extensions?.sdk?.session?.inSupportedLocation; const bamCC = d?.extensions?.sdk?.session?.location?.countryCode; const blocked = (inLoc === false); const cc = blocked ? "" : ((bamCC || homeCC || (await sd_queryLandingCCMulti()) || "").toUpperCase());
  return sd_renderShort({ name: SD_I18N().disney, ok: !blocked, cc, tag: blocked ? t("regionBlocked") : "" });
}
async function sd_testHuluUS() { const r = await sd_httpGet("https://www.hulu.com/", {}, true); if (!r.ok) return sd_renderShort({ name: SD_I18N().huluUS, ok: false, cc: "", tag: t("notReachable") }); const blocked = /not\s+available\s+in\s+your\s+region/i.test(r.data || ""); return sd_renderShort({ name: SD_I18N().huluUS, ok: !blocked, cc: blocked ? "" : "US", tag: blocked ? t("regionBlocked") : "" }); }
async function sd_testHuluJP() { const r = await sd_httpGet("https://www.hulu.jp/", { "Accept-Language": "ja" }, true); if (!r.ok) return sd_renderShort({ name: SD_I18N().huluJP, ok: false, cc: "", tag: t("notReachable") }); const blocked = /ご利用いただけません|サービスをご利用いただけません|not available/i.test(r.data || ""); return sd_renderShort({ name: SD_I18N().huluJP, ok: !blocked, cc: blocked ? "" : "JP", tag: blocked ? t("regionBlocked") : "" }); }
async function sd_testHBO() { const r = await sd_httpGet("https://www.max.com/", {}, true); if (!r.ok) return sd_renderShort({ name: SD_I18N().hbo, ok: false, cc: "", tag: t("notReachable") }); const blocked = /not\s+available\s+in\s+your\s+region|country\s+not\s+supported/i.test(r.data || ""); let cc = ""; try { const m = String(r.data || "").match(/"countryCode"\s*:\s*"([A-Z]{2})"/i); if (m) cc = m[1].toUpperCase(); } catch (_) {} if (!cc) cc = await sd_queryLandingCCMulti(); return sd_renderShort({ name: SD_I18N().hbo, ok: !blocked, cc: blocked ? "" : cc, tag: blocked ? t("regionBlocked") : "" }); }
function buildServiceTests() { return { youtube: sd_testYouTube, netflix: sd_testNetflix, disney: sd_testDisney, chatgpt_web: sd_testChatGPTWeb, chatgpt_app: sd_testChatGPTAppAPI, hulu_us: sd_testHuluUS, hulu_jp: sd_testHuluJP, hbo: sd_testHBO }; }
async function runServiceChecks() {
  const order = selectServices();
  if (!order.length) return [];
  const map = buildServiceTests();
  const results = new Array(order.length);
  let cursor = 0, inflight = 0, finished = 0, doneFlag = false;
  const finish = () => { doneFlag = true; };
  const tryLaunch = () => {
    while (!doneFlag && inflight < S().CFG.SD_CONCURRENCY && cursor < order.length) {
      if (budgetLeft() <= 320) break;
      const idx = cursor++, key = order[idx], fn = map[key];
      if (!fn) { results[idx] = { name: key, state: "blocked", icon: S().SD_ICONS.blocked, region: "—", badge: "X" }; finished++; continue; }
      inflight++;
      Promise.resolve(fn()).then((line) => { results[idx] = line; }).catch(() => { results[idx] = { name: key, state: "blocked", icon: S().SD_ICONS.blocked, region: "—", badge: "X" }; }).finally(() => { inflight--; finished++; if (finished >= order.length) finish(); else tryLaunch(); });
    }
  };
  tryLaunch();
  await withTimeout(new Promise((r) => { const tick = () => { if (doneFlag || finished >= order.length || budgetLeft() <= 260) return r(true); setTimeout(tick, 30); }; tick(); }), Math.max(800, Math.min(5200, capByBudget(5200))), false);
  finish();
  return results.filter(Boolean);
}

function txt(text, fontSize, weight, color, opts) {
  const el = { type: "text", text: String(text ?? ""), font: { size: fontSize, weight: weight || "regular" } };
  if (color) el.textColor = color;
  if (opts) for (const k in opts) el[k] = opts[k];
  return el;
}
function icon(systemName, size, tintColor, opts) {
  const el = { type: "image", src: "sf-symbol:" + systemName, width: size, height: size };
  if (tintColor) el.color = tintColor;
  if (opts) for (const k in opts) el[k] = opts[k];
  return el;
}
function hstack(children, opts) { const el = { type: "stack", direction: "row", alignItems: "center", children }; if (opts) for (const k in opts) el[k] = opts[k]; return el; }
function vstack(children, opts) { const el = { type: "stack", direction: "column", alignItems: "start", children }; if (opts) for (const k in opts) el[k] = opts[k]; return el; }
function spacer(length) { const el = { type: "spacer" }; if (length != null) el.length = length; return el; }
function divider() { return hstack([spacer()], { height: 1, backgroundColor: "rgba(255,255,255,0.08)" }); }
function pill(textValue, bg, fg) { return hstack([txt(textValue, 9, "semibold", fg || "#FFFFFF")], { padding: [3, 7, 3, 7], backgroundColor: bg, borderRadius: 99 }); }
function miniLabel(label, value) { return vstack([txt(label, 9, "medium", "rgba(255,255,255,0.45)"), txt(value || "-", 11, "semibold", "#FFFFFF", { maxLines: 1, minScale: 0.65 })], { gap: 1 }); }
function card(children, opts = {}) { return vstack(children, Object.assign({ gap: 4, padding: [8, 10, 8, 10], backgroundColor: "rgba(255,255,255,0.05)", borderRadius: 12 }, opts)); }
function headerBar(summary) {
  return hstack([
    icon(S().ICON_NAME, 14, S().ICON_COLOR),
    txt(summary.netType, 12, "bold", "#FFFFFF", { maxLines: 1, minScale: 0.58 }),
    spacer(),
    txt(summary.runAtShort, 9, "medium", "rgba(255,255,255,0.52)", { maxLines: 1, minScale: 0.7 })
  ], { gap: 6 });
}
function serviceChip(item) {
  const bg = item.state === "full" ? "rgba(52,199,89,0.18)" : item.state === "partial" ? "rgba(255,204,0,0.18)" : "rgba(255,59,48,0.18)";
  return hstack([
    txt(item.icon, 11, "regular", "#FFFFFF"),
    txt(item.name, 10, "medium", "#FFFFFF"),
    spacer(2),
    txt(item.region || "—", 9, "medium", "rgba(255,255,255,0.72)")
  ], { gap: 4, padding: [4, 6, 4, 6], backgroundColor: bg, borderRadius: 10 });
}

function blockSummary(titleText, info, opts = {}) {
  const loc = info.loc ? (S().CFG.MASK_POS ? onlyFlag(info.loc) : flagFirst(info.loc)) : "-";
  return card([
    txt(titleText, 10, "medium", "rgba(255,255,255,0.52)"),
    txt(shortIP(info.ip || ""), 12, "bold", "#FFFFFF", { maxLines: 1, minScale: 0.65 }),
    txt(loc || "-", 10, "medium", "rgba(255,255,255,0.82)", { maxLines: 1, minScale: 0.6 }),
    txt(fmtISP(info.isp || "", info.loc || "") || "-", 9, "medium", "rgba(255,255,255,0.55)", { maxLines: 1, minScale: 0.6 })
  ], opts);
}

function buildInline(summary) {
  return { type: "widget", children: [icon(S().ICON_NAME, 12, S().ICON_COLOR), txt(`${summary.netType} · ${summary.policy || "-"} · ${summary.landingLocShort || "-"}`, 11, "medium", null, { maxLines: 1, minScale: 0.65 })] };
}
function buildCircular(summary) {
  return { type: "widget", gap: 2, children: [spacer(), icon(S().ICON_NAME, 18, S().ICON_COLOR), txt(`${summary.riskValue}%`, 12, "bold", "#FFFFFF"), txt(summary.riskLineShort, 9, "medium", "rgba(255,255,255,0.75)", { maxLines: 1, minScale: 0.5 }), spacer()] };
}
function buildRect(summary) {
  return { type: "widget", gap: 2, children: [txt(summary.policyLine, 10, "bold", null, { maxLines: 1, minScale: 0.6 }), txt(`${summary.landingIpShort} · ${summary.landingLocShort}`, 10, "medium", null, { maxLines: 1, minScale: 0.6 }), txt(`${summary.riskLineShort} · ${summary.topServiceLine}`, 9, "medium", null, { maxLines: 1, minScale: 0.55 })] };
}
function buildSmall(summary) {
  return {
    type: "widget",
    padding: [12, 14, 12, 14],
    backgroundGradient: { type: "linear", colors: ["#0B1730", "#112547", "#0F1D34"], startPoint: { x: 0, y: 0 }, endPoint: { x: 1, y: 1 } },
    children: [
      headerBar(summary), spacer(6), divider(), spacer(7),
      hstack([pill(summary.policy || "-", "rgba(96,165,250,0.18)", "#BFDBFE"), spacer(), pill(summary.riskValue + "%", summary.riskValue >= 80 ? "rgba(255,59,48,0.18)" : summary.riskValue >= 50 ? "rgba(255,204,0,0.18)" : "rgba(52,199,89,0.18)", "#FFFFFF")]),
      spacer(7),
      card([
        txt(t("landing"), 10, "medium", "rgba(255,255,255,0.52)"),
        txt(summary.landingIpShort, 13, "bold", "#FFFFFF"),
        txt(summary.landingLocShort, 11, "medium", "rgba(255,255,255,0.82)", { maxLines: 1, minScale: 0.7 }),
        txt(summary.riskLine, 10, "medium", "rgba(255,255,255,0.6)", { maxLines: 1, minScale: 0.65 })
      ]),
      spacer(),
      txt(summary.topServiceLine, 10, "medium", "rgba(255,255,255,0.55)", { maxLines: 1, minScale: 0.6 })
    ]
  };
}
function buildMedium(summary) {
  const hasEntrance = !!(summary.entrance && (summary.entrance.ip || summary.entrance.loc || summary.entrance.isp));
  const topCards = hasEntrance
    ? [blockSummary(t("local"), summary.local), blockSummary(t("entrance"), summary.entrance), blockSummary(t("landing"), summary.landing)]
    : [blockSummary(t("local"), summary.local, { width: 148 }), blockSummary(t("landing"), summary.landing, { width: 148 })];

  const serviceBlock = vstack([
    txt(t("services"), 10, "medium", "rgba(255,255,255,0.52)"),
    hstack(summary.serviceChips.slice(0, 3), { gap: 6 })
  ], { gap: 6 });

  return {
    type: "widget",
    padding: [11, 13, 10, 13],
    backgroundGradient: { type: "linear", colors: ["#091425", "#10213E", "#122A4E"], startPoint: { x: 0, y: 0 }, endPoint: { x: 1, y: 1 } },
    children: [
      headerBar(summary), spacer(5), divider(), spacer(6),
      hstack(topCards, { gap: 8, alignItems: "start" }),
      spacer(7),
      hstack([
        card([
          txt(t("risk"), 10, "medium", "rgba(255,255,255,0.52)"),
          hstack([txt(`${summary.riskValue}%`, 18, "heavy", "#FFFFFF"), spacer(), pill(summary.policy || "-", "rgba(96,165,250,0.18)", "#BFDBFE")], { gap: 6 }),
          txt(summary.riskLine, 10, "medium", "rgba(255,255,255,0.68)", { maxLines: 1, minScale: 0.68 }),
          txt(summary.tunnelLine, 9, "medium", "rgba(255,255,255,0.5)", { maxLines: 1, minScale: 0.68 })
        ], { width: 116, gap: 2 }),
        serviceBlock
      ], { gap: 8, alignItems: "start" })
    ]
  };
}
function buildLarge(summary) {
  const serviceRows = [];
  for (let i = 0; i < summary.services.length; i += 2) {
    serviceRows.push(hstack(summary.services.slice(i, i + 2).map(serviceChip), { gap: 6 }));
  }
  const hasEntrance = !!(summary.entrance && (summary.entrance.ip || summary.entrance.loc || summary.entrance.isp));
  const topCards = hasEntrance
    ? [blockSummary(t("local"), summary.local), blockSummary(t("entrance"), summary.entrance), blockSummary(t("landing"), summary.landing)]
    : [blockSummary(t("local"), summary.local, { width: 170 }), blockSummary(t("landing"), summary.landing, { width: 170 })];
  return {
    type: "widget",
    padding: [12, 14, 12, 14],
    backgroundGradient: { type: "linear", colors: ["#081220", "#0F1F38", "#15325C"], startPoint: { x: 0, y: 0 }, endPoint: { x: 0.95, y: 1 } },
    children: [
      headerBar(summary), spacer(6), divider(), spacer(7),
      hstack(topCards, { gap: 8, alignItems: "start" }),
      spacer(8),
      hstack([
        card([
          txt(t("risk"), 10, "medium", "rgba(255,255,255,0.52)"),
          hstack([txt(`${summary.riskValue}%`, 20, "heavy", "#FFFFFF"), spacer(), pill(summary.policy || "-", "rgba(96,165,250,0.18)", "#BFDBFE")]),
          txt(summary.riskLine, 11, "medium", "rgba(255,255,255,0.78)", { maxLines: 1 }),
          txt(summary.tunnelLine, 10, "medium", "rgba(255,255,255,0.55)", { maxLines: 1 }),
          txt(summary.hintLine, 9, "medium", "rgba(255,255,255,0.45)", { maxLines: 2, minScale: 0.65 })
        ], { width: 150, gap: 3 }),
        vstack([txt(t("services"), 10, "medium", "rgba(255,255,255,0.52)"), ...serviceRows], { gap: 6 })
      ], { gap: 8, alignItems: "start" })
    ]
  };
}
function buildExtraLarge(summary) { return buildLarge(summary); }
function errorWidget(msg) {
  return { type: "widget", padding: 16, backgroundColor: "#1A1A2E", children: [icon("wifi.exclamationmark", 26, "#FF3B30"), txt(t("title"), 14, "bold", "#FFFFFF"), txt(msg, 11, "medium", "#FCA5A5", { maxLines: 5, minScale: 0.6 })] };
}

function summarize(local, entrance, landing, risk, services) {
  const topService = services.filter(Boolean).slice(0, 4);
  return {
    netType: netTypeLine(),
    runAtShort: now().slice(6),
    policy: S().CFG.PROXY_POLICY || "-",
    policyLine: `${t("policy")}: ${S().CFG.PROXY_POLICY || "-"}`,
    local,
    entrance,
    landing,
    riskValue: Number(risk?.riskValue || 0),
    riskLine: `${risk?.lineType || "-"} · ${risk?.nativeHint || "-"}`,
    riskLineShort: `${risk?.lineType || "-"}`,
    tunnelLine: `${risk?.tunnelHint || "-"}`,
    hintLine: entrance?.ip ? `${t("runAt")}: ${now()}` : t("noEntranceHint"),
    landingIpShort: shortIP(landing?.ip || ""),
    landingLocShort: landing?.loc ? (S().CFG.MASK_POS ? onlyFlag(landing.loc) : flagFirst(landing.loc)) : "-",
    topServiceLine: topService.length ? topService.map(x => `${x.icon}${x.name.replace(/\(.+?\)/g, "")}`).join(" · ") : "-",
    services,
    serviceChips: topService.map(serviceChip)
  };
}

async function runMain(ctx) {
  G = buildState(ctx);
  log("info", "Start", JSON.stringify({ family: ctx.widgetFamily || "systemMedium", budget: S().BUDGET_MS }));

  const hasV6Local = !!ctx.device?.ipv6?.address;
  const ipv6Eff = !!S().CFG.IPv6 && hasV6Local;

  const [cn, probe, services] = await Promise.all([
    getDirectV4(S().CFG.DOMESTIC_IPv4).catch(() => ({})),
    probeLandingV6(S().CFG.LANDING_IPv6).catch(() => ({ ok: false, ip: "" })),
    runServiceChecks().catch(() => [])
  ]);

  const cn6 = ipv6Eff ? await getDirectV6(S().CFG.DOMESTIC_IPv6).catch(() => ({})) : {};
  const landing = await getLandingV4(S().CFG.LANDING_IPv4).catch(() => ({}));
  const landing6 = (probe.ok && probe.ip) ? { ip: probe.ip } : {};

  const entrance = { ip: S().CFG.ENTRANCE4 || S().CFG.ENTRANCE6 || "", loc: "", isp: "" };
  const rdnsHost = await queryPTRMaybe(landing.ip).catch(() => "");
  const risk = calculateRiskValueSafe(landing.isp, landing.org, landing.country, landing.as || landing.asn || "", rdnsHost);

  const localBlock = { ip: cn.ip || cn6.ip || ctx.device?.ipv4?.address || "", loc: cn.loc || "", isp: cn.isp || "" };
  const entranceBlock = { ip: S().CFG.ENTRANCE4 || S().CFG.ENTRANCE6 || "", loc: S().CFG.ENTRANCE4 || S().CFG.ENTRANCE6 ? (S().CFG.SD_LANG === "zh-Hant" ? "請手動維護" : "请手动维护") : "", isp: S().CFG.PROXY_POLICY || "" };
  const landingBlock = { ip: landing.ip || landing6.ip || "", loc: landing.loc || "", isp: landing.isp || "" };

  const summary = summarize(localBlock, entranceBlock, landingBlock, risk, services);

  const family = ctx.widgetFamily || "systemMedium";
  const builders = {
    accessoryInline: buildInline,
    accessoryCircular: buildCircular,
    accessoryRectangular: buildRect,
    systemSmall: buildSmall,
    systemMedium: buildMedium,
    systemLarge: buildLarge,
    systemExtraLarge: buildExtraLarge
  };
  const widget = (builders[family] || buildMedium)(summary);
  widget.refreshAfter = new Date(Date.now() + Math.max(60, Number(S().CFG.Update) || 10) * 1000).toISOString();
  return widget;
}

export default async function(ctx) {
  try {
    return await runMain(ctx);
  } catch (err) {
    const msg = String(err && err.stack ? err.stack : err);
    try { console.log(msg); } catch (_) {}
    return errorWidget(msg.slice(0, 300));
  }
}
