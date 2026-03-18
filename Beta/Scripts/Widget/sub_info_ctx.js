/* =========================================================
 * 模块：订阅信息面板（多机场流量 / 到期展示）
 * 作者：ByteValley
 * 版本：2026-03-18R2
 * ========================================================= */

const TAG = "SubscribeInfo";
function log() {
  if (typeof console === "undefined" || !console.log) return;
  const parts = [];
  for (let i = 0; i < arguments.length; i++) {
    const v = arguments[i];
    if (v === null || v === undefined) parts.push("");
    else if (typeof v === "string") parts.push(v);
    else { try { parts.push(JSON.stringify(v)); } catch (_) { parts.push(String(v)); } }
  }
  console.log("[" + TAG + "] " + parts.join(" "));
}

// =====================================================================
// 工具函数
// =====================================================================

function pad2(n) { return String(n).padStart(2, "0"); }
function bytesToSize(bytes) {
  if (!bytes || bytes <= 0) return "0 B";
  const k = 1024, sizes = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(k)), sizes.length - 1);
  return `${(bytes / Math.pow(k, i)).toFixed(2)} ${sizes[i]}`;
}
function toPercent(used, total) {
  if (!total) return "0%";
  return `${((used / total) * 100).toFixed(2)}%`;
}
function toReversePercent(used, total) {
  if (!total) return "0%";
  return `${(((total - used) / total) * 100).toFixed(2)}%`;
}
function formatDate(ts) {
  const d = new Date(ts);
  return `${d.getFullYear()}.${pad2(d.getMonth() + 1)}.${pad2(d.getDate())}`;
}
function startOfDay(d) { return new Date(d.getFullYear(), d.getMonth(), d.getDate()); }
function daysUntilDate(targetDate) {
  const diff = Math.ceil((startOfDay(targetDate) - startOfDay(new Date())) / 86400000);
  return diff > 0 ? diff : 0;
}
function getResetDaysLeft(resetDayNum) {
  if (!resetDayNum) return null;
  const now = new Date();
  let d = new Date(now.getFullYear(), now.getMonth(), resetDayNum);
  if (d.getDate() < now.getDate()) d = new Date(now.getFullYear(), now.getMonth() + 1, resetDayNum);
  return Math.max(0, Math.ceil((d - now) / 86400000));
}
function isHttpUrl(s) { return /^https?:\/\//i.test(String(s || "")); }
const PLACEHOLDER_STRINGS = ["订阅链接", "机场名称", "重置日期"];
function isPlaceholderString(s) {
  const t = String(s || "").trim();
  if (!t) return false;
  if (/^{{{[^}]+}}}$/.test(t)) return true;
  if (PLACEHOLDER_STRINGS.indexOf(t) !== -1) return true;
  return ["null", "undefined"].includes(t.toLowerCase());
}
function cleanArg(val) {
  if (val == null) return null;
  const s = String(val).trim();
  return (!s || isPlaceholderString(s)) ? null : s;
}
function normalizeUrl(src, label) {
  const s = cleanArg(src);
  if (!s) { log("normalizeUrl", label, "=> skip"); return null; }
  if (isHttpUrl(s)) return s;
  try {
    const d = decodeURIComponent(s);
    if (isHttpUrl(d)) return d;
  } catch (_) {}
  return null;
}
function widgetTimeText() {
  const d = new Date();
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}
function runAtLine() {
  const d = new Date();
  return `⏱ 执行时间：${pad2(d.getMonth()+1)}-${pad2(d.getDate())} ${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}`;
}

// =====================================================================
// resetDay 解析
// =====================================================================

function parseResetSpec(s) {
  const t = String(s || "").trim();
  if (!t) return null;
  if (/^\d{1,2}$/.test(t)) {
    const day = parseInt(t, 10);
    return (day >= 1 && day <= 31) ? { type: "monthly", day } : null;
  }
  let m = t.match(/^(\d{4})[.\-\/年](\d{1,2})[.\-\/月](\d{1,2})/);
  if (m) {
    const mo = parseInt(m[2], 10), d = parseInt(m[3], 10);
    return (mo >= 1 && mo <= 12 && d >= 1 && d <= 31)
      ? { type: "absolute", year: parseInt(m[1], 10), month: mo, day: d } : null;
  }
  m = t.match(/^(\d{1,2})[.\-\/月](\d{1,2})(?:日)?$/);
  if (m) {
    const mo = parseInt(m[1], 10), d = parseInt(m[2], 10);
    return (mo >= 1 && mo <= 12 && d >= 1 && d <= 31) ? { type: "yearly", month: mo, day: d } : null;
  }
  return null;
}

