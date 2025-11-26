/* =========================================================
 * 模块：网络信息 + 服务检测（BoxJS / Surge / Loon / QuanX / Egern 兼容）
 * 作者：ByteValley
 * 版本：2025-11-27R1
 *
 * 概述 · 功能边界
 *  · 展示本地 / 入口 / 落地网络信息（IPv4/IPv6），并并发检测常见服务解锁状态
 *  · 标题显示网络类型；正文首行显示 执行时间 与 代理策略（紧邻）
 *  · Netflix 区分“完整/自制剧”；其他服务统一“已解锁/不可达”
 *  · 台湾旗样式可切换：TW_FLAG_MODE = 0(🇨🇳) / 1(🇹🇼) / 2(🇼🇸)
 *
 * 运行环境 · 依赖接口
 *  · 兼容：Surge（Panel/Script）、Loon、Quantumult X、Egern、BoxJS
 *  · 依赖：$httpClient / $httpAPI / $persistentStore|$prefs / $notification / $network
 *
 * 渲染结构 · 版式控制
 *  · 分组子标题：本地 / 入口 / 落地 / 服务检测；组间留白由 GAP_LINES 控制（0~2）
 *  · IPv4/IPv6 分行显示，按 MASK_IP 可脱敏；位置按 MASK_POS 可脱敏（未显式设置时随 MASK_IP）
 *  · 子标题样式由 SUBTITLE_STYLE 控制；SUBTITLE_MINIMAL 可输出极简标题
 *
 * 数据源 · 抓取策略（并发 race）
 *  · 直连 IPv4：多源并发 race（最快成功 + 城市级优先）
 *  · 直连 IPv6：先快速探测“是否存在 IPv6 出口”，无出口则放弃外网 v6（仍显示本地 v6）
 *  · 落地 IPv4/IPv6：多源并发 race（最快成功；IPv4 可城市级优先）
 *
 * 入口 · 策略名获取（稳态）
 *  · 预触发一次落地端点（v4/v6），确保代理产生可被记录的外连请求
 *  · 扫描 /v1/requests/recent 捕获入口 IPv4/IPv6 与 policyName；必要时用任意代理请求兜底
 *  · 入口定位：多源并发 race（取最快成功 + 城市级优先），TTL 跟 Update 联动
 *
 * 服务检测 · 显示风格
 *  · 覆盖：YouTube / Netflix / Disney+ / Hulu(美) / Hulu(日) / Max(HBO) / ChatGPT Web / ChatGPT App(API)
 *  · 样式：SD_STYLE = icon|text；SD_REGION_MODE = full|abbr|flag；SD_ICON_THEME = check|lock|circle
 *  · ChatGPT App(API) 地区优先读 Cloudflare 头（CF-IPCountry），无则多源回退
 *
 * 参数 · 默认值 & 取值优先级（重要）
 *  · 单值参数：arguments（显式改动） > BoxJS > 默认（默认参数=脚本默认）
 *  · 超时统一为“秒”：只认 Timeout 与 SD_TIMEOUT（单位秒），不再读取/兼容 SD_TIMEOUT_MS
 *  · 请求级超时会按“脚本剩余预算”自动 clamp，避免撑爆 Surge timeout
 * ========================================================= */

// ====================== 常量 & 配置基线 ======================
const CONSTS = Object.freeze({
  MAX_RECENT_REQ: 160,
  PRETOUCH_TO_MS: 700,
  RETRY_DELAY_MS: 220,
  SD_MIN_TIMEOUT_SEC: 2,
  LOG_RING_MAX: 140,
  DEBUG_TAIL_LINES: 18,

  BUDGET_GUARD_MS: 320,          // 自动预算预留（避免贴边超时）
  REQ_MIN_MS: 220,               // 单请求最小 timeout（clamp 下限）
  RACE_GRACE_MS: 260,            // 非“优选”命中后的等候窗口（用于城市级优先）
  V6_PROBE_MS: 900,              // IPv6 出口探测窗口（快速判定无出口）
  ENT_MIN_TTL: 30,
  ENT_MAX_TTL: 3600
});

/* ===== 语言字典（固定 UI 词收口）===== */
const SD_STR = {
  "zh-Hans": {
    panelTitle: "网络信息 𝕏",
    wifi: "Wi-Fi",
    cellular: "蜂窝网络",
    unknownNet: "网络 | 未知",
    gen: (g, r) => `${g ? `${g} - ${r}` : r}`,
    policy: "代理策略",
    ip: "IP",
    entrance: "入口",
    landingIP: "落地 IP",
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
    debug: "调试",
    noV6Egress: "无 IPv6 出口"
  },
  "zh-Hant": {
    panelTitle: "網路資訊 𝕏",
    wifi: "Wi-Fi",
    cellular: "行動服務",
    unknownNet: "網路 | 未知",
    gen: (g, r) => `${g ? `${g} - ${r}` : r}`,
    policy: "代理策略",
    ip: "IP",
    entrance: "入口",
    landingIP: "落地 IP",
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
    debug: "除錯",
    noV6Egress: "無 IPv6 出口"
  }
};

/** 取词工具（注意：依赖后面的 SD_LANG 常量，但不会在定义前调用） */
function t(key, ...args) {
  const lang = (typeof SD_LANG === "string" ? SD_LANG : "zh-Hans");
  const pack = SD_STR[lang] || SD_STR["zh-Hans"];
  const v = pack[key];
  if (typeof v === "function") return v(...args);
  return v != null ? v : key;
}

// ====================== 运行环境适配层 ======================
const KVStore = (() => {
  if (typeof $prefs !== "undefined" && $prefs.valueForKey) {
    return { read: (k) => $prefs.valueForKey(k), write: (v, k) => $prefs.setValueForKey(v, k) };
  }
  if (typeof $persistentStore !== "undefined" && $persistentStore.read) {
    return { read: (k) => $persistentStore.read(k), write: (v, k) => $persistentStore.write(v, k) };
  }
  try {
    if (typeof localStorage !== "undefined") {
      return { read: (k) => localStorage.getItem(k), write: (v, k) => localStorage.setItem(k, v) };
    }
  } catch (_) {}
  return { read: () => null, write: () => {} };
})();

// ====================== 启动阶段临时日志（专门抓 BoxJS 读写） ======================
const BOOT_DEBUG = [];
function bootLog(...args) {
  const line = "[NI][BOOT] " + args.map((x) => (typeof x === "string" ? x : JSON.stringify(x))).join(" ");
  BOOT_DEBUG.push(line);
  try { console.log(line); } catch (_) {}
}

/**
 * 读取 BoxJS 设置对象（NetworkInfo）
 * 仅关心：Panel.NetworkInfo.Settings
 */
function readBoxSettings() {
  let raw;
  try { raw = KVStore.read("Panel"); } catch (e) {
    bootLog("BoxSettings.read Panel error:", String(e));
    return {};
  }
  if (raw === null || raw === undefined || raw === "") {
    bootLog("BoxSettings.Panel.empty");
    return {};
  }
  let panel = raw;
  if (typeof raw === "string") {
    try { panel = JSON.parse(raw); } catch (e) {
      const tag = raw.length > 120 ? raw.slice(0, 120) + "…" : raw;
      bootLog("BoxSettings.Panel.parse.fail:", String(e));
      bootLog("BoxSettings.Panel.raw.snip:", tag);
      return {};
    }
  }
  if (!panel || typeof panel !== "object") {
    bootLog("BoxSettings.Panel.invalid type:", typeof panel);
    return {};
  }
  try { bootLog("BoxSettings.Panel.keys:", Object.keys(panel)); } catch (_) {}

  if (panel.NetworkInfo && panel.NetworkInfo.Settings && typeof panel.NetworkInfo.Settings === "object") {
    bootLog("BoxSettings.path: Panel.NetworkInfo.Settings");
    return panel.NetworkInfo.Settings;
  }
  if (panel.Settings && typeof panel.Settings === "object") {
    bootLog("BoxSettings.path: Panel.Settings (fallback)");
    return panel.Settings;
  }
  bootLog("BoxSettings.no NetworkInfo.Settings, use {}");
  return {};
}

const BOX = readBoxSettings();
function readBoxKey(key) {
  if (!BOX || typeof BOX !== "object") return undefined;
  if (!Object.prototype.hasOwnProperty.call(BOX, key)) return undefined;
  const v = BOX[key];
  if (v === "" || v === null || v === undefined) return undefined;
  return v;
}

// ====================== 参数解析（arguments） ======================
function parseArgs(raw) {
  if (!raw) return {};
  if (typeof raw === "object") return raw;
  if (typeof raw === "string") {
    return raw.split("&").reduce((acc, kv) => {
      if (!kv) return acc;
      const [k, v = ""] = kv.split("=");
      const key = decodeURIComponent(k || "");
      acc[key] = decodeURIComponent(String(v).replace(/\+/g, "%20"));
      return acc;
    }, {});
  }
  return {};
}
const $args = parseArgs(typeof $argument !== "undefined" ? $argument : undefined);

function readArgRaw(name) {
  try {
    if (typeof $argument === "string") {
      const re = new RegExp(`(?:^|&)${name}=([^&]*)`);
      const m = $argument.match(re);
      if (m) return decodeURIComponent(String(m[1]).replace(/\+/g, "%20"));
    }
  } catch (_) {}
  return undefined;
}

// ====================== 小工具（类型/拼接/格式） ======================
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
const joinNonEmpty = (arr, sep = " ") => arr.filter(Boolean).join(sep);

// ====================== ENV：统一参数优先级 ======================
/**
 * 优先级：
 *  1）arguments（含义上 != 默认）视为“显式改动” => 最高
 *  2）否则 BoxJS 覆盖
 *  3）否则默认（默认参数=脚本默认）
 */
