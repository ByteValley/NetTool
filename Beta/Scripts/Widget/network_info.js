/* =========================================================
 * 模块分类 · 网络信息小组件
 * 作者 · ByteValley
 * 版本 · 2026-03-12R1
 *
 * 模块分类 · 说明
 * · 纯 Egern Generic Script + Widget DSL
 * · 重新设计为卡片式信息架构，不再按旧 Panel 长文本硬搬
 * · 保留核心能力：本地 / 入口 / 落地 / 风险 / 服务检测 / BoxJS / _compat.$argument
 * · Egern 当前无 recent-requests 公共 API，策略名 / 入口 IP 改为 env 手动传入：
 *   PROXY_POLICY / ENTRANCE4 / ENTRANCE6
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
    title: "网络信息",
    runAt: "执行时间",
    policy: "代理策略",
    local: "本地",
    entrance: "入口",
    landing: "落地",
    location: "位置",
    isp: "运营商",
    risk: "风险",
    services: "服务",
    nativeLike: "更像原生",
    nonNative: "可能非原生",
    home: "家宽",
    nonHome: "非家宽",
    weakTunnel: "代理特征偏弱",
    strongTunnel: "代理特征偏强",
    noData: "暂无数据",
    manualPolicyHint: "策略名请用 PROXY_POLICY 传入",
    wifi: "Wi-Fi",
    cellular: "蜂窝",
    unknownNet: "未知网络",
    unlocked: "已解锁",
    partialUnlocked: "部分解锁",
    notReachable: "不可达",
    timeout: "超时",
    fail: "失败",
    regionBlocked: "区域受限",
    nfFull: "完整解锁",
    nfOriginals: "仅自制剧"
  },
  "zh-Hant": {
    title: "網路資訊",
    runAt: "執行時間",
    policy: "代理策略",
    local: "本地",
    entrance: "入口",
    landing: "落地",
    location: "位置",
    isp: "運營商",
    risk: "風險",
    services: "服務",
    nativeLike: "更像原生",
    nonNative: "可能非原生",
    home: "家寬",
    nonHome: "非家寬",
    weakTunnel: "代理特徵偏弱",
    strongTunnel: "代理特徵偏強",
    noData: "暫無資料",
    manualPolicyHint: "策略名請用 PROXY_POLICY 傳入",
    wifi: "Wi-Fi",
    cellular: "行動網路",
    unknownNet: "未知網路",
    unlocked: "已解鎖",
    partialUnlocked: "部分解鎖",
    notReachable: "不可達",
    timeout: "逾時",
    fail: "失敗",
    regionBlocked: "區域受限",
    nfFull: "完整解鎖",
    nfOriginals: "僅自製劇"
  }
};

let G = null;
function S() { return G; }
function t(key) {
  const pack = SD_STR[S()?.CFG?.SD_LANG || "zh-Hans"] || SD_STR["zh-Hans"];
  return pack[key] != null ? pack[key] : key;
}

function safeJSON(s, d = {}) { try { return JSON.parse(s || ""); } catch (_) { return d; } }
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

function parseArgs(raw) {
  if (!raw) return {};
  if (typeof raw === "object") return raw;
  return String(raw).split("&").reduce((acc, kv) => {
    if (!kv) return acc;
    const i = kv.indexOf("=");
    const k = i >= 0 ? kv.slice(0, i) : kv;
    const v = i >= 0 ? kv.slice(i + 1) : "";
    acc[decodeURIComponent(k || "")] = decodeURIComponent(String(v).replace(/\+/g, "%20"));
    return acc;
  }, {});
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
  },
  async writeJSON(ctx, key, value) {
    try { if (ctx.storage?.setJSON) return await ctx.storage.setJSON(key, value); } catch (_) {}
    try { if (ctx.storage?.set) return await ctx.storage.set(key, JSON.stringify(value)); } catch (_) {}
  }
};

async function readBoxSettings(ctx) {
  const panel = await KVCompat.readJSON(ctx, "Panel");
  if (!panel || typeof panel !== "object") return {};
  if (panel.NetworkInfo && panel.NetworkInfo.Settings && typeof panel.NetworkInfo.Settings === "object") return panel.NetworkInfo.Settings;
  if (panel.Settings && typeof panel.Settings === "object") return panel.Settings;
  return {};
}

function buildENV(ctx, box) {
  const compatArgs = parseArgs(ctx?.env?._compat?.$argument || ctx?.env?.["_compat.$argument"] || "");
  const directEnv = ctx?.env || {};
  const read = (key, defVal, opt = {}) => {
    const typeHint = typeof defVal;
    const argKeys = [key].concat(opt.argAlias || []);
    const boxKeys = [key].concat(opt.boxAlias || []);
    let envRaw, hasEnv = false;
    for (const k of argKeys) {
      const v = directEnv[k];
      if (v !== undefined && v !== null && v !== "") { envRaw = v; hasEnv = true; break; }
    }
    let argRaw, hasArg = false;
    for (const k of argKeys) {
      const v = compatArgs[k];
      if (v !== undefined && v !== null && v !== "") { argRaw = v; hasArg = true; break; }
    }
    let boxRaw, hasBox = false;
    for (const k of boxKeys) {
      const v = box?.[k];
      if (v !== undefined && v !== null && v !== "") { boxRaw = v; hasBox = true; break; }
    }
    const convert = (val) => {
      if (typeHint === "boolean") return toBool(val, defVal);
      if (typeHint === "number") return toNum(val, defVal);
      return val;
    };
    if (hasEnv) return convert(envRaw);
    if (hasArg) return convert(argRaw);
    if (hasBox) return convert(boxRaw);
    return defVal;
  };
  return { read, compatArgs, directEnv };
}

function buildCFG(ctx, box) {
  const ENV = buildENV(ctx, box);
  const cfg = {
    Update: toNum(ENV.read("Update", 10), 10),
    Timeout: toNum(ENV.read("Timeout", 12), 12),
    BUDGET_SEC_RAW: ENV.read("BUDGET", 0),
    MASK_IP: toBool(ENV.read("MASK_IP", true), true),
    MASK_POS_MODE: ENV.read("MASK_POS", "auto"),
    IPv6: toBool(ENV.read("IPv6", true), true),
    DOMESTIC_IPv4: ENV.read("DOMESTIC_IPv4", "ipip"),
    DOMESTIC_IPv6: ENV.read("DOMESTIC_IPv6", "ddnspod"),
    LANDING_IPv4: ENV.read("LANDING_IPv4", "ipapi"),
    LANDING_IPv6: ENV.read("LANDING_IPv6", "ipsb"),
    TW_FLAG_MODE: toNum(ENV.read("TW_FLAG_MODE", 1), 1),
    IconPreset: ENV.read("IconPreset", "globe"),
    Icon: ENV.read("Icon", ""),
    IconColor: ENV.read("IconColor", "#60A5FA"),
    SD_STYLE: ENV.read("SD_STYLE", "icon"),
    SD_LANG: String(ENV.read("SD_LANG", "zh-Hans")).toLowerCase() === "zh-hant" ? "zh-Hant" : "zh-Hans",
    SD_TIMEOUT_SEC_RAW: ENV.read("SD_TIMEOUT", 0),
    SD_CONCURRENCY: clamp(toNum(ENV.read("SD_CONCURRENCY", 6), 6), 1, 8),
    SD_REGION_MODE: ENV.read("SD_REGION_MODE", "full"),
    SD_ICON_THEME: ENV.read("SD_ICON_THEME", "check"),
    SD_ARROW: toBool(ENV.read("SD_ARROW", true), true),
    SD_SHOW_LAT: toBool(ENV.read("SD_SHOW_LAT", true), true),
    SD_SHOW_HTTP: toBool(ENV.read("SD_SHOW_HTTP", true), true),
    LOG: toBool(ENV.read("LOG", true), true),
    LOG_LEVEL: String(ENV.read("LOG_LEVEL", "info")).toLowerCase(),
    PROXY_POLICY: String(ENV.read("PROXY_POLICY", "")).trim(),
    ENTRANCE4: String(ENV.read("ENTRANCE4", "")).trim(),
    ENTRANCE6: String(ENV.read("ENTRANCE6", "")).trim(),
    SERVICES_BOX_CHECKED_RAW: (() => {
      const v = box?.SERVICES;
      if (v == null) return null;
      if (Array.isArray(v)) return v.length ? JSON.stringify(v) : null;
      const s = String(v).trim();
      return s && s !== "[]" ? s : null;
    })(),
    SERVICES_BOX_TEXT: box?.SERVICES_TEXT != null ? String(box.SERVICES_TEXT).trim() : "",
    SERVICES_ARG_TEXT: (() => {
      const v = ENV.directEnv.SERVICES ?? ENV.compatArgs.SERVICES;
      return v != null ? String(v).trim() : "";
    })()
  };
  const baseSec = Number(cfg.Timeout) || 8;
  const secRaw = Number(cfg.SD_TIMEOUT_SEC_RAW);
  cfg.SD_TIMEOUT_MS = Math.max(CONSTS.SD_MIN_TIMEOUT, ((Number.isFinite(secRaw) && secRaw > 0) ? secRaw : baseSec) * 1000);
  cfg.BUDGET_MS = (() => {
    const raw = Number(cfg.BUDGET_SEC_RAW);
    const base = Math.max(1, Number(cfg.Timeout) || 8) * 1000;
    if (Number.isFinite(raw) && raw > 0) return Math.max(3500, raw * 1000);
    return Math.min(CONSTS.BUDGET_HARD_MS, Math.max(5500, base));
  })();
  cfg.MASK_POS = ["", "auto", "follow", "same"].includes(String(cfg.MASK_POS_MODE).trim().toLowerCase()) ? cfg.MASK_IP : toBool(cfg.MASK_POS_MODE, true);
  cfg.ICON_NAME = String(cfg.Icon || "").trim() || ({
    wifi: "wifi.router",
    globe: "globe.asia.australia",
    dots: "dot.radiowaves.left.and.right",
    antenna: "antenna.radiowaves.left.and.right",
    point: "point.3.connected.trianglepath.dotted"
  }[String(cfg.IconPreset).trim()] || "globe.asia.australia");
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

function maskIP(ip) {
  if (!ip || !S().CFG.MASK_IP) return ip || "";
  if (isIPv4(ip)) { const p = ip.split("."); return `${p[0]}.${p[1]}.*.*`; }
  if (isIPv6(ip)) { const p = ip.split(":"); return [...p.slice(0, 4), "*", "*", "*", "*"].join(":"); }
  return ip;
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
function onlyFlag(loc) { return splitFlagRaw(loc).flag || "-"; }
function flagFirst(loc) { const x = splitFlagRaw(loc); return (x.flag || "") + (x.text || ""); }
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
  if (/(^|[\s-])(cbn|china\s*broadcast)/.test(s) || /广电/.test(norm)) return S().CFG.SD_LANG === "zh-Hant" ? "中國廣電" : "中国广电";
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

function log(level, ...args) {
  if (!S().CFG.LOG) return;
  const map = { debug: 10, info: 20, warn: 30, error: 40 };
  if ((map[level] ?? 20) < (map[S().CFG.LOG_LEVEL] ?? 20)) return;
  const line = `[NI][${level.toUpperCase()}] ${args.map(x => typeof x === 'string' ? x : JSON.stringify(x)).join(' ')}`;
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
  } finally { if (tmr) clearTimeout(tmr); }
}

async function httpGetRT(url, headers = {}, timeoutMs = null, followRedirect = false) {
  const start = Date.now();
  const resp = await S().RT.http.get(url, {
    headers,
    timeout: timeoutMs == null ? capByBudget(3500) : Math.min(Number(timeoutMs) || 3500, capByBudget(3500)),
    redirect: followRedirect ? "follow" : "manual",
    policy: S().CFG.PROXY_POLICY || undefined
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
    redirect: "follow",
    policy: S().CFG.PROXY_POLICY || undefined
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
      return { ip: j?.data?.ip || "", loc: joinNonEmpty([flag, loc[0], loc[1], loc[2]], " ").replace(/\s*中国\s*/, ""), isp: String(isp || "").trim() };
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
      return { ip, loc: joinNonEmpty([flagOf(isCN ? "CN" : ""), addr.replace(/中国\s*/, "")], " "), isp: isp.replace(/中国\s*/, "") };
    }
  },
  "163": {
    url: "https://dashi.163.com/fgw/mailsrv-ipdetail/detail",
    parse: (r) => {
      const d = safeJSON(r.body, {})?.result || {};
      return { ip: d.ip || "", loc: joinNonEmpty([flagOf(d.countryCode), d.country, d.province, d.city], " ").replace(/\s*中国\s*/, ""), isp: d.isp || d.org || "" };
    }
  },
  bilibili: {
    url: "https://api.bilibili.com/x/web-interface/zone",
    parse: (r) => {
      const d = safeJSON(r.body, {})?.data || {};
      const flag = flagOf(d.country === "中国" ? "CN" : d.country);
      return { ip: d.addr || "", loc: joinNonEmpty([flag, d.country, d.province, d.city], " ").replace(/\s*中国\s*/, ""), isp: d.isp || "" };
    }
  },
  "126": {
    url: "https://ipservice.ws.126.net/locate/api/getLocByIp",
    parse: (r) => {
      const d = safeJSON(r.body, {})?.result || {};
      return { ip: d.ip || "", loc: joinNonEmpty([flagOf(d.countrySymbol), d.country, d.province, d.city], " ").replace(/\s*中国\s*/, ""), isp: d.operator || "" };
    }
  },
  pingan: {
    url: "https://rmb.pingan.com.cn/itam/mas/linden/ip/request",
    parse: (r) => {
      const d = safeJSON(r.body, {})?.data || {};
      return { ip: d.ip || "", loc: joinNonEmpty([flagOf(d.countryIsoCode), d.country, d.region, d.city], " ").replace(/\s*中国\s*/, ""), isp: d.isp || d.ispName || d.operator || d.org || d.as || "" };
    }
  }
});