function nextResetDateFromSpec(spec) {
  const now = new Date(), today = startOfDay(now);
  if (spec.type === "yearly") {
    let d = new Date(now.getFullYear(), spec.month - 1, spec.day);
    if (startOfDay(d) <= today) d = new Date(now.getFullYear() + 1, spec.month - 1, spec.day);
    return d;
  }
  if (spec.type === "absolute") {
    let d = new Date(spec.year, spec.month - 1, spec.day);
    if (startOfDay(d) <= today) {
      d = new Date(now.getFullYear(), spec.month - 1, spec.day);
      if (startOfDay(d) <= today) d = new Date(now.getFullYear() + 1, spec.month - 1, spec.day);
    }
    return d;
  }
  return null;
}

function buildResetLine(resetDayRaw) {
  const resetClean = cleanArg(resetDayRaw);
  if (!resetClean) return "";
  const spec = parseResetSpec(resetClean);
  if (spec?.type === "monthly") return `重置：${getResetDaysLeft(spec.day) ?? 0}天`;
  if (spec && (spec.type === "yearly" || spec.type === "absolute")) {
    const nd = nextResetDateFromSpec(spec);
    return nd ? `重置：${daysUntilDate(nd)}天（${formatDate(nd.getTime())}）` : `重置：${resetClean}`;
  }
  return `重置：${resetClean}`;
}

// =====================================================================
// KV / BoxJS
// =====================================================================

function makeKVStore(ctx) {
  if (ctx?.storage) {
    return {
      read: async (k) => {
        try {
          if (ctx.storage.getJSON) { const v = await ctx.storage.getJSON(k); if (v != null) return v; }
          if (ctx.storage.get) return await ctx.storage.get(k);
        } catch (_) {}
        return null;
      }
    };
  }
  const syncStore = (() => {
    if (typeof $prefs !== "undefined" && $prefs.valueForKey) return { read: k => $prefs.valueForKey(k) };
    if (typeof $persistentStore !== "undefined" && $persistentStore.read) return { read: k => $persistentStore.read(k) };
    try { if (typeof localStorage !== "undefined") return { read: k => localStorage.getItem(k) }; } catch (_) {}
    return { read: () => null };
  })();
  return { read: async (k) => syncStore.read(k) };
}

async function readBoxSettings(ctx) {
  const kv = makeKVStore(ctx);
  try {
    let panel = await kv.read("Panel");
    if (panel) {
      if (typeof panel === "string") { try { panel = JSON.parse(panel); } catch (_) {} }
      if (panel?.SubscribeInfo?.Settings) return panel.SubscribeInfo.Settings;
    }
  } catch (_) {}
  for (const key of ["Panel.SubscribeInfo.Settings", "@Panel.SubscribeInfo.Settings"]) {
    try {
      let val = await kv.read(key);
      if (!val) continue;
      if (typeof val === "string") { try { val = JSON.parse(val); } catch (_) { continue; } }
      if (val?.Settings) return val.Settings;
      if (val && typeof val === "object") return val;
    } catch (_) {}
  }
  return {};
}

// =====================================================================
// 参数读取
// =====================================================================

function buildArgStore(ctx) {
  const envStore = ctx?.env || {};
  const args = {};
  const rawArgument = (typeof $argument !== "undefined" ? $argument : "") + "";
  rawArgument.split("&").forEach(p => {
    if (!p) return;
    const idx = p.indexOf("=");
    if (idx === -1) return;
    args[p.substring(0, idx)] = (() => { try { return decodeURIComponent(p.substring(idx + 1)); } catch (_) { return p.substring(idx + 1); } })();
  });
  return { envStore, args };
}

