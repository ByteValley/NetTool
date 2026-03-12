/* =========================================================
 * 模块分类 · 网络信息 + 服务检测
 * 作者 · ByteValley
 * 版本 · 2026-03-12R1
 *
 * 模块分类 · 说明
 * · Legacy 运行时：Surge / Loon / QuanX / 旧 Egern Panel 风格
 * · Legacy 运行时：Surge / Loon / QuanX / 旧 Egern Panel 风格
 * · Egern 新 API：通过 ctx.http / ctx.storage / ctx.device / ctx.notify 兼容旧面板脚本
 * · 保持原有业务逻辑与文本面板结构，Egern 下仍输出 title/content 面板对象
 * · /v1/requests/recent 在 Egern 公开 API 中未文档化，这里支持用 env 合成入口回放：PROXY_POLICY / ENTRANCE4 / ENTRANCE6
 * ========================================================= */

/* =========================================================
 * 模块分类 · 常量
 * ========================================================= */
const CONSTS = Object.freeze({
  MAX_RECENT_REQ: 150,
  PRETOUCH_TO_MS: 700,
  SD_MIN_TIMEOUT: 2000,
  LOG_RING_MAX: 140,
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
    wifi: "Wi-Fi",
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
    wifi: "Wi-Fi",
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

let G_STATE = null;
function S() { return G_STATE; }
function t(key, ...args) {
  const lang = (S()?.CFG?.SD_LANG) || "zh-Hans";
  const pack = SD_STR[lang] || SD_STR["zh-Hans"];
  const v = pack[key];
  if (typeof v === "function") return v(...args);
  return v != null ? v : key;
}

/* =========================================================
 * 模块分类 · KV / 参数
 * ========================================================= */
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

const BOOT_DEBUG = [];
function bootLog(...args) {
  const line = "[NI][BOOT] " + args.map(x => typeof x === "string" ? x : JSON.stringify(x)).join(" ");
  BOOT_DEBUG.push(line);
  try { console.log(line); } catch (_) {}
}

function safeJSON(s, d = {}) { try { return JSON.parse(s || ""); } catch (_) { return d; } }
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
function readBoxSettings() {
  let raw;
  try { raw = KVStore.read("Panel"); } catch (e) {
    bootLog("BoxSettings.read Panel error:", String(e));
    return {};
  }
  if (raw == null || raw === "") return {};
  let panel = raw;
  if (typeof raw === "string") {
    try { panel = JSON.parse(raw); } catch (e) { return {}; }
  }
  if (!panel || typeof panel !== "object") return {};
  if (panel.NetworkInfo && panel.NetworkInfo.Settings && typeof panel.NetworkInfo.Settings === "object") return panel.NetworkInfo.Settings;
  if (panel.Settings && typeof panel.Settings === "object") return panel.Settings;
  return {};
}
const BOX = readBoxSettings();
function readBoxKey(key) {
  if (!BOX || typeof BOX !== "object") return undefined;
  if (!Object.prototype.hasOwnProperty.call(BOX, key)) return undefined;
  const v = BOX[key];
  if (v === "" || v == null) return undefined;
  return v;
}
const LEGACY_ARGS = parseArgs(typeof $argument !== "undefined" ? $argument : undefined);
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

/* =========================================================
 * 模块分类 · 基础工具
 * ========================================================= */
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
const clamp = (n, min, max) => Math.max(min, Math.min(max, n));

function ENV(RT, key, defVal, opt = {}) {
  const typeHint = typeof defVal;
  const argKeys = [key].concat(opt.argAlias || []);
  const boxKeys = [key].concat(opt.boxAlias || []);
  let argRaw, hasArg = false;
  const envObj = RT?.env || {};
  for (const k of argKeys) {
    if (Object.prototype.hasOwnProperty.call(envObj, k)) {
      const v = envObj[k];
      if (v !== undefined && v !== null && v !== "") {
        argRaw = v; hasArg = true; break;
      }
    }
  }
  let boxRaw, hasBox = false;
  for (const bk of boxKeys) {
    const v = readBoxKey(bk);
    if (v !== undefined && v !== null && v !== "") {
      boxRaw = v; hasBox = true; break;
    }
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
function buildCFG(RT) {
  const envObj = RT?.env || {};
  const cfg = {
    Update: toNum(ENV(RT, "Update", 10), 10),
    Timeout: toNum(ENV(RT, "Timeout", 12), 12),
    BUDGET_SEC_RAW: ENV(RT, "BUDGET", 0),
    MASK_IP: toBool(ENV(RT, "MASK_IP", true), true),
    MASK_POS_MODE: ENV(RT, "MASK_POS", "auto"),
    IPv6: toBool(ENV(RT, "IPv6", true), true),
    DOMESTIC_IPv4: (() => {
      const v = ENV(RT, "DOMESTIC_IPv4", "ipip");
      if (v !== "" && v != null) return v;
      return envObj.DOMIC_IPv4 || "ipip";
    })(),
    DOMESTIC_IPv6: (() => {
      const v = ENV(RT, "DOMESTIC_IPv6", "ddnspod");
      if (v !== "" && v != null) return v;
      return envObj.DOMIC_IPv6 || "ddnspod";
    })(),
    LANDING_IPv4: ENV(RT, "LANDING_IPv4", "ipapi"),
    LANDING_IPv6: ENV(RT, "LANDING_IPv6", "ipsb"),
    TW_FLAG_MODE: toNum(ENV(RT, "TW_FLAG_MODE", 1), 1),
    IconPreset: ENV(RT, "IconPreset", "globe"),
    Icon: ENV(RT, "Icon", ""),
    IconColor: ENV(RT, "IconColor", "#1E90FF"),
    SUBTITLE_STYLE: ENV(RT, "SUBTITLE_STYLE", "line"),
    SUBTITLE_MINIMAL: ENV(RT, "SUBTITLE_MINIMAL", false),
    GAP_LINES: ENV(RT, "GAP_LINES", 1),
    SD_STYLE: ENV(RT, "SD_STYLE", "icon"),
    SD_REGION_MODE: ENV(RT, "SD_REGION_MODE", "full"),
    SD_ICON_THEME: ENV(RT, "SD_ICON_THEME", "check"),
    SD_ARROW: toBool(ENV(RT, "SD_ARROW", true), true),
    SD_SHOW_LAT: toBool(ENV(RT, "SD_SHOW_LAT", true), true),
    SD_SHOW_HTTP: toBool(ENV(RT, "SD_SHOW_HTTP", true), true),
    SD_LANG: ENV(RT, "SD_LANG", "zh-Hans"),
    SD_TIMEOUT_SEC_RAW: ENV(RT, "SD_TIMEOUT", 0),
    SD_CONCURRENCY: toNum(ENV(RT, "SD_CONCURRENCY", 6), 6),
    SERVICES_BOX_CHECKED_RAW: (() => {
      const v = readBoxKey("SERVICES");
      if (v == null) return null;
      if (Array.isArray(v)) return v.length ? JSON.stringify(v) : null;
      const s = String(v).trim();
      if (!s || s === "[]") return null;
      return s;
    })(),
    SERVICES_BOX_TEXT: (() => {
      const v = readBoxKey("SERVICES_TEXT");
      return v != null ? String(v).trim() : "";
    })(),
    SERVICES_ARG_TEXT: (() => {
      let v = envObj.SERVICES;
      if (Array.isArray(v)) return JSON.stringify(v);
      if (v == null || v === "") v = readArgRaw("SERVICES");
      return v != null ? String(v).trim() : "";
    })(),
    LOG: toBool(ENV(RT, "LOG", true), true),
    LOG_LEVEL: (ENV(RT, "LOG_LEVEL", "info") + "").toLowerCase(),
    LOG_TO_PANEL: toBool(ENV(RT, "LOG_TO_PANEL", false), false),
    LOG_PUSH: toBool(ENV(RT, "LOG_PUSH", true), true),
    PROXY_POLICY: ENV(RT, "PROXY_POLICY", ""),
    ENTRANCE4: ENV(RT, "ENTRANCE4", ""),
    ENTRANCE6: ENV(RT, "ENTRANCE6", "")
  };
  cfg.SUBTITLE_STYLE = normalizeSubStyle(cfg.SUBTITLE_STYLE);
  cfg.SUBTITLE_MINIMAL = toBool(cfg.SUBTITLE_MINIMAL, false);
  cfg.GAP_LINES = clamp(toNum(cfg.GAP_LINES, 1), 0, 2);
  cfg.SD_LANG = String(cfg.SD_LANG).toLowerCase() === "zh-hant" ? "zh-Hant" : "zh-Hans";
  return cfg;
}
function buildState(RT) {
  const CFG = buildCFG(RT);
  const WANT_V6 = !!CFG.IPv6;
  const HAS_V6 = !!(RT.device?.ipv6?.address);
  const IPV6_EFF = WANT_V6 && HAS_V6;
  const MASK_IP = !!CFG.MASK_IP;
  const _maskPosMode = String(CFG.MASK_POS_MODE ?? "auto").trim().toLowerCase();
  CFG.MASK_POS = (_maskPosMode === "" || _maskPosMode === "auto" || _maskPosMode === "follow" || _maskPosMode === "same")
    ? MASK_IP : toBool(_maskPosMode, true);
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
  const DEADLINE = Date.now() + BUDGET_MS;
  const V6_TO = Math.min(Math.max(CONSTS.SD_MIN_TIMEOUT, SD_TIMEOUT_MS), 2500);
  const LOG_LEVELS = { debug: 10, info: 20, warn: 30, error: 40 };
  const LOG_THRESH = LOG_LEVELS[CFG.LOG_LEVEL] ?? 20;
  const SD_STYLE = String(CFG.SD_STYLE).toLowerCase() === "text" ? "text" : "icon";
  const SD_REGION_MODE = ["full", "abbr", "flag"].includes(String(CFG.SD_REGION_MODE)) ? CFG.SD_REGION_MODE : "full";
  const SD_ICON_THEME = ["lock", "circle", "check"].includes(String(CFG.SD_ICON_THEME)) ? CFG.SD_ICON_THEME : "check";
  const SD_ICONS = (() => {
    switch (SD_ICON_THEME) {
      case "lock": return { full: "🔓", partial: "🔐", blocked: "🔒" };
      case "circle": return { full: "⭕️", partial: "⛔️", blocked: "🚫" };
      default: return { full: "✅", partial: "❇️", blocked: "❎" };
    }
  })();
  return {
    RT, CFG, WANT_V6, HAS_V6, IPV6_EFF, MASK_IP, MASK_POS: !!CFG.MASK_POS, SD_TIMEOUT_MS, BUDGET_MS,
    DEADLINE, V6_TO, LOG_LEVELS, LOG_THRESH, DEBUG_LINES: BOOT_DEBUG.slice(), ENT_CACHE: { ip: "", t: 0, data: null },
    SD_STYLE, SD_REGION_MODE, SD_ICON_THEME, SD_ICONS, TW_FLAG_MODE: Number(CFG.TW_FLAG_MODE) || 0,
    ICON_NAME: (CFG.Icon || "").trim() || ICON_PRESET_MAP[String(CFG.IconPreset).trim()] || "globe.asia.australia",
    ICON_COLOR: CFG.IconColor
  };
}

/* =========================================================
 * 模块分类 · 运行时桥
 * ========================================================= */
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
function wrapLegacyResp(r) {
  return {
    status: r?.status || 0,
    headers: normalizeHeadersObject(r?.headers || {}),
    async text() { return String(r?.body || ""); },
    async json() { return safeJSON(r?.body || "", {}); }
  };
}
function wrapEgernResp(r) {
  return {
    status: r?.status ?? r?.statusCode ?? 0,
    headers: normalizeHeadersObject(r?.headers || {}),
    async text() {
      if (typeof r?.body === "string") return r.body;
      if (typeof r?.data === "string") return r.data;
      if (r?.body != null) return JSON.stringify(r.body);
      if (r?.data != null) return JSON.stringify(r.data);
      return "";
    },
    async json() {
      if (typeof r?.body === "object" && r.body !== null) return r.body;
      if (typeof r?.data === "object" && r.data !== null) return r.data;
      const txt = typeof r?.body === "string"
        ? r.body
        : typeof r?.data === "string"
          ? r.data
          : "";
      return safeJSON(txt, {});
    }
  };
}
function createLegacyRuntime() {
  const n = (typeof $network !== "undefined" && $network) ? $network : {};
  return {
    kind: "legacy",
    env: LEGACY_ARGS,
    device: {
      cellular: { carrier: n.cellular?.carrier || n["cellular-data"]?.carrier || null, radio: n.cellular?.radio || n["cellular-data"]?.radio || null },
      wifi: { ssid: n.wifi?.ssid || null, bssid: n.wifi?.bssid || null },
      ipv4: { address: n.v4?.primaryAddress || null, gateway: n.v4?.primaryRouter || null, interface: n.v4?.primaryInterface || null },
      ipv6: { address: n.v6?.primaryAddress || null, interface: n.v6?.primaryInterface || null },
      dnsServers: []
    },
    storage: {
      get: (k) => KVStore.read(k),
      set: (k, v) => KVStore.write(v, k),
      getJSON: (k) => safeJSON(KVStore.read(k), null),
      setJSON: (k, v) => KVStore.write(JSON.stringify(v), k),
      delete: (k) => KVStore.write("", k)
    },
    notify({ title, subtitle = "", body = "" }) { try { $notification?.post?.(title, subtitle, body); } catch (_) {} },
    async httpGet(url, options = {}) {
      const r = await legacyHttp("GET", { url, headers: options.headers || {}, timeout: options.timeout || null, followRedirect: options.redirect === "follow" });
      return wrapLegacyResp(r);
    },
    async httpPost(url, options = {}) {
      const r = await legacyHttp("POST", { url, headers: options.headers || {}, body: options.body || "", timeout: options.timeout || null });
      return wrapLegacyResp(r);
    },
    async httpAPI(path) {
      return await new Promise((res) => {
        if (typeof $httpAPI === "function") $httpAPI("GET", path, null, (x) => res(x));
        else res(null);
      });
    },
    finishPanel(payload) { $done(payload); },
    widgetFamily: undefined
  };
}
function makeSyntheticRecent(env = {}) {
  const policy = String(env.PROXY_POLICY || "").trim();
  const ip4 = String(env.ENTRANCE4 || "").trim();
  const ip6 = String(env.ENTRANCE6 || "").trim();
  const requests = [];
  const mk = (URL, remoteAddress) => ({ URL, remoteAddress, policyName: policy || "" });
  if (ip4) requests.push(mk("http://ip-api.com/json?lang=zh-CN", `${ip4} (Proxy)`));
  if (ip6) requests.push(mk("https://api-ipv6.ip.sb/ip", `[${ip6}] (Proxy)`));
  if (!requests.length && policy) requests.push(mk("http://ip-api.com/json?lang=zh-CN", "(Proxy)"));
  return { requests };
}

function createEgernRuntime(ctx) {
  return {
    kind: "egern",
    env: ctx?.env || {},
    device: ctx?.device || {
      cellular: { carrier: null, radio: null },
      wifi: { ssid: null, bssid: null },
      ipv4: { address: null, gateway: null, interface: null },
      ipv6: { address: null, interface: null },
      dnsServers: []
    },
    storage: ctx?.storage || {
      get: async () => null,
      set: async () => {},
      getJSON: async () => null,
      setJSON: async () => {},
      delete: async () => {}
    },
    notify({ title, subtitle = "", body = "" }) {
      try { ctx?.notify?.({ title, subtitle, body, sound: false, duration: 4 }); } catch (_) {}
    },
    async httpGet(url, options = {}) {
      const r = await ctx.http.get(url, {
        headers: options.headers,
        timeout: options.timeout,
        policy: options.policy,
        policyDescriptor: options.policyDescriptor,
        redirect: options.redirect || "follow",
        credentials: options.credentials || "include",
        insecureTls: !!options.insecureTls
      });
      return wrapEgernResp(r);
    },
    async httpPost(url, options = {}) {
      const r = await ctx.http.post(url, {
        headers: options.headers,
        body: options.body,
        timeout: options.timeout,
        policy: options.policy,
        policyDescriptor: options.policyDescriptor,
        redirect: options.redirect || "follow",
        credentials: options.credentials || "include",
        insecureTls: !!options.insecureTls
      });
      return wrapEgernResp(r);
    },
    async httpAPI(path) {
      if (String(path || "") === "/v1/requests/recent") return makeSyntheticRecent(ctx?.env || {});
      return null;
    },
    finishPanel(payload) { return payload; },
    widgetFamily: ctx?.widgetFamily || "systemMedium"
  };
}

/* =========================================================
 * 模块分类 · Legacy HTTP / 通用 HTTP
 * ========================================================= */
function legacyHttp(method, req) {
  return new Promise((resolve, reject) => {
    if (typeof $httpClient === "undefined" || !$httpClient || (!$httpClient.get && !$httpClient.post)) return reject(new Error("no-$httpClient"));
    const fn = String(method).toUpperCase() === "POST" ? $httpClient.post : $httpClient.get;
    const payload = Object.assign({}, req);
    fn(payload, (err, resp, body) => {
      if (err || !resp) return reject(err || new Error("no-resp"));
      resolve({ status: resp.status || resp.statusCode || 0, headers: resp.headers || {}, body });
    });
  });
}
function budgetLeft() { return Math.max(0, S().DEADLINE - Date.now()); }
function capByBudget(capMs, floorMs = 220) {
  const left = budgetLeft();
  if (left <= CONSTS.BUDGET_SOFT_GUARD_MS) return Math.max(120, floorMs);
  const room = Math.max(120, left - CONSTS.BUDGET_SOFT_GUARD_MS);
  return Math.max(120, Math.min(Number(capMs) || room, room));
}
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
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
async function httpGetRT(url, headers = {}, timeoutMs = null, followRedirect = false, ext = {}) {
  const RT = S().RT;
  const start = Date.now();
  const resp = await RT.httpGet(url, {
    headers,
    timeout: timeoutMs == null ? capByBudget(3500) : Math.min(Number(timeoutMs) || 3500, capByBudget(3500)),
    redirect: followRedirect ? "follow" : "manual",
    policy: ext.policy,
    policyDescriptor: ext.policyDescriptor,
    insecureTls: ext.insecureTls
  });
  const body = await resp.text();
  return { status: resp.status || 0, headers: resp.headers || {}, body, cost: Date.now() - start };
}
async function httpPostRT(url, headers = {}, body = "", timeoutMs = null, ext = {}) {
  const RT = S().RT;
  const start = Date.now();
  const resp = await RT.httpPost(url, {
    headers, body,
    timeout: timeoutMs == null ? capByBudget(3500) : Math.min(Number(timeoutMs) || 3500, capByBudget(3500)),
    redirect: "follow", policy: ext.policy, policyDescriptor: ext.policyDescriptor, insecureTls: ext.insecureTls
  });
  const text = await resp.text();
  return { status: resp.status || 0, headers: resp.headers || {}, body: text, cost: Date.now() - start };
}

/* =========================================================
 * 模块分类 · 日志
 * ========================================================= */
function _maskMaybe(ip) {
  if (!ip) return "";
  if (!S().MASK_IP) return ip;
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
  if (!S().CFG.LOG) return;
  const L = S().LOG_LEVELS[level] ?? 20;
  if (L < S().LOG_THRESH) return;
  const msg = args.map(x => typeof x === "string" ? x : JSON.stringify(x));
  const line = `[NI][${level.toUpperCase()}] ${msg.join(" ")}`;
  try { console.log(line); } catch (_) {}
  S().DEBUG_LINES.push(line);
  if (S().DEBUG_LINES.length > CONSTS.LOG_RING_MAX) S().DEBUG_LINES.shift();
}
function logErrPush(title, body) {
  if (S().CFG.LOG_PUSH) S().RT.notify({ title, body });
  log("error", title, body);
}

/* =========================================================
 * 模块分类 · 正则 / 格式
 * ========================================================= */
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
const pad2 = (n) => String(n).padStart(2, "0");
function now() {
  const d = new Date();
  return `${pad2(d.getMonth()+1)}-${pad2(d.getDate())} ${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}`;
}
function maskIP(ip) {
  if (!ip || !S().MASK_IP) return ip || "";
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
function ipLine(label, ip) {
  if (!ip) return null;
  const s = String(ip).trim();
  if (!s) return null;
  if (/ipv4/i.test(label) && !isIPv4(s)) return null;
  if (/ipv6/i.test(label) && !isIPv6(s)) return null;
  return `${label}: ${maskIP(s)}`;
}
function hasCityLevel(loc) {
  if (!loc) return false;
  try {
    const s = String(loc).replace(/^[\u{1F1E6}-\u{1F1FF}]{2}\s*/u, "").trim();
    if (/市|区|縣|县|州|市辖/.test(s)) return true;
    const parts = s.split(/\s+/).filter(Boolean);
    return parts.length >= 3;
  } catch (_) { return false; }
}

/* =========================================================
 * 模块分类 · 标题 / 图标 / 台湾旗
 * ========================================================= */
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
  for (let i = 0; i < S().CFG.GAP_LINES; i++) parts.push("");
  const render = makeSubTitleRenderer(S().CFG.SUBTITLE_STYLE, S().CFG.SUBTITLE_MINIMAL);
  parts.push(render(title));
}
const ICON_PRESET_MAP = Object.freeze({
  wifi: "wifi.router",
  globe: "globe.asia.australia",
  dots: "dot.radiowaves.left.and.right",
  antenna: "antenna.radiowaves.left.and.right",
  point: "point.3.connected.trianglepath.dotted"
});
function splitFlagRaw(s) {
  const re = /^[\u{1F1E6}-\u{1F1FF}]{2}\s*/u;
  const m = String(s || "").match(re);
  let flag = m ? m[0] : "";
  const text = String(s || "").replace(re, "");
  if (flag.includes("🇹🇼")) {
    if (S().TW_FLAG_MODE === 0) flag = "🇨🇳";
    else if (S().TW_FLAG_MODE === 2) flag = "🇼🇸";
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
      if (S().TW_FLAG_MODE === 0) return "🇨🇳";
      if (S().TW_FLAG_MODE === 2) return "🇼🇸";
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
  if (/(^|[\s-])(cmcc|cmnet|cmi)\b/.test(s) || /china\s*mobile/.test(s) || /移动/.test(norm)) return "中国移动";
  if (/(^|[\s-])(chinanet|china\s*telecom|ctcc|ct)\b/.test(s) || /电信/.test(norm)) return "中国电信";
  if (/(^|[\s-])(china\s*unicom|cncgroup|netcom)\b/.test(s) || /联通/.test(norm)) return "中国联通";
  if (/(^|[\s-])(cbn|china\s*broadcast)/.test(s) || /广电/.test(norm)) return "中国广电";
  if ((/cernet|china\s*education/).test(s) || /教育网/.test(norm)) return "中国教育网";
  if (/^中国(移动|联通|电信|广电)$/.test(norm)) return norm;
  return raw;
}

/* =========================================================
 * 模块分类 · 风险评估
 * ========================================================= */
const RISK_RULES = Object.freeze({
  dataCenterKeywords: [
    "datacenter", "data center", "hosting", "cloud", "cdn", "edge", "vps", "colo", "colocation",
    "proxy", "vpn", "tunnel", "relay", "compute", "server", "amazon", "aws", "google", "gcp",
    "microsoft", "azure", "digitalocean", "linode", "ovh", "hetzner", "vultr", "oracle",
    "alibaba cloud", "tencent cloud", "cloudflare", "fastly", "akamai", "leaseweb", "choopa", "dmit", "racknerd"
  ],
  homeBroadbandKeywords: [
    "china telecom", "chinanet", "ctcc", "as4134", "as4809", "china mobile", "cmcc", "cmnet", "cmi", "as9808",
    "china unicom", "unicom", "cucc", "as4837", "cernet", "china education",
    "comcast", "xfinity", "verizon", "at&t", "charter", "spectrum", "cox", "rogers", "bell canada", "telus",
    "bt", "virgin media", "sky broadband", "deutsche telekom", "telefonica", "orange", "vodafone",
    "isp", "broadband", "fiber", "ftth", "residential", "cable", "docsis", "pppoe", "dsl", "adsl", "vdsl",
    "pon", "gpon", "epon", "cpe", "dynamic", "dyn", "pool", "subscriber", "cust", "customer",
    "telecom", "communications", "chunghwa", "cht", "hinet", "kbro", "formosabroadband", "formosa broadband",
    "seednet", "taiwan broadband", "tbc", "cable tv", "cablemodem"
  ],
  mobileKeywords: ["mobile", "lte", "4g", "5g", "cell", "cellular", "wireless", "epc", "ims", "gprs", "wimax"],
  rdnsDatacenterSuffix: [
    "amazonaws.com", "compute.amazonaws.com", "googleusercontent.com", "cloudapp.azure.com", "digitalocean.com",
    "linodeusercontent.com", "ovh.net", "kimsufi.com", "online.net", "hetzner.de", "hetzner.com",
    "vultrusercontent.com", "leaseweb.net", "choopa.net", "cloudflare.com", "cloudflarenet.com", "fastly.net", "akamai.net"
  ],
  rdnsHomeKeywords: [
    "dynamic", "dyn", "pppoe", "dsl", "adsl", "vdsl", "cable", "docsis", "fiber", "ftth", "fios", "broadband",
    "res", "home", "cust", "customer", "subscriber", "pool", "cpe", "hinet", "formosabroadband", "kbro", "cht", "seednet"
  ],
  rdnsMobileKeywords: ["lte", "5g", "4g", "mobile", "cell", "wireless", "epc"],
  highRiskCountries: ["俄罗斯", "russia", "印度", "india", "乌克兰", "ukraine"]
});
const ASN_HOME_STRONG = new Set([38841]);
function normStr(x) {
  return String(x == null ? "" : x).replace(/\s+/g, " ").replace(/[（(].*?[）)]/g, " ").trim().toLowerCase();
}
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
  const isHant = S().CFG.SD_LANG === "zh-Hant";
  const zh = (h, t2) => isHant ? t2 : h;
  const tunnelLike = (dcEvidence >= 2) || (riskValue >= 70) || rdnsHitDC;
  const homeLikeStrong = (hbEvidence >= 2) && !tunnelLike && (riskValue <= 50);
  const homeLikeSoft = (hbEvidence >= 1) && (dcEvidence === 0) && !tunnelLike && (riskValue <= 38);
  const isHomeBroadband = homeLikeStrong || homeLikeSoft;
  const lineType = isHomeBroadband ? zh("家宽", "家寬") : zh("非家宽", "非家寬");
  let subtype = zh("未知", "未知");
  if (rdnsHitMobile || mobileHit) subtype = zh("移动网络", "行動網路");
  else if (tunnelLike || dcEvidence >= 1) subtype = zh("机房/专线特征", "機房/專線特徵");
  else if (isHomeBroadband) subtype = zh("住宅/接入特征", "住宅/接入特徵");
  else if (hbEvidence >= 1) subtype = zh("运营商/接入", "運營商/接入");
  else subtype = zh("普通 ISP", "一般 ISP");
  const nativeHint = (!tunnelLike && riskValue < 55) ? zh("更像原生", "更像原生") : zh("可能非原生", "可能非原生");
  const tunnelHint = tunnelLike ? zh("机房/代理特征偏强", "機房/代理特徵偏強") : zh("机房/代理特征偏弱", "機房/代理特徵偏弱");
  return { riskValue, lineType, subtype, isHomeBroadband, nativeHint, tunnelHint, reasons, _raw: { asn, rdnsHost: rdnsHost || "", dcHit, hbHit, mobileHit, rdnsHitDC, rdnsHitHB, rdnsHitMobile, hbEvidence, dcEvidence } };
}

/* =========================================================
 * 模块分类 · 网络类型
 * ========================================================= */
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
    const n = S().RT.device || {};
    const ssid = n.wifi?.ssid, bssid = n.wifi?.bssid;
    if (ssid || bssid) return `${t("wifi")} | ${ssid || "-"}`;
    const radio = n.cellular?.radio;
    if (radio) return `${t("cellular")} | ${t("gen", radioToGen(radio), radio)}`;
    const iface = n.ipv4?.interface || n.ipv6?.interface || "";
    if (/^pdp/i.test(iface)) return `${t("cellular")} | -`;
    if (/^(en|eth|wlan)/i.test(iface)) return `${t("wifi")} | -`;
  } catch (_) {}
  return t("unknownNet");
}

/* =========================================================
 * 模块分类 · PTR
 * ========================================================= */
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
    const hex32 = groups.slice(0, 8).join("");
    return hex32.split("").reverse().join(".") + ".ip6.arpa";
  }
  return "";
}
async function queryPTR(ip) {
  const name = ipToPtrName(ip);
  if (!name) return "";
  const url = "https://dns.google/resolve?name=" + encodeURIComponent(name) + "&type=PTR";
  const r = await httpGetRT(url, { "Accept": "application/dns-json" }, Math.min(900, capByBudget(900)), true).catch(() => null);
  if (!r || r.status !== 200) return "";
  try {
    const j = safeJSON(r.body, {});
    const ans = Array.isArray(j.Answer) ? j.Answer : [];
    const first = ans.find((x) => x && (x.type === 12 || String(x.type) === "12") && x.data);
    const host = first ? String(first.data).trim() : "";
    return host.replace(/\.$/, "");
  } catch (_) { return ""; }
}
async function queryPTRMaybe(ip) {
  if (!ip) return "";
  if (budgetLeft() <= 800) return "";
  return await withTimeout(queryPTR(ip), Math.min(950, capByBudget(950)), "");
}

