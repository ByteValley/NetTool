/* =========================================================
 * 模块：订阅信息面板（多机场流量 / 到期展示）
 * 作者：ByteValley
 * 版本：2026-03-18R1
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
    args[p.substring(0, idx)] = (() => {
      try { return decodeURIComponent(p.substring(idx + 1)); } catch (_) { return p.substring(idx + 1); }
    })();
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
      const timer = setTimeout(() => {
        if (finished) return; finished = true; reject(new Error("timeout"));
      }, REQ_TIMEOUT_MS + 200);
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
    const resetDate = resetSpec
      ? (resetSpec.type === "monthly"
        ? (() => {
            const now = new Date();
            let d = new Date(now.getFullYear(), now.getMonth(), resetSpec.day);
            if (d <= now) d = new Date(now.getFullYear(), now.getMonth() + 1, resetSpec.day);
            return d;
          })()
        : nextResetDateFromSpec(resetSpec))
      : null;
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
// Widget 渲染（仿电信仪表盘样式）
// =====================================================================

function gaugeColor(usedPct) {
  if (usedPct >= 0.9) return "#EF4444";
  if (usedPct >= 0.7) return "#F59E0B";
  return "#10B981";
}

// SVG 半圆仪表盘
function buildGaugeSVG(usedPct, size) {
  const remainPct = Math.max(0, 1 - usedPct);
  const remainStr = `${(remainPct * 100).toFixed(1)}`;
  const cx = size / 2, cy = size / 2;
  const r = size * 0.38;
  const strokeW = size * 0.09;
  const startAngle = 210;
  const totalAngle = 240;
  const fillAngle = totalAngle * remainPct;
  const gc = gaugeColor(usedPct);

  function polarToXY(deg, radius) {
    const rad = (deg - 90) * Math.PI / 180;
    return { x: cx + radius * Math.cos(rad), y: cy + radius * Math.sin(rad) };
  }
  function arcPath(startDeg, angleDeg, radius) {
    if (angleDeg <= 0) return "";
    const endDeg = startDeg + Math.min(angleDeg, 359.99);
    const s = polarToXY(startDeg, radius);
    const e = polarToXY(endDeg, radius);
    const large = angleDeg > 180 ? 1 : 0;
    return `M ${s.x.toFixed(2)} ${s.y.toFixed(2)} A ${radius} ${radius} 0 ${large} 1 ${e.x.toFixed(2)} ${e.y.toFixed(2)}`;
  }

  const dotEnd = polarToXY(startAngle + fillAngle, r);
  const dotR = strokeW * 0.5;
  const fontSize = size * 0.19;
  const unitSize = size * 0.11;

  const svg = `<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" xmlns="http://www.w3.org/2000/svg">
  <path d="${arcPath(startAngle, totalAngle, r)}" fill="none" stroke="rgba(255,255,255,0.18)" stroke-width="${strokeW}" stroke-linecap="round"/>
  ${fillAngle > 0.5 ? `<path d="${arcPath(startAngle, fillAngle, r)}" fill="none" stroke="${gc}" stroke-width="${strokeW}" stroke-linecap="round"/>` : ""}
  ${fillAngle > 0.5 ? `<circle cx="${dotEnd.x.toFixed(2)}" cy="${dotEnd.y.toFixed(2)}" r="${dotR}" fill="white"/>` : ""}
  <text x="${cx}" y="${(cy + fontSize * 0.35).toFixed(2)}" text-anchor="middle" font-size="${fontSize}" font-weight="bold" fill="white" font-family="-apple-system,sans-serif">${remainStr}</text>
  <text x="${cx}" y="${(cy + fontSize * 0.35 + unitSize * 1.2).toFixed(2)}" text-anchor="middle" font-size="${unitSize}" fill="rgba(255,255,255,0.7)" font-family="-apple-system,sans-serif">%</text>
</svg>`;

  return svg;
}

// 单个机场列
function buildSubColumn(info, gaugeSize) {
  const textWhite     = { light: "#FFFFFF", dark: "#FFFFFF" };
  const textWhiteSub  = { light: "rgba(255,255,255,0.75)", dark: "rgba(255,255,255,0.75)" };
  const textWhiteSoft = { light: "rgba(255,255,255,0.5)", dark: "rgba(255,255,255,0.5)" };

  if (!info.ok) {
    return {
      type: "stack",
      direction: "column",
      alignItems: "center",
      gap: 4,
      flex: 1,
      children: [
        {
          type: "image",
          src: "sf-symbol:exclamationmark.circle.fill",
          width: gaugeSize * 0.4, height: gaugeSize * 0.4,
          color: textWhiteSoft
        },
        {
          type: "text",
          text: "获取失败",
          font: { size: "caption2" },
          textColor: textWhiteSoft,
          textAlign: "center"
        },
        {
          type: "text",
          text: info.title,
          font: { size: "caption2" },
          textColor: textWhiteSub,
          maxLines: 1, minScale: 0.8,
          textAlign: "center"
        }
      ]
    };
  }

  const usedPct = info.usedPct || 0;
  const expireStr = info.expireMs ? formatDate(info.expireMs) : "未知";
  const resetDays = info.resetDate ? daysUntilDate(info.resetDate) : null;

  const svgStr = buildGaugeSVG(usedPct, gaugeSize);
  const svgB64 = (() => {
    try {
      return `data:image/svg+xml;base64,${btoa(unescape(encodeURIComponent(svgStr)))}`;
    } catch (_) {
      return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svgStr)}`;
    }
  })();

  return {
    type: "stack",
    direction: "column",
    alignItems: "center",
    gap: 2,
    flex: 1,
    children: [
      // 半圆仪表盘
      {
        type: "image",
        src: svgB64,
        width: gaugeSize,
        height: gaugeSize
      },
      // 剩余流量大字
      {
        type: "text",
        text: bytesToSize(info.remain),
        font: { size: "footnote", weight: "bold" },
        textColor: textWhite,
        maxLines: 1, minScale: 0.7,
        textAlign: "center"
      },
      // 机场名称
      {
        type: "text",
        text: info.title,
        font: { size: "caption2", weight: "semibold" },
        textColor: textWhiteSub,
        maxLines: 1, minScale: 0.75,
        textAlign: "center"
      },
      // 到期日期
      {
        type: "stack",
        direction: "row",
        alignItems: "center",
        gap: 2,
        children: [
          {
            type: "image",
            src: "sf-symbol:calendar",
            width: 9, height: 9,
            color: textWhiteSoft
          },
          {
            type: "text",
            text: expireStr,
            font: { size: "caption2" },
            textColor: textWhiteSoft,
            textAlign: "center"
          }
        ]
      },
      // 重置倒计时（有才显示）
      ...(resetDays !== null ? [{
        type: "stack",
        direction: "row",
        alignItems: "center",
        gap: 2,
        children: [
          {
            type: "image",
            src: "sf-symbol:arrow.clockwise",
            width: 9, height: 9,
            color: textWhiteSoft
          },
          {
            type: "text",
            text: `${resetDays} 天后重置`,
            font: { size: "caption2" },
            textColor: textWhiteSoft,
            textAlign: "center"
          }
        ]
      }] : [])
    ]
  };
}

function buildWidget(infos, cfg) {
  const refreshTime = new Date(Date.now() + Math.max(60, cfg.Update || 600) * 1000).toISOString();

  const bgGradient = {
    type: "linear",
    colors: [
      { light: "#1A2A3A", dark: "#111820" },
      { light: "#2A3A4A", dark: "#1A2530" }
    ],
    stops: [0, 1],
    startPoint: { x: 0, y: 0 },
    endPoint: { x: 1, y: 1 }
  };

  const textWhite    = { light: "#FFFFFF", dark: "#FFFFFF" };
  const textWhiteSub = { light: "rgba(255,255,255,0.6)", dark: "rgba(255,255,255,0.6)" };
  const accentColor  = { light: cfg.defaultIconColor || "#00E28F", dark: cfg.defaultIconColor || "#00E28F" };

  if (!infos.length) {
    return {
      type: "widget",
      padding: [0, 0, 0, 0],
      backgroundGradient: bgGradient,
      refreshAfter: refreshTime,
      children: [{
        type: "text",
        text: "未配置订阅参数",
        font: { size: "footnote" },
        textColor: textWhiteSub,
        padding: [14, 14, 14, 14]
      }]
    };
  }

  // 仪表盘尺寸按机场数量自适应
  const count = infos.length;
  const gaugeSize = count <= 2 ? 88 : count <= 3 ? 80 : count <= 5 ? 68 : 56;

  // 顶部标题行
  const headerRow = {
    type: "stack",
    direction: "row",
    alignItems: "center",
    gap: 6,
    padding: [0, 0, 8, 0],
    children: [
      {
        type: "image",
        src: `sf-symbol:${cfg.defaultIcon || "antenna.radiowaves.left.and.right.circle.fill"}`,
        width: 15, height: 15,
        color: accentColor
      },
      {
        type: "text",
        text: "订阅信息",
        font: { size: "footnote", weight: "semibold" },
        textColor: textWhite,
        flex: 1
      },
      {
        type: "image",
        src: "sf-symbol:arrow.clockwise",
        width: 10, height: 10,
        color: textWhiteSub
      },
      {
        type: "text",
        text: widgetTimeText(),
        font: { size: "caption2" },
        textColor: textWhiteSub
      }
    ]
  };

  // 所有机场横排
  const columnsRow = {
    type: "stack",
    direction: "row",
    alignItems: "flex-start",
    gap: 4,
    children: infos.map(info => buildSubColumn(info, gaugeSize))
  };

  return {
    type: "widget",
    padding: [0, 0, 0, 0],
    backgroundGradient: bgGradient,
    refreshAfter: refreshTime,
    children: [{
      type: "stack",
      direction: "column",
      gap: 0,
      padding: [12, 14, 12, 14],
      children: [headerRow, columnsRow]
    }]
  };
}

// =====================================================================
// 面板文字输出（Surge / Loon / QX 原有格式）
// =====================================================================

function buildPanelContent(infos) {
  if (!infos.length) return "未配置订阅参数";
  const blocks = infos.map(info => {
    if (!info.ok) return `机场：${info.title}\n订阅请求失败：${info.error}`;
    const expireStr = info.expireMs ? formatDate(info.expireMs) : "未知";
    const now = new Date();
    const timeStr = `${pad2(now.getHours())}:${pad2(now.getMinutes())}`;
    const resetLinePart = buildResetLine(info.resetDayRaw);
    const tailLine = resetLinePart
      ? `${resetLinePart} | 到期：${expireStr}`
      : `到期：${expireStr}`;
    return [
      `${info.title} | ${bytesToSize(info.total)} | ${timeStr}`,
      `已用：${toPercent(info.used, info.total)} ➟ ${bytesToSize(info.used)}`,
      `剩余：${toReversePercent(info.used, info.total)} ➟ ${bytesToSize(info.remain)}`,
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

  const defaultIcon = pickStr("defaultIcon", "DefaultIcon",
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
    tasks.push(() => fetchInfo(requestSubInfo, url, reset, title, i));
  }

  const results = await runPool(tasks, CONCURRENCY_LIMIT);
  const infos = results.filter(Boolean);
  log("final slots:", infos.length);

  if (ctx) {
    return buildWidget(infos, cfg);
  }

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
        colors: [
          { light: "#1A2A3A", dark: "#111820" },
          { light: "#2A3A4A", dark: "#1A2530" }
        ],
        stops: [0, 1], startPoint: { x: 0, y: 0 }, endPoint: { x: 1, y: 1 }
      },
      refreshAfter: new Date(Date.now() + 60000).toISOString(),
      children: [{
        type: "stack", direction: "column", gap: 6,
        padding: [12, 14, 12, 14],
        children: [
          {
            type: "image",
            src: "sf-symbol:exclamationmark.triangle.fill",
            width: 16, height: 16,
            color: { light: "#EF4444", dark: "#F87171" }
          },
          {
            type: "text",
            text: "订阅信息组件异常",
            font: { size: "caption1", weight: "semibold" },
            textColor: { light: "#FFFFFF", dark: "#FFFFFF" }
          },
          {
            type: "text",
            text: String(err?.stack || err).slice(0, 200),
            font: { size: "caption2" },
            textColor: { light: "rgba(255,255,255,0.6)", dark: "rgba(255,255,255,0.6)" },
            maxLines: 6
          }
        ]
      }]
    };
  }
}

// ── Surge / Loon / QX 入口
if (typeof $done !== "undefined") {
  main(null).then(r => $done(r)).catch(err => {
    log("fatal:", String(err));
    $done({
      title: "订阅信息",
      content: `脚本异常：${String(err)}`,
      icon: "exclamationmark.triangle",
      iconColor: "#EF4444"
    });
  });
}