function makePickStr(envStore, args, BOX) {
  function readBoxMulti(keys) {
    if (!BOX || typeof BOX !== "object") return undefined;
    for (const k of keys) {
      if (!k || !Object.prototype.hasOwnProperty.call(BOX, k)) continue;
      const v = BOX[k];
      if (v !== "" && v != null) return v;
    }
    return undefined;
  }
  return function pickStr(lowerKey, upperKey, defVal, defArgRaw) {
    const canon = v => (v == null ? "" : String(v).trim());
    const envVal = cleanArg(envStore[lowerKey] ?? envStore[upperKey] ?? null);
    if (envVal != null) return envVal;
    const boxClean = cleanArg(readBoxMulti([upperKey, lowerKey]));
    const argRaw = Object.prototype.hasOwnProperty.call(args, lowerKey)
      ? args[lowerKey]
      : (Object.prototype.hasOwnProperty.call(args, upperKey) ? args[upperKey] : null);
    const argClean = cleanArg(argRaw);
    const argChanged = argRaw != null && canon(argRaw) !== canon(defArgRaw);
    if (argChanged && argClean != null) return argClean;
    if (boxClean != null) return boxClean;
    if (argClean != null) return argClean;
    return defVal;
  };
}

// =====================================================================
// HTTP 请求
// =====================================================================

const CONCURRENCY_LIMIT = 3;
const REQ_TIMEOUT_MS = 5000;
const MAX_RETRY = 1;

function makeHttpRequest(ctx) {
  if (ctx?.http) {
    return async function requestSubInfo(url) {
      const opt = { timeout: REQ_TIMEOUT_MS, redirect: "follow" };
      try {
        const r = await ctx.http.head(url, opt);
        if (r.status >= 200 && r.status < 400) return r;
      } catch (_) {}
      return await ctx.http.get(url, opt);
    };
  }
  function httpInvoke(method, options, cb) {
    const m = String(method || "GET").toUpperCase();
    const opt = Object.assign({}, options);
    if (!opt.timeout) opt.timeout = REQ_TIMEOUT_MS;
    const lower = m.toLowerCase();
    const fn = typeof $httpClient !== "undefined" && $httpClient[lower] ? $httpClient[lower] : null;
    if (fn) { fn(opt, cb); return; }
    opt.method = m; $httpClient.get(opt, cb);
  }
  function httpWithRetry(method, options, attempt) {
    return new Promise((resolve, reject) => {
      let finished = false;
      const timer = setTimeout(() => { if (finished) return; finished = true; reject(new Error("timeout")); }, REQ_TIMEOUT_MS + 200);
      httpInvoke(method, options, (err, resp) => {
        if (finished) return; finished = true; clearTimeout(timer);
        if (err || !resp) {
          if (attempt < MAX_RETRY) return httpWithRetry(method, options, attempt + 1).then(resolve, reject);
          return reject(err || new Error("request error"));
        }
        resolve(resp);
      });
    });
  }
  return async function requestSubInfo(url) {
    const opt = { url, headers: { "User-Agent": "Clash/1.18.0" } };
    try {
      const r = await httpWithRetry("HEAD", opt, 1);
      if (r.status >= 200 && r.status < 400) return r;
    } catch (_) {}
    return await httpWithRetry("GET", opt, 1);
  };
}

// =====================================================================
// 订阅信息解析
// =====================================================================

async function fetchInfo(requestSubInfo, url, resetDayRaw, title, index) {
  log("fetchInfo start slot", index);
  try {
    const resp = await requestSubInfo(url);
    if (!(resp.status >= 200 && resp.status < 400)) {
      return { ok: false, title, error: `状态码：${resp.status}` };
    }
    const headers = resp.headers || {};
    const headerKey = Object.keys(headers).find(k => k.toLowerCase() === "subscription-userinfo");
    const data = {};
    if (headerKey && headers[headerKey]) {
      headers[headerKey].split(";").forEach(p => {
        const idx = p.indexOf("=");
        if (idx === -1) return;
        const k = p.slice(0, idx).trim(), v = parseInt(p.slice(idx + 1).trim(), 10);
        if (k && !isNaN(v)) data[k] = v;
      });
    }
    const upload = data.upload || 0, download = data.download || 0;
    const total = data.total || 0, used = upload + download;
    const remain = Math.max(total - used, 0);
    const usedPct = total > 0 ? (used / total) : 0;
    let expireMs = null;
    if (data.expire) {
      let exp = Number(data.expire);
      if (exp < 10000000000) exp *= 1000;
      expireMs = exp;
    } else {
      expireMs = new Date("2099-12-31T00:00:00Z").getTime();
    }
    const resetSpec = parseResetSpec(cleanArg(resetDayRaw));
    const resetDate = resetSpec ? (resetSpec.type === "monthly"
      ? (() => { const now = new Date(); let d = new Date(now.getFullYear(), now.getMonth(), resetSpec.day); if (d <= now) d = new Date(now.getFullYear(), now.getMonth() + 1, resetSpec.day); return d; })()
      : nextResetDateFromSpec(resetSpec)) : null;
    log("fetchInfo done slot", index, `used=${bytesToSize(used)} total=${bytesToSize(total)}`);
    return { ok: true, title, used, remain, total, usedPct, expireMs, resetDate, resetDayRaw };
  } catch (e) {
    const reason = String(e).includes("timeout") ? "请求超时" : "请求错误";
    return { ok: false, title, error: reason };
  }
}