function ENV(key, defVal, opt = {}) {
  const typeHint = typeof defVal;
  const argKeys = [key].concat(opt.argAlias || []);
  const boxKeys = [key].concat(opt.boxAlias || []);

  let argRaw;
  let hasArg = false;
  for (const k of argKeys) {
    if ($args && Object.prototype.hasOwnProperty.call($args, k)) {
      const v = $args[k];
      if (v !== undefined && v !== null && v !== "") { argRaw = v; hasArg = true; break; }
    }
  }

  let boxRaw;
  let hasBox = false;
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

// ====================== 统一配置对象（CFG.*） ======================
const CFG = {
  Update: toNum(ENV("Update", 10), 10),
  Timeout: toNum(ENV("Timeout", 12), 12),

  // 总执行预算（秒）：0=自动（≈Timeout - guard）
  BUDGET: toNum(ENV("BUDGET", 0), 0),

  MASK_IP: toBool(ENV("MASK_IP", true), true),

  // MASK_POS：默认 auto 跟随 MASK_IP
  MASK_POS_MODE: ENV("MASK_POS", "auto"),

  IPv6: toBool(ENV("IPv6", true), true),

  DOMESTIC_IPv4: ENV("DOMESTIC_IPv4", "ipip"),
  DOMESTIC_IPv6: ENV("DOMESTIC_IPv6", "ddnspod"),
  LANDING_IPv4: ENV("LANDING_IPv4", "ipapi"),
  LANDING_IPv6: ENV("LANDING_IPv6", "ipsb"),

  TW_FLAG_MODE: toNum(ENV("TW_FLAG_MODE", 1), 1),

  IconPreset: ENV("IconPreset", "globe"),
  Icon: ENV("Icon", "globe.asia.australia"),
  IconColor: ENV("IconColor", "#1E90FF"),

  SD_STYLE: ENV("SD_STYLE", "icon"),
  SD_SHOW_LAT: toBool(ENV("SD_SHOW_LAT", true), true),
  SD_SHOW_HTTP: toBool(ENV("SD_SHOW_HTTP", true), true),
  SD_LANG: ENV("SD_LANG", "zh-Hans"),

  // 🔥 超时统一为秒：只认 SD_TIMEOUT（秒）
  // 约定：0 或空 => 跟随 Timeout
  SD_TIMEOUT: toNum(ENV("SD_TIMEOUT", 0), 0),

  SD_REGION_MODE: ENV("SD_REGION_MODE", "full"),
  SD_ICON_THEME: ENV("SD_ICON_THEME", "check"),
  SD_ARROW: toBool(ENV("SD_ARROW", true), true),

  SERVICES_BOX_CHECKED_RAW: (() => {
    const v = readBoxKey("SERVICES");
    if (v == null) return null;
    if (Array.isArray(v)) { if (!v.length) return null; return JSON.stringify(v); }
    const s = String(v).trim();
    if (!s || s === "[]" || /^null$/i.test(s)) return null;
    return s;
  })(),
  SERVICES_BOX_TEXT: (() => {
    const v = readBoxKey("SERVICES_TEXT");
    return v != null ? String(v).trim() : "";
  })(),
  SERVICES_ARG_TEXT: (() => {
    let v = $args.SERVICES;
    if (Array.isArray(v)) return JSON.stringify(v);
    if (v == null || v === "") v = readArgRaw("SERVICES");
    return v != null ? String(v).trim() : "";
  })(),

  SUBTITLE_STYLE: ENV("SUBTITLE_STYLE", "line"),
  SUBTITLE_MINIMAL: ENV("SUBTITLE_MINIMAL", false),
  GAP_LINES: ENV("GAP_LINES", 1),

  LOG: toBool(ENV("LOG", true), true),
  LOG_LEVEL: (ENV("LOG_LEVEL", "info") + "").toLowerCase(),
  LOG_TO_PANEL: toBool(ENV("LOG_TO_PANEL", false), false),
  LOG_PUSH: toBool(ENV("LOG_PUSH", true), true)
};

// ====================== 子标题样式（与 CFG 联动） ======================
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
function normalizeSubStyle(v) {
  const k = String(v ?? "line").trim();
  return SUBTITLE_STYLES[k] ? k : "line";
}
function makeSubTitleRenderer(styleKey, minimal = false) {
  const key = normalizeSubStyle(styleKey);
  const fn = SUBTITLE_STYLES[key] || SUBTITLE_STYLES.line;
  return minimal ? (s) => String(s) : (s) => fn(String(s));
}
function pushGroupTitle(parts, title) {
  for (let i = 0; i < CFG.GAP_LINES; i++) parts.push("");
  const render = makeSubTitleRenderer(CFG.SUBTITLE_STYLE, CFG.SUBTITLE_MINIMAL);
  parts.push(render(title));
}
CFG.SUBTITLE_STYLE = normalizeSubStyle(CFG.SUBTITLE_STYLE);
CFG.SUBTITLE_MINIMAL = toBool(CFG.SUBTITLE_MINIMAL, false);
CFG.GAP_LINES = Math.max(0, Math.min(2, toNum(CFG.GAP_LINES, 1)));

// ====================== 图标 & 开关映射 ======================
const ICON_PRESET_MAP = Object.freeze({
  wifi: "wifi.router",
  globe: "globe.asia.australia",
  dots: "dot.radiowaves.left.and.right",
  antenna: "antenna.radiowaves.left.and.right",
  point: "point.3.connected.trianglepath.dotted"
});
const ICON_NAME = (CFG.Icon || "").trim() || ICON_PRESET_MAP[String(CFG.IconPreset).trim()] || "globe.asia.australia";
const ICON_COLOR = CFG.IconColor;

const MASK_IP = !!CFG.MASK_IP;
const _maskPosMode = String(CFG.MASK_POS_MODE ?? "auto").trim().toLowerCase();
CFG.MASK_POS = (_maskPosMode === "" || _maskPosMode === "auto" || _maskPosMode === "follow" || _maskPosMode === "same")
  ? MASK_IP
  : toBool(_maskPosMode, true);
const MASK_POS = !!CFG.MASK_POS;

const TW_FLAG_MODE = Number(CFG.TW_FLAG_MODE) || 0;

const DOMESTIC_IPv4 = CFG.DOMESTIC_IPv4;
const DOMESTIC_IPv6 = CFG.DOMESTIC_IPv6;
const LANDING_IPv4 = CFG.LANDING_IPv4;
const LANDING_IPv6 = CFG.LANDING_IPv6;

// ====================== 服务检测参数（秒 => ms） ======================
const SD_STYLE = (String(CFG.SD_STYLE).toLowerCase() === "text") ? "text" : "icon";
const SD_SHOW_LAT = !!CFG.SD_SHOW_LAT;
const SD_SHOW_HTTP = !!CFG.SD_SHOW_HTTP;
const SD_LANG = (String(CFG.SD_LANG).toLowerCase() === "zh-hant") ? "zh-Hant" : "zh-Hans";
const SD_REGION_MODE = ["full", "abbr", "flag"].includes(String(CFG.SD_REGION_MODE)) ? CFG.SD_REGION_MODE : "full";
const SD_ICON_THEME = ["lock", "circle", "check"].includes(String(CFG.SD_ICON_THEME)) ? CFG.SD_ICON_THEME : "check";
const SD_ARROW = !!CFG.SD_ARROW;

const SD_TIMEOUT_MS = (() => {
  const base = Math.max(1, Number(CFG.Timeout) || 8);
  const v = Number(CFG.SD_TIMEOUT) || 0;
  const sec = (v <= 0) ? base : v;
  return Math.max(CONSTS.SD_MIN_TIMEOUT_SEC, sec) * 1000;
})();

const SD_ICONS = (() => {
  switch (SD_ICON_THEME) {
    case "lock": return { full: "🔓", partial: "🔐", blocked: "🔒" };
    case "circle": return { full: "⭕️", partial: "⛔️", blocked: "🚫" };
    default: return { full: "✅", partial: "❇️", blocked: "❎" };
  }
})();

// ====================== 预算管理（全请求 clamp） ======================
const Budget = (() => {
  const t0 = Date.now();
  const timeoutMs = Math.max(1000, (Number(CFG.Timeout) || 8) * 1000);
  const total = (Number(CFG.BUDGET) > 0)
    ? Math.max(800, Number(CFG.BUDGET) * 1000)
    : Math.max(800, timeoutMs - CONSTS.BUDGET_GUARD_MS);

  const usedMs = () => Date.now() - t0;
  const remainingMs = () => Math.max(0, total - usedMs());
  const clamp = (ms, minMs = CONSTS.REQ_MIN_MS) => {
    const left = remainingMs();
    const want = Number(ms) || 0;
    const cap = Math.max(0, left - 60);
    const v = Math.min(want, cap);
    return Math.max(minMs, v);
  };
  const can = (ms) => remainingMs() > ms;

  return { total, usedMs, remainingMs, clamp, can };
})();

// ====================== 日志系统（基于 CFG） ======================
const LOG_ON = !!CFG.LOG;
const LOG_TO_PANEL = !!CFG.LOG_TO_PANEL;
const LOG_PUSH = !!CFG.LOG_PUSH;
const LOG_LEVEL = CFG.LOG_LEVEL || "info";

const LOG_LEVELS = { debug: 10, info: 20, warn: 30, error: 40 };
const LOG_THRESH = LOG_LEVELS[LOG_LEVEL] ?? 20;
const DEBUG_LINES = BOOT_DEBUG.slice();

function _maskMaybe(ip) {
  if (!ip) return "";
  if (!MASK_IP) return ip;
  if (/^\d{1,3}(?:\.\d{1,3}){3}$/.test(ip)) {
    const p = ip.split(".");
    return `${p[0]}.${p[1]}.*.*`;
  }
  if (/:/.test(ip)) {
    const p = ip.split(":");
    return joinNonEmpty([...p.slice(0, 4), "*", "*", "*", "*"], ":");
  }
  return ip;
}
function log(level, ...args) {
  if (!LOG_ON) return;
  const L = LOG_LEVELS[level] ?? 20;
  if (L < LOG_THRESH) return;
  const msg = args.map((x) => (typeof x === "string" ? x : JSON.stringify(x)));
  const line = `[NI][${level.toUpperCase()}] ${msg.join(" ")}`;
  try { console.log(line); } catch (_) {}
  DEBUG_LINES.push(line);
  if (DEBUG_LINES.length > CONSTS.LOG_RING_MAX) DEBUG_LINES.shift();
}
function logErrPush(title, body) {
  if (LOG_PUSH) $notification?.post?.(title, "", body);
  log("error", title, body);
}

// 避免打印 BoxJS 旧残留的 SD_TIMEOUT_MS（即便存在也不打印）
function sanitizeBoxForLog(obj) {
  if (!obj || typeof obj !== "object") return obj;
  const x = {};
  for (const k of Object.keys(obj)) {
    if (k === "SD_TIMEOUT_MS") continue;
    x[k] = obj[k];
  }
  return x;
}

// ====================== 基础判断 / 格式 ======================
const IPV4_RE = /^((25[0-5]|(2[0-4]|1\d|[1-9]|)\d)(\.(?!$)|$)){4}$/;
const IPV6_SRC = [
  "(([0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}|",
  "([0-9a-fA-F]{1,4}:){1,7}:|",
  "([0-9a-fA-F]{1,4}:){1,6}:[0-9a-fA-F]{1,4}|",
  "([0-9a-fA-F]{1,4}:){1,5}(:[0-9a-fA-F]{1,4}){1,2}|",
  "([0-9a-fA-F]{1,4}:){1,4}(:[0-9a-fA-F]{1,4}){1,3}|",
  "([0-9a-fA-F]{1,4}:){1,3}(:[0-9a-fA-F]{1,4}){1,4}|",
  "([0-9a-fA-F]{1,4}:){1,2}(:[0-9a-fA-F]{1,4}){1,5}|",
  "[0-9a-fA-F]{1,4}:((:[0-9a-fA-F]{1,4}){1,6})|",
  ":((:[0-9a-fA-F]{1,4}){1,7}|:)|",
  "::(ffff(:0{1,4}){0,1}:){0,1}(",
  "(25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])\\.){3,3}",
  "(25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])|",
  "([0-9a-fA-F]{1,4}:){1,4}:(",
  "(25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])\\.){3,3}",
  "(25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9]))"
].join("");
const IPV6_RE = new RegExp(`^${IPV6_SRC}$`);

function now() { return new Date().toTimeString().split(" ")[0]; }
function isIPv4(ip) { return IPV4_RE.test(ip || ""); }
function isIPv6(ip) { return IPV6_RE.test(ip || ""); }
function isIP(ip) { return isIPv4(ip) || isIPv6(ip); }

function maskIP(ip) {
  if (!ip || !MASK_IP) return ip || "";
  if (isIPv4(ip)) {
    const p = ip.split(".");
    return [p[0], p[1], "*", "*"].join(".");
  }
  if (isIPv6(ip)) {
    const p = ip.split(":");
    return [...p.slice(0, 4), "*", "*", "*", "*"].join(":");
  }
  return ip;
}
function ipLine(label, ip) { return ip ? `${label}: ${maskIP(ip)}` : null; }

// 城市级判定（用于优选）
function hasCityLevel(loc) {
  if (!loc) return false;
  try {
    const s = String(loc).replace(/^[\u{1F1E6}-\u{1F1FF}]{2}\s*/u, "").trim();
    if (/市|区|縣|县|州|市辖/.test(s)) return true;
    const parts = s.split(/\s+/).filter(Boolean);
    return parts.length >= 3;
  } catch {
    return false;
  }
}

// ====================== 国旗/位置/ISP ======================
function splitFlagRaw(s) {
  const re = /^[\u{1F1E6}-\u{1F1FF}]{2}\s*/u;
  const m = String(s || "").match(re);
  let flag = m ? m[0] : "";
  const text = String(s || "").replace(re, "");
  if (flag.includes("🇹🇼")) {
    if (TW_FLAG_MODE === 0) flag = "🇨🇳";
    else if (TW_FLAG_MODE === 2) flag = "🇼🇸";
  }
  return { flag, text };
}
const onlyFlag = (loc) => splitFlagRaw(loc).flag || "-";
const flagFirst = (loc) => {
  const { flag, text } = splitFlagRaw(loc);
  return (flag || "") + (text || "");
};

function flagOf(code) {
  let cc = String(code || "").trim();
  if (!cc) return "";
  if (/^中国$|^CN$/i.test(cc)) cc = "CN";
  if (cc.length !== 2 || !/^[A-Za-z]{2}$/.test(cc)) return "";
  try {
    if (cc.toUpperCase() === "TW") {
      if (TW_FLAG_MODE === 0) return "🇨🇳";
      if (TW_FLAG_MODE === 2) return "🇼🇸";
    }
    return String.fromCodePoint(...[...cc.toUpperCase()].map((ch) => 127397 + ch.charCodeAt(0)));
  } catch (_) {
    return "";
  }
}

function fmtISP(isp, locStr) {
  const raw = String(isp || "").trim();
  if (!raw) return "";
  const txt = String(locStr || "");
  const isMainland = /^🇨🇳/.test(txt) || /(^|\s)中国(?!香港|澳门|台湾)/.test(txt);
  if (!isMainland) return raw;

  const norm = raw.replace(/\s*\(中国\)\s*/, "").replace(/\s+/g, " ").trim();
  const s = norm.toLowerCase();
  if (/(^|[\s-])(cmcc|cmnet|cmi)\b/.test(s) || /china\s*mobile/.test(s) || /移动/.test(norm)) return "中国移动";
  if (/(^|[\s-])(chinanet|china\s*telecom|ctcc|ct)\b/.test(s) || /电信/.test(norm)) return "中国电信";
  if (/(^|[\s-])(china\s*unicom|cncgroup|netcom)\b/.test(s) || /联通/.test(norm)) return "中国联通";
  if (/(^|[\s-])(cbn|china\s*broadcast)/.test(s) || /广电/.test(norm)) return "中国广电";
  if ((/cernet|china\s*education/).test(s) || /教育网/.test(norm)) return "中国教育网";
  if (/^中国(移动|联通|电信|广电)$/.test(norm)) return norm;
  return raw;
}

// ====================== 网络类型标题 ======================
function radioToGen(r) {
  if (!r) return "";
  const x = String(r).toUpperCase().replace(/\s+/g, "");
  const alias = { NR5G: "NR", NRSA: "NR", NRNSA: "NRNSA", LTEA: "LTE", "LTE+": "LTE", LTEPLUS: "LTE" };
  const k = alias[x] || x;
  const MAP = {
    GPRS: "2.5G",
    EDGE: "2.75G",
    CDMA1X: "2.5G",
    WCDMA: "3G",
    HSDPA: "3.5G",
    HSUPA: "3.75G",
    CDMAEVD0REV0: "3.5G",
    CDMAEVD0REVA: "3.5G",
    CDMAEVD0REVB: "3.75G",
    EHRPD: "3.9G",
    LTE: "4G",
    NRNSA: "5G",
    NR: "5G"
  };
  return MAP[k] || "";
}

function netTypeLine() {
  try {
    const n = $network || {};
    const ssid = n.wifi?.ssid;
    const bssid = n.wifi?.bssid;
    if (ssid || bssid) return `${t("wifi")} | ${ssid || "-"}`;

    const radio = (n.cellular?.radio) || (n["cellular-data"]?.radio);
    if (radio) return `${t("cellular")} | ${t("gen", radioToGen(radio), radio)}`;

    const iface = n.v4?.primaryInterface || n.v6?.primaryInterface || "";
    if (/^pdp/i.test(iface)) return `${t("cellular")} | -`;
    if (/^(en|eth|wlan)/i.test(iface)) return `${t("wifi")} | -`;
  } catch (_) {}
  return t("unknownNet");
}

function buildNetTitleHard() {
  const n = $network || {};
  const ssid = n.wifi && (n.wifi.ssid || n.wifi.bssid);
  const radio = (n.cellular && n.cellular.radio) || (n["cellular-data"] && n["cellular-data"].radio) || "";
  const iface = (n.v4 && n.v4.primaryInterface) || (n.v6 && n.v6.primaryInterface) || "";
  if (ssid) return `${t("wifi")} | ${n.wifi.ssid || "-"}`;
  if (radio) return `${t("cellular")} | ${t("gen", radioToGen(radio), radio)}`;
  if (/^pdp/i.test(iface)) return `${t("cellular")} | -`;
  if (/^(en|eth|wlan)/i.test(iface)) return `${t("wifi")} | -`;
  return t("unknownNet");
}

// ====================== HTTP 基础（全 clamp） ======================
function httpGet(url, headers = {}, timeoutMs = null, followRedirect = false) {
  return new Promise((resolve, reject) => {
    const req = { url, headers };
    if (timeoutMs != null) req.timeout = Budget.clamp(timeoutMs);
    if (followRedirect) req.followRedirect = true;

    const start = Date.now();
    $httpClient.get(req, (err, resp, body) => {
      const cost = Date.now() - start;
      if (err) {
        log("warn", "HTTP GET fail", url, "cost", cost + "ms", String(err));
        return reject(err);
      }
      const status = resp?.status || resp?.statusCode;
      log("debug", "HTTP GET", url, "status", status, "cost", cost + "ms");
      resolve({ status, headers: resp?.headers || {}, body: body || "" });
    });
  });
}

function httpPost(url, headers = {}, body = "", timeoutMs = null) {
  return new Promise((resolve, reject) => {
    const req = { url, headers, body };
    if (timeoutMs != null) req.timeout = Budget.clamp(timeoutMs);

    const start = Date.now();
    $httpClient.post(req, (err, resp, data) => {
      const cost = Date.now() - start;
      if (err) {
        log("warn", "HTTP POST fail", url, "cost", cost + "ms", String(err));
        return reject(err);
      }
      const status = resp?.status || resp?.statusCode;
      log("debug", "HTTP POST", url, "status", status, "cost", cost + "ms");
      resolve({ status, headers: resp?.headers || {}, body: data || "" });
    });
  });
}

function httpAPI(path = "/v1/requests/recent") {
  return new Promise((res) => {
    if (typeof $httpAPI === "function") {
      $httpAPI("GET", path, null, (x) => { log("debug", "httpAPI", path, "ok"); res(x); });
    } else {
      log("warn", "httpAPI not available");
      res({});
    }
  });
}

// ====================== 源常量 & 解析器 ======================
function safeJSON(s, d = {}) {
  try { return JSON.parse(s || ""); } catch { return d; }
}

// —— 直连 IPv4 源（新增：ipwho.is / ipapi.co / ifconfig.co / api.myip.com）——
const DIRECT_V4_SOURCES = Object.freeze({
  ipip: {
    url: "https://myip.ipip.net/json",
    parse: (r) => {
      const j = safeJSON(r.body, {});
      const loc = j?.data?.location || [];
      const c0 = loc[0];
      const flag = flagOf(c0 === "中国" ? "CN" : c0);
      return {
        ip: j?.data?.ip || "",
        loc: joinNonEmpty([flag, loc[0], loc[1], loc[2]], " ").replace(/\s*中国\s*/, ""),
        isp: loc[4] || ""
      };
    }
  },
  cip: {
    url: "http://cip.cc/",
    parse: (r) => {
      const b = String(r.body || "");
      const ip = (b.match(/IP.*?:\s*(\S+)/) || [])[1] || "";
      const addr = (b.match(/地址.*?:\s*(.+)/) || [])[1] || "";
      const isp = (b.match(/运营商.*?:\s*(.+)/) || [])[1] || "";
      const isCN = /中国/.test(addr);
      return {
        ip,
        loc: joinNonEmpty([flagOf(isCN ? "CN" : ""), addr.replace(/中国\s*/, "")], " "),
        isp: isp.replace(/中国\s*/, "")
      };
    }
  },
  "163": {
    url: "https://dashi.163.com/fgw/mailsrv-ipdetail/detail",
    parse: (r) => {
      const d = safeJSON(r.body, {})?.result || {};
      return {
        ip: d.ip || "",
        loc: joinNonEmpty([flagOf(d.countryCode), d.country, d.province, d.city], " ").replace(/\s*中国\s*/, ""),
        isp: d.isp || d.org || ""
      };
    }
  },
  "126": {
    url: "https://ipservice.ws.126.net/locate/api/getLocByIp",
    parse: (r) => {
      const d = safeJSON(r.body, {})?.result || {};
      return {
        ip: d.ip || "",
        loc: joinNonEmpty([flagOf(d.countrySymbol), d.country, d.province, d.city], " ").replace(/\s*中国\s*/, ""),
        isp: d.operator || ""
      };
    }
  },
  bilibili: {
    url: "https://api.bilibili.com/x/web-interface/zone",
    parse: (r) => {
      const d = safeJSON(r.body, {})?.data || {};
      const flag = flagOf(d.country === "中国" ? "CN" : d.country);
      return {
        ip: d.addr || "",
        loc: joinNonEmpty([flag, d.country, d.province, d.city], " ").replace(/\s*中国\s*/, ""),
        isp: d.isp || ""
      };
    }
  },
  pingan: {
    url: "https://rmb.pingan.com.cn/itam/mas/linden/ip/request",
    parse: (r) => {
      const d = safeJSON(r.body, {})?.data || {};
      return {
        ip: d.ip || "",
        loc: joinNonEmpty([flagOf(d.countryIsoCode), d.country, d.region, d.city], " ").replace(/\s*中国\s*/, ""),
        isp: d.isp || ""
      };
    }
  },
  ipwhois: {
    url: "https://ipwho.is/",
    parse: (r) => {
      const j = safeJSON(r.body, {});
      const cc = (j.country_code || "").toUpperCase();
      return {
        ip: j.ip || "",
        loc: joinNonEmpty([flagOf(cc), j.country, j.region, j.city], " ").replace(/\s*中国\s*/, ""),
        isp: j?.connection?.isp || j.isp || j.org || ""
      };
    }
  },
  ipapi_co: {
    url: "https://ipapi.co/json/",
    parse: (r) => {
      const j = safeJSON(r.body, {});
      return {
        ip: j.ip || "",
        loc: joinNonEmpty([flagOf(j.country_code), j.country_name, j.region, j.city], " ").replace(/\s*中国\s*/, ""),
        isp: j.org || j.asn || ""
      };
    }
  },
  ifconfig: {
    url: "https://ifconfig.co/json",
    parse: (r) => {
      const j = safeJSON(r.body, {});
      const cc = (j.country_iso || j.country_code || "").toUpperCase();
      return {
        ip: j.ip || "",
        loc: joinNonEmpty([flagOf(cc), j.country, j.region_name || j.region, j.city], " ").replace(/\s*中国\s*/, ""),
        isp: j.asn_org || j.org || ""
      };
    }
  },
  myip: {
    url: "https://api.myip.com/",
    parse: (r) => {
      const j = safeJSON(r.body, {});
      return {
        ip: j.ip || "",
        loc: joinNonEmpty([flagOf(j.cc), j.country], " "),
        isp: ""
      };
    }
  }
});

// —— 落地 IPv4 源（新增：ipwho.is / ipapi.co / ifconfig.co / api.myip.com）——
const LANDING_V4_SOURCES = Object.freeze({
  ipapi: {
    url: "http://ip-api.com/json?lang=zh-CN",
    parse: (r) => {
      const j = safeJSON(r.body, {});
      return {
        ip: j.query || "",
        loc: joinNonEmpty([flagOf(j.countryCode), j.country?.replace(/\s*中国\s*/, ""), j.regionName?.split(/\s+or\s+/)[0], j.city], " "),
        isp: j.isp || j.org || ""
      };
    }
  },
  ipsb: {
    url: "https://api-ipv4.ip.sb/geoip",
    parse: (r) => {
      const j = safeJSON(r.body, {});
      return {
        ip: j.ip || "",
        loc: joinNonEmpty([flagOf(j.country_code), j.country, j.region, j.city], " ").replace(/\s*中国\s*/, ""),
        isp: j.isp || j.organization || ""
      };
    }
  },
  ipwhois: {
    url: "https://ipwho.is/",
    parse: (r) => {
      const j = safeJSON(r.body, {});
      const cc = (j.country_code || "").toUpperCase();
      return {
        ip: j.ip || "",
        loc: joinNonEmpty([flagOf(cc), j.country, j.region, j.city], " ").replace(/\s*中国\s*/, ""),
        isp: j?.connection?.isp || j.isp || j.org || ""
      };
    }
  },
  ipapi_co: {
    url: "https://ipapi.co/json/",
    parse: (r) => {
      const j = safeJSON(r.body, {});
      return {
        ip: j.ip || "",
        loc: joinNonEmpty([flagOf(j.country_code), j.country_name, j.region, j.city], " ").replace(/\s*中国\s*/, ""),
        isp: j.org || j.asn || ""
      };
    }
  },
  ifconfig: {
    url: "https://ifconfig.co/json",
    parse: (r) => {
      const j = safeJSON(r.body, {});
      const cc = (j.country_iso || j.country_code || "").toUpperCase();
      return {
        ip: j.ip || "",
        loc: joinNonEmpty([flagOf(cc), j.country, j.region_name || j.region, j.city], " ").replace(/\s*中国\s*/, ""),
        isp: j.asn_org || j.org || ""
      };
    }
  },
  myip: {
    url: "https://api.myip.com/",
    parse: (r) => {
      const j = safeJSON(r.body, {});
      return {
        ip: j.ip || "",
        loc: joinNonEmpty([flagOf(j.cc), j.country], " "),
        isp: ""
      };
    }
  }
});

// —— IPv6 IP 端点（更多推荐源）——
const IPV6_IP_ENDPOINTS = Object.freeze({
  ddnspod: "https://ipv6.ddnspod.com",
  neu6: "https://speed.neu6.edu.cn/getIP.php",

  ipsb: "https://api-ipv6.ip.sb/ip",
  ident: "https://v6.ident.me",
  ipify: "https://api6.ipify.org",

  ipw6: "https://6.ipw.cn",
  myipla: "https://v6.myip.la/raw",
  icanhaz: "https://ipv6.icanhazip.com",
  ifconfig: "https://ifconfig.co/ip"
});

// —— 默认尝试顺序（并发 race 的候选池）——
const ORDER = Object.freeze({
  directV4: ["ipip", "cip", "163", "126", "bilibili", "pingan", "ipwhois", "ipapi_co", "ifconfig", "myip"],
  landingV4: ["ipapi", "ipsb", "ipwhois", "ipapi_co", "ifconfig", "myip"],
  v6Endpoints: ["ipsb", "ipw6", "myipla", "ipify", "ident", "icanhaz", "ifconfig", "ddnspod", "neu6"]
});

// ====================== 并发 race：最快成功 + 优选（城市级） ======================
async function raceSources(keys, map, opt = {}) {
  const tag = opt.tag || "Race";
  const prefer = opt.prefer || (() => false);      // 返回 true => 立刻命中
  const graceMs = opt.graceMs ?? CONSTS.RACE_GRACE_MS;
  const reqToMs = opt.reqToMs ?? 1200;             // 单请求 timeout（仍会被 clamp）
  const hardToMs = opt.hardToMs ?? Math.min(1600, Budget.remainingMs());

  log("info", `${tag} keys`, keys);

  let done = false;
  let firstOK = null;

  return await new Promise((resolve) => {
    const timer = setTimeout(() => {
      if (done) return;
      done = true;
      resolve(firstOK || {});
    }, Math.max(CONSTS.REQ_MIN_MS, Budget.clamp(hardToMs)));

    let pending = keys.length;
    const finish = (v) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      resolve(v || firstOK || {});
    };

    for (const k of keys) {
      const def = map[k];
      if (!def) { pending--; continue; }

      (async () => {
        const t0 = Date.now();
        try {
          const r = await httpGet(def.url, def.headers || {}, reqToMs, true);
          const out = def.parse(r) || {};
          const ok = !!out.ip;
          const cost = Date.now() - t0;

          log("debug", `${tag} try`, JSON.stringify({
            k, ok, prefer: ok ? !!prefer(out) : false,
            ip: _maskMaybe(out.ip || ""), loc: out.loc || "", isp: out.isp || "", cost_ms: cost
          }));

          if (done) return;

          if (ok && !firstOK) {
            firstOK = out;
            setTimeout(() => { if (!done) finish(firstOK); }, graceMs);
          }
          if (ok && prefer(out)) return finish(out);
        } catch (e) {
          log("warn", `${tag} fail`, k, String(e));
        } finally {
          pending--;
          if (pending <= 0 && !done) finish(firstOK || {});
        }
      })();
    }
  });
}

