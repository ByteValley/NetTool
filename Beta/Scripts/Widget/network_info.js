/* =========================================================
 * 模块分类 · 网络信息面板
 * 作者 · ByteValley
 * 版本 · 2026-03-14R1
 *
 * 模块分类 · 说明
 * · 参数优先级：
 *   env 显式设置 > BoxJS > 默认值
 * · 不再依赖 _compat.$argument / compat_arguments 作为运行时参数源
 * · 保留原脚本主要参数能力：
 *   SUBTITLE_STYLE / SUBTITLE_MINIMAL / GAP_LINES / SD_STYLE /
 *   SD_ARROW / SD_SHOW_LAT / SD_SHOW_HTTP / LOG_TO_PANEL / LOG_PUSH
 * · 保留 SERVICES 三段优先级：
 *   env > BoxJS 多选 > BoxJS 文本 > 默认全开
 * · 保留 DOMIC_IPv4 / DOMIC_IPv6 旧别名兼容（env alias）
 * · 策略 / 入口支持自动捕获（若宿主提供 recent requests 能力），否则回退手动传参
 * · 日志统一输出到宿主日志（console.log）
 * · 采用高密度日志埋点，便于在 Egern 日志页排查参数、生效顺序与请求链路
 * ========================================================= */

const CONSTS = Object.freeze({
  SD_MIN_TIMEOUT: 2000,
  V6_PROBE_TO_MS: 1200,
  BUDGET_HARD_MS: 10000,
  BUDGET_SOFT_GUARD_MS: 260,
  ENT_MIN_TTL: 30,
  ENT_MAX_TTL: 3600,
  LOG_RING_MAX: 140,
  DEBUG_TAIL_LINES: 18,
  MAX_RECENT_REQ: 150
});

const DEFAULTS = Object.freeze({
  Update: "10",
  Timeout: "14",
  BUDGET: "0",
  MASK_IP: "1",
  MASK_POS: "auto",
  IPv6: "1",
  DOMESTIC_IPv4: "ipip",
  DOMESTIC_IPv6: "ddnspod",
  LANDING_IPv4: "ipapi",
  LANDING_IPv6: "ipsb",
  TW_FLAG_MODE: "1",
  IconPreset: "globe",
  Icon: "globe.asia.australia",
  IconColor: "#1E90FF",
  SUBTITLE_STYLE: "line",
  SUBTITLE_MINIMAL: "0",
  GAP_LINES: "1",
  SD_STYLE: "icon",
  SD_LANG: "zh-Hans",
  SD_TIMEOUT: "3",
  SD_CONCURRENCY: "6",
  SD_REGION_MODE: "full",
  SD_ICON_THEME: "check",
  SD_ARROW: "1",
  SD_SHOW_LAT: "1",
  SD_SHOW_HTTP: "1",
  SERVICES: "",
  LOG: "1",
  LOG_LEVEL: "info",
  LOG_TO_PANEL: "0",
  LOG_PUSH: "1",
  PROXY_POLICY: "",
  ENTRANCE4: "",
  ENTRANCE6: "",
  WIDGET_PAGE: "summary"
});