// =====================================================================
// 并发池
// =====================================================================

async function runPool(tasks, limit) {
  const results = new Array(tasks.length);
  let nextIndex = 0;
  async function worker() {
    while (true) {
      const cur = nextIndex++;
      if (cur >= tasks.length) break;
      try { results[cur] = await tasks[cur](); } catch (e) { results[cur] = null; }
    }
  }
  const n = Math.max(1, Math.min(limit || 3, tasks.length));
  await Promise.all(Array.from({ length: n }, () => worker()));
  return results;
}

// =====================================================================
// Widget 渲染
// =====================================================================

function gaugeColor(usedPct) {
  if (usedPct >= 0.9) return { light: "#EF4444", dark: "#F87171" };
  if (usedPct >= 0.7) return { light: "#F59E0B", dark: "#FBBF24" };
  return { light: "#10B981", dark: "#34D399" };
}

// 单个机场行（紧凑，整合进一张卡片）
function buildSubRow(info) {
  const textMain = { light: "#111827", dark: "#F3F4F6" };
  const textSub  = { light: "#6B7280", dark: "#A1A1AA" };
  const textSoft = { light: "#9CA3AF", dark: "#71717A" };

  if (!info.ok) {
    return {
      type: "stack",
      direction: "row",
      alignItems: "center",
      gap: 6,
      padding: [4, 0, 4, 0],
      children: [
        {
          type: "image",
          src: "sf-symbol:exclamationmark.circle",
          width: 12, height: 12,
          color: { light: "#EF4444", dark: "#F87171" }
        },
        {
          type: "text",
          text: `${info.title}  ${info.error || "获取失败"}`,
          font: { size: "caption2" },
          textColor: textSub
        }
      ]
    };
  }

  const usedPct = info.usedPct || 0;
  const remainPct = Math.max(0, 1 - usedPct);
  const gc = gaugeColor(usedPct);
  const usedPctStr = `${(usedPct * 100).toFixed(1)}%`;
  const remainPctStr = `${(remainPct * 100).toFixed(1)}%`;
  const expireStr = info.expireMs ? formatDate(info.expireMs) : "未知";

  // 重置信息
  let resetStr = "";
  if (info.resetDate) {
    const days = daysUntilDate(info.resetDate);
    resetStr = `${days}天`;
  }

  return {
    type: "stack",
    direction: "column",
    gap: 3,
    padding: [5, 0, 5, 0],
    children: [
      // 机场名 + 到期 + 重置
      {
        type: "stack",
        direction: "row",
        alignItems: "center",
        gap: 4,
        children: [
          {
            type: "text",
            text: info.title,
            font: { size: "caption1", weight: "semibold" },
            textColor: textMain,
            flex: 1,
            maxLines: 1,
            minScale: 0.8
          },
          {
            type: "image",
            src: "sf-symbol:calendar",
            width: 10, height: 10,
            color: textSoft
          },
          {
            type: "text",
            text: expireStr,
            font: { size: "caption2" },
            textColor: textSoft
          },
          ...(resetStr ? [
            {
              type: "image",
              src: "sf-symbol:arrow.clockwise",
              width: 10, height: 10,
              color: textSoft
            },
            {
              type: "text",
              text: resetStr,
              font: { size: "caption2" },
              textColor: textSoft
            }
          ] : [])
        ]
      },
      // 进度条
      {
        type: "stack",
        direction: "row",
        height: 5,
        borderRadius: 2.5,
        backgroundColor: { light: "#F3F4F6", dark: "#2D2F35" },
        children: [
          {
            type: "stack",
            flex: Math.max(usedPct, 0.001),
            height: 5,
            borderRadius: 2.5,
            backgroundColor: gc
          },
          {
            type: "stack",
            flex: Math.max(remainPct, 0.001),
            height: 5
          }
        ]
      },
      // 流量数据：已用% | 已用量 · 剩余% | 剩余量 · 总量
      {
        type: "stack",
        direction: "row",
        alignItems: "center",
        gap: 3,
        children: [
          {
            type: "text",
            text: `已用 ${usedPctStr}`,
            font: { size: "caption2" },
            textColor: gc
          },
          {
            type: "text",
            text: bytesToSize(info.used),
            font: { size: "caption2" },
            textColor: textSub
          },
          { type: "spacer" },
          {
            type: "text",
            text: `剩余 ${remainPctStr}`,
            font: { size: "caption2" },
            textColor: textSub
          },
          {
            type: "text",
            text: bytesToSize(info.remain),
            font: { size: "caption2" },
            textColor: textSub
          },
          {
            type: "text",
            text: `/ ${bytesToSize(info.total)}`,
            font: { size: "caption2" },
            textColor: textSoft
          }
        ]
      }
    ]
  };
}