const LANDING_V4_SOURCES = Object.freeze({
  ipapi: {
    url: "http://ip-api.com/json?lang=zh-CN",
    parse: (r) => {
      const j = safeJSON(r.body, {});
      return { ip: j.query || "", loc: joinNonEmpty([flagOf(j.countryCode), j.country?.replace(/\s*中国\s*/, ""), j.regionName?.split(/\s+or\s+/)[0], j.city], " "), isp: j.isp || j.org || "", org: j.org || "", as: j.as || "", country: j.country || "" };
    }
  },
  ipwhois: {
    url: "https://ipwhois.app/widget.php?lang=zh-CN",
    parse: (r) => {
      const j = safeJSON(r.body, {});
      const asn = j.asn || j.as || (j?.connection?.asn) || "";
      return { ip: j.ip || "", loc: joinNonEmpty([flagOf(j.country_code), j.country?.replace(/\s*中国\s*/, ""), j.region, j.city], " "), isp: (j?.connection?.isp) || "", org: j.org || (j?.connection?.org) || "", as: asn || "", country: j.country || "" };
    }
  },
  ipsb: {
    url: "https://api-ipv4.ip.sb/geoip",
    parse: (r) => {
      const j = safeJSON(r.body, {});
      const as = j.asn ? (`AS${j.asn}` + (j.asn_organization ? ` ${j.asn_organization}` : "")) : "";
      return { ip: j.ip || "", loc: joinNonEmpty([flagOf(j.country_code), j.country, j.region, j.city], " ").replace(/\s*中国\s*/, ""), isp: j.isp || j.organization || "", org: j.organization || j.asn_organization || "", as, country: j.country || "" };
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
function makeTryOrder(prefer, fallbackList) { return [prefer, ...fallbackList].filter((x, i, a) => x && a.indexOf(x) === i); }
function hasCityLevel(loc) {
  if (!loc) return false;
  try {
    const s = String(loc).replace(/^[\u{1F1E6}-\u{1F1FF}]{2}\s*/u, "").trim();
    if (/市|区|縣|县|州|市辖/.test(s)) return true;
    return s.split(/\s+/).filter(Boolean).length >= 3;
  } catch (_) { return false; }
}
async function trySources(order, sourceMap, { needCityPrefer = false, acceptIp = null }) {
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
      if (ok) {
        res.ip = ip;
        if (!firstOK) firstOK = res;
        if (!needCityPrefer || cityOK) return res;
      }
    } catch (_) {}
  }
  return firstOK || {};
}
async function tryIPv6Ip(order, opt = {}) {
  const timeoutMs = opt.timeoutMs != null ? opt.timeoutMs : Math.min(Math.max(CONSTS.SD_MIN_TIMEOUT, S().CFG.SD_TIMEOUT_MS), 2500);
  const maxTries = Math.max(1, Math.min(Number(opt.maxTries || order.length), order.length));
  for (const key of order.slice(0, maxTries)) {
    if (budgetLeft() <= 260) break;
    const url = IPV6_IP_ENDPOINTS[key];
    if (!url) continue;
    try {
      const r = await httpGetRT(url, {}, timeoutMs, false);
      const ip = String(r.body || "").trim();
      if (isIPv6(ip)) return { ip };
    } catch (_) {}
  }
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
  const res = await trySources(makeTryOrder(preferKey, ORDER.directV4), DIRECT_V4_SOURCES, { needCityPrefer: true, acceptIp: isIPv4 });
  if (res && res.ip && !String(res.isp || "").trim()) {
    const filled = await fillDirectIspSameIp(res.ip, preferKey).catch(() => "");
    if (filled) res.isp = filled;
  }
  return res || {};
}
async function getDirectV6(preferKey) { return await tryIPv6Ip(makeTryOrder(preferKey, ORDER.directV6), { timeoutMs: 2200 }); }
async function getLandingV4(preferKey) { return await trySources(makeTryOrder(preferKey, ORDER.landingV4), LANDING_V4_SOURCES, { acceptIp: isIPv4 }); }
async function probeLandingV6(preferKey) {
  const r = await tryIPv6Ip(makeTryOrder(preferKey, ORDER.landingV6), { timeoutMs: Math.min(CONSTS.V6_PROBE_TO_MS, 900), maxTries: 2 });
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
    const r = await httpGetRT("https://dns.google/resolve?name=" + encodeURIComponent(name) + "&type=PTR", { Accept: "application/dns-json" }, Math.min(900, capByBudget(900)), true).catch(() => null);
    if (!r || r.status !== 200) return "";
    const j = safeJSON(r.body, {});
    const ans = Array.isArray(j.Answer) ? j.Answer : [];
    const first = ans.find((x) => x && (x.type === 12 || String(x.type) === "12") && x.data);
    return first ? String(first.data).trim().replace(/\.$/, "") : "";
  })(), Math.min(950, capByBudget(950)), "");
}