const SD_STR = {
  "zh-Hans": {
    title: "网络信息 𝕏",
    runAt: "执行时间",
    policy: "代理策略",
    local: "本地",
    entrance: "入口",
    landing: "落地",
    location: "位置",
    isp: "运营商",
    risk: "风险",
    services: "服务检测",
    nativeLike: "更像原生",
    nonNative: "可能非原生",
    home: "家宽",
    nonHome: "非家宽",
    weakTunnel: "机房/代理特征偏弱",
    strongTunnel: "机房/代理特征偏强",
    noData: "暂无数据",
    manualPolicyHint: "未传入（请通过模块环境变量设置 PROXY_POLICY）",
    wifi: "Wi-Fi",
    cellular: "蜂窝网络",
    unknownNet: "网络 | 未知",
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
    title: "網路資訊 𝕏",
    runAt: "執行時間",
    policy: "代理策略",
    local: "本地",
    entrance: "入口",
    landing: "落地",
    location: "位置",
    isp: "運營商",
    risk: "風險",
    services: "服務檢測",
    nativeLike: "更像原生",
    nonNative: "可能非原生",
    home: "家寬",
    nonHome: "非家寬",
    weakTunnel: "機房/代理特徵偏弱",
    strongTunnel: "機房/代理特徵偏強",
    noData: "暫無資料",
    manualPolicyHint: "未傳入（請透過模組環境變數設定 PROXY_POLICY）",
    wifi: "Wi-Fi",
    cellular: "行動服務",
    unknownNet: "網路 | 未知",
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

let G = null;
function S() { return G; }

function t(key) {
  const pack = SD_STR[S()?.CFG?.SD_LANG || "zh-Hans"] || SD_STR["zh-Hans"];
  return pack[key] != null ? pack[key] : key;
}

function safeJSON(s, d = {}) {
  try { return JSON.parse(s || ""); } catch (_) { return d; }
}
function toBool(v, d = false) {
  if (v == null || v === "") return d;
  if (typeof v === "boolean") return v;
  const s = String(v).trim().toLowerCase();
  if (["1", "true", "on", "yes", "y"].includes(s)) return true;
  if (["0", "false", "off", "no", "n"].includes(s)) return false;
  return d;
}
function toNum(v, d) {
  if (v == null || v === "") return d;
  const n = Number(v);
  return Number.isFinite(n) ? n : d;
}
function clamp(n, min, max) { return Math.max(min, Math.min(max, n)); }
function joinNonEmpty(arr, sep = " ") { return arr.filter(Boolean).join(sep); }
function pad2(n) { return String(n).padStart(2, "0"); }
function nowStr() {
  const d = new Date();
  return `${pad2(d.getMonth() + 1)}-${pad2(d.getDate())} ${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}`;
}
function textOrDash(v) {
  const s = String(v == null ? "" : v).trim();
  return s || "-";
}
function parseCompatArgument(raw) {
  const out = {};
  const src = String(raw == null ? "" : raw).trim();
  if (!src) return out;

  for (const part of src.split("&")) {
    if (!part) continue;
    const idx = part.indexOf("=");
    let k = "";
    let v = "";

    if (idx === -1) {
      k = part.trim();
      v = "";
    } else {
      k = part.slice(0, idx).trim();
      v = part.slice(idx + 1).trim();
    }

    if (!k) continue;

    try { k = decodeURIComponent(k); } catch (_) {}
    try { v = decodeURIComponent(v); } catch (_) {}

    out[k] = v;
  }

  return out;
}

const KVCompat = {
  async read(ctx, key) {
    try {
      if (ctx.storage?.get) return await ctx.storage.get(key);
    } catch (_) {}
    try {
      const v = ctx.storage?.getJSON?.(key);
      if (typeof v === "string") return v;
    } catch (_) {}
    return null;
  },
  async readJSON(ctx, key) {
    try {
      if (ctx.storage?.getJSON) {
        const v = await ctx.storage.getJSON(key);
        if (v != null) return v;
      }
    } catch (_) {}
    try {
      const raw = await this.read(ctx, key);
      return safeJSON(raw, null);
    } catch (_) {}
    return null;
  }
};

async function readBoxSettings(ctx) {
  const panel = await KVCompat.readJSON(ctx, "Panel");
  if (!panel || typeof panel !== "object") return {};
  if (panel.NetworkInfo && panel.NetworkInfo.Settings && typeof panel.NetworkInfo.Settings === "object") {
    return panel.NetworkInfo.Settings;
  }
  if (panel.Settings && typeof panel.Settings === "object") {
    return panel.Settings;
  }
  return {};
}

function buildENV(ctx, box) {
  const directEnv = ctx?.env || {};

  const compatArgumentRaw =
    directEnv?._compat?.$argument ??
    directEnv?.["$argument"] ??
    directEnv?.["_compat.$argument"] ??
    "";

  const compatEnv = parseCompatArgument(compatArgumentRaw);

  function pickByKeys(container, keys) {
    for (const k of keys) {
      const v = container?.[k];
      if (v !== undefined && v !== null && v !== "") {
        return { hit: true, key: k, value: v };
      }
    }
    return { hit: false, key: "", value: undefined };
  }

  const readWithMeta = (key, defVal, opt = {}) => {
    const typeHint = typeof defVal;
    const envKeys = [key].concat(opt.envAlias || []);
    const boxKeys = [key].concat(opt.boxAlias || []);

    const envHit = pickByKeys(directEnv, envKeys);
    const compatHit = pickByKeys(compatEnv, envKeys);
    const boxHit = pickByKeys(box, boxKeys);

    const convert = (val) => {
      if (typeHint === "boolean") return toBool(val, defVal);
      if (typeHint === "number") return toNum(val, defVal);
      return val;
    };

    if (envHit.hit) return { value: convert(envHit.value), source: `env:${envHit.key}`, raw: envHit.value };
    if (compatHit.hit) return { value: convert(compatHit.value), source: `compat:${compatHit.key}`, raw: compatHit.value };
    if (boxHit.hit) return { value: convert(boxHit.value), source: `box:${boxHit.key}`, raw: boxHit.value };
    return { value: defVal, source: "default", raw: defVal };
  };

  const read = (key, defVal, opt = {}) => readWithMeta(key, defVal, opt).value;

  return {
    read,
    readWithMeta,
    directEnv,
    compatEnv,
    compatArgumentRaw
  };
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
  for (let i = 0; i < (S().CFG.GAP_LINES || 0); i++) parts.push("");
  const render = makeSubTitleRenderer(S().CFG.SUBTITLE_STYLE, S().CFG.SUBTITLE_MINIMAL);
  parts.push(render(title));
}

function buildCFG(ctx, box) {
  const ENV = buildENV(ctx, box);
  const SRC = {};

  const pick = (key, defVal, opt = {}) => {
    const meta = ENV.readWithMeta(key, defVal, opt);
    SRC[key] = meta.source;
    return meta.value;
  };

  const cfg = {
    Update: toNum(pick("Update", 10), 10),
    Timeout: toNum(pick("Timeout", 12), 12),
    BUDGET_SEC_RAW: pick("BUDGET", 0),

    MASK_IP: toBool(pick("MASK_IP", true), true),
    MASK_POS_MODE: pick("MASK_POS", "auto"),
    IPv6: toBool(pick("IPv6", true), true),

    DOMESTIC_IPv4: (() => {
      const v = pick("DOMESTIC_IPv4", "ipip", { envAlias: ["DOMIC_IPv4"] });
      return v !== "" && v != null ? v : "ipip";
    })(),
    DOMESTIC_IPv6: (() => {
      const v = pick("DOMESTIC_IPv6", "ddnspod", { envAlias: ["DOMIC_IPv6"] });
      return v !== "" && v != null ? v : "ddnspod";
    })(),

    LANDING_IPv4: pick("LANDING_IPv4", "ipapi"),
    LANDING_IPv6: pick("LANDING_IPv6", "ipsb"),
    TW_FLAG_MODE: toNum(pick("TW_FLAG_MODE", 1), 1),

    IconPreset: pick("IconPreset", "globe"),
    Icon: pick("Icon", ""),
    IconColor: pick("IconColor", "#1E90FF"),

    SUBTITLE_STYLE: pick("SUBTITLE_STYLE", "line"),
    SUBTITLE_MINIMAL: toBool(pick("SUBTITLE_MINIMAL", false), false),
    GAP_LINES: Math.max(0, Math.min(2, toNum(pick("GAP_LINES", 1), 1))),

    SD_STYLE: pick("SD_STYLE", "icon"),
    SD_LANG: String(pick("SD_LANG", "zh-Hans")).toLowerCase() === "zh-hant" ? "zh-Hant" : "zh-Hans",
    SD_TIMEOUT_SEC_RAW: pick("SD_TIMEOUT", 0),
    SD_CONCURRENCY: clamp(toNum(pick("SD_CONCURRENCY", 6), 6), 1, 8),
    SD_REGION_MODE: pick("SD_REGION_MODE", "full"),
    SD_ICON_THEME: pick("SD_ICON_THEME", "check"),
    SD_ARROW: toBool(pick("SD_ARROW", true), true),
    SD_SHOW_LAT: toBool(pick("SD_SHOW_LAT", true), true),
    SD_SHOW_HTTP: toBool(pick("SD_SHOW_HTTP", true), true),

    LOG: toBool(pick("LOG", true), true),
    LOG_LEVEL: String(pick("LOG_LEVEL", "info")).toLowerCase(),
    LOG_TO_PANEL: toBool(pick("LOG_TO_PANEL", false), false),
    LOG_PUSH: toBool(pick("LOG_PUSH", true), true),

    PROXY_POLICY: String(pick("PROXY_POLICY", "")).trim(),
    ENTRANCE4: String(pick("ENTRANCE4", "")).trim(),
    ENTRANCE6: String(pick("ENTRANCE6", "")).trim(),
    
    WIDGET_PAGE: String(pick("WIDGET_PAGE", DEFAULTS.WIDGET_PAGE)).trim().toLowerCase()
  };

  const servicesEnvMeta = (() => {
    const m = ENV.readWithMeta("SERVICES", "");
    const s = m.value != null ? String(m.value).trim() : "";
    return { value: s, source: s ? m.source : "default" };
  })();

  const servicesBoxCheckedMeta = (() => {
    const v = box?.SERVICES;
    if (v == null) return { value: null, source: "default" };
    if (Array.isArray(v)) return { value: v.length ? JSON.stringify(v) : null, source: "box:SERVICES" };
    const s = String(v).trim();
    return { value: s && s !== "[]" ? s : null, source: s ? "box:SERVICES" : "default" };
  })();

  const servicesBoxTextMeta = (() => {
    const v = box?.SERVICES_TEXT != null ? String(box.SERVICES_TEXT).trim() : "";
    return { value: v, source: v ? "box:SERVICES_TEXT" : "default" };
  })();

  cfg.SERVICES_ENV_TEXT = servicesEnvMeta.value;
  cfg.SERVICES_BOX_CHECKED_RAW = servicesBoxCheckedMeta.value;
  cfg.SERVICES_BOX_TEXT = servicesBoxTextMeta.value;
  cfg.SERVICES_SOURCE = servicesEnvMeta.value
    ? servicesEnvMeta.source
    : servicesBoxCheckedMeta.value
      ? servicesBoxCheckedMeta.source
      : servicesBoxTextMeta.value
        ? servicesBoxTextMeta.source
        : "default";

  cfg.SOURCE_MAP = SRC;

  const baseSec = Number(cfg.Timeout) || 8;
  const secRaw = Number(cfg.SD_TIMEOUT_SEC_RAW);
  cfg.SD_TIMEOUT_MS = Math.max(
    CONSTS.SD_MIN_TIMEOUT,
    ((Number.isFinite(secRaw) && secRaw > 0) ? secRaw : baseSec) * 1000
  );

  cfg.BUDGET_MS = (() => {
    const raw = Number(cfg.BUDGET_SEC_RAW);
    const base = Math.max(1, Number(cfg.Timeout) || 8) * 1000;
    if (Number.isFinite(raw) && raw > 0) return Math.max(3500, raw * 1000);
    return Math.min(CONSTS.BUDGET_HARD_MS, Math.max(5500, base));
  })();

  cfg.MASK_POS = ["", "auto", "follow", "same"].includes(String(cfg.MASK_POS_MODE).trim().toLowerCase())
    ? cfg.MASK_IP
    : toBool(cfg.MASK_POS_MODE, true);

  cfg.SUBTITLE_STYLE = normalizeSubStyle(cfg.SUBTITLE_STYLE);

  cfg.ICON_NAME = String(cfg.Icon || "").trim() || ({
    wifi: "wifi.router",
    globe: "globe.asia.australia",
    dots: "dot.radiowaves.left.and.right",
    antenna: "antenna.radiowaves.left.and.right",
    point: "point.3.connected.trianglepath.dotted"
  }[String(cfg.IconPreset).trim()] || "globe.asia.australia");

  cfg.ENV_DIRECT = ENV.directEnv || {};
  cfg.COMPAT_ARGUMENT_RAW = ENV.compatArgumentRaw || "";
  cfg.COMPAT_ARGUMENT_PARSED = ENV.compatEnv || {};

  return cfg;
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
function onlyFlag(loc) { return splitFlagRaw(loc).flag || "-"; }
function flagFirst(loc) {
  const x = splitFlagRaw(loc);
  return (x.flag || "") + (x.text || "");
}
function flagOf(code) {
  let cc = String(code || "").trim();
  if (!cc) return "";
  if (/^中国$|^CN$/i.test(cc)) cc = "CN";
  if (!/^[A-Za-z]{2}$/.test(cc)) return "";
  try {
    if (cc.toUpperCase() === "TW") {
      if (S().CFG.TW_FLAG_MODE === 0) return "🇨🇳";
      if (S().CFG.TW_FLAG_MODE === 2) return "🇼🇸";
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
  const hant = S().CFG.SD_LANG === "zh-Hant";

  if (/(^|[\s-])(cmcc|cmnet|cmi)\b/.test(s) || /china\s*mobile/.test(s) || /移动/.test(norm)) return hant ? "中國移動" : "中国移动";
  if (/(^|[\s-])(chinanet|china\s*telecom|ctcc|ct)\b/.test(s) || /电信/.test(norm)) return hant ? "中國電信" : "中国电信";
  if (/(^|[\s-])(china\s*unicom|cncgroup|netcom)\b/.test(s) || /联通/.test(norm)) return hant ? "中國聯通" : "中国联通";
  if (/(^|[\s-])(cbn|china\s*broadcast)/.test(s) || /广电/.test(norm)) return hant ? "中國廣電" : "中国广电";
  if (/cernet|china\s*education/.test(s) || /教育网/.test(norm)) return hant ? "中國教育網" : "中国教育网";

  return raw;
}

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
    EHRPD: "3.9G",
    LTE: "4G",
    NRNSA: "5G",
    NR: "5G"
  };
  return MAP[k] || "";
}

function netTypeLine() {
  const n = S().RT.device || {};
  const ssid = n.wifi?.ssid;
  if (ssid) return `${t("wifi")} | ${ssid}`;
  const radio = n.cellular?.radio;
  if (radio) return `${t("cellular")} | ${radioToGen(radio) || radio}`;
  const iface = n.ipv4?.interface || n.ipv6?.interface || "";
  if (/^pdp/i.test(iface)) return `${t("cellular")} | -`;
  if (/^(en|eth|wlan)/i.test(iface)) return `${t("wifi")} | -`;
  return t("unknownNet");
}

function logCfgSources(cfg) {
  try {
    log("info", "cfg-source", {
      Update: cfg?.SOURCE_MAP?.Update || "default",
      Timeout: cfg?.SOURCE_MAP?.Timeout || "default",
      BUDGET: cfg?.SOURCE_MAP?.BUDGET || "default",
      MASK_IP: cfg?.SOURCE_MAP?.MASK_IP || "default",
      MASK_POS: cfg?.SOURCE_MAP?.MASK_POS || "default",
      IPv6: cfg?.SOURCE_MAP?.IPv6 || "default",
      DOMESTIC_IPv4: cfg?.SOURCE_MAP?.DOMESTIC_IPv4 || "default",
      DOMESTIC_IPv6: cfg?.SOURCE_MAP?.DOMESTIC_IPv6 || "default",
      LANDING_IPv4: cfg?.SOURCE_MAP?.LANDING_IPv4 || "default",
      LANDING_IPv6: cfg?.SOURCE_MAP?.LANDING_IPv6 || "default",
      TW_FLAG_MODE: cfg?.SOURCE_MAP?.TW_FLAG_MODE || "default",
      PROXY_POLICY: cfg?.SOURCE_MAP?.PROXY_POLICY || "default",
      ENTRANCE4: cfg?.SOURCE_MAP?.ENTRANCE4 || "default",
      ENTRANCE6: cfg?.SOURCE_MAP?.ENTRANCE6 || "default",
      SERVICES: cfg?.SERVICES_SOURCE || "default",
      SUBTITLE_STYLE: cfg?.SOURCE_MAP?.SUBTITLE_STYLE || "default",
      SUBTITLE_MINIMAL: cfg?.SOURCE_MAP?.SUBTITLE_MINIMAL || "default",
      GAP_LINES: cfg?.SOURCE_MAP?.GAP_LINES || "default",
      SD_STYLE: cfg?.SOURCE_MAP?.SD_STYLE || "default",
      SD_LANG: cfg?.SOURCE_MAP?.SD_LANG || "default",
      SD_REGION_MODE: cfg?.SOURCE_MAP?.SD_REGION_MODE || "default",
      SD_ICON_THEME: cfg?.SOURCE_MAP?.SD_ICON_THEME || "default",
      SD_ARROW: cfg?.SOURCE_MAP?.SD_ARROW || "default",
      SD_SHOW_LAT: cfg?.SOURCE_MAP?.SD_SHOW_LAT || "default",
      SD_SHOW_HTTP: cfg?.SOURCE_MAP?.SD_SHOW_HTTP || "default",
      LOG: cfg?.SOURCE_MAP?.LOG || "default",
      LOG_LEVEL: cfg?.SOURCE_MAP?.LOG_LEVEL || "default",
      LOG_TO_PANEL: cfg?.SOURCE_MAP?.LOG_TO_PANEL || "default",
      LOG_PUSH: cfg?.SOURCE_MAP?.LOG_PUSH || "default"
    });
  } catch (_) {}
}

function log(level, ...args) {
  if (!S().CFG.LOG) return;
  const map = { debug: 10, info: 20, warn: 30, error: 40 };
  if ((map[level] ?? 20) < (map[S().CFG.LOG_LEVEL] ?? 20)) return;

  const line = `[NI][${level.toUpperCase()}] ${args.map(x => typeof x === "string" ? x : JSON.stringify(x)).join(" ")}`;
  try { console.log(line); } catch (_) {}
  S().DEBUG.push(line);
  if (S().DEBUG.length > CONSTS.LOG_RING_MAX) S().DEBUG.shift();
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
  } finally {
    if (tmr) clearTimeout(tmr);
  }
}
async function httpGetRT(url, headers = {}, timeoutMs = null, followRedirect = false) {
  const start = Date.now();
  const resp = await S().RT.http.get(url, {
    headers,
    timeout: timeoutMs == null ? capByBudget(3500) : Math.min(Number(timeoutMs) || 3500, capByBudget(3500)),
    redirect: followRedirect ? "follow" : "manual"
  });
  const body = await resp.text();
  return { status: resp.status || 0, headers: resp.headers || {}, body, cost: Date.now() - start };
}

async function httpPostRT(url, headers = {}, body = "", timeoutMs = null) {
  const start = Date.now();
  const resp = await S().RT.http.post(url, {
    headers,
    body,
    timeout: timeoutMs == null ? capByBudget(3500) : Math.min(Number(timeoutMs) || 3500, capByBudget(3500)),
    redirect: "follow"
  });
  const text = await resp.text();
  return { status: resp.status || 0, headers: resp.headers || {}, body: text, cost: Date.now() - start };
}

const DIRECT_V4_SOURCES = Object.freeze({
  ipip: {
    url: "https://myip.ipip.net/json",
    parse: (r) => {
      const j = safeJSON(r.body, {});
      const loc = j?.data?.location || [];
      const c0 = loc[0];
      const flag = flagOf(c0 === "中国" ? "CN" : c0);
      let isp = "";
      if (Array.isArray(loc)) {
        if (loc.length >= 5) isp = loc[4] || "";
        else if (loc.length >= 4) isp = loc[3] || "";
      }
      return {
        ip: j?.data?.ip || "",
        loc: joinNonEmpty([flag, loc[0], loc[1], loc[2]], " ").replace(/\s*中国\s*/, ""),
        isp: String(isp || "").trim()
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
  pingan: {
    url: "https://rmb.pingan.com.cn/itam/mas/linden/ip/request",
    parse: (r) => {
      const d = safeJSON(r.body, {})?.data || {};
      return {
        ip: d.ip || "",
        loc: joinNonEmpty([flagOf(d.countryIsoCode), d.country, d.region, d.city], " ").replace(/\s*中国\s*/, ""),
        isp: d.isp || d.ispName || d.operator || d.org || d.as || ""
      };
    }
  }
});

const LANDING_V4_SOURCES = Object.freeze({
  ipapi: {
    url: "http://ip-api.com/json?lang=zh-CN",
    parse: (r) => {
      const j = safeJSON(r.body, {});
      return {
        ip: j.query || "",
        loc: joinNonEmpty([flagOf(j.countryCode), j.country?.replace(/\s*中国\s*/, ""), j.regionName?.split(/\s+or\s+/)[0], j.city], " "),
        isp: j.isp || j.org || "",
        org: j.org || "",
        as: j.as || "",
        country: j.country || ""
      };
    }
  },
  ipwhois: {
    url: "https://ipwhois.app/widget.php?lang=zh-CN",
    parse: (r) => {
      const j = safeJSON(r.body, {});
      const asn = j.asn || j.as || (j?.connection?.asn) || "";
      return {
        ip: j.ip || "",
        loc: joinNonEmpty([flagOf(j.country_code), j.country?.replace(/\s*中国\s*/, ""), j.region, j.city], " "),
        isp: (j?.connection?.isp) || "",
        org: j.org || (j?.connection?.org) || "",
        as: asn || "",
        country: j.country || ""
      };
    }
  },
  ipsb: {
    url: "https://api-ipv4.ip.sb/geoip",
    parse: (r) => {
      const j = safeJSON(r.body, {});
      const as = j.asn ? (`AS${j.asn}` + (j.asn_organization ? ` ${j.asn_organization}` : "")) : "";
      return {
        ip: j.ip || "",
        loc: joinNonEmpty([flagOf(j.country_code), j.country, j.region, j.city], " ").replace(/\s*中国\s*/, ""),
        isp: j.isp || j.organization || "",
        org: j.organization || j.asn_organization || "",
        as,
        country: j.country || ""
      };
    }
  }
});

const IPV6_IP_ENDPOINTS = Object.freeze({
  ddnspod: "https://ipv6.ddnspod.com",
  neu6: "https://speed.neu6.edu.cn/getIP.php",
  ipsb: "https://api-ipv6.ip.sb/ip",
  ident: "https://v6.ident.me",
  ipify: "https://api6.ipify.org"
});

const ORDER = Object.freeze({
  directV4: ["cip", "163", "126", "bilibili", "pingan", "ipip"],
  landingV4: ["ipapi", "ipwhois", "ipsb"],
  directV6: ["ddnspod", "neu6"],
  landingV6: ["ipsb", "ident", "ipify"]
});

function makeTryOrder(prefer, fallbackList) {
  return [prefer, ...fallbackList].filter((x, i, a) => x && a.indexOf(x) === i);
}
function hasCityLevel(loc) {
  if (!loc) return false;
  try {
    const s = String(loc).replace(/^[\u{1F1E6}-\u{1F1FF}]{2}\s*/u, "").trim();
    if (/市|区|縣|县|州|市辖/.test(s)) return true;
    return s.split(/\s+/).filter(Boolean).length >= 3;
  } catch (_) {
    return false;
  }
}

async function trySources(order, sourceMap, { needCityPrefer = false, acceptIp = null, logTag = "trySources" }) {
  log("info", `${logTag}:begin`, { order, needCityPrefer });
  let firstOK = null;

  for (const key of order) {
    if (budgetLeft() <= 300) break;
    const def = sourceMap[key];
    if (!def) continue;

    try {
      const r = await httpGetRT(def.url, {}, null, false);
      const res = def.parse(r) || {};
      const ip = String(res.ip || "").trim();
      const ok = acceptIp ? acceptIp(ip) : !!ip;
      const cityOK = ok && hasCityLevel(res.loc);

      log("debug", `${logTag}:try`, {
        key,
        ok,
        cityOK,
        ip: maskIP(ip),
        loc: res.loc || "",
        isp: res.isp || "",
        status: r.status,
        cost: r.cost
      });

      if (ok) {
        res.ip = ip;
        if (!firstOK) firstOK = res;
        if (!needCityPrefer || cityOK) {
          log("info", `${logTag}:hit`, {
            key,
            ip: maskIP(ip),
            loc: res.loc || "",
            isp: res.isp || ""
          });
          return res;
        }
      }
    } catch (e) {
      log("warn", `${logTag}:fail`, { key, error: String(e) });
    }
  }

  if (firstOK) {
    log("info", `${logTag}:fallback-first`, {
      ip: maskIP(firstOK.ip || ""),
      loc: firstOK.loc || "",
      isp: firstOK.isp || ""
    });
  } else {
    log("warn", `${logTag}:empty`);
  }

  return firstOK || {};
}

async function tryIPv6Ip(order, opt = {}) {
  const timeoutMs = opt.timeoutMs != null ? opt.timeoutMs : Math.min(Math.max(CONSTS.SD_MIN_TIMEOUT, S().CFG.SD_TIMEOUT_MS), 2500);
  const maxTries = Math.max(1, Math.min(Number(opt.maxTries || order.length), order.length));
  const logTag = opt.logTag || "tryIPv6Ip";

  log("info", `${logTag}:begin`, { order: order.slice(0, maxTries), timeoutMs });

  for (const key of order.slice(0, maxTries)) {
    if (budgetLeft() <= 260) break;
    const url = IPV6_IP_ENDPOINTS[key];
    if (!url) continue;

    try {
      const r = await httpGetRT(url, {}, timeoutMs, false);
      const ip = String(r.body || "").trim();
      const ok = isIPv6(ip);

      log("debug", `${logTag}:try`, {
        key,
        ok,
        ip: ok ? maskIP(ip) : ip,
        status: r.status,
        cost: r.cost
      });

      if (ok) {
        log("info", `${logTag}:hit`, { key, ip: maskIP(ip) });
        return { ip };
      }
    } catch (e) {
      log("warn", `${logTag}:fail`, { key, error: String(e) });
    }
  }

  log("warn", `${logTag}:empty`);
  return {};
}

async function fillDirectIspSameIp(targetIp, skipKey) {
  const ip = String(targetIp || "").trim();
  if (!ip) return "";

  for (const key of ORDER.directV4.filter((k) => k && k !== skipKey)) {
    if (budgetLeft() <= 320) break;
    const def = DIRECT_V4_SOURCES[key];
    if (!def) continue;

    try {
      const r = await httpGetRT(def.url, {}, null, false);
      const x = def.parse(r) || {};
      if (String(x.ip || "").trim() === ip && String(x.isp || "").trim()) return String(x.isp || "").trim();
    } catch (_) {}
  }

  return "";
}

async function getDirectV4(preferKey) {
  const res = await trySources(
    makeTryOrder(preferKey, ORDER.directV4),
    DIRECT_V4_SOURCES,
    { needCityPrefer: true, acceptIp: isIPv4, logTag: "direct-v4" }
  );

  if (res && res.ip && !String(res.isp || "").trim()) {
    const filled = await fillDirectIspSameIp(res.ip, preferKey).catch(() => "");
    if (filled) res.isp = filled;
  }

  return res || {};
}
async function getDirectV6(preferKey) {
  return await tryIPv6Ip(makeTryOrder(preferKey, ORDER.directV6), { timeoutMs: 2200, logTag: "direct-v6" });
}
async function getLandingV4(preferKey) {
  return await trySources(makeTryOrder(preferKey, ORDER.landingV4), LANDING_V4_SOURCES, { acceptIp: isIPv4, logTag: "landing-v4" });
}
async function probeLandingV6(preferKey) {
  const r = await tryIPv6Ip(makeTryOrder(preferKey, ORDER.landingV6), {
    timeoutMs: Math.min(CONSTS.V6_PROBE_TO_MS, 900),
    maxTries: 2,
    logTag: "landing-v6-probe"
  });
  return { ok: !!r.ip, ip: r.ip || "" };
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
    return groups.join("").split("").reverse().join(".") + ".ip6.arpa";
  }
  return "";
}

async function queryPTRMaybe(ip) {
  if (!ip || budgetLeft() <= 800) return "";

  return await withTimeout((async () => {
    const name = ipToPtrName(ip);
    if (!name) return "";
    const r = await httpGetRT(
      "https://dns.google/resolve?name=" + encodeURIComponent(name) + "&type=PTR",
      { Accept: "application/dns-json" },
      Math.min(900, capByBudget(900)),
      true
    ).catch(() => null);
    if (!r || r.status !== 200) return "";
    const j = safeJSON(r.body, {});
    const ans = Array.isArray(j.Answer) ? j.Answer : [];
    const first = ans.find((x) => x && (x.type === 12 || String(x.type) === "12") && x.data);
    return first ? String(first.data).trim().replace(/\.$/, "") : "";
  })(), Math.min(950, capByBudget(950)), "");
}

function normStr(x) {
  return String(x == null ? "" : x)
    .replace(/\s+/g, " ")
    .replace(/[（(].*?[）)]/g, " ")
    .trim()
    .toLowerCase();
}
function parseASNNumber(s) {
  const str = String(s || "");
  const m = str.match(/\bAS(\d{1,10})\b/i);
  if (m) return Number(m[1]) || 0;
  const m2 = str.match(/\b(\d{1,10})\b/);
  return m2 ? (Number(m2[1]) || 0) : 0;
}

const RISK_RULES = Object.freeze({
  dataCenterKeywords: [
    "datacenter", "data center", "hosting", "cloud", "cdn", "edge", "vps", "colo", "colocation",
    "proxy", "vpn", "tunnel", "relay", "compute", "server", "amazon", "aws", "google", "gcp",
    "microsoft", "azure", "digitalocean", "linode", "ovh", "hetzner", "vultr", "oracle",
    "alibaba cloud", "tencent cloud", "cloudflare", "fastly", "akamai", "leaseweb", "choopa",
    "dmit", "racknerd"
  ],
  homeBroadbandKeywords: [
    "china telecom", "chinanet", "ctcc", "as4134", "as4809", "china mobile", "cmcc", "cmnet", "cmi",
    "as9808", "china unicom", "unicom", "cucc", "as4837", "cernet", "china education", "comcast",
    "xfinity", "verizon", "at&t", "charter", "spectrum", "cox", "rogers", "bell canada", "telus",
    "bt", "virgin media", "sky broadband", "deutsche telekom", "telefonica", "orange", "vodafone",
    "isp", "broadband", "fiber", "ftth", "residential", "cable", "docsis", "pppoe", "dsl", "adsl",
    "vdsl", "pon", "gpon", "epon", "cpe", "dynamic", "dyn", "pool", "subscriber", "cust", "customer",
    "telecom", "communications", "chunghwa", "cht", "hinet", "kbro", "formosabroadband",
    "formosa broadband", "seednet", "taiwan broadband", "tbc", "cable tv", "cablemodem"
  ],
  mobileKeywords: ["mobile", "lte", "4g", "5g", "cell", "cellular", "wireless", "epc", "ims", "gprs", "wimax"],
  rdnsDatacenterSuffix: [
    "amazonaws.com", "compute.amazonaws.com", "googleusercontent.com", "cloudapp.azure.com",
    "digitalocean.com", "linodeusercontent.com", "ovh.net", "kimsufi.com", "online.net",
    "hetzner.de", "hetzner.com", "vultrusercontent.com", "leaseweb.net", "choopa.net",
    "cloudflare.com", "cloudflarenet.com", "fastly.net", "akamai.net"
  ],
  rdnsHomeKeywords: [
    "dynamic", "dyn", "pppoe", "dsl", "adsl", "vdsl", "cable", "docsis", "fiber", "ftth", "fios",
    "broadband", "res", "home", "cust", "customer", "subscriber", "pool", "cpe", "hinet",
    "formosabroadband", "kbro", "cht", "seednet"
  ],
  rdnsMobileKeywords: ["lte", "5g", "4g", "mobile", "cell", "wireless", "epc"],
  highRiskCountries: ["俄罗斯", "russia", "印度", "india", "乌克兰", "ukraine"]
});

const ASN_HOME_STRONG = new Set([38841]);

function _hasAny(hay, list) {
  const H = normStr(hay);
  if (!H) return false;
  for (const kw of list || []) {
    const K = normStr(kw);
    if (K && H.includes(K)) return true;
  }
  return false;
}
function _rdnsLooksDatacenter(ptrHost) {
  const host = normStr(ptrHost).replace(/\.$/, "");
  if (!host) return false;
  return RISK_RULES.rdnsDatacenterSuffix.some((suf) => host.endsWith(normStr(suf)));
}

function calculateRiskValueSafe(isp, org, country, asField, rdnsHost) {
  const ISP = normStr(isp);
  const ORG = normStr(org);
  const CTRY = normStr(country);
  const AS = normStr(asField);
  const hay = joinNonEmpty([ISP, ORG, AS], " | ");
  const asn = parseASNNumber(asField);

  const reasons = [];
  let riskValue = 0;

  const rdnsHitDC = _rdnsLooksDatacenter(rdnsHost);
  const rdnsHitHB = _hasAny(rdnsHost, RISK_RULES.rdnsHomeKeywords);
  const rdnsHitMobile = _hasAny(rdnsHost, RISK_RULES.rdnsMobileKeywords);

  if (rdnsHitDC) { riskValue += 75; reasons.push("PTR 命中机房域名后缀"); }
  if (rdnsHitHB) { const delta = rdnsHitDC ? -6 : -26; riskValue += delta; reasons.push(`PTR 命中住宅/接入网关键词(${delta})`); }
  if (rdnsHitMobile) { const delta = rdnsHitDC ? 0 : -8; riskValue += delta; reasons.push(`PTR 命中移动网络关键词(${delta})`); }

  const dcHit = _hasAny(hay, RISK_RULES.dataCenterKeywords);
  const hbHit = _hasAny(hay, RISK_RULES.homeBroadbandKeywords);
  const mobileHit = _hasAny(hay, RISK_RULES.mobileKeywords);

  if (dcHit) { riskValue += 55; reasons.push("ORG/ISP/AS 命中机房/云/托管关键词(+55)"); }
  if (hbHit) { const delta = (rdnsHitDC || dcHit) ? -10 : -22; riskValue += delta; reasons.push(`ORG/ISP/AS 命中家宽/接入关键词(${delta})`); }
  if (mobileHit) { const delta = (rdnsHitDC || dcHit) ? 0 : -10; riskValue += delta; reasons.push(`ORG/ISP/AS 命中移动网络关键词(${delta})`); }
  if (RISK_RULES.highRiskCountries.some((x) => CTRY.includes(normStr(x)))) { riskValue += 18; reasons.push("国家风险加成(+18)"); }
  if (!ORG && !AS && ISP.length <= 3) { riskValue += 10; reasons.push("信息不足惩罚(+10)"); }

  riskValue = clamp(Math.round(riskValue), 0, 100);

  const hbEvidence = [hbHit, rdnsHitHB].filter(Boolean).length + (ASN_HOME_STRONG.has(asn) ? 1 : 0);
  const dcEvidence = [dcHit, rdnsHitDC].filter(Boolean).length;
  const tunnelLike = (dcEvidence >= 2) || (riskValue >= 70) || rdnsHitDC;
  const homeLikeStrong = (hbEvidence >= 2) && !tunnelLike && (riskValue <= 50);
  const homeLikeSoft = (hbEvidence >= 1) && (dcEvidence === 0) && !tunnelLike && (riskValue <= 38);
  const isHomeBroadband = homeLikeStrong || homeLikeSoft;

  return {
    riskValue,
    isHomeBroadband,
    lineType: isHomeBroadband ? t("home") : t("nonHome"),
    nativeHint: (!tunnelLike && riskValue < 55) ? t("nativeLike") : t("nonNative"),
    tunnelHint: tunnelLike ? t("strongTunnel") : t("weakTunnel"),
    reasons
  };
}

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

const ENT_LOC_CHAIN = Object.freeze({
  pingan: async (ip) => {
    const r = await httpGetRT(
      "https://rmb.pingan.com.cn/itam/mas/linden/ip/request?ip=" + encodeURIComponent(ip),
      {},
      Math.min(2200, Math.max(1200, S().CFG.SD_TIMEOUT_MS || 0)),
      false
    );
    const d = safeJSON(r.body, {})?.data || {};
    if (!d || (!d.countryIsoCode && !d.country)) throw new Error("pingan-empty");
    return {
      loc: joinNonEmpty([flagOf(d.countryIsoCode), d.country, d.region, d.city], " ").replace(/\s*中国\s*/, ""),
      isp: String(d.isp || d.ispName || d.operator || d.org || d.as || "").trim()
    };
  },
  ipapi: async (ip) => {
    const r = await httpGetRT(
      `http://ip-api.com/json/${encodeURIComponent(ip)}?lang=zh-CN`,
      {},
      Math.min(2200, Math.max(1200, S().CFG.SD_TIMEOUT_MS || 0)),
      false
    );
    const j = safeJSON(r.body, {});
    return {
      loc: joinNonEmpty([flagOf(j.countryCode), j.country?.replace(/\s*中国\s*/, ""), j.regionName?.split(/\s+or\s+/)[0], j.city], " "),
      isp: String(j.isp || j.org || j.as || "").trim()
    };
  },
  ipwhois: async (ip) => {
    const r = await httpGetRT(
      `https://ipwhois.app/json/${encodeURIComponent(ip)}?lang=zh-CN`,
      {},
      Math.min(2200, Math.max(1200, S().CFG.SD_TIMEOUT_MS || 0)),
      false
    );
    const j = safeJSON(r.body, {});
    return {
      loc: joinNonEmpty([flagOf(j.country_code), j.country?.replace(/\s*中国\s*/, ""), j.region, j.city], " "),
      isp: String((j.connection && j.connection.isp) || j.org || "").trim()
    };
  },
  ipsb: async (ip) => {
    const r = await httpGetRT(
      `https://api.ip.sb/geoip/${encodeURIComponent(ip)}`,
      {},
      Math.min(2200, Math.max(1200, S().CFG.SD_TIMEOUT_MS || 0)),
      false
    );
    const j = safeJSON(r.body, {});
    return {
      loc: joinNonEmpty([flagOf(j.country_code), j.country, j.region, j.city], " ").replace(/\s*中国\s*/, ""),
      isp: String(j.isp || j.organization || "").trim()
    };
  }
});

function _sameLoc(a, b) {
  const A = String(a || "").trim();
  const B = String(b || "").trim();
  if (!A || !B) return false;
  const strip = (s) => String(s).replace(/^[\u{1F1E6}-\u{1F1FF}]{2}\s*/u, "").trim();
  return strip(A) === strip(B);
}

async function getEntranceBundle(ip) {
  const nowT = Date.now();
  const fresh = (nowT - S().ENT_CACHE.t) < Math.max(CONSTS.ENT_MIN_TTL, Math.min(Number(S().CFG.Update) || 10, CONSTS.ENT_MAX_TTL)) * 1000;
  if (S().ENT_CACHE.ip === ip && fresh && S().ENT_CACHE.data) return S().ENT_CACHE.data;

  const [p, a, w, s] = await Promise.allSettled([
    ENT_LOC_CHAIN.pingan(ip),
    ENT_LOC_CHAIN.ipapi(ip),
    ENT_LOC_CHAIN.ipwhois(ip),
    ENT_LOC_CHAIN.ipsb(ip)
  ]);

  const pick = (arr) => {
    for (const x of arr) if (x.status === "fulfilled") return x.value || {};
    return {};
  };

  const p1 = (p.status === "fulfilled") ? (p.value || {}) : {};
  const c2 = pick([a, w, s]);

  let loc1 = String(p1.loc || "").trim();
  let isp1 = String(p1.isp || "").trim();
  let loc2 = String(c2.loc || "").trim();
  let isp2 = String(c2.isp || "").trim();

  if (!loc1 && loc2) { loc1 = loc2; isp1 = isp2; loc2 = ""; isp2 = ""; }
  if (loc1 && !isp1 && isp2) isp1 = isp2;
  if (_sameLoc(loc1, loc2)) loc2 = "";

  const res = { ip, loc1, isp1, loc2, isp2 };
  S().ENT_CACHE = { ip, t: nowT, data: res };
  return res;
}

const SD_ALIAS = {
  yt: "youtube",
  youtube: "youtube",
  "youtube premium": "youtube",
  油管: "youtube",
  nf: "netflix",
  netflix: "netflix",
  奈飞: "netflix",
  奈飛: "netflix",
  disney: "disney",
  "disney+": "disney",
  迪士尼: "disney",
  chatgpt: "chatgpt_app",
  gpt: "chatgpt_app",
  openai: "chatgpt_app",
  chatgpt_web: "chatgpt_web",
  "chatgpt-web": "chatgpt_web",
  "chatgpt web": "chatgpt_web",
  hulu: "hulu_us",
  葫芦: "hulu_us",
  葫蘆: "hulu_us",
  huluus: "hulu_us",
  hulujp: "hulu_jp",
  hbo: "hbo",
  max: "hbo"
};

const SD_TEST_KEYS = ["youtube", "netflix", "disney", "chatgpt_web", "chatgpt_app", "hulu_us", "hulu_jp", "hbo"];

function parseServices(raw) {
  if (raw == null) return [];
  const s = String(raw).trim();
  if (!s || s === "[]" || s === "{}" || /^null$/i.test(s) || /^undefined$/i.test(s)) return [];
  try {
    const arr = JSON.parse(s);
    if (Array.isArray(arr)) return normSvcList(arr);
  } catch (_) {}
  return normSvcList(s.split(/[,\uFF0C;|/ \t\r\n]+/));
}

function normSvcList(list) {
  const out = [];
  for (let x of list) {
    let k = String(x ?? "").trim().toLowerCase();
    if (!k) continue;
    k = SD_ALIAS[k] || k;
    if (!SD_TEST_KEYS.includes(k)) continue;
    if (!out.includes(k)) out.push(k);
  }
  return out;
}

function selectServices() {
  const cfg = S().CFG;

  const envList = parseServices(cfg.SERVICES_ENV_TEXT);
  if (envList.length) {
    log("info", "services-selected", { source: "env", list: envList });
    return envList;
  }

  const boxCheckedList = parseServices(cfg.SERVICES_BOX_CHECKED_RAW);
  if (boxCheckedList.length) {
    log("info", "services-selected", { source: "box-checked", list: boxCheckedList });
    return boxCheckedList;
  }

  const boxTextList = parseServices(cfg.SERVICES_BOX_TEXT);
  if (boxTextList.length) {
    log("info", "services-selected", { source: "box-text", list: boxTextList });
    return boxTextList;
  }

  const d = SD_TEST_KEYS.slice();
  log("info", "services-selected", { source: "default", list: d });
  return d;
}

const SD_UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";
const SD_BASE_HEADERS = { "User-Agent": SD_UA, "Accept-Language": "en" };

async function sd_httpGet(url, headers = {}, followRedirect = true) {
  const start = Date.now();
  return await httpGetRT(url, { ...SD_BASE_HEADERS, ...headers }, S().CFG.SD_TIMEOUT_MS, followRedirect)
    .then((r) => ({ ok: true, status: r.status, headers: r.headers || {}, data: r.body || "", cost: Date.now() - start }))
    .catch((e) => ({ ok: false, status: 0, headers: {}, data: "", cost: Date.now() - start, err: String(e || "") }));
}

async function sd_httpPost(url, headers = {}, body = "") {
  const start = Date.now();
  return await httpPostRT(url, { ...SD_BASE_HEADERS, ...headers }, body, S().CFG.SD_TIMEOUT_MS)
    .then((r) => ({ ok: true, status: r.status, headers: r.headers || {}, data: r.body || "", cost: Date.now() - start }))
    .catch((e) => ({ ok: false, status: 0, headers: {}, data: "", cost: Date.now() - start, err: String(e || "") }));
}

function sd_flagFromCC(cc) {
  cc = (cc || "").toUpperCase();
  if (!/^[A-Z]{2}$/.test(cc)) return "";
  if (cc === "TW") {
    if (S().CFG.TW_FLAG_MODE === 0) return "🇨🇳";
    if (S().CFG.TW_FLAG_MODE === 2) return "🇼🇸";
  }
  try {
    return String.fromCodePoint(...[...cc].map((c) => 0x1F1E6 + (c.charCodeAt(0) - 65)));
  } catch (_) {
    return "";
  }
}

const SD_CC_NAME = {
  "zh-Hans": {
    CN: "中国", TW: "台湾", HK: "中国香港", MO: "中国澳门", JP: "日本", KR: "韩国", US: "美国",
    SG: "新加坡", MY: "马来西亚", TH: "泰国", VN: "越南", PH: "菲律宾", ID: "印度尼西亚",
    IN: "印度", AU: "澳大利亚", NZ: "新西兰", CA: "加拿大", GB: "英国", DE: "德国",
    FR: "法国", NL: "荷兰", ES: "西班牙", IT: "意大利", BR: "巴西"
  },
  "zh-Hant": {
    CN: "中國", TW: "台灣", HK: "中國香港", MO: "中國澳門", JP: "日本", KR: "南韓", US: "美國",
    SG: "新加坡", MY: "馬來西亞", TH: "泰國", VN: "越南", PH: "菲律賓", ID: "印尼",
    IN: "印度", AU: "澳洲", NZ: "紐西蘭", CA: "加拿大", GB: "英國", DE: "德國",
    FR: "法國", NL: "荷蘭", ES: "西班牙", IT: "義大利", BR: "巴西"
  }
};

function sd_ccPretty(cc) {
  cc = (cc || "").toUpperCase();
  const flag = sd_flagFromCC(cc);
  const name = SD_CC_NAME[S().CFG.SD_LANG][cc];
  if (!cc) return "—";
  if (S().CFG.SD_REGION_MODE === "flag") return flag || "—";
  if (S().CFG.SD_REGION_MODE === "abbr") return (flag || "") + cc;
  if (flag && name) return `${flag} ${cc} | ${name}`;
  if (flag) return `${flag} ${cc}`;
  return cc;
}

function serviceStateMeta(ok, tag, state) {
  const st = state ? state : (
    ok
      ? (/自制|自製|original/i.test(String(tag || "")) || /部分/i.test(String(tag || "")) ? "partial" : "full")
      : "blocked"
  );
  const icons = S().CFG.SD_ICON_THEME === "lock"
    ? { full: "🔓", partial: "🔐", blocked: "🔒" }
    : S().CFG.SD_ICON_THEME === "circle"
      ? { full: "⭕️", partial: "⛔️", blocked: "🚫" }
      : { full: "✅", partial: "❇️", blocked: "❎" };
  return { st, icon: icons[st] };
}

function sd_nameOfKey(key) {
  const map = {
    youtube: "YouTube",
    netflix: "Netflix",
    disney: "Disney+",
    chatgpt_web: "ChatGPT Web",
    chatgpt_app: "ChatGPT",
    hulu_us: "Hulu(美)",
    hulu_jp: "Hulu(日)",
    hbo: "Max(HBO)"
  };
  return map[key] || key;
}

function sd_compact(key, ok, cc, tag, state, cost = null, status = 0) {
  const meta = serviceStateMeta(ok, tag, state);
  return {
    key,
    name: sd_nameOfKey(key),
    ok,
    cc,
    tag: tag || "",
    state: meta.st,
    icon: meta.icon,
    region: cc ? sd_ccPretty(cc) : "—",
    cost,
    status
  };
}

async function sd_queryLandingCCMulti() {
  for (const url of ["http://ip-api.com/json", "https://api.ip.sb/geoip", "https://ipinfo.io/json", "https://ifconfig.co/json"]) {
    const r = await sd_httpGet(url, { "Accept-Language": "en" }, true);
    if (r.ok && r.status === 200) {
      try {
        const j = safeJSON(r.data, {});
        const cc = (j.countryCode || j.country_code || j.country || j.country_iso || "").toUpperCase();
        if (/^[A-Z]{2}$/.test(cc)) return cc;
      } catch (_) {}
    }
  }
  return "";
}

function sd_parseNFRegion(resp) {
  try {
    const xo = resp?.headers?.["x-originating-url"] || resp?.headers?.["X-Originating-URL"] || resp?.headers?.["X-Origining-URL"];
    if (xo) {
      const m = String(xo).match(/\/([A-Z]{2})(?:[-/]|$)/i);
      if (m) return m[1].toUpperCase();
    }
    const m2 = String(resp?.data || "").match(/"countryCode"\s*:\s*"([A-Z]{2})"/i);
    if (m2) return m2[1].toUpperCase();
  } catch (_) {}
  return "";
}

const SD_NF_ORIGINAL = "80018499";
const SD_NF_NONORIG = "81280792";
const sd_nfGet = (id) => sd_httpGet(`https://www.netflix.com/title/${id}`, {}, true);

async function sd_testYouTube() {
  const r = await sd_httpGet("https://www.youtube.com/premium?hl=en", {}, true);
  if (!r.ok) return sd_compact("youtube", false, "", t("notReachable"), undefined, r.cost, r.status);
  let cc = "US";
  try {
    let m = r.data.match(/"countryCode":"([A-Z]{2})"/);
    if (!m) m = r.data.match(/["']GL["']\s*:\s*["']([A-Z]{2})["']/);
    if (m) cc = m[1];
  } catch (_) {}
  return sd_compact("youtube", true, cc, "", undefined, r.cost, r.status);
}

async function sd_testChatGPTWeb() {
  const r = await sd_httpGet("https://chatgpt.com/cdn-cgi/trace", {}, true);
  if (!r.ok) return sd_compact("chatgpt_web", false, "", t("notReachable"), undefined, r.cost, r.status);
  let cc = "";
  try {
    const m = r.data.match(/loc=([A-Z]{2})/);
    if (m) cc = m[1];
  } catch (_) {}
  return sd_compact("chatgpt_web", true, cc, "", undefined, r.cost, r.status);
}

async function sd_testChatGPTAppAPI() {
  const r = await sd_httpGet("https://api.openai.com/v1/models", {}, true);
  if (!r.ok) return sd_compact("chatgpt_app", false, "", t("notReachable"), undefined, r.cost, r.status);
  let cc = "";
  try {
    const h = r.headers || {};
    cc = (h["cf-ipcountry"] || h["CF-IPCountry"] || h["Cf-IpCountry"] || "").toString().toUpperCase();
    if (!/^[A-Z]{2}$/.test(cc)) cc = "";
  } catch (_) {}
  if (!cc) cc = await sd_queryLandingCCMulti();
  return sd_compact("chatgpt_app", true, cc, "", undefined, r.cost, r.status);
}

async function sd_testNetflix() {
  const r1 = await sd_nfGet(SD_NF_NONORIG);
  if (!r1.ok) return sd_compact("netflix", false, "", t("fail"), undefined, r1.cost, r1.status);
  if (r1.status === 403) return sd_compact("netflix", false, "", t("regionBlocked"), undefined, r1.cost, r1.status);
  if (r1.status === 404) {
    const r2 = await sd_nfGet(SD_NF_ORIGINAL);
    if (!r2.ok) return sd_compact("netflix", false, "", t("fail"), undefined, r2.cost, r2.status);
    if (r2.status === 404) return sd_compact("netflix", false, "", t("regionBlocked"), undefined, r2.cost, r2.status);
    return sd_compact("netflix", true, sd_parseNFRegion(r2) || "", t("nfOriginals"), "partial", r2.cost, r2.status);
  }
  if (r1.status === 200) return sd_compact("netflix", true, sd_parseNFRegion(r1) || "", t("nfFull"), "full", r1.cost, r1.status);
  return sd_compact("netflix", false, "", `HTTP ${r1.status}`, undefined, r1.cost, r1.status);
}

async function sd_testDisney() {
  const rHome = await sd_httpGet("https://www.disneyplus.com/", { "Accept-Language": "en" }, true);
  if (!rHome.ok || rHome.status !== 200 || /Sorry,\s*Disney\+\s*is\s*not\s*available/i.test(rHome.data || "")) {
    return sd_compact("disney", false, "", (!rHome.ok) ? t("timeout") : t("regionBlocked"), undefined, rHome.cost, rHome.status);
  }

  let homeCC = "";
  try {
    const m = rHome.data.match(/"countryCode"\s*:\s*"([A-Z]{2})"/i) || rHome.data.match(/data-country=["']([A-Z]{2})["']/i);
    if (m) homeCC = m[1].toUpperCase();
  } catch (_) {}

  const headers = {
    "Accept-Language": "en",
    "Authorization": "ZGlzbmV5JmJyb3dzZXImMS4wLjA.Cu56AgSfBTDag5NiRA81oLHkDZfu5L3CKadnefEAY84",
    "Content-Type": "application/json",
    "User-Agent": SD_UA
  };

  const body = JSON.stringify({
    query: "mutation registerDevice($input: RegisterDeviceInput!) { registerDevice(registerDevice: $input) { grant { grantType assertion } } }",
    variables: {
      input: {
        applicationRuntime: "chrome",
        attributes: {
          browserName: "chrome",
          browserVersion: "120.0.0.0",
          manufacturer: "apple",
          model: null,
          operatingSystem: "macintosh",
          operatingSystemVersion: "10.15.7",
          osDeviceIds: []
        },
        deviceFamily: "browser",
        deviceLanguage: "en",
        deviceProfile: "macosx"
      }
    }
  });

  const rBam = await sd_httpPost("https://disney.api.edge.bamgrid.com/graph/v1/device/graphql", headers, body);
  if (!rBam.ok || rBam.status !== 200) {
    return sd_compact("disney", true, homeCC || (await sd_queryLandingCCMulti()) || "", "", undefined, rHome.cost, rHome.status);
  }

  const d = safeJSON(rBam.data, {});
  if (d?.errors) {
    return sd_compact("disney", true, homeCC || (await sd_queryLandingCCMulti()) || "", "", undefined, rHome.cost, rHome.status);
  }

  const inLoc = d?.extensions?.sdk?.session?.inSupportedLocation;
  const bamCC = d?.extensions?.sdk?.session?.location?.countryCode;
  const blocked = inLoc === false;

  return sd_compact(
    "disney",
    !blocked,
    blocked ? "" : ((bamCC || homeCC || (await sd_queryLandingCCMulti()) || "").toUpperCase()),
    blocked ? t("regionBlocked") : "",
    undefined,
    rBam.cost || rHome.cost,
    rBam.status || rHome.status
  );
}

async function sd_testHuluUS() {
  const r = await sd_httpGet("https://www.hulu.com/", {}, true);
  if (!r.ok) return sd_compact("hulu_us", false, "", t("notReachable"), undefined, r.cost, r.status);
  const blocked = /not\s+available\s+in\s+your\s+region/i.test(r.data || "");
  return sd_compact("hulu_us", !blocked, blocked ? "" : "US", blocked ? t("regionBlocked") : "", undefined, r.cost, r.status);
}

async function sd_testHuluJP() {
  const r = await sd_httpGet("https://www.hulu.jp/", { "Accept-Language": "ja" }, true);
  if (!r.ok) return sd_compact("hulu_jp", false, "", t("notReachable"), undefined, r.cost, r.status);
  const blocked = /ご利用いただけません|サービスをご利用いただけません|not available/i.test(r.data || "");
  return sd_compact("hulu_jp", !blocked, blocked ? "" : "JP", blocked ? t("regionBlocked") : "", undefined, r.cost, r.status);
}

async function sd_testHBO() {
  const r = await sd_httpGet("https://www.max.com/", {}, true);
  if (!r.ok) return sd_compact("hbo", false, "", t("notReachable"), undefined, r.cost, r.status);
  const blocked = /not\s+available\s+in\s+your\s+region|country\s+not\s+supported/i.test(r.data || "");
  let cc = "";
  try {
    const m = String(r.data || "").match(/"countryCode"\s*:\s*"([A-Z]{2})"/i);
    if (m) cc = m[1].toUpperCase();
  } catch (_) {}
  if (!cc) cc = await sd_queryLandingCCMulti();
  return sd_compact("hbo", !blocked, blocked ? "" : cc, blocked ? t("regionBlocked") : "", undefined, r.cost, r.status);
}

function buildServiceTests() {
  return {
    youtube: sd_testYouTube,
    netflix: sd_testNetflix,
    disney: sd_testDisney,
    chatgpt_web: sd_testChatGPTWeb,
    chatgpt_app: sd_testChatGPTAppAPI,
    hulu_us: sd_testHuluUS,
    hulu_jp: sd_testHuluJP,
    hbo: sd_testHBO
  };
}

async function runServiceChecks() {
  const order = selectServices();
  if (!order.length) return [];
  const map = buildServiceTests();
  const conc = S().CFG.SD_CONCURRENCY;

  log("info", "service-check:begin", { order, conc });

  const stageCap = Math.max(800, Math.min(5200, capByBudget(5200)));
  const results = new Array(order.length);
  let cursor = 0;
  let inflight = 0;
  let finished = 0;
  let doneFlag = false;

  const finish = () => { doneFlag = true; };

  const tryLaunch = () => {
    while (!doneFlag && inflight < conc && cursor < order.length) {
      if (budgetLeft() <= 320) break;

      const idx = cursor++;
      const key = order[idx];
      const fn = map[key];

      if (!fn) {
        results[idx] = sd_compact(key, false, "", t("fail"), undefined, null, 0);
        finished++;
        continue;
      }

      inflight++;
      Promise.resolve(fn()).then((line) => {
        results[idx] = line;
        log("info", "service-check:item", {
          key,
          ok: !!line?.ok,
          state: line?.state || "",
          region: line?.region || "",
          tag: line?.tag || "",
          cost: line?.cost,
          status: line?.status
        });
      }).catch((e) => {
        results[idx] = sd_compact(key, false, "", t("fail"), undefined, null, 0);
        log("warn", "service-check:fail", { key, error: String(e) });
      }).finally(() => {
        inflight--;
        finished++;
        if (finished >= order.length) finish();
        else tryLaunch();
      });
    }
  };

  tryLaunch();

  await withTimeout(new Promise((r) => {
    const tick = () => {
      if (doneFlag || finished >= order.length || budgetLeft() <= 260) return r(true);
      setTimeout(tick, 30);
    };
    tick();
  }), stageCap, false);

  finish();

  for (let i = 0; i < results.length; i++) {
    if (!results[i]) results[i] = sd_compact(order[i], false, "", t("timeout"), undefined, null, 0);
  }

  const finalResults = results.filter(Boolean);
  log("info", "service-check:done", { count: finalResults.length });
  return finalResults;
}

function sdRenderPanelLine(x) {
  const meta = serviceStateMeta(x.ok, x.tag, x.state);
  const regionText = x.region || "—";
  const isText = String(S().CFG.SD_STYLE).toLowerCase() === "text";
  const useArrow = !!S().CFG.SD_ARROW;
  const showLat = !!S().CFG.SD_SHOW_LAT;
  const showHttp = !!S().CFG.SD_SHOW_HTTP;
  const tag = x.tag || "";
  const cost = x.cost;
  const status = x.status || 0;

  if (isText) {
    const stateText = meta.st === "full" ? t("unlocked") : meta.st === "partial" ? t("partialUnlocked") : t("notReachable");
    const head = useArrow ? `${x.name}: ${stateText} ➟ ${regionText}` : `${x.name}: ${stateText} ｜ ${regionText}`;
    const tail = [tag, (showLat && cost != null) ? `${cost}ms` : "", (showHttp && status > 0) ? `HTTP ${status}` : ""].filter(Boolean).join(" ｜ ");
    return tail ? `${head} ｜ ${tail}` : head;
  }

  const head = useArrow ? `${meta.icon} ${x.name} ➟ ${regionText}` : `${meta.icon} ${x.name} ｜ ${regionText}`;
  const tail = [tag, (showLat && cost != null) ? `${cost}ms` : "", (showHttp && status > 0) ? `HTTP ${status}` : ""].filter(Boolean).join(" ｜ ");
  return tail ? `${head} ｜ ${tail}` : head;
}

function secLine(title, value) {
  return `${title}：${value || "-"}`;
}

function maskIP(ip) {
  if (!ip || !S().CFG.MASK_IP) return ip || "";
  if (isIPv4(ip)) {
    const p = ip.split(".");
    return `${p[0]}.${p[1]}.*.*`;
  }
  if (isIPv6(ip)) {
    const p = ip.split(":");
    return [...p.slice(0, 4), "*", "*", "*", "*"].join(":");
  }
  return ip;
}

async function buildModel(ctx) {
  const box = await readBoxSettings(ctx);
  const cfg = buildCFG(ctx, box);

  // ===== DEBUG: 检查 env 注入 =====
  try {
    console.log("[NI][DEBUG] ctx.env =", JSON.stringify(ctx?.env || {}));
    console.log("[NI][DEBUG] raw PROXY_POLICY =", String(ctx?.env?.PROXY_POLICY ?? ""));
    console.log("[NI][DEBUG] cfg PROXY_POLICY =", String(cfg?.PROXY_POLICY ?? ""));
    console.log("[NI][DEBUG] cfg source =", JSON.stringify(cfg?.SOURCE_MAP || {}));
  } catch (_) {}
  // =================================
  
  G = {
    RT: ctx,
    CFG: cfg,
    DEADLINE: Date.now() + cfg.BUDGET_MS,
    DEBUG: [],
    ENT_CACHE: { ip: "", t: 0, data: null }
  };

  log("info", "start", {
    mode: "panel",
    policy: cfg.PROXY_POLICY || "-",
    policySource: cfg.SOURCE_MAP.PROXY_POLICY || "default"
  });
  logCfgSources(cfg);

  const sdPromise = runServiceChecks().catch((e) => {
    log("warn", "service-check:crash", String(e));
    return [];
  });

  const local = await getDirectV4(cfg.DOMESTIC_IPv4).catch((e) => {
    log("warn", "direct-v4:crash", String(e));
    return {};
  });
  log("info", "direct-v4:result", {
    ip: maskIP(local.ip || ""),
    loc: local.loc || "",
    isp: local.isp || ""
  });

  const local6 = (cfg.IPv6 && ctx.device?.ipv6?.address)
    ? await getDirectV6(cfg.DOMESTIC_IPv6).catch((e) => {
        log("warn", "direct-v6:crash", String(e));
        return {};
      })
    : {};
  log("info", "direct-v6:result", { ip: maskIP(local6.ip || "") });

  const landing = await getLandingV4(cfg.LANDING_IPv4).catch((e) => {
    log("warn", "landing-v4:crash", String(e));
    return {};
  });
  log("info", "landing-v4:result", {
    ip: maskIP(landing.ip || ""),
    loc: landing.loc || "",
    isp: landing.isp || "",
    org: landing.org || "",
    as: landing.as || ""
  });

  const probe = cfg.IPv6
    ? await probeLandingV6(cfg.LANDING_IPv6).catch((e) => {
        log("warn", "landing-v6-probe:crash", String(e));
        return ({ ok: false, ip: "" });
      })
    : { ok: false, ip: "" };
  const landing6 = probe.ok ? { ip: probe.ip } : {};
  log("info", "landing-v6-probe:result", { ok: !!probe.ok, ip: maskIP(probe.ip || "") });

  let autoPolicy = "";
  let autoEntrance4 = "";
  let autoEntrance6 = "";

  try {
    if (typeof ctx.httpAPI === "function") {
      const recent = await ctx.httpAPI("/v1/requests/recent");
      const reqs = Array.isArray(recent?.requests) ? recent.requests : [];
      const hits = reqs.slice(0, CONSTS.MAX_RECENT_REQ).filter((i) =>
        /(ip-api\.com|ipwhois\.app|ip\.sb|ipinfo\.io|ident\.me|ipify\.org|ifconfig\.co)/i.test(i.URL || "")
      );

      for (const i of hits) {
        if (!autoPolicy && i.policyName) autoPolicy = i.policyName;
        const ip = extractIP(i.remoteAddress || "");
        if (isIPv4(ip) && !autoEntrance4) autoEntrance4 = ip;
        if (isIPv6(ip) && !autoEntrance6) autoEntrance6 = ip;
        if (autoPolicy && autoEntrance4 && autoEntrance6) break;
      }
    }
  } catch (e) {
    log("warn", "auto-policy-entrance:crash", String(e));
  }

  log("info", "auto-policy-entrance:result", {
    policy: autoPolicy || "",
    entrance4: maskIP(autoEntrance4 || ""),
    entrance6: maskIP(autoEntrance6 || "")
  });

  const policyFinal = String(autoPolicy || cfg.PROXY_POLICY || "").trim();
  const entrance4 = isIPv4(autoEntrance4 || "") ? autoEntrance4 : (isIPv4(cfg.ENTRANCE4 || "") ? cfg.ENTRANCE4 : "");
  const entrance6ip = isIPv6(autoEntrance6 || "") ? autoEntrance6 : (isIPv6(cfg.ENTRANCE6 || "") ? cfg.ENTRANCE6 : "");

  log("info", "policy-entrance:final", {
    policy: policyFinal || "",
    entrance4: maskIP(entrance4 || ""),
    entrance6: maskIP(entrance6ip || "")
  });

  const entrance = entrance4
    ? await getEntranceBundle(entrance4).catch((e) => {
        log("warn", "entrance-bundle-v4:crash", String(e));
        return ({ ip: entrance4 });
      })
    : {};
  log("info", "entrance-bundle-v4:result", {
    ip: maskIP(entrance.ip || ""),
    loc1: entrance.loc1 || "",
    isp1: entrance.isp1 || "",
    loc2: entrance.loc2 || "",
    isp2: entrance.isp2 || ""
  });

  const entrance6 = entrance6ip
    ? await getEntranceBundle(entrance6ip).catch((e) => {
        log("warn", "entrance-bundle-v6:crash", String(e));
        return ({ ip: entrance6ip });
      })
    : {};
  log("info", "entrance-bundle-v6:result", {
    ip: maskIP(entrance6.ip || ""),
    loc1: entrance6.loc1 || "",
    isp1: entrance6.isp1 || "",
    loc2: entrance6.loc2 || "",
    isp2: entrance6.isp2 || ""
  });

  const rdnsHost = await queryPTRMaybe(landing.ip).catch((e) => {
    log("warn", "risk-ptr:crash", String(e));
    return "";
  });
  log("info", "risk-input", {
    ip: maskIP(landing.ip || ""),
    isp: landing.isp || "",
    org: landing.org || "",
    country: landing.country || "",
    as: landing.as || landing.asn || "",
    ptr: rdnsHost || ""
  });

  const risk = landing.ip
    ? calculateRiskValueSafe(landing.isp, landing.org, landing.country, landing.as || landing.asn || "", rdnsHost)
    : null;
  log("info", "risk-output", risk || {});

  const services = await sdPromise;

  return {
    runAt: nowStr(),
    policy: policyFinal || "",
    local,
    local6,
    entrance,
    entrance6,
    landing,
    landing6,
    risk,
    services,
    debug: S().DEBUG.slice(-CONSTS.DEBUG_TAIL_LINES),
    cfgSource: cfg.SOURCE_MAP,
    servicesSource: cfg.SERVICES_SOURCE
  };
}

function widgetColors() {
  return {
    bgGradient: {
      type: "linear",
      colors: [
        { light: "#F7F8FA", dark: "#111214" },
        { light: "#FFFFFF", dark: "#1B1C1F" },
        { light: "#F4F6F8", dark: "#16171A" }
      ],
      stops: [0, 0.55, 1],
      startPoint: { x: 0, y: 0 },
      endPoint: { x: 1, y: 1 }
    },
    cardBg: { light: "#FFFFFF", dark: "#23252A" },
    cardBorder: { light: "#E6E8EC", dark: "#343741" },
    textMain: { light: "#111827", dark: "#F3F4F6" },
    textSub: { light: "#6B7280", dark: "#A1A1AA" },
    textSoft: { light: "#9CA3AF", dark: "#71717A" },
    accent: { light: S().CFG.IconColor || "#1E90FF", dark: S().CFG.IconColor || "#4DA3FF" },
    ok: { light: "#10B981", dark: "#34D399" },
    warn: { light: "#F59E0B", dark: "#FBBF24" },
    bad: { light: "#EF4444", dark: "#F87171" },
    line: { light: "#E5E7EB", dark: "#3F3F46" }
  };
}

function widgetText(v, fallback = "-") {
  const s = String(v == null ? "" : v).trim();
  return s || fallback;
}

function widgetNetTitle(model) {
  const net = netTypeLine();
  const landingFlag = model.landing?.loc ? onlyFlag(model.landing.loc) : "";
  return `${net}${landingFlag ? ` ${landingFlag}` : ""}`;
}

function widgetTimeText() {
  const d = new Date();
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

function widgetRiskTone(model, colors) {
  const risk = model.risk;
  if (!risk) return colors.textSoft;
  if (risk.riskValue >= 70) return colors.bad;
  if (risk.riskValue >= 40) return colors.warn;
  return colors.ok;
}

function widgetServiceSummary(model) {
  const arr = Array.isArray(model.services) ? model.services : [];
  const ok = arr.filter(x => x?.state === "full").length;
  const partial = arr.filter(x => x?.state === "partial").length;
  const bad = arr.filter(x => !x?.ok || x?.state === "blocked").length;
  return { ok, partial, bad, total: arr.length };
}

function compactServiceLine(x) {
  if (!x) return "";
  return `${x.icon || "•"} ${x.name}${x.region ? ` ${x.region}` : ""}`;
}

function buildInfoCard(title, rows, colors, icon = "sf-symbol:circle.fill", iconColor = null, opt = {}) {
  const cardMinHeight = opt.minHeight || 82;
  const bodyRows = rows.filter(Boolean).slice(0, opt.maxRows || 2);

  return {
    type: "stack",
    direction: "column",
    gap: 6,
    padding: [10, 10, 10, 10],
    backgroundColor: colors.cardBg,
    borderRadius: 12,
    borderWidth: 0.5,
    borderColor: colors.cardBorder,
    minHeight: cardMinHeight,
    children: [
      {
        type: "stack",
        direction: "row",
        alignItems: "center",
        gap: 6,
        children: [
          {
            type: "image",
            src: icon,
            width: 11,
            height: 11,
            color: iconColor || colors.accent
          },
          {
            type: "text",
            text: title,
            font: { size: "caption2", weight: "semibold" },
            textColor: colors.textSub,
            maxLines: 1,
            minScale: 0.8,
            flex: 1
          }
        ]
      },
      ...bodyRows.map((row) => ({
        type: "text",
        text: row,
        font: { size: "caption2" },
        textColor: colors.textMain,
        maxLines: 1,
        minScale: 0.65
      }))
    ]
  };
}

function buildLocalCard(model, colors) {
  const localLoc = model.local?.loc
    ? (S().CFG.MASK_POS ? onlyFlag(model.local.loc) : flagFirst(model.local.loc))
    : "-";

  return buildInfoCard(
    t("local"),
    [
      `IPv4 ${widgetText(maskIP(model.local?.ip || ""))}`,
      model.local6?.ip ? `IPv6 ${widgetText(maskIP(model.local6.ip))}` : "",
      `${t("location")} ${widgetText(localLoc)}`,
      model.local?.isp ? `${t("isp")} ${fmtISP(model.local.isp, model.local.loc)}` : ""
    ],
    colors,
    "sf-symbol:house",
    colors.accent,
    { minHeight: 112, maxRows: 4 }
  );
}

function buildEntranceCard(model, colors) {
  const entShow = (model.entrance && (model.entrance.loc1 || model.entrance.isp1)) ? model.entrance : model.entrance6;
  const hasAny = model.entrance?.ip || model.entrance6?.ip || entShow?.loc1 || entShow?.isp1;

  if (!hasAny) {
    return buildInfoCard(
      t("entrance"),
      [t("noData")],
      colors,
      "sf-symbol:arrow.down.forward.circle",
      colors.textSoft,
      { minHeight: 112, maxRows: 3 }
    );
  }

  return buildInfoCard(
    t("entrance"),
    [
      model.entrance?.ip ? `IPv4 ${maskIP(model.entrance.ip)}` : "",
      model.entrance6?.ip ? `IPv6 ${maskIP(model.entrance6.ip)}` : "",
      entShow?.loc1 ? `${t("location")} ${flagFirst(entShow.loc1)}` : "",
      entShow?.isp1 ? `${t("isp")} ${fmtISP(entShow.isp1, entShow.loc1)}` : ""
    ],
    colors,
    "sf-symbol:arrow.down.forward.circle",
    colors.accent,
    { minHeight: 112, maxRows: 4 }
  );
}

function buildLandingCard(model, colors) {
  return buildInfoCard(
    t("landing"),
    [
      `IPv4 ${widgetText(maskIP(model.landing?.ip || ""))}`,
      model.landing6?.ip ? `IPv6 ${maskIP(model.landing6.ip)}` : "",
      model.landing?.loc ? `${t("location")} ${flagFirst(model.landing.loc)}` : "",
      model.landing?.isp ? `${t("isp")} ${fmtISP(model.landing.isp, model.landing.loc)}` : ""
    ],
    colors,
    "sf-symbol:airplane.circle",
    colors.accent,
    { minHeight: 112, maxRows: 4 }
  );
}

function buildRiskCard(model, colors) {
  const risk = model.risk;
  if (!risk) {
    return buildInfoCard(
      t("risk"),
      [t("noData")],
      colors,
      "sf-symbol:shield.lefthalf.filled",
      colors.textSoft,
      { minHeight: 112, maxRows: 3 }
    );
  }

  return buildInfoCard(
    t("risk"),
    [
      `${risk.lineType}`,
      `${risk.nativeHint}`,
      `${risk.tunnelHint}`,
      `风险值 ${risk.riskValue}%`
    ],
    colors,
    "sf-symbol:shield.lefthalf.filled",
    widgetRiskTone(model, colors),
    { minHeight: 112, maxRows: 4 }
  );
}

function buildServiceCard(model, colors) {
  const svs = Array.isArray(model.services) ? model.services : [];
  const summary = widgetServiceSummary(model);

  const rows = [
    `完整 ${summary.ok} · 部分 ${summary.partial} · 失败 ${summary.bad}`
  ];

  for (const item of svs.slice(0, 3)) {
    rows.push(compactServiceLine(item));
  }

  return buildInfoCard(
    t("services"),
    rows,
    colors,
    "sf-symbol:sparkles.tv",
    summary.bad > 0 ? colors.warn : colors.ok,
    { minHeight: 118, maxRows: 4 }
  );
}

function pickWidgetPage() {
  const p = String(S().CFG.WIDGET_PAGE || "").trim().toLowerCase();
  if (["summary", "local", "entrance", "landing", "risk", "services"].includes(p)) return p;
  return "summary";
}

function buildSummaryCard(model, colors) {
  const summary = widgetServiceSummary(model);
  const localFlag = model.local?.loc ? onlyFlag(model.local.loc) : "-";
  const landingFlag = model.landing?.loc ? onlyFlag(model.landing.loc) : "-";
  const riskText = model.risk ? `${model.risk.riskValue}%` : "-";
  const policyText = model.policy ? model.policy : "未传入";

  return {
    type: "stack",
    direction: "column",
    gap: 8,
    padding: [12, 12, 12, 12],
    backgroundColor: colors.cardBg,
    borderRadius: 14,
    borderWidth: 0.5,
    borderColor: colors.cardBorder,
    children: [
      {
        type: "stack",
        direction: "row",
        alignItems: "center",
        gap: 6,
        children: [
          {
            type: "image",
            src: `sf-symbol:${S().CFG.ICON_NAME || "globe.asia.australia"}`,
            width: 15,
            height: 15,
            color: colors.accent
          },
          {
            type: "text",
            text: widgetNetTitle(model),
            font: { size: "caption1", weight: "semibold" },
            textColor: colors.textMain,
            maxLines: 1,
            minScale: 0.72,
            flex: 1
          },
          {
            type: "image",
            src: "sf-symbol:clock",
            width: 10,
            height: 10,
            color: colors.textSoft
          },
          {
            type: "text",
            text: widgetTimeText(),
            font: { size: "caption2" },
            textColor: colors.textSoft
          }
        ]
      },

      {
        type: "stack",
        direction: "row",
        alignItems: "center",
        gap: 6,
        padding: [8, 10, 8, 10],
        backgroundColor: { light: "#F8FAFC", dark: "#1C1E22" },
        borderRadius: 11,
        children: [
          {
            type: "image",
            src: "sf-symbol:point.3.connected.trianglepath.dotted",
            width: 11,
            height: 11,
            color: colors.accent
          },
          {
            type: "text",
            text: `${t("policy")} ${policyText}`,
            font: { size: "caption2", weight: "medium" },
            textColor: colors.textMain,
            maxLines: 1,
            minScale: 0.72,
            flex: 1
          }
        ]
      },

      {
        type: "stack",
        direction: "column",
        gap: 5,
        children: [
          {
            type: "text",
            text: `本地 ${localFlag} · 落地 ${landingFlag}`,
            font: { size: "caption2" },
            textColor: colors.textMain,
            maxLines: 1,
            minScale: 0.72
          },
          {
            type: "text",
            text: `风险 ${riskText} · 服务 ${summary.ok}/${summary.total || 0}`,
            font: { size: "caption2" },
            textColor: colors.textMain,
            maxLines: 1,
            minScale: 0.72
          }
        ]
      }
    ]
  };
}

function buildDetailCardByPage(model, colors) {
  const page = pickWidgetPage();

  if (page === "summary") return buildSummaryCard(model, colors);
  if (page === "local") return buildLocalCard(model, colors);
  if (page === "entrance") return buildEntranceCard(model, colors);
  if (page === "landing") return buildLandingCard(model, colors);
  if (page === "risk") return buildRiskCard(model, colors);
  return buildServiceCard(model, colors);
}

function buildDetailTitle() {
  const page = pickWidgetPage();
  const map = {
    local: t("local"),
    entrance: t("entrance"),
    landing: t("landing"),
    risk: t("risk"),
    services: t("services")
  };
  return map[page] || "详情";
}

function renderWidget(model) {
  const colors = widgetColors();
  const refreshTime = new Date(Date.now() + Math.max(60, Number(S().CFG.Update) || 10) * 1000).toISOString();
  const page = pickWidgetPage();
  const detailTitle = buildDetailTitle();

  log("info", "render-widget-summary", {
    page,
    policy: model.policy || "",
    local4: maskIP(model.local?.ip || ""),
    landing4: maskIP(model.landing?.ip || "")
  });

  if (page === "summary") {
    return {
      type: "widget",
      padding: [12, 12, 12, 12],
      gap: 8,
      backgroundGradient: colors.bgGradient,
      refreshAfter: refreshTime,
      children: [
        buildSummaryCard(model, colors)
      ]
    };
  }

  return {
    type: "widget",
    padding: [12, 12, 12, 12],
    gap: 8,
    backgroundGradient: colors.bgGradient,
    refreshAfter: refreshTime,
    children: [
      {
        type: "stack",
        direction: "row",
        alignItems: "center",
        gap: 6,
        children: [
          {
            type: "image",
            src: `sf-symbol:${S().CFG.ICON_NAME || "globe.asia.australia"}`,
            width: 14,
            height: 14,
            color: colors.accent
          },
          {
            type: "text",
            text: detailTitle,
            font: { size: "caption1", weight: "semibold" },
            textColor: colors.textMain,
            maxLines: 1,
            minScale: 0.72,
            flex: 1
          },
          {
            type: "image",
            src: "sf-symbol:clock",
            width: 10,
            height: 10,
            color: colors.textSoft
          },
          {
            type: "text",
            text: widgetTimeText(),
            font: { size: "caption2" },
            textColor: colors.textSoft
          }
        ]
      },

      buildDetailCardByPage(model, colors)
    ]
  };
}

function renderErrorWidget(err) {
  const msg = String(err && err.stack ? err.stack : err);
  try { console.log(msg); } catch (_) {}

  return {
    type: "widget",
    padding: 14,
    gap: 8,
    backgroundGradient: {
      type: "linear",
      colors: [
        { light: "#FFF7F7", dark: "#2A1414" },
        { light: "#FFFFFF", dark: "#1A1A1A" }
      ],
      stops: [0, 1],
      startPoint: { x: 0, y: 0 },
      endPoint: { x: 1, y: 1 }
    },
    refreshAfter: new Date(Date.now() + 60000).toISOString(),
    children: [
      {
        type: "stack",
        direction: "row",
        alignItems: "center",
        gap: 6,
        children: [
          {
            type: "image",
            src: "sf-symbol:exclamationmark.triangle.fill",
            width: 14,
            height: 14,
            color: { light: "#EF4444", dark: "#F87171" }
          },
          {
            type: "text",
            text: "网络信息组件异常",
            font: { size: "caption1", weight: "semibold" },
            textColor: { light: "#111827", dark: "#F3F4F6" }
          }
        ]
      },
      {
        type: "text",
        text: msg.slice(0, 260),
        font: { size: "caption2" },
        textColor: { light: "#6B7280", dark: "#A1A1AA" },
        maxLines: 8
      }
    ]
  };
}

export default async function(ctx) {
  try {
    const model = await buildModel(ctx);
    const widget = renderWidget(model);
    log("info", "done", { refreshAfter: widget.refreshAfter });
    return widget;
  } catch (err) {
    try { console.log(`[NI][ERROR] fatal ${String(err && err.stack ? err.stack : err)}`); } catch (_) {}
    return renderErrorWidget(err);
  }
}