// 分隔线
function rowDivider() {
  return {
    type: "stack",
    direction: "row",
    padding: [1, 0, 1, 0],
    children: [{
      type: "stack",
      flex: 1,
      height: 0.4,
      backgroundColor: { light: "#E8EAEE", dark: "#343741" }
    }]
  };
}

function buildWidget(infos, cfg) {
  const refreshTime = new Date(Date.now() + Math.max(60, (cfg.Update || 10)) * 1000).toISOString();
  const bgGradient = {
    type: "linear",
    colors: [
      { light: "#F7F8FA", dark: "#111214" },
      { light: "#FFFFFF", dark: "#1B1C1F" }
    ],
    stops: [0, 1],
    startPoint: { x: 0, y: 0 },
    endPoint: { x: 1, y: 1 }
  };
  const cardBg     = { light: "#FFFFFF", dark: "#23252A" };
  const cardBorder = { light: "#E8EAEE", dark: "#343741" };
  const textMain   = { light: "#111827", dark: "#F3F4F6" };
  const textSoft   = { light: "#9CA3AF", dark: "#71717A" };
  const accentColor = { light: cfg.defaultIconColor || "#00E28F", dark: cfg.defaultIconColor || "#00E28F" };

  if (!infos.length) {
    return {
      type: "widget",
      padding: [0, 0, 0, 0],
      backgroundGradient: bgGradient,
      refreshAfter: refreshTime,
      children: [{
        type: "stack",
        direction: "column",
        gap: 4,
        padding: [12, 14, 12, 14],
        backgroundColor: cardBg,
        borderRadius: 16,
        borderWidth: 0.5,
        borderColor: cardBorder,
        children: [{
          type: "text",
          text: "未配置订阅参数",
          font: { size: "footnote" },
          textColor: textSoft
        }]
      }]
    };
  }

  // 标题行
  const headerRow = {
    type: "stack",
    direction: "row",
    alignItems: "center",
    gap: 5,
    padding: [0, 0, 3, 0],
    children: [
      {
        type: "image",
        src: `sf-symbol:${cfg.defaultIcon || "antenna.radiowaves.left.and.right.circle.fill"}`,
        width: 14, height: 14,
        color: accentColor
      },
      {
        type: "text",
        text: "订阅信息",
        font: { size: "footnote", weight: "bold" },
        textColor: textMain,
        flex: 1
      },
      {
        type: "text",
        text: widgetTimeText(),
        font: { size: "caption2" },
        textColor: accentColor
      }
    ]
  };

  // 所有机场行，中间插分隔线
  const subRows = [];
  infos.forEach((info, idx) => {
    subRows.push(buildSubRow(info));
    if (idx < infos.length - 1) subRows.push(rowDivider());
  });

  return {
    type: "widget",
    padding: [0, 0, 0, 0],
    backgroundGradient: bgGradient,
    refreshAfter: refreshTime,
    children: [{
      type: "stack",
      direction: "column",
      gap: 0,
      padding: [10, 12, 10, 12],
      backgroundColor: cardBg,
      borderRadius: 16,
      borderWidth: 0.5,
      borderColor: cardBorder,
      children: [headerRow, ...subRows]
    }]
  };
}

// =====================================================================
// 面板文字输出（原有格式，保留）
// =====================================================================