// ====================== IPv6：快速探测“有无出口” ======================
async function probeV6Egress() {
  if (!Budget.can(380)) return false;

  const keys = ["ipsb", "ipw6", "myipla", "ipify", "ident", "icanhaz"];
  const tasks = keys.map((k) => {
    const url = IPV6_IP_ENDPOINTS[k];
    return (async () => {
      try {
        const r = await httpGet(url, {}, CONSTS.V6_PROBE_MS, true);
        const ip = String(r.body || "").trim();
        if (isIPv6(ip)) return ip;
      } catch (_) {}
      return "";
    })();
  });

  // 并发短探测：任一成功 => 有 v6 出口
  const deadline = Date.now() + Budget.clamp(CONSTS.V6_PROBE_MS);
  let ip = "";
  while (Date.now() < deadline && !ip) {
    const r = await Promise.race(tasks.map((p) => p.then((x) => x)));
    if (isIPv6(r)) { ip = r; break; }
    break;
  }
  return !!ip;
}

async function fetchV6IP() {
  const keys = ORDER.v6Endpoints.slice();
  const reqToMs = Math.min(1400, Budget.remainingMs());
  const hardToMs = Math.min(1700, Budget.remainingMs());

  return await new Promise((resolve) => {
    let done = false;
    let first = "";
    let pending = keys.length;

    const timer = setTimeout(() => {
      if (done) return;
      done = true;
      resolve(first ? { ip: first } : {});
    }, Math.max(CONSTS.REQ_MIN_MS, Budget.clamp(hardToMs)));

    const finish = (ip) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      resolve(ip ? { ip } : {});
    };

    for (const k of keys) {
      const url = IPV6_IP_ENDPOINTS[k];
      if (!url) { pending--; continue; }

      (async () => {
        try {
          const r = await httpGet(url, {}, reqToMs, true);
          const ip = String(r.body || "").trim();
          if (!done && isIPv6(ip)) {
            if (!first) first = ip;
            finish(ip);
          }
        } catch (_) {
        } finally {
          pending--;
          if (pending <= 0 && !done) finish(first || "");
        }
      })();
    }
  });
}