function normStr(x) { return String(x == null ? "" : x).replace(/\s+/g, " ").replace(/[（(].*?[）)]/g, " ").trim().toLowerCase(); }
function parseASNNumber(s) {
  const str = String(s || "");
  const m = str.match(/\bAS(\d{1,10})\b/i);
  if (m) return Number(m[1]) || 0;
  const m2 = str.match(/\b(\d{1,10})\b/);
  return m2 ? (Number(m2[1]) || 0) : 0;
}
const RISK_RULES = Object.freeze({
  dataCenterKeywords: ["datacenter", "data center", "hosting", "cloud", "cdn", "edge", "vps", "colo", "colocation", "proxy", "vpn", "tunnel", "relay", "compute", "server", "amazon", "aws", "google", "gcp", "microsoft", "azure", "digitalocean", "linode", "ovh", "hetzner", "vultr", "oracle", "alibaba cloud", "tencent cloud", "cloudflare", "fastly", "akamai", "leaseweb", "choopa", "dmit", "racknerd"],
  homeBroadbandKeywords: ["china telecom", "chinanet", "ctcc", "as4134", "as4809", "china mobile", "cmcc", "cmnet", "cmi", "as9808", "china unicom", "unicom", "cucc", "as4837", "cernet", "china education", "comcast", "xfinity", "verizon", "at&t", "charter", "spectrum", "cox", "rogers", "bell canada", "telus", "bt", "virgin media", "sky broadband", "deutsche telekom", "telefonica", "orange", "vodafone", "isp", "broadband", "fiber", "ftth", "residential", "cable", "docsis", "pppoe", "dsl", "adsl", "vdsl", "pon", "gpon", "epon", "cpe", "dynamic", "dyn", "pool", "subscriber", "cust", "customer", "telecom", "communications", "chunghwa", "cht", "hinet", "kbro", "formosabroadband", "formosa broadband", "seednet", "taiwan broadband", "tbc", "cable tv", "cablemodem"],
  mobileKeywords: ["mobile", "lte", "4g", "5g", "cell", "cellular", "wireless", "epc", "ims", "gprs", "wimax"],
  rdnsDatacenterSuffix: ["amazonaws.com", "compute.amazonaws.com", "googleusercontent.com", "cloudapp.azure.com", "digitalocean.com", "linodeusercontent.com", "ovh.net", "kimsufi.com", "online.net", "hetzner.de", "hetzner.com", "vultrusercontent.com", "leaseweb.net", "choopa.net", "cloudflare.com", "cloudflarenet.com", "fastly.net", "akamai.net"],
  rdnsHomeKeywords: ["dynamic", "dyn", "pppoe", "dsl", "adsl", "vdsl", "cable", "docsis", "fiber", "ftth", "fios", "broadband", "res", "home", "cust", "customer", "subscriber", "pool", "cpe", "hinet", "formosabroadband", "kbro", "cht", "seednet"],
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
  const ISP = normStr(isp), ORG = normStr(org), CTRY = normStr(country), AS = normStr(asField);
  const hay = joinNonEmpty([ISP, ORG, AS], " | ");
  const asn = parseASNNumber(asField);
  const reasons = [];
  let riskValue = 0;
  const rdnsHitDC = _rdnsLooksDatacenter(rdnsHost);
  const rdnsHitHB = _hasAny(rdnsHost, RISK_RULES.rdnsHomeKeywords);
  const rdnsHitMobile = _hasAny(rdnsHost, RISK_RULES.rdnsMobileKeywords);
  if (rdnsHitDC) { riskValue += 75; reasons.push("PTR命中机房"); }
  if (rdnsHitHB) { const delta = rdnsHitDC ? -6 : -26; riskValue += delta; reasons.push(`PTR住宅${delta}`); }
  if (rdnsHitMobile) { const delta = rdnsHitDC ? 0 : -8; riskValue += delta; reasons.push(`PTR移动${delta}`); }
  const dcHit = _hasAny(hay, RISK_RULES.dataCenterKeywords);
  const hbHit = _hasAny(hay, RISK_RULES.homeBroadbandKeywords);
  const mobileHit = _hasAny(hay, RISK_RULES.mobileKeywords);
  if (dcHit) { riskValue += 55; reasons.push("ORG/ISP机房+55"); }
  if (hbHit) { const delta = (rdnsHitDC || dcHit) ? -10 : -22; riskValue += delta; reasons.push(`ORG/ISP家宽${delta}`); }
  if (mobileHit) { const delta = (rdnsHitDC || dcHit) ? 0 : -10; riskValue += delta; reasons.push(`ORG/ISP移动${delta}`); }
  if (RISK_RULES.highRiskCountries.some((x) => CTRY.includes(normStr(x)))) { riskValue += 18; reasons.push("国家+18"); }
  if (!ORG && !AS && ISP.length <= 3) { riskValue += 10; reasons.push("信息不足+10"); }
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

const SD_ALIAS = {
  yt: "youtube", youtube: "youtube", "youtube premium": "youtube", 油管: "youtube",
  nf: "netflix", netflix: "netflix", 奈飞: "netflix", 奈飛: "netflix",
  disney: "disney", "disney+": "disney", 迪士尼: "disney",
  chatgpt: "chatgpt_app", gpt: "chatgpt_app", openai: "chatgpt_app",
  chatgpt_web: "chatgpt_web", "chatgpt-web": "chatgpt_web", "chatgpt web": "chatgpt_web",
  hulu: "hulu_us", 葫芦: "hulu_us", 葫蘆: "hulu_us", huluus: "hulu_us", hulujp: "hulu_jp",
  hbo: "hbo", max: "hbo"
};
const SD_TEST_KEYS = ["youtube", "netflix", "disney", "chatgpt_web", "chatgpt_app", "hulu_us", "hulu_jp", "hbo"];
function parseServices(raw) {
  if (raw == null) return [];
  let s = String(raw).trim();
  if (!s || s === "[]" || s === "{}" || /^null$/i.test(s) || /^undefined$/i.test(s)) return [];
  try {
    const arr = JSON.parse(s);
    if (Array.isArray(arr)) return normSvcList(arr);
  } catch (_) {}
  return normSvcList(s.split(/[,\uFF0C;|\/ \t\r\n]+/));
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
  const argList = parseServices(cfg.SERVICES_ARG_TEXT);
  if (argList.length) return argList;
  const boxCheckedList = parseServices(cfg.SERVICES_BOX_CHECKED_RAW);
  if (boxCheckedList.length) return boxCheckedList;
  const boxTextList = parseServices(cfg.SERVICES_BOX_TEXT);
  if (boxTextList.length) return boxTextList;
  return SD_TEST_KEYS.slice();
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
  try { return String.fromCodePoint(...[...cc].map((c) => 0x1F1E6 + (c.charCodeAt(0) - 65))); } catch (_) { return ""; }
}
const SD_CC_NAME = {
  "zh-Hans": { CN: "中国", TW: "台湾", HK: "中国香港", MO: "中国澳门", JP: "日本", KR: "韩国", US: "美国", SG: "新加坡", MY: "马来西亚", TH: "泰国", VN: "越南", PH: "菲律宾", ID: "印度尼西亚", IN: "印度", AU: "澳大利亚", NZ: "新西兰", CA: "加拿大", GB: "英国", DE: "德国", FR: "法国", NL: "荷兰", ES: "西班牙", IT: "意大利", BR: "巴西" },
  "zh-Hant": { CN: "中國", TW: "台灣", HK: "中國香港", MO: "中國澳門", JP: "日本", KR: "南韓", US: "美國", SG: "新加坡", MY: "馬來西亞", TH: "泰國", VN: "越南", PH: "菲律賓", ID: "印尼", IN: "印度", AU: "澳洲", NZ: "紐西蘭", CA: "加拿大", GB: "英國", DE: "德國", FR: "法國", NL: "荷蘭", ES: "西班牙", IT: "義大利", BR: "巴西" }
};
function sd_ccPretty(cc) {
  cc = (cc || "").toUpperCase();
  const flag = sd_flagFromCC(cc);
  const name = SD_CC_NAME[S().CFG.SD_LANG][cc];
  if (!cc) return "—";
  if (S().CFG.SD_REGION_MODE === "flag") return flag || "—";
  if (S().CFG.SD_REGION_MODE === "abbr") return (flag || "") + cc;
  if (flag && name) return `${flag} ${name}`;
  if (flag) return `${flag} ${cc}`;
  return cc;
}
function serviceStateMeta(ok, tag, state) {
  const st = state ? state : (ok ? (/自制|自製|original/i.test(String(tag || "")) || /部分/i.test(String(tag || "")) ? "partial" : "full") : "blocked");
  const icons = S().CFG.SD_ICON_THEME === "lock" ? { full: "🔓", partial: "🔐", blocked: "🔒" } : S().CFG.SD_ICON_THEME === "circle" ? { full: "⭕️", partial: "⛔️", blocked: "🚫" } : { full: "✅", partial: "❇️", blocked: "❎" };
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
function sd_compact(key, ok, cc, tag, state) {
  const meta = serviceStateMeta(ok, tag, state);
  return { key, name: sd_nameOfKey(key), ok, cc, tag: tag || "", state: meta.st, icon: meta.icon, region: cc ? sd_ccPretty(cc) : "—" };
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
    const xo = resp?.headers?.["x-originating-url"] || resp?.headers?.["X-Originating-URL"];
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
  if (!r.ok) return sd_compact("youtube", false, "", t("notReachable"));
  let cc = "US";
  try { let m = r.data.match(/"countryCode":"([A-Z]{2})"/); if (!m) m = r.data.match(/["']GL["']\s*:\s*["']([A-Z]{2})["']/); if (m) cc = m[1]; } catch (_) {}
  return sd_compact("youtube", true, cc, "");
}
async function sd_testChatGPTWeb() {
  const r = await sd_httpGet("https://chatgpt.com/cdn-cgi/trace", {}, true);
  if (!r.ok) return sd_compact("chatgpt_web", false, "", t("notReachable"));
  let cc = ""; try { const m = r.data.match(/loc=([A-Z]{2})/); if (m) cc = m[1]; } catch (_) {}
  return sd_compact("chatgpt_web", true, cc, "");
}
async function sd_testChatGPTAppAPI() {
  const r = await sd_httpGet("https://api.openai.com/v1/models", {}, true);
  if (!r.ok) return sd_compact("chatgpt_app", false, "", t("notReachable"));
  let cc = "";
  try { const h = r.headers || {}; cc = (h["cf-ipcountry"] || h["CF-IPCountry"] || h["Cf-IpCountry"] || "").toString().toUpperCase(); if (!/^[A-Z]{2}$/.test(cc)) cc = ""; } catch (_) {}
  if (!cc) cc = await sd_queryLandingCCMulti();
  return sd_compact("chatgpt_app", true, cc, "");
}
async function sd_testNetflix() {
  const r1 = await sd_nfGet(SD_NF_NONORIG);
  if (!r1.ok) return sd_compact("netflix", false, "", t("fail"));
  if (r1.status === 403) return sd_compact("netflix", false, "", t("regionBlocked"));
  if (r1.status === 404) {
    const r2 = await sd_nfGet(SD_NF_ORIGINAL);
    if (!r2.ok) return sd_compact("netflix", false, "", t("fail"));
    if (r2.status === 404) return sd_compact("netflix", false, "", t("regionBlocked"));
    return sd_compact("netflix", true, sd_parseNFRegion(r2) || "", t("nfOriginals"), "partial");
  }
  if (r1.status === 200) return sd_compact("netflix", true, sd_parseNFRegion(r1) || "", t("nfFull"), "full");
  return sd_compact("netflix", false, "", `HTTP ${r1.status}`);
}
async function sd_testDisney() {
  const rHome = await sd_httpGet("https://www.disneyplus.com/", { "Accept-Language": "en" }, true);
  if (!rHome.ok || rHome.status !== 200 || /Sorry,\s*Disney\+\s*is\s*not\s*available/i.test(rHome.data || "")) return sd_compact("disney", false, "", (!rHome.ok) ? t("timeout") : t("regionBlocked"));
  let homeCC = "";
  try { const m = rHome.data.match(/"countryCode"\s*:\s*"([A-Z]{2})"/i) || rHome.data.match(/data-country=["']([A-Z]{2})["']/i); if (m) homeCC = m[1].toUpperCase(); } catch (_) {}
  const headers = { "Accept-Language": "en", "Authorization": "ZGlzbmV5JmJyb3dzZXImMS4wLjA.Cu56AgSfBTDag5NiRA81oLHkDZfu5L3CKadnefEAY84", "Content-Type": "application/json", "User-Agent": SD_UA };
  const body = JSON.stringify({ query: "mutation registerDevice($input: RegisterDeviceInput!) { registerDevice(registerDevice: $input) { grant { grantType assertion } } }", variables: { input: { applicationRuntime: "chrome", attributes: { browserName: "chrome", browserVersion: "120.0.0.0", manufacturer: "apple", model: null, operatingSystem: "macintosh", operatingSystemVersion: "10.15.7", osDeviceIds: [] }, deviceFamily: "browser", deviceLanguage: "en", deviceProfile: "macosx" } } });
  const rBam = await sd_httpPost("https://disney.api.edge.bamgrid.com/graph/v1/device/graphql", headers, body);
  if (!rBam.ok || rBam.status !== 200) return sd_compact("disney", true, homeCC || (await sd_queryLandingCCMulti()) || "", "");
  const d = safeJSON(rBam.data, {});
  if (d?.errors) return sd_compact("disney", true, homeCC || (await sd_queryLandingCCMulti()) || "", "");
  const inLoc = d?.extensions?.sdk?.session?.inSupportedLocation;
  const bamCC = d?.extensions?.sdk?.session?.location?.countryCode;
  const blocked = inLoc === false;
  return sd_compact("disney", !blocked, blocked ? "" : ((bamCC || homeCC || (await sd_queryLandingCCMulti()) || "").toUpperCase()), blocked ? t("regionBlocked") : "");
}
async function sd_testHuluUS() {
  const r = await sd_httpGet("https://www.hulu.com/", {}, true);
  if (!r.ok) return sd_compact("hulu_us", false, "", t("notReachable"));
  const blocked = /not\s+available\s+in\s+your\s+region/i.test(r.data || "");
  return sd_compact("hulu_us", !blocked, blocked ? "" : "US", blocked ? t("regionBlocked") : "");
}
async function sd_testHuluJP() {
  const r = await sd_httpGet("https://www.hulu.jp/", { "Accept-Language": "ja" }, true);
  if (!r.ok) return sd_compact("hulu_jp", false, "", t("notReachable"));
  const blocked = /ご利用いただけません|サービスをご利用いただけません|not available/i.test(r.data || "");
  return sd_compact("hulu_jp", !blocked, blocked ? "" : "JP", blocked ? t("regionBlocked") : "");
}
async function sd_testHBO() {
  const r = await sd_httpGet("https://www.max.com/", {}, true);
  if (!r.ok) return sd_compact("hbo", false, "", t("notReachable"));
  const blocked = /not\s+available\s+in\s+your\s+region|country\s+not\s+supported/i.test(r.data || "");
  let cc = ""; try { const m = String(r.data || "").match(/"countryCode"\s*:\s*"([A-Z]{2})"/i); if (m) cc = m[1].toUpperCase(); } catch (_) {}
  if (!cc) cc = await sd_queryLandingCCMulti();
  return sd_compact("hbo", !blocked, blocked ? "" : cc, blocked ? t("regionBlocked") : "");
}
function buildServiceTests() {
  return { youtube: sd_testYouTube, netflix: sd_testNetflix, disney: sd_testDisney, chatgpt_web: sd_testChatGPTWeb, chatgpt_app: sd_testChatGPTAppAPI, hulu_us: sd_testHuluUS, hulu_jp: sd_testHuluJP, hbo: sd_testHBO };
}
async function runServiceChecks() {
  const order = selectServices();
  if (!order.length) return [];
  const map = buildServiceTests();
  const conc = S().CFG.SD_CONCURRENCY;
  const stageCap = Math.max(800, Math.min(5200, capByBudget(5200)));
  const results = new Array(order.length);
  let cursor = 0, inflight = 0, finished = 0, doneFlag = false;
  const finish = () => { doneFlag = true; };
  const tryLaunch = () => {
    while (!doneFlag && inflight < conc && cursor < order.length) {
      if (budgetLeft() <= 320) break;
      const idx = cursor++;
      const key = order[idx];
      const fn = map[key];
      if (!fn) { results[idx] = sd_compact(key, false, "", t("fail")); finished++; continue; }
      inflight++;
      Promise.resolve(fn()).then((line) => { results[idx] = line; }).catch(() => { results[idx] = sd_compact(key, false, "", t("fail")); }).finally(() => { inflight--; finished++; if (finished >= order.length) finish(); else tryLaunch(); });
    }
  };
  tryLaunch();
  await withTimeout(new Promise((r) => {
    const tick = () => { if (doneFlag || finished >= order.length || budgetLeft() <= 260) return r(true); setTimeout(tick, 30); };
    tick();
  }), stageCap, false);
  finish();
  for (let i = 0; i < results.length; i++) if (!results[i]) results[i] = sd_compact(order[i], false, "", t("timeout"));
  return results.filter(Boolean);
}

const ENT_LOC_CHAIN = Object.freeze({
  pingan: async (ip) => {
    const r = await httpGetRT("https://rmb.pingan.com.cn/itam/mas/linden/ip/request?ip=" + encodeURIComponent(ip), {}, Math.min(2200, Math.max(1200, S().CFG.SD_TIMEOUT_MS || 0)), false);
    const d = safeJSON(r.body, {})?.data || {};
    if (!d || (!d.countryIsoCode && !d.country)) throw new Error("pingan-empty");
    return { loc: joinNonEmpty([flagOf(d.countryIsoCode), d.country, d.region, d.city], " ").replace(/\s*中国\s*/, ""), isp: String(d.isp || d.ispName || d.operator || d.org || d.as || "").trim() };
  },
  ipapi: async (ip) => {
    const r = await httpGetRT(`http://ip-api.com/json/${encodeURIComponent(ip)}?lang=zh-CN`, {}, Math.min(2200, Math.max(1200, S().CFG.SD_TIMEOUT_MS || 0)), false);
    const j = safeJSON(r.body, {});
    return { loc: joinNonEmpty([flagOf(j.countryCode), j.country?.replace(/\s*中国\s*/, ""), j.regionName?.split(/\s+or\s+/)[0], j.city], " "), isp: String(j.isp || j.org || j.as || "").trim() };
  },
  ipwhois: async (ip) => {
    const r = await httpGetRT(`https://ipwhois.app/json/${encodeURIComponent(ip)}?lang=zh-CN`, {}, Math.min(2200, Math.max(1200, S().CFG.SD_TIMEOUT_MS || 0)), false);
    const j = safeJSON(r.body, {});
    return { loc: joinNonEmpty([flagOf(j.country_code), j.country?.replace(/\s*中国\s*/, ""), j.region, j.city], " "), isp: String((j.connection && j.connection.isp) || j.org || "").trim() };
  },
  ipsb: async (ip) => {
    const r = await httpGetRT(`https://api.ip.sb/geoip/${encodeURIComponent(ip)}`, {}, Math.min(2200, Math.max(1200, S().CFG.SD_TIMEOUT_MS || 0)), false);
    const j = safeJSON(r.body, {});
    return { loc: joinNonEmpty([flagOf(j.country_code), j.country, j.region, j.city], " ").replace(/\s*中国\s*/, ""), isp: String(j.isp || j.organization || "").trim() };
  }
});
function _sameLoc(a, b) {
  const A = String(a || "").trim(), B = String(b || "").trim();
  if (!A || !B) return false;
  const strip = (s) => String(s).replace(/^[\u{1F1E6}-\u{1F1FF}]{2}\s*/u, "").trim();
  return strip(A) === strip(B);
}
async function getEntranceBundle(ip) {
  const nowT = Date.now();
  const fresh = (nowT - S().ENT_CACHE.t) < Math.max(CONSTS.ENT_MIN_TTL, Math.min(Number(S().CFG.Update) || 10, CONSTS.ENT_MAX_TTL)) * 1000;
  if (S().ENT_CACHE.ip === ip && fresh && S().ENT_CACHE.data) return S().ENT_CACHE.data;
  const [p, a, w, s] = await Promise.allSettled([ENT_LOC_CHAIN.pingan(ip), ENT_LOC_CHAIN.ipapi(ip), ENT_LOC_CHAIN.ipwhois(ip), ENT_LOC_CHAIN.ipsb(ip)]);
  const pick = (arr) => { for (const x of arr) if (x.status === "fulfilled") return x.value || {}; return {}; };
  const p1 = (p.status === "fulfilled") ? (p.value || {}) : {};
  const c2 = pick([a, w, s]);
  let loc1 = String(p1.loc || "").trim(), isp1 = String(p1.isp || "").trim();
  let loc2 = String(c2.loc || "").trim(), isp2 = String(c2.isp || "").trim();
  if (!loc1 && loc2) { loc1 = loc2; isp1 = isp2; loc2 = ""; isp2 = ""; }
  if (loc1 && !isp1 && isp2) isp1 = isp2;
  if (_sameLoc(loc1, loc2)) loc2 = "";
  const res = { ip, loc1, isp1, loc2, isp2 };
  S().ENT_CACHE = { ip, t: nowT, data: res };
  return res;
}

function txt(text, fontSize, weight, color, opts) {
  const el = { type: "text", text: String(text ?? ""), font: { size: fontSize, weight: weight || "regular" } };
  if (color) el.textColor = color;
  if (opts) Object.assign(el, opts);
  return el;
}
function icon(name, size, color, opts) {
  const el = { type: "image", src: `sf-symbol:${name}`, width: size, height: size };
  if (color) el.color = color;
  if (opts) Object.assign(el, opts);
  return el;
}
function hstack(children, opts) { const el = { type: "stack", direction: "row", alignItems: "center", children }; if (opts) Object.assign(el, opts); return el; }
function vstack(children, opts) { const el = { type: "stack", direction: "column", alignItems: "start", children }; if (opts) Object.assign(el, opts); return el; }
function spacer(length) { const el = { type: "spacer" }; if (length != null) el.length = length; return el; }
function divider() { return hstack([spacer()], { height: 1, backgroundColor: "rgba(255,255,255,0.08)" }); }
function pill(textStr, bg, fg) { return vstack([txt(textStr, 9, "semibold", fg || "#FFFFFF")], { padding: [4, 7, 4, 7], backgroundColor: bg, borderRadius: 999 }); }

function sectionCard(title, iconName, lines, opts = {}) {
  const children = [
    hstack([
      icon(iconName, 11, opts.iconColor || "#93C5FD"),
      txt(title, 10, "bold", "rgba(255,255,255,0.88)"),
      spacer()
    ], { gap: 4 })
  ];

  for (const line of lines.filter(Boolean).slice(0, opts.maxLines || 3)) {
    children.push(
      txt(line, 9, "medium", "rgba(255,255,255,0.78)", {
        maxLines: 1,
        minScale: 0.62
      })
    );
  }

  return vstack(children, {
    gap: 2,
    padding: [8, 9, 8, 9],
    backgroundColor: opts.backgroundColor || "rgba(255,255,255,0.06)",
    borderRadius: 12,
    width: opts.width,
    height: opts.height
  });
}

function buildSectionLines(kind, data, ip6) {
  const lines = [];
  if (data?.ip) lines.push(`IPv4 ${maskIP(data.ip)}`);
  if (ip6?.ip) lines.push(`IPv6 ${maskIP(ip6.ip)}`);
  if (kind === "local") {
    if (data?.loc) lines.push((S().CFG.MASK_POS ? onlyFlag(data.loc) : flagFirst(data.loc)) || "-");
    if (data?.isp) lines.push(fmtISP(data.isp, data.loc));
  } else if (kind === "landing") {
    if (data?.loc) lines.push(flagFirst(data.loc));
    if (data?.isp) lines.push(fmtISP(data.isp, data.loc));
  } else if (kind === "entrance") {
    if (data?.loc1) lines.push(flagFirst(data.loc1));
    if (data?.isp1) lines.push(fmtISP(data.isp1, data.loc1));
  }
  return lines.filter(Boolean);
}

function renderAccessoryInline(model) {
  const textStr = `${netTypeLine()} · ${model.policy || "-"} · ${model.landing?.ip ? maskIP(model.landing.ip) : t("noData")}`;
  return { type: "widget", children: [icon(S().CFG.ICON_NAME, 12, S().CFG.IconColor), txt(textStr, 12, "medium", null, { maxLines: 1, minScale: 0.65 })] };
}
function renderAccessoryCircular(model) {
  return {
    type: "widget",
    gap: 2,
    children: [
      spacer(),
      icon(S().CFG.ICON_NAME, 18, S().CFG.IconColor),
      txt(model.risk ? `${model.risk.riskValue}%` : "--", 12, "bold", null, { minScale: 0.6 }),
      txt(model.risk ? model.risk.lineType : t("risk"), 9, "medium", null, { minScale: 0.6 }),
      spacer()
    ]
  };
}
function renderAccessoryRectangular(model) {
  const sv = (model.services || []).slice(0, 3).map((x) => `${x.icon}${x.name.replace(/\(.+?\)/g, "")}`);
  return {
    type: "widget",
    gap: 3,
    children: [
      hstack([icon(S().CFG.ICON_NAME, 11, S().CFG.IconColor), txt(model.policy || "-", 11, "bold", null, { maxLines: 1, minScale: 0.7 }), spacer(), txt(model.runAt.slice(6), 9, "medium", "rgba(255,255,255,0.55)")], { gap: 4 }),
      txt(model.landing?.loc ? flagFirst(model.landing.loc) : t("noData"), 10, "medium", null, { maxLines: 1, minScale: 0.7 }),
      txt(sv.join("  ") || t("noData"), 9, "medium", null, { maxLines: 1, minScale: 0.65 })
    ]
  };
}

function makeRoot(children, gradientColors, padding) {
  return {
    type: "widget",
    padding: padding || [12, 14, 12, 14],
    gap: 0,
    backgroundGradient: {
      type: "linear",
      colors: gradientColors || ["#0B1220", "#0E1A32", "#10233F"],
      startPoint: { x: 0, y: 0 },
      endPoint: { x: 1, y: 1 }
    },
    refreshAfter: new Date(Date.now() + Math.max(60, Number(S().CFG.Update) || 10) * 1000).toISOString(),
    children
  };
}

function headerBar(model, titleSize, iconSize) {
  return hstack([
    icon(S().CFG.ICON_NAME, iconSize, S().CFG.IconColor),
    vstack([
      txt(t("title"), titleSize, "heavy", "#FFFFFF", { maxLines: 1, minScale: 0.82 }),
      txt(netTypeLine(), Math.max(8, titleSize - 4), "medium", "rgba(255,255,255,0.65)", {
        maxLines: 1,
        minScale: 0.62
      })
    ], {
      gap: 1,
      width: 178
    }),
    spacer(6),
    vstack([
      txt(model.policy || "-", 9, "bold", "#BFDBFE", {
        maxLines: 1,
        minScale: 0.6
      }),
      txt(model.runAt.slice(6), 8, "medium", "rgba(255,255,255,0.55)", {
        maxLines: 1,
        minScale: 0.65
      })
    ], {
      alignItems: "end",
      gap: 1,
      width: 58
    })
  ], { gap: 6, alignItems: "center" });
}

function riskCard(model) {
  const risk = model.risk;
  if (!risk) {
    return sectionCard(t("risk"), "shield.lefthalf.filled", [t("noData")], {
      iconColor: "#FCA5A5",
      backgroundColor: "rgba(255,255,255,0.06)"
    });
  }

  const riskText = `${risk.riskValue}%`;
  const color = risk.riskValue >= 80 ? "#F87171" : risk.riskValue >= 50 ? "#FBBF24" : "#34D399";

  return vstack([
    hstack([
      icon("shield.lefthalf.filled", 12, color),
      txt(t("risk"), 10, "bold", "rgba(255,255,255,0.88)"),
      spacer(),
      pill(riskText, color + "33", color)
    ], { gap: 4 }),
    txt(`${risk.lineType} · ${risk.nativeHint}`, 9, "medium", "rgba(255,255,255,0.8)", {
      maxLines: 1,
      minScale: 0.7
    }),
    txt(risk.tunnelHint, 8, "medium", "rgba(255,255,255,0.58)", {
      maxLines: 1,
      minScale: 0.7
    }),
    txt((risk.reasons || []).slice(0, 1).join(" · ") || "-", 7, "medium", "rgba(255,255,255,0.45)", {
      maxLines: 1,
      minScale: 0.62
    })
  ], {
    gap: 2,
    padding: [8, 9, 8, 9],
    backgroundColor: "rgba(255,255,255,0.06)",
    borderRadius: 12
  });
}

function servicesRow(model, maxItems) {
  const items = (model.services || []).slice(0, maxItems || 4).map((x) => vstack([
    txt(x.icon, 12, "regular", null),
    txt(x.name.replace(/\(.+?\)/g, ""), 7, "medium", "rgba(255,255,255,0.78)", {
      maxLines: 1,
      minScale: 0.62
    }),
    txt(x.cc ? x.cc : "-", 7, "medium", "rgba(255,255,255,0.5)", {
      maxLines: 1,
      minScale: 0.62
    })
  ], {
    alignItems: "center",
    gap: 1,
    padding: [5, 3, 5, 3],
    backgroundColor: "rgba(255,255,255,0.04)",
    borderRadius: 10,
    width: 52
  }));

  if (!items.length) {
    return sectionCard(t("services"), "play.rectangle.on.rectangle", [t("noData")], {
      iconColor: "#C4B5FD"
    });
  }

  return vstack([
    hstack([
      icon("play.rectangle.on.rectangle", 12, "#C4B5FD"),
      txt(t("services"), 10, "bold", "rgba(255,255,255,0.88)")
    ], { gap: 4 }),
    hstack(items, { gap: 4 })
  ], {
    gap: 5,
    padding: [8, 9, 8, 9],
    backgroundColor: "rgba(255,255,255,0.06)",
    borderRadius: 12
  });
}

function renderSystemSmall(model) {
  const children = [
    headerBar(model, 13, 14), spacer(6), divider(), spacer(8),
    sectionCard(t("landing"), "paperplane.circle.fill", buildSectionLines("landing", model.landing, model.landing6), { iconColor: "#93C5FD", maxLines: 3 }),
    spacer(8),
    riskCard(model),
    spacer(),
    txt(model.policy ? `${t("policy")}: ${model.policy}` : t("manualPolicyHint"), 8, "medium", "rgba(255,255,255,0.45)", { maxLines: 1, minScale: 0.7 })
  ];
  return makeRoot(children, ["#0D1323", "#11213D", "#1A2A4E"], [12, 14, 10, 14]);
}
function renderSystemMedium(model) {
  const localCard = sectionCard(
    t("local"),
    "house.fill",
    buildSectionLines("local", model.local, model.local6),
    {
      iconColor: "#60A5FA",
      width: 156,
      maxLines: 4,
      height: 92
    }
  );

  const landingCard = sectionCard(
    t("landing"),
    "paperplane.circle.fill",
    buildSectionLines("landing", model.landing, model.landing6),
    {
      iconColor: "#34D399",
      width: 156,
      maxLines: 4,
      height: 92
    }
  );

  const children = [
    headerBar(model, 14, 16),
    spacer(4),
    divider(),
    spacer(6),

    hstack([localCard, landingCard], {
      gap: 8,
      alignItems: "start"
    }),

    spacer(6),

    hstack([
      vstack([riskCard(model)], { width: 122 }),
      vstack([servicesRow(model, 4)], { width: 202 })
    ], {
      gap: 8,
      alignItems: "start"
    })

    // 按你的要求，其他逻辑不动，但这里把底部那行 policy 提示拿掉，
    // 因为它正是导致底部被截半的元凶之一
  ];

  return makeRoot(children, ["#0B1220", "#0F1C34", "#182E52"], [10, 12, 8, 12]);
}

function serviceListCard(model, maxItems) {
  const rows = (model.services || []).slice(0, maxItems || 8).map((x) => hstack([
    txt(x.icon, 12),
    txt(x.name, 10, "medium", "rgba(255,255,255,0.86)", { width: 76, maxLines: 1, minScale: 0.75 }),
    spacer(),
    txt(x.region || "-", 9, "medium", "rgba(255,255,255,0.62)", { maxLines: 1, minScale: 0.7 })
  ], { gap: 5 }));
  return vstack([
    hstack([icon("play.rectangle.on.rectangle", 12, "#C4B5FD"), txt(t("services"), 10, "bold", "rgba(255,255,255,0.88)")], { gap: 4 }),
    ...rows
  ], { gap: 4, padding: [9, 10, 9, 10], backgroundColor: "rgba(255,255,255,0.06)", borderRadius: 12 });
}

function renderSystemLarge(model) {
  const localCard = sectionCard(t("local"), "house.fill", buildSectionLines("local", model.local, model.local6), { iconColor: "#60A5FA", maxLines: 4 });
  const entData = model.entrance?.ip || model.entrance?.loc1 || model.entrance?.isp1 ? model.entrance : {};
  const entranceCard = sectionCard(t("entrance"), "point.3.connected.trianglepath.dotted", buildSectionLines("entrance", entData, model.entrance6), { iconColor: "#A78BFA", maxLines: 4, backgroundColor: entData.ip || entData.loc1 ? "rgba(255,255,255,0.06)" : "rgba(255,255,255,0.03)" });
  const landingCard = sectionCard(t("landing"), "paperplane.circle.fill", buildSectionLines("landing", model.landing, model.landing6), { iconColor: "#34D399", maxLines: 4 });
  const children = [
    headerBar(model, 16, 18), spacer(6), divider(), spacer(8),
    hstack([vstack([localCard, spacer(8), entranceCard], { gap: 0 }), vstack([landingCard, spacer(8), riskCard(model)], { gap: 0 })], { gap: 8, alignItems: "start" }),
    spacer(8),
    serviceListCard(model, 8),
    spacer(),
    txt(model.policy ? `${t("policy")}: ${model.policy}` : t("manualPolicyHint"), 8, "medium", "rgba(255,255,255,0.45)", { maxLines: 1, minScale: 0.7 })
  ];
  return makeRoot(children, ["#0A1120", "#0D1C36", "#17335A"], [12, 14, 10, 14]);
}

function renderByFamily(model) {
  const family = S().RT.widgetFamily || "systemMedium";
  if (family === "accessoryInline") return renderAccessoryInline(model);
  if (family === "accessoryCircular") return renderAccessoryCircular(model);
  if (family === "accessoryRectangular") return renderAccessoryRectangular(model);
  if (family === "systemSmall") return renderSystemSmall(model);
  if (family === "systemLarge" || family === "systemExtraLarge") return renderSystemLarge(model);
  return renderSystemMedium(model);
}

async function buildModel(ctx) {
  const box = await readBoxSettings(ctx);
  const cfg = buildCFG(ctx, box);
  G = {
    RT: ctx,
    CFG: cfg,
    DEADLINE: Date.now() + cfg.BUDGET_MS,
    DEBUG: [],
    ENT_CACHE: { ip: "", t: 0, data: null }
  };
  log("info", "start", { family: ctx.widgetFamily || "systemMedium", policy: cfg.PROXY_POLICY || "-" });
  const sdPromise = runServiceChecks().catch(() => []);
  const local = await getDirectV4(cfg.DOMESTIC_IPv4).catch(() => ({}));
  const local6 = (cfg.IPv6 && ctx.device?.ipv6?.address) ? await getDirectV6(cfg.DOMESTIC_IPv6).catch(() => ({})) : {};
  const landing = await getLandingV4(cfg.LANDING_IPv4).catch(() => ({}));
  const probe = cfg.IPv6 ? await probeLandingV6(cfg.LANDING_IPv6).catch(() => ({ ok: false, ip: "" })) : { ok: false, ip: "" };
  const landing6 = probe.ok ? { ip: probe.ip } : {};
  const entrance4 = isIPv4(cfg.ENTRANCE4 || "") ? cfg.ENTRANCE4 : "";
  const entrance6ip = isIPv6(cfg.ENTRANCE6 || "") ? cfg.ENTRANCE6 : "";
  const entrance = entrance4 ? await getEntranceBundle(entrance4).catch(() => ({ ip: entrance4 })) : {};
  const entrance6 = entrance6ip ? await getEntranceBundle(entrance6ip).catch(() => ({ ip: entrance6ip })) : {};
  const rdnsHost = await queryPTRMaybe(landing.ip).catch(() => "");
  const risk = landing.ip ? calculateRiskValueSafe(landing.isp, landing.org, landing.country, landing.as || landing.asn || "", rdnsHost) : null;
  const services = await sdPromise;
  const model = {
    runAt: nowStr(),
    policy: cfg.PROXY_POLICY || "-",
    local,
    local6,
    entrance,
    entrance6,
    landing,
    landing6,
    risk,
    services,
    debug: S().DEBUG.slice(-8)
  };
  return model;
}

export default async function(ctx) {
  try {
    const model = await buildModel(ctx);
    return renderByFamily(model);
  } catch (err) {
    const msg = String(err && err.stack ? err.stack : err);
    try { console.log(msg); } catch (_) {}
    return {
      type: "widget",
      padding: 14,
      backgroundGradient: { type: "linear", colors: ["#1B1B2F", "#16213E"], startPoint: { x: 0, y: 0 }, endPoint: { x: 1, y: 1 } },
      children: [
        hstack([icon("exclamationmark.triangle.fill", 14, "#F87171"), txt("网络信息", 14, "bold", "#FFFFFF")], { gap: 6 }),
        spacer(6),
        txt("Widget 运行失败", 11, "semibold", "#FCA5A5"),
        txt(msg.slice(0, 220), 9, "medium", "rgba(255,255,255,0.78)", { maxLines: 8, minScale: 0.6 })
      ]
    };
  }
}