/* =========================================================
 * 模块分类 · 数据源
 * ========================================================= */
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
      return { ip: j.query || "", loc: joinNonEmpty([flagOf(j.countryCode), j.country?.replace(/\s*中国\s*/, ""), j.regionName?.split(/\s+or\s+/)[0], j.city], " "), isp: j.isp || j.org || "", org: j.org || "", as: j.as || "", country: j.country || "", countryCode: String(j.countryCode || "").toUpperCase() };
    }
  },
  ipwhois: {
    url: "https://ipwhois.app/widget.php?lang=zh-CN",
    parse: (r) => {
      const j = safeJSON(r.body, {});
      const asn = j.asn || j.as || (j?.connection?.asn) || "";
      return { ip: j.ip || "", loc: joinNonEmpty([flagOf(j.country_code), j.country?.replace(/\s*中国\s*/, ""), j.region, j.city], " "), isp: (j?.connection?.isp) || "", org: j.org || (j?.connection?.org) || "", as: asn || "", country: j.country || "", countryCode: String(j.country_code || "").toUpperCase() };
    }
  },
  ipsb: {
    url: "https://api-ipv4.ip.sb/geoip",
    parse: (r) => {
      const j = safeJSON(r.body, {});
      const as = j.asn ? (`AS${j.asn}` + (j.asn_organization ? ` ${j.asn_organization}` : "")) : "";
      return { ip: j.ip || "", loc: joinNonEmpty([flagOf(j.country_code), j.country, j.region, j.city], " ").replace(/\s*中国\s*/, ""), isp: j.isp || j.organization || "", org: j.organization || j.asn_organization || "", as, country: j.country || "", countryCode: String(j.country_code || "").toUpperCase() };
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
async function trySources(order, sourceMap, { preferLogTag, needCityPrefer = false, acceptIp = null, ext = {} }) {
  log("info", `${preferLogTag} begin`, JSON.stringify(order));
  let firstOK = null;
  for (const key of order) {
    if (budgetLeft() <= 300) break;
    const def = sourceMap[key];
    if (!def) continue;
    const t0 = Date.now();
    try {
      const r = await httpGetRT(def.url, {}, null, false, ext);
      const res = def.parse(r) || {};
      const ip = String(res.ip || "").trim();
      const ok = acceptIp ? acceptIp(ip) : !!ip;
      const cityOK = ok && hasCityLevel(res.loc);
      log("debug", `${preferLogTag} try`, JSON.stringify({ key, ok, cityOK, ip: _maskMaybe(ip), loc: res.loc || "", isp: res.isp || "", cost_ms: Date.now() - t0 }));
      if (ok) {
        res.ip = ip;
        if (!firstOK) firstOK = res;
        if (!needCityPrefer || cityOK) return res;
      }
    } catch (e) {
      log("warn", `${preferLogTag} fail`, key, "cost", (Date.now() - t0) + "ms", String(e));
    }
  }
  return firstOK || {};
}
async function tryIPv6Ip(order, opt = {}, ext = {}) {
  const timeoutMs = (opt.timeoutMs != null) ? opt.timeoutMs : S().V6_TO;
  const maxTries = Math.max(1, Math.min(Number(opt.maxTries || order.length), order.length));
  for (const key of order.slice(0, maxTries)) {
    if (budgetLeft() <= 260) break;
    const url = IPV6_IP_ENDPOINTS[key];
    if (!url) continue;
    try {
      const r = await httpGetRT(url, {}, timeoutMs, false, ext);
      const ip = String(r.body || "").trim();
      if (isIPv6(ip)) return { ip };
    } catch (_) {}
  }
  return {};
}
async function fillDirectIspSameIp(targetIp, skipKey, ext = {}) {
  const ip = String(targetIp || "").trim();
  if (!ip) return "";
  const order = (ORDER.directV4 || []).filter((k) => k && k !== skipKey);
  for (const key of order) {
    if (budgetLeft() <= 320) break;
    const def = DIRECT_V4_SOURCES[key];
    if (!def) continue;
    try {
      const r = await httpGetRT(def.url, {}, null, false, ext);
      const x = def.parse(r) || {};
      if (String(x.ip || "").trim() === ip && String(x.isp || "").trim()) return String(x.isp || "").trim();
    } catch (_) {}
  }
  return "";
}
async function getDirectV4(preferKey) {
  const ext = { policy: S().RT.kind === "egern" ? "DIRECT" : undefined };
  const order = makeTryOrder(preferKey, ORDER.directV4);
  const res = await trySources(order, DIRECT_V4_SOURCES, { preferLogTag: "DirectV4", needCityPrefer: true, acceptIp: isIPv4, ext });
  if (!res || !res.ip) return {};
  if (!String(res.isp || "").trim()) {
    const filled = await fillDirectIspSameIp(res.ip, preferKey, ext).catch(() => "");
    if (filled) res.isp = filled;
  }
  return res;
}
async function getDirectV6(preferKey) {
  const ext = { policy: S().RT.kind === "egern" ? "DIRECT" : undefined };
  return await tryIPv6Ip(makeTryOrder(preferKey, ORDER.directV6), { timeoutMs: S().V6_TO }, ext);
}
async function getLandingV4(preferKey) {
  const ext = { policy: S().CFG.PROXY_POLICY || undefined };
  return await trySources(makeTryOrder(preferKey, ORDER.landingV4), LANDING_V4_SOURCES, { preferLogTag: "LandingV4", needCityPrefer: false, acceptIp: isIPv4, ext });
}
async function probeLandingV6(preferKey) {
  const ext = { policy: S().CFG.PROXY_POLICY || undefined };
  const r = await tryIPv6Ip(makeTryOrder(preferKey, ORDER.landingV6), { timeoutMs: Math.min(CONSTS.V6_PROBE_TO_MS, 900), maxTries: 2 }, ext);
  return { ok: !!r.ip, ip: r.ip || "" };
}

/* =========================================================
 * 模块分类 · 入口 / 策略
 * ========================================================= */
const ENT_SOURCES_RE = /(ip-api\.com|ipwhois\.app|ip\.sb|ipinfo\.io|ident\.me|ipify\.org|ifconfig\.co)/i;
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
async function touchLandingOnceQuick(opt = {}) {
  const doV6 = !!opt.v6;
  const policy = S().CFG.PROXY_POLICY || undefined;
  await Promise.allSettled([
    httpGetRT("http://ip-api.com/json?lang=zh-CN", {}, CONSTS.PRETOUCH_TO_MS, true, { policy }),
    httpGetRT("https://api-ipv4.ip.sb/ip", {}, CONSTS.PRETOUCH_TO_MS, true, { policy })
  ]);
  if (doV6) await Promise.allSettled([httpGetRT("https://api-ipv6.ip.sb/ip", {}, Math.min(CONSTS.PRETOUCH_TO_MS, S().V6_TO), true, { policy })]);
}
async function getPolicyAndEntranceBoth() {
  const RT = S().RT;
  if (RT.kind !== "egern" && typeof RT.httpAPI === "function") {
    const data = await RT.httpAPI("/v1/requests/recent");
    const reqs = Array.isArray(data?.requests) ? data.requests : [];
    const hits = reqs.slice(0, CONSTS.MAX_RECENT_REQ).filter((i) => ENT_SOURCES_RE.test(i.URL || ""));
    let policy = "", ip4 = "", ip6 = "";
    for (const i of hits) {
      if (!policy && i.policyName) policy = i.policyName;
      const ip = extractIP(i.remoteAddress || "");
      if (!ip) continue;
      if (isIPv6(ip)) { if (!ip6) ip6 = ip; }
      else if (isIPv4(ip)) { if (!ip4) ip4 = ip; }
      if (policy && ip4 && ip6) break;
    }
    if (!policy && !ip4 && !ip6) {
      const d = await RT.httpAPI("/v1/requests/recent");
      const rs = Array.isArray(d?.requests) ? d.requests : [];
      const hit = rs.find((i) => /\(Proxy\)/.test(i.remoteAddress || "") && i.policyName);
      if (hit) {
        policy = hit.policyName;
        const eip = extractIP(hit.remoteAddress);
        if (eip) (isIPv6(eip) ? (ip6 = eip) : (ip4 = eip));
      }
    }
    return { policyName: policy, entrance4: ip4, entrance6: ip6 };
  }
  return { policyName: S().CFG.PROXY_POLICY || "-", entrance4: S().CFG.ENTRANCE4 || "", entrance6: S().CFG.ENTRANCE6 || "" };
}
const ENT_LOC_CHAIN = Object.freeze({
  pingan: async (ip, ext = {}) => {
    const r = await httpGetRT("https://rmb.pingan.com.cn/itam/mas/linden/ip/request?ip=" + encodeURIComponent(ip), {}, Math.min(2200, Math.max(1200, S().SD_TIMEOUT_MS || 0)), false, ext);
    const d = safeJSON(r.body, {})?.data || {};
    if (!d || (!d.countryIsoCode && !d.country)) throw new Error("pingan-empty");
    return { loc: joinNonEmpty([flagOf(d.countryIsoCode), d.country, d.region, d.city], " ").replace(/\s*中国\s*/, ""), isp: String(d.isp || d.ispName || d.operator || d.org || d.as || "").trim() };
  },
  ipapi: async (ip, ext = {}) => {
    const r = await httpGetRT(`http://ip-api.com/json/${encodeURIComponent(ip)}?lang=zh-CN`, {}, Math.min(2200, Math.max(1200, S().SD_TIMEOUT_MS || 0)), false, ext);
    const j = safeJSON(r.body, {});
    return { loc: joinNonEmpty([flagOf(j.countryCode), j.country?.replace(/\s*中国\s*/, ""), j.regionName?.split(/\s+or\s+/)[0], j.city], " "), isp: String(j.isp || j.org || j.as || "").trim() };
  },
  ipwhois: async (ip, ext = {}) => {
    const r = await httpGetRT(`https://ipwhois.app/json/${encodeURIComponent(ip)}?lang=zh-CN`, {}, Math.min(2200, Math.max(1200, S().SD_TIMEOUT_MS || 0)), false, ext);
    const j = safeJSON(r.body, {});
    return { loc: joinNonEmpty([flagOf(j.country_code), j.country?.replace(/\s*中国\s*/, ""), j.region, j.city], " "), isp: String((j.connection && j.connection.isp) || j.org || "").trim() };
  },
  ipsb: async (ip, ext = {}) => {
    const r = await httpGetRT(`https://api.ip.sb/geoip/${encodeURIComponent(ip)}`, {}, Math.min(2200, Math.max(1200, S().SD_TIMEOUT_MS || 0)), false, ext);
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
  const ext = { policy: "DIRECT" };
  const [p, a, w, s] = await Promise.allSettled([
    ENT_LOC_CHAIN.pingan(ip, ext), ENT_LOC_CHAIN.ipapi(ip, ext), ENT_LOC_CHAIN.ipwhois(ip, ext), ENT_LOC_CHAIN.ipsb(ip, ext)
  ]);
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

/* =========================================================
 * 模块分类 · 服务检测
 * ========================================================= */
const SD_UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";
const SD_BASE_HEADERS = { "User-Agent": SD_UA, "Accept-Language": "en" };
const SD_CC_NAME = {
  "zh-Hans": { CN: "中国", TW: "台湾", HK: "中国香港", MO: "中国澳门", JP: "日本", KR: "韩国", US: "美国", SG: "新加坡", MY: "马来西亚", TH: "泰国", VN: "越南", PH: "菲律宾", ID: "印度尼西亚", IN: "印度", AU: "澳大利亚", NZ: "新西兰", CA: "加拿大", GB: "英国", DE: "德国", FR: "法国", NL: "荷兰", ES: "西班牙", IT: "意大利", BR: "巴西", AR: "阿根廷", MX: "墨西哥", RU: "俄罗斯" },
  "zh-Hant": { CN: "中國", TW: "台灣", HK: "中國香港", MO: "中國澳門", JP: "日本", KR: "南韓", US: "美國", SG: "新加坡", MY: "馬來西亞", TH: "泰國", VN: "越南", PH: "菲律賓", ID: "印尼", IN: "印度", AU: "澳洲", NZ: "紐西蘭", CA: "加拿大", GB: "英國", DE: "德國", FR: "法國", NL: "荷蘭", ES: "西班牙", IT: "義大利", BR: "巴西", AR: "阿根廷", MX: "墨西哥", RU: "俄羅斯" }
};
function SD_I18N() {
  return {
    youTube: "YouTube", chatgpt_app: "ChatGPT", chatgpt: "ChatGPT Web", netflix: "Netflix",
    disney: "Disney+", huluUS: "Hulu(美)", huluJP: "Hulu(日)", hbo: "Max(HBO)"
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
    if (!["youtube","netflix","disney","chatgpt_web","chatgpt_app","hulu_us","hulu_jp","hbo"].includes(k)) continue;
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
  return ["youtube", "netflix", "disney", "chatgpt_web", "chatgpt_app", "hulu_us", "hulu_jp", "hbo"];
}
function sd_flagFromCC(cc) {
  cc = (cc || "").toUpperCase();
  if (!/^[A-Z]{2}$/.test(cc)) return "";
  if (cc === "TW") {
    if (S().TW_FLAG_MODE === 0) return "🇨🇳";
    if (S().TW_FLAG_MODE === 2) return "🇼🇸";
  }
  try {
    return String.fromCodePoint(...[...cc].map((c) => 0x1F1E6 + (c.charCodeAt(0) - 65)));
  } catch (_) { return ""; }
}
function sd_ccPretty(cc) {
  cc = (cc || "").toUpperCase();
  const flag = sd_flagFromCC(cc);
  const name = SD_CC_NAME[S().CFG.SD_LANG][cc];
  if (!cc) return "—";
  if (S().SD_REGION_MODE === "flag") return flag || "—";
  if (S().SD_REGION_MODE === "abbr") return (flag || "") + cc;
  if (flag && name) return `${flag} ${cc} | ${name}`;
  if (flag) return `${flag} ${cc}`;
  return cc;
}
const isPartial = (tag) => /自制|自製|original/i.test(String(tag || "")) || /部分/i.test(String(tag || ""));
function sd_renderLine({ name, ok, cc, cost, status, tag, state }) {
  const st = state ? state : (ok ? (isPartial(tag) ? "partial" : "full") : "blocked");
  const icon = S().SD_ICONS[st];
  const regionText = cc ? sd_ccPretty(cc) : "-";
  const unlockedShort = t("unlocked");
  const blockedText = t("notReachable");
  const isNetflix = /netflix/i.test(String(name));
  const stateTextLong = (st === "full") ? t("nfFull") : (st === "partial") ? t("nfOriginals") : blockedText;
  const stateTextShort = (st === "blocked") ? blockedText : unlockedShort;
  const showTag = (isNetflix && S().SD_STYLE === "text" && !S().CFG.SD_ARROW) ? "" : (tag || "");
  if (S().SD_STYLE === "text" && !S().CFG.SD_ARROW) {
    const left = `${name}: ${isNetflix ? stateTextLong : stateTextShort}`;
    const head = `${left}，${t("region")}: ${regionText}`;
    const tail = [showTag, (S().CFG.SD_SHOW_LAT && cost != null) ? `${cost}ms` : "", (S().CFG.SD_SHOW_HTTP && status > 0) ? `HTTP ${status}` : ""].filter(Boolean).join(" ｜ ");
    return tail ? `${head} ｜ ${tail}` : head;
  }
  if (S().SD_STYLE === "text") {
    const left = `${name}: ${st === "full" ? t("unlocked") : st === "partial" ? t("partialUnlocked") : t("notReachable")}`;
    const head = S().CFG.SD_ARROW ? `${left} ➟ ${regionText}` : `${left} ｜ ${regionText}`;
    const tail = [showTag, (S().CFG.SD_SHOW_LAT && cost != null) ? `${cost}ms` : "", (S().CFG.SD_SHOW_HTTP && status > 0) ? `HTTP ${status}` : ""].filter(Boolean).join(" ｜ ");
    return tail ? `${head} ｜ ${tail}` : head;
  }
  const head = S().CFG.SD_ARROW ? `${icon} ${name} ➟ ${regionText}` : `${icon} ${name} ｜ ${regionText}`;
  const tail = [showTag, (S().CFG.SD_SHOW_LAT && cost != null) ? `${cost}ms` : "", (S().CFG.SD_SHOW_HTTP && status > 0) ? `HTTP ${status}` : ""].filter(Boolean).join(" ｜ ");
  return tail ? `${head} ｜ ${tail}` : head;
}
function sd_nameOfKey(key) {
  const i = SD_I18N();
  switch (key) {
    case "youtube": return i.youTube;
    case "netflix": return i.netflix;
    case "disney": return i.disney;
    case "hulu_us": return i.huluUS;
    case "hulu_jp": return i.huluJP;
    case "hbo": return i.hbo;
    case "chatgpt_web": return i.chatgpt;
    case "chatgpt_app": return i.chatgpt_app;
    default: return key;
  }
}
async function sd_httpGet(url, headers = {}, followRedirect = true) {
  const start = Date.now();
  const r = await httpGetRT(url, { ...SD_BASE_HEADERS, ...headers }, S().SD_TIMEOUT_MS, followRedirect, { policy: S().CFG.PROXY_POLICY || undefined })
    .then((r) => ({ ok: true, status: r.status, headers: r.headers || {}, data: r.body || "", cost: Date.now() - start }))
    .catch((e) => ({ ok: false, status: 0, headers: {}, data: "", cost: Date.now() - start, err: String(e || "") }));
  return r;
}
async function sd_httpPost(url, headers = {}, body = "") {
  const start = Date.now();
  return await httpPostRT(url, { ...SD_BASE_HEADERS, ...headers }, body, S().SD_TIMEOUT_MS, { policy: S().CFG.PROXY_POLICY || undefined })
    .then((r) => ({ ok: true, status: r.status, headers: r.headers || {}, data: r.body || "", cost: Date.now() - start }))
    .catch((e) => ({ ok: false, status: 0, headers: {}, data: "", cost: Date.now() - start, err: String(e || "") }));
}
const SD_NF_ORIGINAL = "80018499";
const SD_NF_NONORIG = "81280792";
const sd_nfGet = (id) => sd_httpGet(`https://www.netflix.com/title/${id}`, {}, true);
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
async function sd_queryLandingCC() {
  const r = await sd_httpGet("http://ip-api.com/json", {}, true);
  if (r.ok && r.status === 200) {
    try { const j = safeJSON(r.data, {}); return (j.countryCode || "").toUpperCase(); } catch (_) {}
  }
  return "";
}
async function sd_queryLandingCCMulti() {
  let cc = await sd_queryLandingCC();
  if (cc) return cc;
  for (const url of ["https://api.ip.sb/geoip", "https://ipinfo.io/json", "https://ifconfig.co/json"]) {
    const r = await sd_httpGet(url, { "Accept-Language": "en" }, true);
    if (r.ok && r.status === 200) {
      try {
        const j = safeJSON(r.data, {});
        cc = (j.country_code || j.country || j.country_iso || "").toUpperCase();
        if (/^[A-Z]{2}$/.test(cc)) return cc;
      } catch (_) {}
    }
  }
  return "";
}
async function sd_testYouTube() {
  const r = await sd_httpGet("https://www.youtube.com/premium?hl=en", {}, true);
  if (!r.ok) return sd_renderLine({ name: sd_nameOfKey("youtube"), ok: false, cc: "", cost: r.cost, status: r.status, tag: t("notReachable") });
  let cc = "US";
  try {
    let m = r.data.match(/"countryCode":"([A-Z]{2})"/);
    if (!m) m = r.data.match(/["']GL["']\s*:\s*["']([A-Z]{2})["']/);
    if (m) cc = m[1];
  } catch (_) {}
  return sd_renderLine({ name: sd_nameOfKey("youtube"), ok: true, cc, cost: r.cost, status: r.status, tag: "" });
}
async function sd_testChatGPTWeb() {
  const r = await sd_httpGet("https://chatgpt.com/cdn-cgi/trace", {}, true);
  if (!r.ok) return sd_renderLine({ name: sd_nameOfKey("chatgpt_web"), ok: false, cc: "", cost: r.cost, status: r.status, tag: t("notReachable") });
  let cc = "";
  try { const m = r.data.match(/loc=([A-Z]{2})/); if (m) cc = m[1]; } catch (_) {}
  return sd_renderLine({ name: sd_nameOfKey("chatgpt_web"), ok: true, cc, cost: r.cost, status: r.status, tag: "" });
}
async function sd_testChatGPTAppAPI() {
  const r = await sd_httpGet("https://api.openai.com/v1/models", {}, true);
  if (!r.ok) return sd_renderLine({ name: sd_nameOfKey("chatgpt_app"), ok: false, cc: "", cost: r.cost, status: r.status, tag: t("notReachable") });
  let cc = "";
  try {
    const h = r.headers || {};
    cc = (h["cf-ipcountry"] || h["CF-IPCountry"] || h["Cf-IpCountry"] || "").toString().toUpperCase();
    if (!/^[A-Z]{2}$/.test(cc)) cc = "";
  } catch (_) {}
  if (!cc) cc = await sd_queryLandingCCMulti();
  return sd_renderLine({ name: sd_nameOfKey("chatgpt_app"), ok: true, cc, cost: r.cost, status: r.status, tag: "" });
}
async function sd_testNetflix() {
  const r1 = await sd_nfGet(SD_NF_NONORIG);
  if (!r1.ok) return sd_renderLine({ name: sd_nameOfKey("netflix"), ok: false, cc: "", cost: r1.cost, status: r1.status, tag: t("fail") });
  if (r1.status === 403) return sd_renderLine({ name: sd_nameOfKey("netflix"), ok: false, cc: "", cost: r1.cost, status: r1.status, tag: t("regionBlocked") });
  if (r1.status === 404) {
    const r2 = await sd_nfGet(SD_NF_ORIGINAL);
    if (!r2.ok) return sd_renderLine({ name: sd_nameOfKey("netflix"), ok: false, cc: "", cost: r2.cost, status: r2.status, tag: t("fail") });
    if (r2.status === 404) return sd_renderLine({ name: sd_nameOfKey("netflix"), ok: false, cc: "", cost: r2.cost, status: r2.status, tag: t("regionBlocked") });
    const cc = sd_parseNFRegion(r2) || "";
    return sd_renderLine({ name: sd_nameOfKey("netflix"), ok: true, cc, cost: r2.cost, status: r2.status, tag: t("nfOriginals"), state: "partial" });
  }
  if (r1.status === 200) {
    const cc = sd_parseNFRegion(r1) || "";
    return sd_renderLine({ name: sd_nameOfKey("netflix"), ok: true, cc, cost: r1.cost, status: r1.status, tag: t("nfFull"), state: "full" });
  }
  return sd_renderLine({ name: sd_nameOfKey("netflix"), ok: false, cc: "", cost: r1.cost, status: r1.status, tag: `HTTP ${r1.status}` });
}
async function sd_testDisney() {
  const rHome = await sd_httpGet("https://www.disneyplus.com/", { "Accept-Language": "en" }, true);
  if (!rHome.ok || rHome.status !== 200 || /Sorry,\s*Disney\+\s*is\s*not\s*available/i.test(rHome.data || "")) {
    return sd_renderLine({ name: sd_nameOfKey("disney"), ok: false, cc: "", cost: rHome.cost, status: rHome.status, tag: (!rHome.ok) ? t("timeout") : t("regionBlocked") });
  }
  let homeCC = "";
  try {
    const m = rHome.data.match(/"countryCode"\s*:\s*"([A-Z]{2})"/i) || rHome.data.match(/data-country=["']([A-Z]{2})["']/i);
    if (m) homeCC = m[1].toUpperCase();
  } catch (_) {}
  const headers = {
    "Accept-Language": "en",
    "Authorization": "ZGlzbmV5JmJyb3dzZXImMS4wLjA.Cu56AgSfBTDag5NiRA81oLHkDZfu5L3CKadnefEAY84",
    "Content-Type": "application/json", "User-Agent": SD_UA
  };
  const body = JSON.stringify({
    query: "mutation registerDevice($input: RegisterDeviceInput!) { registerDevice(registerDevice: $input) { grant { grantType assertion } } }",
    variables: { input: { applicationRuntime: "chrome", attributes: { browserName: "chrome", browserVersion: "120.0.0.0", manufacturer: "apple", model: null, operatingSystem: "macintosh", operatingSystemVersion: "10.15.7", osDeviceIds: [] }, deviceFamily: "browser", deviceLanguage: "en", deviceProfile: "macosx" } }
  });
  const rBam = await sd_httpPost("https://disney.api.edge.bamgrid.com/graph/v1/device/graphql", headers, body);
  if (!rBam.ok || rBam.status !== 200) {
    const cc = homeCC || (await sd_queryLandingCCMulti()) || "";
    return sd_renderLine({ name: sd_nameOfKey("disney"), ok: true, cc, cost: rHome.cost, status: rHome.status, tag: "" });
  }
  const d = safeJSON(rBam.data, {});
  if (d?.errors) {
    const cc = homeCC || (await sd_queryLandingCCMulti()) || "";
    return sd_renderLine({ name: sd_nameOfKey("disney"), ok: true, cc, cost: rHome.cost, status: rHome.status, tag: "" });
  }
  const inLoc = d?.extensions?.sdk?.session?.inSupportedLocation;
  const bamCC = d?.extensions?.sdk?.session?.location?.countryCode;
  const blocked = (inLoc === false);
  const cc = blocked ? "" : ((bamCC || homeCC || (await sd_queryLandingCCMulti()) || "").toUpperCase());
  return sd_renderLine({ name: sd_nameOfKey("disney"), ok: !blocked, cc, cost: Math.min(rHome.cost || 0, rBam.cost || 0) || (rBam.cost || rHome.cost || 0), status: rBam.status || rHome.status || 0, tag: blocked ? t("regionBlocked") : "" });
}
async function sd_testHuluUS() {
  const r = await sd_httpGet("https://www.hulu.com/", {}, true);
  if (!r.ok) return sd_renderLine({ name: sd_nameOfKey("hulu_us"), ok: false, cc: "", cost: r.cost, status: r.status, tag: t("notReachable") });
  const blocked = /not\s+available\s+in\s+your\s+region/i.test(r.data || "");
  return sd_renderLine({ name: sd_nameOfKey("hulu_us"), ok: !blocked, cc: blocked ? "" : "US", cost: r.cost, status: r.status, tag: blocked ? t("regionBlocked") : "" });
}
async function sd_testHuluJP() {
  const r = await sd_httpGet("https://www.hulu.jp/", { "Accept-Language": "ja" }, true);
  if (!r.ok) return sd_renderLine({ name: sd_nameOfKey("hulu_jp"), ok: false, cc: "", cost: r.cost, status: r.status, tag: t("notReachable") });
  const blocked = /ご利用いただけません|サービスをご利用いただけません|not available/i.test(r.data || "");
  return sd_renderLine({ name: sd_nameOfKey("hulu_jp"), ok: !blocked, cc: blocked ? "" : "JP", cost: r.cost, status: r.status, tag: blocked ? t("regionBlocked") : "" });
}
async function sd_testHBO() {
  const r = await sd_httpGet("https://www.max.com/", {}, true);
  if (!r.ok) return sd_renderLine({ name: sd_nameOfKey("hbo"), ok: false, cc: "", cost: r.cost, status: r.status, tag: t("notReachable") });
  const blocked = /not\s+available\s+in\s+your\s+region|country\s+not\s+supported/i.test(r.data || "");
  let cc = "";
  try { const m = String(r.data || "").match(/"countryCode"\s*:\s*"([A-Z]{2})"/i); if (m) cc = m[1].toUpperCase(); } catch (_) {}
  if (!cc) cc = await sd_queryLandingCCMulti();
  return sd_renderLine({ name: sd_nameOfKey("hbo"), ok: !blocked, cc: blocked ? "" : cc, cost: r.cost, status: r.status, tag: blocked ? t("regionBlocked") : "" });
}
function buildServiceTests() {
  return {
    youtube: () => sd_testYouTube(),
    netflix: () => sd_testNetflix(),
    disney: () => sd_testDisney(),
    chatgpt_web: () => sd_testChatGPTWeb(),
    chatgpt_app: () => sd_testChatGPTAppAPI(),
    hulu_us: () => sd_testHuluUS(),
    hulu_jp: () => sd_testHuluJP(),
    hbo: () => sd_testHBO()
  };
}
async function runServiceChecks() {
  const order = selectServices();
  if (!order.length) return [];
  const map = buildServiceTests();
  const conc = clamp(Number(S().CFG.SD_CONCURRENCY) || 6, 1, 8);
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
      if (!fn) {
        results[idx] = sd_renderLine({ name: sd_nameOfKey(key), ok: false, cc: "", cost: 0, status: 0, tag: t("fail") });
        finished++;
        continue;
      }
      inflight++;
      Promise.resolve(fn())
        .then((line) => { results[idx] = line; })
        .catch(() => { results[idx] = sd_renderLine({ name: sd_nameOfKey(key), ok: false, cc: "", cost: null, status: 0, tag: t("fail") }); })
        .finally(() => { inflight--; finished++; if (finished >= order.length) finish(); else tryLaunch(); });
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
    if (!results[i]) results[i] = sd_renderLine({ name: sd_nameOfKey(order[i]), ok: false, cc: "", cost: null, status: 0, tag: t("timeout") });
  }
  return results.filter(Boolean);
}

/* =========================================================
 * 模块分类 · 简繁
 * ========================================================= */
function zhHansToHantOnce(s) {
  if (!s) return s;
  const phraseMap = [
    ["网络信息", "網路資訊"], ["服务检测", "服務檢測"], ["执行时间", "執行時間"], ["蜂窝网络", "行動服務"], ["蜂窝", "行動"],
    ["网络", "網路"], ["运营商", "運營商"], ["区域受限", "區域受限"], ["区域", "區域"], ["不可达", "不可達"], ["检测失败", "檢測失敗"],
    ["超时", "逾時"], ["已完整解锁", "已完整解鎖"], ["仅解锁自制剧", "僅解鎖自製劇"], ["部分解锁", "部分解鎖"], ["已解锁", "已解鎖"],
    ["风险值", "風險值"], ["网络类型", "網路類型"], ["已连接", "已連線"], ["未连接", "未連線"], ["家宽", "家寬"], ["非家宽", "非家寬"],
    ["中国香港", "中國香港"], ["中国澳门", "中國澳門"], ["中国移动", "中國移動"], ["中国联通", "中國聯通"], ["中国电信", "中國電信"], ["中国广电", "中國廣電"], ["中国教育网", "中國教育網"]
  ];
  for (const [hans, hant] of phraseMap) s = s.replace(new RegExp(hans, "g"), hant);
  const charMap = { "网": "網", "络": "絡", "执": "執", "时": "時", "运": "運", "营": "營", "区": "區", "险": "險", "类": "類", "态": "態", "检": "檢", "测": "測", "达": "達" };
  return s.replace(/[\u4E00-\u9FFF]/g, (ch) => charMap[ch] || ch);
}
function maybeTifyLine(line) {
  if (S().CFG.SD_LANG !== "zh-Hant") return line;
  const prefix = t("policy") + ": ";
  if (String(line || "").startsWith(prefix)) return line;
  return zhHansToHantOnce(line);
}
function buildPanelText(parts) {
  return (S().CFG.SD_LANG === "zh-Hant") ? parts.map(maybeTifyLine).join("\n") : parts.join("\n");
}

/* =========================================================
 * 模块分类 · 渲染
 * ========================================================= */
function renderLegacyPanel({ title, content }) {
  return { title, content, icon: S().ICON_NAME, "icon-color": S().ICON_COLOR };
}
function renderEgernWidget({ title, parts }) {
  const rows = [];
  for (const line of parts.slice(0, 20)) {
    rows.push({
      type: "text",
      text: String(line || " "),
      font: { size: "caption2" },
      textColor: "#FFFFFF",
      maxLines: 1,
      minScale: 0.7
    });
  }
  const family = S().RT.widgetFamily || "systemMedium";
  if (family === "accessoryInline") {
    return {
      type: "widget",
      children: [
        { type: "text", text: String(parts.filter(Boolean)[0] || title), font: { size: "caption2", weight: "semibold" } }
      ]
    };
  }
  if (family === "accessoryCircular") {
    return {
      type: "widget",
      children: [{
        type: "stack", direction: "column", alignItems: "center", gap: 2, children: [
          { type: "image", src: `sf-symbol:${S().ICON_NAME}`, color: "#60A5FA", width: 14, height: 14 },
          { type: "text", text: String(parts.filter(Boolean).length), font: { size: "caption1", weight: "bold" }, textColor: "#FFFFFF" }
        ]
      }]
    };
  }
  return {
    type: "widget",
    padding: 14,
    backgroundGradient: { type: "linear", colors: ["#132238", "#0F172A"], startPoint: { x: 0, y: 0 }, endPoint: { x: 1, y: 1 } },
    children: [
      {
        type: "stack", direction: "row", alignItems: "center", gap: 6, children: [
          { type: "image", src: `sf-symbol:${S().ICON_NAME}`, color: "#60A5FA", width: 16, height: 16 },
          { type: "text", text: title, font: { size: "headline", weight: "bold" }, textColor: "#FFFFFF" },
          { type: "spacer" },
          { type: "text", text: now(), font: { size: "caption2" }, textColor: "#9CA3AF" }
        ]
      },
      { type: "stack", direction: "column", gap: 3, children: rows }
    ]
  };
}

/* =========================================================
 * 模块分类 · 主流程
 * ========================================================= */
async function runMain(RT) {
  G_STATE = buildState(RT);
  log("info", "Start", JSON.stringify({
    kind: RT.kind, Update: S().CFG.Update, Timeout: S().CFG.Timeout, Budget_ms: S().BUDGET_MS,
    IPv6_local: S().IPV6_EFF, WANT_V6: S().WANT_V6, HAS_V6: S().HAS_V6, SD_TIMEOUT_MS: S().SD_TIMEOUT_MS,
    SD_STYLE: S().SD_STYLE, SD_REGION_MODE: S().SD_REGION_MODE, TW_FLAG_MODE: S().TW_FLAG_MODE
  }));

  const preTouchV4 = touchLandingOnceQuick({ v6: false }).catch(() => {});
  const sdPromise = runServiceChecks().catch(() => []);

  const cn = await getDirectV4(S().CFG.DOMESTIC_IPv4).catch(() => ({}));
  await preTouchV4;

  let { policyName, entrance4, entrance6 } = await getPolicyAndEntranceBoth();
  if (!entrance4 && RT.kind !== "egern") {
    await httpGetRT("https://api-ipv4.ip.sb/ip", {}, CONSTS.PRETOUCH_TO_MS, true, { policy: S().CFG.PROXY_POLICY || undefined }).catch(() => {});
    await sleep(80);
    const r1 = await getPolicyAndEntranceBoth();
    policyName = policyName || r1.policyName;
    entrance4 = entrance4 || r1.entrance4;
    entrance6 = entrance6 || r1.entrance6;
  }

  const probe = await probeLandingV6(S().CFG.LANDING_IPv6).catch(() => ({ ok: false, ip: "" }));
  const V6_READY = probe.ok;
  if (V6_READY && !entrance6 && RT.kind !== "egern") {
    await touchLandingOnceQuick({ v6: true }).catch(() => {});
    const r2 = await getPolicyAndEntranceBoth();
    entrance6 = r2.entrance6 || entrance6 || "";
  }

  const cn6 = S().IPV6_EFF ? await getDirectV6(S().CFG.DOMESTIC_IPv6).catch(() => ({})) : {};
  const ent4 = isIPv4(entrance4 || "") ? await getEntranceBundle(entrance4).catch(() => ({ ip: entrance4 })) : {};
  const ent6 = (V6_READY && isIPv6(entrance6 || "")) ? await getEntranceBundle(entrance6).catch(() => ({ ip: entrance6 })) : {};
  const px = await getLandingV4(S().CFG.LANDING_IPv4).catch(() => ({}));
  const px6 = (V6_READY && probe && probe.ip) ? { ip: probe.ip } : {};
  const rdnsHost = await queryPTRMaybe(px.ip).catch(() => "");
  const asField = (px && (px.as || px.asn)) ? (px.as || px.asn) : "";
  const risk = calculateRiskValueSafe(px.isp, px.org, px.country, asField, rdnsHost);

  const title = netTypeLine() || t("unknownNet");
  const parts = [];
  parts.push(`${t("runAt")}: ${now()}`);
  parts.push(`${t("policy")}: ${policyName || "-"}`);

  pushGroupTitle(parts, "本地");
  const directIPv4 = ipLine("IPv4", cn.ip);
  const directIPv6 = ipLine("IPv6", cn6.ip);
  if (directIPv4) parts.push(directIPv4);
  if (directIPv6) parts.push(directIPv6);
  const directLoc = cn.loc ? (S().MASK_POS ? onlyFlag(cn.loc) : flagFirst(cn.loc)) : "-";
  parts.push(`${t("location")}: ${directLoc}`);
  if (cn.isp) parts.push(`${t("isp")}: ${fmtISP(cn.isp, cn.loc)}`);

  if ((ent4 && (ent4.ip || ent4.loc1 || ent4.loc2 || ent4.isp1 || ent4.isp2)) || (ent6 && (ent6.ip || ent6.loc1 || ent6.loc2 || ent6.isp1 || ent6.isp2))) {
    pushGroupTitle(parts, "入口");
    const entIPv4 = ipLine("IPv4", ent4.ip && isIPv4(ent4.ip) ? ent4.ip : "");
    const entIPv6 = ipLine("IPv6", ent6.ip && isIPv6(ent6.ip) ? ent6.ip : "");
    if (entIPv4) parts.push(entIPv4);
    if (entIPv6) parts.push(entIPv6);
    const entShow = (ent4 && (ent4.loc1 || ent4.loc2 || ent4.isp1 || ent4.isp2)) ? ent4 : ent6;
    if (entShow?.loc1) parts.push(`${t("location")}¹: ${flagFirst(entShow.loc1)}`);
    if (entShow?.isp1) parts.push(`${t("isp")}¹: ${fmtISP(entShow.isp1, entShow.loc1)}`);
    if (entShow?.loc2) parts.push(`${t("location")}²: ${flagFirst(entShow.loc2)}`);
    if (entShow?.isp2) parts.push(`${t("isp")}²: ${String(entShow.isp2).trim()}`);
  }

  if (px && (px.ip || (px6 && px6.ip) || px.loc || px.isp)) {
    pushGroupTitle(parts, "落地");
    const landIPv4 = ipLine("IPv4", px.ip);
    const landIPv6 = ipLine("IPv6", (px6 && px6.ip) ? px6.ip : "");
    if (landIPv4) parts.push(landIPv4);
    if (landIPv6) parts.push(landIPv6);
    if (px.loc) parts.push(`${t("location")}: ${flagFirst(px.loc)}`);
    if (px.isp) parts.push(`${t("isp")}: ${fmtISP(px.isp, px.loc)}`);
    parts.push(`网络类型: ${risk.lineType} · ${risk.nativeHint}`);
    parts.push(`代理特征: ${risk.tunnelHint}`);
    parts.push(`证据: ${(risk.reasons || []).slice(0, 4).join("；") || "-"}`);
    const rv = Number(risk.riskValue);
    const riskValue = Number.isFinite(rv) ? clamp(Math.round(rv), 0, 100) : 0;
    const riskWarn = (riskValue >= 80) ? " 🚨" : (riskValue >= 50) ? " ⚠️" : "";
    parts.push(`风险值: ${riskValue}%${riskWarn}`);
  }

  const sdLines = await sdPromise;
  if (sdLines.length) {
    pushGroupTitle(parts, "服务检测");
    parts.push(...sdLines);
  }

  if (S().CFG.LOG_TO_PANEL && S().DEBUG_LINES.length) {
    pushGroupTitle(parts, t("debug"));
    parts.push(S().DEBUG_LINES.slice(-CONSTS.DEBUG_TAIL_LINES).join("\n"));
  }

  const content = buildPanelText(parts);
  log("info", "Done", `${Date.now() - (S().DEADLINE - S().BUDGET_MS)}ms`);

  return renderLegacyPanel({ title, content });
}

/* =========================================================
 * 模块分类 · 导出与 Legacy 启动
 * ========================================================= */
export default async function(ctx) {
  try {
    return await runMain(createEgernRuntime(ctx));
  } catch (err) {
    const RT = createEgernRuntime(ctx);
    G_STATE = G_STATE || buildState(RT);
    const msg = String(err && err.stack ? err.stack : err);
    try { RT.notify({ title: t("panelTitle"), body: msg.slice(0, 200) }); } catch (_) {}
    return renderEgernWidget({
      title: t("panelTitle"),
      parts: [
        `${t("debug")}: Egern runtime error`,
        msg.slice(0, 300)
      ]
    });
  }
}

if (typeof $done !== "undefined") {
  (async () => {
    try {
      const out = await runMain(createLegacyRuntime());
      $done(out);
    } catch (err) {
      G_STATE = G_STATE || buildState(createLegacyRuntime());
      const msg = String(err && err.stack ? err.stack : err);
      logErrPush(t("panelTitle"), msg);
      $done({ title: t("panelTitle"), content: (S().CFG.SD_LANG === "zh-Hant" ? zhHansToHantOnce(msg) : msg), icon: S().ICON_NAME, "icon-color": S().ICON_COLOR });
    }
  })();
}