// ====================== 四个对外接口（并发 race） ======================
async function getDirectV4() {
  const keys = ORDER.directV4.slice();
  // 城市级优先
  return await raceSources(keys, DIRECT_V4_SOURCES, {
    tag: "DirectV4",
    prefer: (x) => hasCityLevel(x.loc),
    reqToMs: 1200,
    hardToMs: 1700
  });
}

async function getLandingV4() {
  const keys = ORDER.landingV4.slice();
  // 这里也做城市级优先（命中则更好）
  return await raceSources(keys, LANDING_V4_SOURCES, {
    tag: "LandingV4",
    prefer: (x) => hasCityLevel(x.loc),
    reqToMs: 1300,
    hardToMs: 1800
  });
}

async function getDirectV6IfAny() {
  return await fetchV6IP();
}

async function getLandingV6IfAny() {
  return await fetchV6IP();
}

// ====================== 入口/策略（稳态获取） ======================
const ENT_SOURCES_RE = /(ip-api\.com|api[-.]ipv4\.ip\.sb|api[-.]ipv6\.ip\.sb|ipwho\.is|ipapi\.co|ifconfig\.co|api\.myip\.com|ident\.me|ipify\.org|icanhazip\.com|ipw\.cn|myip\.la)/i;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function extractIP(str) {
  const s = String(str || "").replace(/\(Proxy\)/i, "").trim();
  let m = s.match(/\[([0-9a-fA-F:]+)]/);
  if (m && isIPv6(m[1])) return m[1];
  m = s.match(/(\d{1,3}(?:\.\d{1,3}){3})/);
  if (m && isIPv4(m[1])) return m[1];
  m = s.match(/([0-9a-fA-F:]{2,})/);
  if (m && isIPv6(m[1])) return m[1];
  return "";
}