function buildPanelContent(infos) {
  if (!infos.length) return "未配置订阅参数";
  const blocks = infos.map(info => {
    if (!info.ok) return `机场：${info.title}\n订阅请求失败：${info.error}`;
    const used = info.used, total = info.total, remain = info.remain;
    const expireStr = info.expireMs ? formatDate(info.expireMs) : "未知";
    const now = new Date();
    const timeStr = `${pad2(now.getHours())}:${pad2(now.getMinutes())}`;
    const resetLinePart = buildResetLine(info.resetDayRaw);
    const tailLine = resetLinePart
      ? `${resetLinePart} | 到期：${expireStr}`
      : `到期：${expireStr}`;
    return [
      `${info.title} | ${bytesToSize(total)} | ${timeStr}`,
      `已用：${toPercent(used, total)} ➟ ${bytesToSize(used)}`,
      `剩余：${toReversePercent(used, total)} ➟ ${bytesToSize(remain)}`,
      tailLine
    ].join("\n");
  });
  return `${runAtLine()}\n\n${blocks.join("\n\n")}`;
}

// =====================================================================
// 主流程
// =====================================================================

async function main(ctx) {
  log("script start, egern:", !!ctx);
  const BOX = await readBoxSettings(ctx);
  const { envStore, args } = buildArgStore(ctx);
  const pickStr = makePickStr(envStore, args, BOX);
  const requestSubInfo = makeHttpRequest(ctx);

  const defaultIcon  = pickStr("defaultIcon", "DefaultIcon",
    "antenna.radiowaves.left.and.right.circle.fill",
    "antenna.radiowaves.left.and.right.circle.fill");
  const defaultIconColor = pickStr("defaultIconColor", "DefaultIconColor", "#00E28F", "#00E28F");
  const updateSec = Math.max(60, parseInt(pickStr("update", "Update", "600", "600"), 10));

  const cfg = { defaultIcon, defaultIconColor, Update: updateSec };

  const tasks = [];
  for (let i = 1; i <= 10; i++) {
    const rawUrl = pickStr(`url${i}`, `URL${i}`, null, "订阅链接");
    const url = normalizeUrl(rawUrl, "url" + i);
    const rawTitle = pickStr(`title${i}`, `Title${i}`, null, "机场名称");
    const title = rawTitle || `机场${i}`;
    const reset = pickStr(`resetDay${i}`, `ResetDay${i}`, null, "重置日期");
    if (!url || !isHttpUrl(url)) continue;
    const _reset = reset;
    tasks.push(() => fetchInfo(requestSubInfo, url, _reset, title, i));
  }

  const results = await runPool(tasks, CONCURRENCY_LIMIT);
  const infos = results.filter(Boolean);

  log("final slots:", infos.length);

  // Egern：返回 Widget
  if (ctx) {
    return buildWidget(infos, cfg);
  }

  // 其他环境：返回面板文字
  return {
    title: "订阅信息",
    content: buildPanelContent(infos),
    icon: defaultIcon,
    iconColor: defaultIconColor
  };
}

// ── Egern 入口
export default async function(ctx) {
  try {
    return await main(ctx);
  } catch (err) {
    log("fatal:", String(err?.stack || err));
    return {
      type: "widget",
      padding: [0, 0, 0, 0],
      backgroundGradient: {
        type: "linear",
        colors: [{ light: "#FFF7F7", dark: "#2A1414" }, { light: "#FFFFFF", dark: "#1A1A1A" }],
        stops: [0, 1], startPoint: { x: 0, y: 0 }, endPoint: { x: 1, y: 1 }
      },
      refreshAfter: new Date(Date.now() + 60000).toISOString(),
      children: [{
        type: "stack", direction: "column", gap: 6,
        padding: [12, 14, 12, 14],
        backgroundColor: { light: "#FFFFFF", dark: "#23252A" },
        borderRadius: 14, borderWidth: 0.5,
        borderColor: { light: "#E8EAEE", dark: "#343741" },
        children: [
          { type: "image", src: "sf-symbol:exclamationmark.triangle.fill", width: 16, height: 16, color: { light: "#EF4444", dark: "#F87171" } },
          { type: "text", text: "订阅信息组件异常", font: { size: "caption1", weight: "semibold" }, textColor: { light: "#111827", dark: "#F3F4F6" } },
          { type: "text", text: String(err?.stack || err).slice(0, 200), font: { size: "caption2" }, textColor: { light: "#6B7280", dark: "#A1A1AA" }, maxLines: 6 }
        ]
      }]
    };
  }
}

// ── Surge / Loon / QX 入口
if (typeof $done !== "undefined") {
  main(null).then(r => $done(r)).catch(err => {
    log("fatal:", String(err));
    $done({ title: "订阅信息", content: `脚本异常：${String(err)}`, icon: "exclamationmark.triangle", iconColor: "#EF4444" });
  });
}