async function touchLandingOnceQuick(wantV6, v6Egress) {
  try { await httpGet("http://ip-api.com/json?lang=zh-CN", {}, CONSTS.PRETOUCH_TO_MS, true); } catch (_) {}
  if (wantV6 && v6Egress) {
    // v6 预触发只打一枪很短的
    try { await httpGet(IPV6_IP_ENDPOINTS.ipsb, {}, Math.min(CONSTS.PRETOUCH_TO_MS, CONSTS.V6_PROBE_MS), true); } catch (_) {}
  }
  log("debug", "Pre-touch landing endpoints done");
}

async function getPolicyAndEntranceBoth() {
  const data = await httpAPI("/v1/requests/recent");
  const reqs = Array.isArray(data?.requests) ? data.requests : [];
  const hits = reqs.slice(0, CONSTS.MAX_RECENT_REQ).filter((i) => ENT_SOURCES_RE.test(i.URL || ""));

  let policy = "";
  let ip4 = "", ip6 = "";
  for (const i of hits) {
    if (!policy && i.policyName) policy = i.policyName;
    const ip = extractIP(i.remoteAddress || "");
    if (!ip) continue;
    if (isIPv6(ip)) { if (!ip6) ip6 = ip; }
    else if (isIPv4(ip)) { if (!ip4) ip4 = ip; }
    if (policy && ip4 && ip6) break;
  }

  // 兜底：找任意 Proxy 请求拿 policy
  if (!policy) {
    const rs = reqs.slice(0, CONSTS.MAX_RECENT_REQ);
    const hit = rs.find((i) => /\(Proxy\)/.test(i.remoteAddress || "") && i.policyName);
    if (hit) policy = hit.policyName || "";
  }

  log("debug", "Policy/Entrance candidates", { policy, v4: _maskMaybe(ip4), v6: _maskMaybe(ip6), hits: hits.length });
  return { policyName: policy, entrance4: ip4, entrance6: ip6 };
}

// —— 入口定位缓存（按入口 IP，随 Update 联动）——
const ENT_TTL_SEC = Math.max(CONSTS.ENT_MIN_TTL, Math.min(Number(CFG.Update) || 10, CONSTS.ENT_MAX_TTL));
let ENT_CACHE = { ip: "", t: 0, data: null };

async function withRetry(fn, retry = 1, delay = CONSTS.RETRY_DELAY_MS) {
  try { return await fn(); } catch (_) {}
  for (let i = 0; i < retry; i++) {
    await sleep(delay * (i + 1));
    try { return await fn(); } catch (_) {}
  }
  throw "retry-fail";
}

// 多源入口定位（新增：ipwho.is / ipapi.co / ifconfig.co / api.myip.com）
const ENT_LOCATORS = Object.freeze({
  pingan: async (ip) => {
    const r = await httpGet("https://rmb.pingan.com.cn/itam/mas/linden/ip/request?ip=" + encodeURIComponent(ip), {}, 1400, true);
    const d = safeJSON(r.body, {})?.data || {};
    if (!d || (!d.countryIsoCode && !d.country)) throw "pingan-empty";
    return { src: "pingan", loc: joinNonEmpty([flagOf(d.countryIsoCode), d.country, d.region, d.city], " ").replace(/\s*中国\s*/, ""), isp: d.isp || "" };
  },
  ipapi: async (ip) => {
    const r = await httpGet(`http://ip-api.com/json/${encodeURIComponent(ip)}?lang=zh-CN`, {}, 1400, true);
    const j = safeJSON(r.body, {});
    if (j.status && j.status !== "success") throw "ipapi-fail";
    return { src: "ipapi", loc: joinNonEmpty([flagOf(j.countryCode), j.country?.replace(/\s*中国\s*/, ""), j.regionName?.split(/\s+or\s+/)[0], j.city], " "), isp: j.isp || j.org || j.as || "" };
  },
  ipwhois: async (ip) => {
    const r = await httpGet(`https://ipwho.is/${encodeURIComponent(ip)}`, {}, 1400, true);
    const j = safeJSON(r.body, {});
    const cc = (j.country_code || "").toUpperCase();
    if (!j || (!j.country && !cc)) throw "ipwhois-fail";
    return { src: "ipwhois", loc: joinNonEmpty([flagOf(cc), j.country, j.region, j.city], " ").replace(/\s*中国\s*/, ""), isp: j?.connection?.isp || j.isp || j.org || "" };
  },
  ipsb: async (ip) => {
    const r = await httpGet(`https://api.ip.sb/geoip/${encodeURIComponent(ip)}`, {}, 1400, true);
    const j = safeJSON(r.body, {});
    if (!j || (!j.country && !j.country_code)) throw "ipsb-fail";
    return { src: "ipsb", loc: joinNonEmpty([flagOf(j.country_code), j.country, j.region, j.city], " ").replace(/\s*中国\s*/, ""), isp: j.isp || j.organization || "" };
  },
  ipapi_co: async (ip) => {
    const r = await httpGet(`https://ipapi.co/${encodeURIComponent(ip)}/json/`, {}, 1400, true);
    const j = safeJSON(r.body, {});
    if (!j || (!j.country_code && !j.country_name)) throw "ipapi_co-fail";
    return { src: "ipapi_co", loc: joinNonEmpty([flagOf(j.country_code), j.country_name, j.region, j.city], " ").replace(/\s*中国\s*/, ""), isp: j.org || j.asn || "" };
  },
  ifconfig: async (ip) => {
    // ifconfig 不支持按 IP 查询时可能不准，作为兜底不强依赖
    const r = await httpGet("https://ifconfig.co/json", {}, 1400, true);
    const j = safeJSON(r.body, {});
    const cc = (j.country_iso || j.country_code || "").toUpperCase();
    if (!j || !j.ip) throw "ifconfig-fail";
    return { src: "ifconfig", loc: joinNonEmpty([flagOf(cc), j.country, j.region_name || j.region, j.city], " ").replace(/\s*中国\s*/, ""), isp: j.asn_org || j.org || "" };
  }
});

async function getEntranceBundle(ip) {
  const nowT = Date.now();
  const fresh = (nowT - ENT_CACHE.t) < ENT_TTL_SEC * 1000;
  if (ENT_CACHE.ip === ip && fresh && ENT_CACHE.data) {
    const left = Math.max(0, ENT_TTL_SEC * 1000 - (nowT - ENT_CACHE.t));
    log("info", "Entrance cache HIT", { ip: _maskMaybe(ip), ttl_ms_left: left });
    return ENT_CACHE.data;
  }
  log("info", "Entrance cache MISS/EXPIRED", { ip: _maskMaybe(ip) });

  const keys = ["pingan", "ipapi", "ipwhois", "ipsb", "ipapi_co", "ifconfig"];
  const preferFn = (x) => hasCityLevel(x.loc);

  // 先 race 拿“最快可用”，同时偏好城市级
  const first = await (async () => {
    const tasks = keys.map((k) => (async () => {
      const fn = ENT_LOCATORS[k];
      if (!fn) return null;
      try { return await withRetry(() => fn(ip), 1); } catch { return null; }
    })());
    const hard = Math.min(1600, Budget.remainingMs());
    let firstOK = null;
    let done = false;

    return await new Promise((resolve) => {
      const timer = setTimeout(() => { if (!done) { done = true; resolve(firstOK); } }, Math.max(CONSTS.REQ_MIN_MS, Budget.clamp(hard)));
      const finish = (v) => { if (done) return; done = true; clearTimeout(timer); resolve(v); };

      let pending = tasks.length;
      for (const p of tasks) {
        p.then((r) => {
          if (done || !r) return;
          if (!firstOK) {
            firstOK = r;
            setTimeout(() => { if (!done) finish(firstOK); }, CONSTS.RACE_GRACE_MS);
          }
          if (preferFn(r)) finish(r);
        }).finally(() => {
          pending--;
          if (pending <= 0 && !done) finish(firstOK);
        });
      }
    });
  })();

  // 再争取第二个不同源（在剩余预算允许时）
  let second = null;
  if (Budget.can(420)) {
    const remainKeys = keys.filter((k) => k !== first?.src);
    const tasks2 = remainKeys.map((k) => (async () => {
      const fn = ENT_LOCATORS[k];
      if (!fn) return null;
      try { return await withRetry(() => fn(ip), 0); } catch { return null; }
    })());
    second = await new Promise((resolve) => {
      const hard = Math.min(900, Budget.remainingMs());
      let done = false;
      const timer = setTimeout(() => { if (!done) { done = true; resolve(null); } }, Math.max(CONSTS.REQ_MIN_MS, Budget.clamp(hard)));
      const finish = (v) => { if (done) return; done = true; clearTimeout(timer); resolve(v); };

      let pending = tasks2.length;
      for (const p of tasks2) {
        p.then((r) => { if (!done && r) finish(r); }).finally(() => {
          pending--;
          if (pending <= 0 && !done) finish(null);
        });
      }
    });
  }

  const res = {
    ip,
    loc1: first?.loc || "",
    isp1: first?.isp || "",
    loc2: second?.loc || "",
    isp2: second?.isp || ""
  };

  ENT_CACHE = { ip, t: nowT, data: res };
  return res;
}

// ====================== 服务清单解析 & 检测 ======================
const SD_I18N = ({
  "zh-Hans": { youTube: "YouTube", chatgpt_app: "ChatGPT", chatgpt: "ChatGPT Web", netflix: "Netflix", disney: "Disney+", huluUS: "Hulu(美)", huluJP: "Hulu(日)", hbo: "Max(HBO)" },
  "zh-Hant": { youTube: "YouTube", chatgpt_app: "ChatGPT", chatgpt: "ChatGPT Web", netflix: "Netflix", disney: "Disney+", huluUS: "Hulu(美)", huluJP: "Hulu(日)", hbo: "Max(HBO)" }
})[SD_LANG];

const SD_ALIAS = {
  yt: "youtube", youtube: "youtube", "youtube premium": "youtube", "油管": "youtube",
  nf: "netflix", netflix: "netflix", "奈飞": "netflix", "奈飛": "netflix",
  disney: "disney", "disney+": "disney", "迪士尼": "disney",
  chatgpt: "chatgpt_app", gpt: "chatgpt_app", openai: "chatgpt_app",
  chatgpt_web: "chatgpt_web", "chatgpt-web": "chatgpt_web", "chatgpt web": "chatgpt_web", chatgptweb: "chatgpt_web",
  hulu: "hulu_us", "葫芦": "hulu_us", "葫蘆": "hulu_us", huluus: "hulu_us", hulujp: "hulu_jp",
  hbo: "hbo", max: "hbo"
};

function parseServices(raw) {
  if (raw == null) return [];
  let s = String(raw).trim();
  if (!s || s === "[]" || s === "{}" || /^null$/i.test(s) || /^undefined$/i.test(s)) return [];
  try {
    const arr = JSON.parse(s);
    if (Array.isArray(arr)) return normSvcList(arr);
  } catch {}
  const parts = s.split(/[,\uFF0C;|\/ \t\r\n]+/);
  return normSvcList(parts);
}
function normSvcList(list) {
  const out = [];
  for (let x of list) {
    let k = String(x ?? "").trim().toLowerCase();
    if (!k) continue;
    k = SD_ALIAS[k] || k;
    if (!SD_TESTS_MAP[k]) continue;
    if (!out.includes(k)) out.push(k);
  }
  return out;
}

// ✅ Services 优先级：arguments(SERVICES) 非空优先；否则 BoxJS(SERVICES 数组)；否则 BoxJS(SERVICES_TEXT)；否则默认全开
function selectServices() {
  const argList = parseServices(CFG.SERVICES_ARG_TEXT);
  if (argList.length > 0) { log("info", "Services: arguments", argList); return argList; }

  const boxCheckedList = parseServices(CFG.SERVICES_BOX_CHECKED_RAW);
  if (boxCheckedList.length > 0) { log("info", "Services: BoxJS checkbox", boxCheckedList); return boxCheckedList; }

  const boxTextList = parseServices(CFG.SERVICES_BOX_TEXT);
  if (boxTextList.length > 0) { log("info", "Services: BoxJS text", boxTextList); return boxTextList; }

  log("info", "Services: default(all)");
  return Object.keys(SD_TESTS_MAP);
}

// ====================== 服务检测 HTTP 工具（全 clamp） ======================
const sd_now = () => Date.now();
const SD_UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";
const SD_BASE_HEADERS = { "User-Agent": SD_UA, "Accept-Language": "en" };

function sd_httpGet(url, headers = {}, followRedirect = true) {
  return new Promise((resolve) => {
    const start = sd_now();
    const to = Budget.clamp(SD_TIMEOUT_MS);
    $httpClient.get({ url, headers: { ...SD_BASE_HEADERS, ...headers }, timeout: to, followRedirect }, (err, resp, data) => {
      const cost = sd_now() - start;
      if (err || !resp) {
        log("warn", "sd_httpGet FAIL", url, "cost", cost + "ms", String(err || ""));
        return resolve({ ok: false, status: 0, cost, headers: {}, data: "" });
      }
      const status = resp.status || resp.statusCode || 0;
      log("debug", "sd_httpGet OK", url, "status", status, "cost", cost + "ms");
      resolve({ ok: true, status, cost, headers: resp.headers || {}, data: data || "" });
    });
  });
}
function sd_httpPost(url, headers = {}, body = "") {
  return new Promise((resolve) => {
    const start = sd_now();
    const to = Budget.clamp(SD_TIMEOUT_MS);
    $httpClient.post({ url, headers: { ...SD_BASE_HEADERS, ...headers }, timeout: to, body }, (err, resp, data) => {
      const cost = sd_now() - start;
      if (err || !resp) {
        log("warn", "sd_httpPost FAIL", url, "cost", cost + "ms", String(err || ""));
        return resolve({ ok: false, status: 0, cost, headers: {}, data: "" });
      }
      const status = resp.status || resp.statusCode || 0;
      log("debug", "sd_httpPost OK", url, "status", status, "cost", cost + "ms");
      resolve({ ok: true, status, cost, headers: resp.headers || {}, data: data || "" });
    });
  });
}

// ====================== 台湾旗模式（服务检测渲染） ======================
function sd_flagFromCC(cc) {
  cc = (cc || "").toUpperCase();
  if (!/^[A-Z]{2}$/.test(cc)) return "";
  if (cc === "TW") {
    if (TW_FLAG_MODE === 0) return "🇨🇳";
    if (TW_FLAG_MODE === 2) return "🇼🇸";
  }
  try {
    const cps = [...cc].map((c) => 0x1F1E6 + (c.charCodeAt(0) - 65));
    return String.fromCodePoint(...cps);
  } catch {
    return "";
  }
}
const SD_CC_NAME = ({
  "zh-Hans": { CN: "中国", TW: "台湾", HK: "中国香港", MO: "中国澳门", JP: "日本", KR: "韩国", US: "美国", SG: "新加坡", MY: "马来西亚", TH: "泰国", VN: "越南", PH: "菲律宾", ID: "印度尼西亚", IN: "印度", AU: "澳大利亚", NZ: "新西兰", CA: "加拿大", GB: "英国", DE: "德国", FR: "法国", NL: "荷兰", ES: "西班牙", IT: "意大利", BR: "巴西", AR: "阿根廷", MX: "墨西哥", RU: "俄罗斯" },
  "zh-Hant": { CN: "中國", TW: "台灣", HK: "中國香港", MO: "中國澳門", JP: "日本", KR: "南韓", US: "美國", SG: "新加坡", MY: "馬來西亞", TH: "泰國", VN: "越南", PH: "菲律賓", ID: "印尼", IN: "印度", AU: "澳洲", NZ: "紐西蘭", CA: "加拿大", GB: "英國", DE: "德國", FR: "法國", NL: "荷蘭", ES: "西班牙", IT: "義大利", BR: "巴西", AR: "阿根廷", MX: "墨西哥", RU: "俄羅斯" }
})[SD_LANG];

function sd_ccPretty(cc) {
  cc = (cc || "").toUpperCase();
  const flag = sd_flagFromCC(cc);
  const name = SD_CC_NAME[cc];
  if (!cc) return "—";
  if (SD_REGION_MODE === "flag") return flag || "—";
  if (SD_REGION_MODE === "abbr") return (flag || "") + cc;
  if (flag && name) return `${flag} ${cc} | ${name}`;
  if (flag) return `${flag} ${cc}`;
  return cc;
}

const isPartial = (tag) => /自制|自製|original/i.test(String(tag || "")) || /部分/i.test(String(tag || ""));

function sd_renderLine({ name, ok, cc, cost, status, tag, state }) {
  const st = state ? state : (ok ? (isPartial(tag) ? "partial" : "full") : "blocked");
  const icon = SD_ICONS[st];
  const regionChunk = cc ? sd_ccPretty(cc) : "";
  const regionText = regionChunk || "-";

  const unlockedShort = t("unlocked");
  const blockedText = t("notReachable");

  const isNetflix = /netflix/i.test(String(name));
  const stateTextLong = (st === "full") ? t("nfFull") : (st === "partial") ? t("nfOriginals") : blockedText;
  const stateTextShort = (st === "blocked") ? blockedText : unlockedShort;
  const showTag = (isNetflix && SD_STYLE === "text" && !SD_ARROW) ? "" : (tag || "");

  if (SD_STYLE === "text" && !SD_ARROW) {
    const left = `${name}: ${isNetflix ? stateTextLong : stateTextShort}`;
    const head = `${left}，${t("region")}: ${regionText}`;
    const tail = [showTag, (SD_SHOW_LAT && cost != null) ? `${cost}ms` : "", (SD_SHOW_HTTP && status > 0) ? `HTTP ${status}` : ""].filter(Boolean).join(" ｜ ");
    return tail ? `${head} ｜ ${tail}` : head;
  }
  if (SD_STYLE === "text") {
    const left = `${name}: ${st === "full" ? t("unlocked") : st === "partial" ? t("partialUnlocked") : t("notReachable")}`;
    const head = SD_ARROW ? `${left} ➟ ${regionText}` : `${left} ｜ ${regionText}`;
    const tail = [showTag, (SD_SHOW_LAT && cost != null) ? `${cost}ms` : "", (SD_SHOW_HTTP && status > 0) ? `HTTP ${status}` : ""].filter(Boolean).join(" ｜ ");
    return tail ? `${head} ｜ ${tail}` : head;
  }

  const head = SD_ARROW ? `${icon} ${name} ➟ ${regionText}` : `${icon} ${name} ｜ ${regionText}`;
  const tail = [showTag, (SD_SHOW_LAT && cost != null) ? `${cost}ms` : "", (SD_SHOW_HTTP && status > 0) ? `HTTP ${status}` : ""].filter(Boolean).join(" ｜ ");
  return tail ? `${head} ｜ ${tail}` : head;
}

// ====================== 各服务检测 ======================
const SD_NF_ORIGINAL = "80018499";
const SD_NF_NONORIG = "81280792";
const sd_nfGet = (id) => sd_httpGet(`https://www.netflix.com/title/${id}`, {}, true);

function sd_parseNFRegion(resp) {
  try {
    const h = resp?.headers || {};
    const xo = h["x-originating-url"] || h["X-Originating-URL"] || h["X-Origining-URL"];
    if (xo) {
      const m = String(xo).match(/\/([A-Z]{2})(?:[-/]|$)/i);
      if (m) return m[1].toUpperCase();
    }
    const m2 = String(resp?.data || "").match(/"countryCode"\s*:\s*"([A-Z]{2})"/i);
    if (m2) return m2[1].toUpperCase();
  } catch (_) {}
  return "";
}

async function sd_testYouTube() {
  const r = await sd_httpGet("https://www.youtube.com/premium?hl=en", {}, true);
  if (!r.ok) return sd_renderLine({ name: SD_I18N.youTube, ok: false, cc: "", cost: r.cost, status: r.status, tag: t("notReachable") });
  let cc = "US";
  try {
    let m = r.data.match(/"countryCode":"([A-Z]{2})"/);
    if (!m) m = r.data.match(/["']GL["']\s*:\s*["']([A-Z]{2})["']/);
    if (m) cc = m[1];
  } catch (_) {}
  return sd_renderLine({ name: SD_I18N.youTube, ok: true, cc, cost: r.cost, status: r.status, tag: "" });
}

async function sd_testChatGPTWeb() {
  const r = await sd_httpGet("https://chatgpt.com/cdn-cgi/trace", {}, true);
  if (!r.ok) return sd_renderLine({ name: SD_I18N.chatgpt, ok: false, cc: "", cost: r.cost, status: r.status, tag: t("notReachable") });
  let cc = "";
  try { const m = r.data.match(/loc=([A-Z]{2})/); if (m) cc = m[1]; } catch (_) {}
  return sd_renderLine({ name: SD_I18N.chatgpt, ok: true, cc, cost: r.cost, status: r.status, tag: "" });
}

async function sd_queryLandingCCMulti() {
  // 多源回退：ip-api / ip.sb / ipwho.is / ipapi.co / ifconfig / myip
  let r = await sd_httpGet("http://ip-api.com/json", {}, true);
  if (r.ok && r.status === 200) {
    try { const j = safeJSON(r.data, {}); if (j.countryCode) return String(j.countryCode).toUpperCase(); } catch (_) {}
  }
  r = await sd_httpGet("https://api.ip.sb/geoip", {}, true);
  if (r.ok && r.status === 200) {
    try { const j = safeJSON(r.data, {}); if (j.country_code) return String(j.country_code).toUpperCase(); } catch (_) {}
  }
  r = await sd_httpGet("https://ipwho.is/", {}, true);
  if (r.ok && r.status === 200) {
    try { const j = safeJSON(r.data, {}); if (j.country_code) return String(j.country_code).toUpperCase(); } catch (_) {}
  }
  r = await sd_httpGet("https://ipapi.co/json/", {}, true);
  if (r.ok && r.status === 200) {
    try { const j = safeJSON(r.data, {}); if (j.country_code) return String(j.country_code).toUpperCase(); } catch (_) {}
  }
  r = await sd_httpGet("https://ifconfig.co/json", {}, true);
  if (r.ok && r.status === 200) {
    try { const j = safeJSON(r.data, {}); if (j.country_iso) return String(j.country_iso).toUpperCase(); } catch (_) {}
  }
  r = await sd_httpGet("https://api.myip.com/", {}, true);
  if (r.ok && r.status === 200) {
    try { const j = safeJSON(r.data, {}); if (j.cc) return String(j.cc).toUpperCase(); } catch (_) {}
  }
  return "";
}

async function sd_testChatGPTAppAPI() {
  // 不带 Key 也会返回 401，但可用于判断可达；地区优先读 CF-IPCountry
  const r = await sd_httpGet("https://api.openai.com/v1/models", {}, true);
  if (!r.ok || r.status === 0) return sd_renderLine({ name: SD_I18N.chatgpt_app, ok: false, cc: "", cost: r.cost, status: r.status, tag: t("notReachable") });

  let cc = "";
  try {
    const h = r.headers || {};
    const pick = (k) => (h[k] || h[k.toLowerCase()] || h[k.toUpperCase()]);
    cc = String(pick("cf-ipcountry") || "").toUpperCase();
    if (!/^[A-Z]{2}$/.test(cc)) cc = "";
  } catch (_) {}
  if (!cc) cc = await sd_queryLandingCCMulti();

  const ok = r.status > 0 && r.status < 500;  // 200/401 都算可达
  return sd_renderLine({ name: SD_I18N.chatgpt_app, ok, cc, cost: r.cost, status: r.status, tag: "" });
}

async function sd_testNetflix() {
  try {
    const r1 = await sd_nfGet(SD_NF_NONORIG);
    if (!r1.ok) return sd_renderLine({ name: SD_I18N.netflix, ok: false, cc: "", cost: r1.cost, status: r1.status, tag: t("fail") });
    if (r1.status === 403) return sd_renderLine({ name: SD_I18N.netflix, ok: false, cc: "", cost: r1.cost, status: r1.status, tag: t("regionBlocked") });

    if (r1.status === 404) {
      const r2 = await sd_nfGet(SD_NF_ORIGINAL);
      if (!r2.ok) return sd_renderLine({ name: SD_I18N.netflix, ok: false, cc: "", cost: r2.cost, status: r2.status, tag: t("fail") });
      if (r2.status === 404) return sd_renderLine({ name: SD_I18N.netflix, ok: false, cc: "", cost: r2.cost, status: r2.status, tag: t("regionBlocked") });
      const cc = sd_parseNFRegion(r2) || "";
      return sd_renderLine({ name: SD_I18N.netflix, ok: true, cc, cost: r2.cost, status: r2.status, tag: t("nfOriginals"), state: "partial" });
    }

    if (r1.status === 200) {
      const cc = sd_parseNFRegion(r1) || "";
      return sd_renderLine({ name: SD_I18N.netflix, ok: true, cc, cost: r1.cost, status: r1.status, tag: t("nfFull"), state: "full" });
    }

    return sd_renderLine({ name: SD_I18N.netflix, ok: false, cc: "", cost: r1.cost, status: r1.status, tag: `HTTP ${r1.status}` });
  } catch (_) {
    return sd_renderLine({ name: SD_I18N.netflix, ok: false, cc: "", cost: null, status: 0, tag: t("fail") });
  }
}

async function sd_testDisney() {
  async function home() {
    const r = await sd_httpGet("https://www.disneyplus.com/", { "Accept-Language": "en" }, true);
    if (!r.ok || r.status !== 200 || /Sorry,\s*Disney\+\s*is\s*not\s*available/i.test(r.data || "")) throw "NA";
    let cc = "";
    try {
      const m = r.data.match(/"countryCode"\s*:\s*"([A-Z]{2})"/i) || r.data.match(/data-country=["']([A-Z]{2})["']/i);
      if (m) cc = m[1];
    } catch (_) {}
    return { cc, cost: r.cost, status: r.status };
  }

  async function bam() {
    const headers = {
      "Accept-Language": "en",
      "Authorization": "ZGlzbmV5JmJyb3dzZXImMS4wLjA.Cu56AgSfBTDag5NiRA81oLHkDZfu5L3CKadnefEAY84",
      "Content-Type": "application/json",
      "User-Agent": SD_UA
    };
    const body = JSON.stringify({
      query: "mutation registerDevice($input: RegisterDeviceInput!) { registerDevice(registerDevice: $input) { grant { grantType assertion } } }",
      variables: { input: { applicationRuntime: "chrome", attributes: { browserName: "chrome", browserVersion: "120.0.0.0", manufacturer: "apple", model: null, operatingSystem: "macintosh", operatingSystemVersion: "10.15.7", osDeviceIds: [] }, deviceFamily: "browser", deviceLanguage: "en", deviceProfile: "macosx" } }
    });
    const r = await sd_httpPost("https://disney.api.edge.bamgrid.com/graph/v1/device/graphql", headers, body);
    if (!r.ok || r.status !== 200) throw "NA";
    const d = safeJSON(r.data, {});
    if (d?.errors) throw "NA";
    const inLoc = d?.extensions?.sdk?.session?.inSupportedLocation;
    const cc = d?.extensions?.sdk?.session?.location?.countryCode;
    return { inLoc, cc, cost: r.cost, status: r.status };
  }

  const timeout = (ms, code) => new Promise((_, rej) => setTimeout(() => rej(code), ms));

  try {
    const h = await Promise.race([home(), timeout(7000, "TO")]);
    const b = await Promise.race([bam(), timeout(7000, "TO")]).catch(() => ({}));
    const blocked = (b && b.inLoc === false);
    const cc = blocked ? "" : (b?.cc || h?.cc || (await sd_queryLandingCCMulti()) || "");
    return sd_renderLine({ name: SD_I18N.disney, ok: !blocked, cc, cost: (b?.cost || h?.cost || 0), status: (b?.status || h?.status || 0), tag: blocked ? t("regionBlocked") : "" });
  } catch (e) {
    const tag = (e === "TO") ? t("timeout") : t("fail");
    return sd_renderLine({ name: SD_I18N.disney, ok: false, cc: "", cost: null, status: 0, tag });
  }
}

async function sd_testHuluUS() {
  const r = await sd_httpGet("https://www.hulu.com/", {}, true);
  if (!r.ok) return sd_renderLine({ name: SD_I18N.huluUS, ok: false, cc: "", cost: r.cost, status: r.status, tag: t("notReachable") });
  const blocked = /not\s+available\s+in\s+your\s+region/i.test(r.data || "");
  return sd_renderLine({ name: SD_I18N.huluUS, ok: !blocked, cc: blocked ? "" : "US", cost: r.cost, status: r.status, tag: blocked ? t("regionBlocked") : "" });
}

async function sd_testHuluJP() {
  const r = await sd_httpGet("https://www.hulu.jp/", { "Accept-Language": "ja" }, true);
  if (!r.ok) return sd_renderLine({ name: SD_I18N.huluJP, ok: false, cc: "", cost: r.cost, status: r.status, tag: t("notReachable") });
  const blocked = /ご利用いただけません|サービスをご利用いただけません|not available/i.test(r.data || "");
  return sd_renderLine({ name: SD_I18N.huluJP, ok: !blocked, cc: blocked ? "" : "JP", cost: r.cost, status: r.status, tag: blocked ? t("regionBlocked") : "" });
}

async function sd_testHBO() {
  const r = await sd_httpGet("https://www.max.com/", {}, true);
  if (!r.ok) return sd_renderLine({ name: SD_I18N.hbo, ok: false, cc: "", cost: r.cost, status: r.status, tag: t("notReachable") });
  const blocked = /not\s+available\s+in\s+your\s+region|country\s+not\s+supported/i.test(r.data || "");
  let cc = "";
  try { const m = String(r.data || "").match(/"countryCode"\s*:\s*"([A-Z]{2})"/i); if (m) cc = m[1].toUpperCase(); } catch (_) {}
  if (!cc) cc = await sd_queryLandingCCMulti();
  return sd_renderLine({ name: SD_I18N.hbo, ok: !blocked, cc: blocked ? "" : cc, cost: r.cost, status: r.status, tag: blocked ? t("regionBlocked") : "" });
}

const SD_TESTS_MAP = {
  youtube: () => sd_testYouTube(),
  netflix: () => sd_testNetflix(),
  disney: () => sd_testDisney(),
  chatgpt_web: () => sd_testChatGPTWeb(),
  chatgpt_app: () => sd_testChatGPTAppAPI(),
  hulu_us: () => sd_testHuluUS(),
  hulu_jp: () => sd_testHuluJP(),
  hbo: () => sd_testHBO()
};

async function runServiceChecks() {
  try {
    if (!Budget.can(520)) {
      log("info", "Service checks skipped (budget low)");
      return [];
    }
    const order = selectServices();
    if (!order.length) return [];
    log("info", "Service checks start", order);
    const tasks = order.map((k) => SD_TESTS_MAP[k] && SD_TESTS_MAP[k]());
    const lines = await Promise.all(tasks);
    log("info", "Service checks done");
    return lines.filter(Boolean);
  } catch (e) {
    log("error", "Service checks error", String(e));
    return [];
  }
}

// ====================== 简→繁（仅在 zh-Hant） ======================
function zhHansToHantOnce(s) {
  if (!s) return s;
  const phraseMap = [
    ["网络", "網路"], ["蜂窝网络", "行動服務"], ["代理策略", "代理策略"],
    ["执行时间", "執行時間"], ["落地 IP", "落地 IP"], ["入口", "入口"],
    ["位置", "位置"], ["运营商", "運營商"], ["区域", "區域"],
    ["不可达", "不可達"], ["检测失败", "檢測失敗"], ["超时", "逾時"],
    ["区域受限", "區域受限"], ["已解锁", "已解鎖"], ["部分解锁", "部分解鎖"],
    ["已完整解锁", "已完整解鎖"], ["仅解锁自制剧", "僅解鎖自製劇"],
    ["中国香港", "中國香港"], ["中国澳门", "中國澳門"],
    ["中国移动", "中國移動"], ["中国联通", "中國聯通"], ["中国电信", "中國電信"],
    ["中国广电", "中國廣電"], ["中国教育网", "中國教育網"]
  ];
  for (const [hans, hant] of phraseMap) s = s.replace(new RegExp(hans, "g"), hant);
  const charMap = { "网": "網", "络": "絡", "运": "運", "营": "營", "达": "達", "检": "檢", "测": "測", "时": "時", "区": "區", "术": "術", "产": "產", "广": "廣", "电": "電", "联": "聯", "动": "動", "数": "數", "汉": "漢", "气": "氣", "历": "曆", "宁": "寧" };
  return s.replace(/[\u4E00-\u9FFF]/g, (ch) => charMap[ch] || ch);
}
function maybeTify(content) { return SD_LANG === "zh-Hant" ? zhHansToHantOnce(content) : content; }

// ====================== 启动日志 ======================
log("info", "Start", JSON.stringify({
  Update: CFG.Update,
  Timeout: CFG.Timeout,
  BUDGET: CFG.BUDGET,
  SD_TIMEOUT: CFG.SD_TIMEOUT,
  SD_STYLE,
  SD_REGION_MODE,
  TW_FLAG_MODE,
  SUBTITLE_STYLE: CFG.SUBTITLE_STYLE,
  SUBTITLE_MINIMAL: CFG.SUBTITLE_MINIMAL,
  GAP_LINES: CFG.GAP_LINES,
  Budget_total_ms: Budget.total
}));

log("info", "BoxSettings(BOX)", sanitizeBoxForLog(BOX));

// ====================== 主流程（IIFE） ======================
;(async () => {
  const wantV6 = !!CFG.IPv6;
  const hasLocalV6 = !!($network?.v6?.primaryAddress);
  const localV6 = String($network?.v6?.primaryAddress || "").trim();

  // 先快速探测 v6 出口：无出口则不做任何外网 v6 请求（仍显示本地 v6）
  const v6Egress = (wantV6 && hasLocalV6) ? await probeV6Egress().catch(() => false) : false;

  // 预触发落地端点（并发，不阻塞其它）
  const preTouch = touchLandingOnceQuick(wantV6, v6Egress).catch(() => {});

  // 直连 v4 / v6 并发 race（v6 只有在 v6Egress=true 才查外网）
  const t0 = Date.now();
  const directTasks = [
    getDirectV4().catch((e) => { log("warn", "DirectV4", String(e)); return {}; })
  ];
  if (wantV6 && v6Egress) {
    directTasks.push(getDirectV6IfAny().catch((e) => { log("warn", "DirectV6", String(e)); return {}; }));
  } else {
    directTasks.push(Promise.resolve({}));
  }
  const [cn, cn6] = await Promise.all(directTasks);
  log("info", "Direct fetched", (Date.now() - t0) + "ms", { v4: _maskMaybe(cn.ip || ""), v6: _maskMaybe(cn6.ip || "") });

  await preTouch;

  // 入口（policy + entrance ip）
  const t1 = Date.now();
  const { policyName, entrance4, entrance6 } = await getPolicyAndEntranceBoth();
  log("info", "EntranceBoth", { policy: policyName || "-", v4: _maskMaybe(entrance4 || ""), v6: _maskMaybe(entrance6 || ""), cost: (Date.now() - t1) + "ms" });

  // 入口定位（并发 race，城市级优先 + 可取第二源）
  const ent4 = isIP(entrance4 || "") ? await getEntranceBundle(entrance4).catch(() => ({ ip: entrance4 })) : {};
  const ent6 = isIP(entrance6 || "") ? await getEntranceBundle(entrance6).catch(() => ({ ip: entrance6 })) : {};

  // 落地 v4 / v6 并发（v6 只有在 v6Egress=true 才查外网）
  const t2 = Date.now();
  const landingTasks = [
    getLandingV4().catch((e) => { log("warn", "LandingV4", String(e)); return {}; })
  ];
  if (wantV6 && v6Egress) {
    landingTasks.push(getLandingV6IfAny().catch((e) => { log("warn", "LandingV6", String(e)); return {}; }));
  } else {
    landingTasks.push(Promise.resolve({}));
  }
  const [px, px6] = await Promise.all(landingTasks);
  log("info", "Landing fetched", (Date.now() - t2) + "ms", { v4: _maskMaybe(px.ip || ""), v6: _maskMaybe(px6.ip || "") });

  // 标题行
  const trial = netTypeLine() || "";
  const title = /未知|unknown/i.test(trial) ? buildNetTitleHard() : trial;

  // ====================== 渲染 ======================
  const parts = [];
  parts.push(`${t("runAt")}: ${now()}`);
  parts.push(`${t("policy")}: ${policyName || "-"}`);

  // 本地
  pushGroupTitle(parts, "本地");
  const directIPv4 = ipLine("IPv4", cn.ip);
  if (directIPv4) parts.push(directIPv4);

  // v6：有出口 => 显示外网 v6；无出口但本地有 v6 => 显示本地 v6
  let shownV6 = "";
  if (cn6.ip && isIPv6(cn6.ip)) shownV6 = cn6.ip;
  else if (hasLocalV6 && localV6) shownV6 = localV6;

  const directIPv6 = ipLine("IPv6", shownV6);
  if (directIPv6) parts.push(directIPv6);

  const directLoc = cn.loc ? (MASK_POS ? onlyFlag(cn.loc) : flagFirst(cn.loc)) : "-";
  parts.push(`${t("location")}: ${directLoc}`);
  if (cn.isp) parts.push(`${t("isp")}: ${fmtISP(cn.isp, cn.loc)}`);
  if (wantV6 && hasLocalV6 && !v6Egress) parts.push(`${t("ip")}: ${t("noV6Egress")}`);

  // 入口
  if ((ent4 && (ent4.ip || ent4.loc1 || ent4.loc2 || ent4.isp1 || ent4.isp2)) || (ent6 && ent6.ip)) {
    pushGroupTitle(parts, "入口");
    const entIPv4 = ipLine("IPv4", ent4.ip && isIPv4(ent4.ip) ? ent4.ip : "");
    const entIPv6 = ipLine("IPv6", ent6.ip && isIPv6(ent6.ip) ? ent6.ip : "");
    if (entIPv4) parts.push(entIPv4);
    if (entIPv6) parts.push(entIPv6);
    if (ent4.loc1) parts.push(`${t("location")}¹: ${flagFirst(ent4.loc1)}`);
    if (ent4.isp1) parts.push(`${t("isp")}¹: ${fmtISP(ent4.isp1, ent4.loc1)}`);
    if (ent4.loc2) parts.push(`${t("location")}²: ${flagFirst(ent4.loc2)}`);
    if (ent4.isp2) parts.push(`${t("isp")}²: ${String(ent4.isp2).trim()}`);
  }

  // 落地
  if (px.ip || px6.ip || px.loc || px.isp) {
    pushGroupTitle(parts, "落地");
    const landIPv4 = ipLine("IPv4", px.ip);
    if (landIPv4) parts.push(landIPv4);

    const landIPv6 = ipLine("IPv6", px6.ip);
    if (landIPv6) parts.push(landIPv6);

    if (px.loc) parts.push(`${t("location")}: ${flagFirst(px.loc)}`);
    if (px.isp) parts.push(`${t("isp")}: ${fmtISP(px.isp, px.loc)}`);
  }

  // 服务检测（预算不足自动跳过）
  const sdLines = await runServiceChecks();
  if (sdLines.length) {
    pushGroupTitle(parts, "服务检测");
    parts.push(...sdLines);
  }

  // 调试尾巴
  if (LOG_TO_PANEL && DEBUG_LINES.length) {
    pushGroupTitle(parts, t("debug"));
    const tail = DEBUG_LINES.slice(-CONSTS.DEBUG_TAIL_LINES).join("\n");
    parts.push(tail);
  }

  const content = maybeTify(parts.join("\n"));
  $done({ title: maybeTify(title), content, icon: ICON_NAME, "icon-color": ICON_COLOR });
})().catch((err) => {
  const msg = String(err);
  logErrPush(t("panelTitle"), msg);
  $done({ title: t("panelTitle"), content: maybeTify(msg), icon: ICON_NAME, "icon-color": ICON_COLOR });
});