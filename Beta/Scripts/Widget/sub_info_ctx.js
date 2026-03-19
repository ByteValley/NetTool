/* =========================================================
 * 模块：订阅信息 Widget
 * 作者：ByteValley
 * 版本：2026-03-19R1
 *
 * 参数优先级：ctx.env > $argument > BoxJS
 * Widget：medium（1排5个）/ large（2排各5个）
 * 背景透明，仪表盘显示剩余流量百分比
 * ========================================================= */

const TAG = "SubscribeInfo";

// ===== 工具函数 =====
function pad2(n) { return String(n).padStart(2, "0"); }

function bytesToSize(bytes) {
  if (!bytes || bytes <= 0) return "0 B";
  const k = 1024, sizes = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${(bytes / Math.pow(k, i)).toFixed(2)} ${sizes[i]}`;
}

function toPercent(used, total) {
  if (!total) return "0%";
  return `${((used / total) * 100).toFixed(1)}%`;
}

function remainPercent(used, total) {
  if (!total) return 0;
  return Math.max(0, Math.min(100, ((total - used) / total) * 100));
}

function formatDate(ts) {
  const d = new Date(ts);
  return `${d.getFullYear()}.${pad2(d.getMonth() + 1)}.${pad2(d.getDate())}`;
}

function nowStr() {
  const d = new Date();
  return `${pad2(d.getMonth() + 1)}-${pad2(d.getDate())} ${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}`;
}

function startOfDay(d) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function daysUntilDate(targetDate) {
  const today = startOfDay(new Date());
  const t = startOfDay(targetDate);
  const diff = Math.ceil((t - today) / (1000 * 60 * 60 * 24));
  return diff > 0 ? diff : 0;
}

function getResetDaysLeft(day) {
  if (!day) return null;
  const today = new Date();
  const nowDay = today.getDate();
  const nowMonth = today.getMonth();
  const nowYear = today.getFullYear();
  let resetDate;
  if (nowDay < day) resetDate = new Date(nowYear, nowMonth, day);
  else resetDate = new Date(nowYear, nowMonth + 1, day);
  const diff = Math.ceil((resetDate - today) / (1000 * 60 * 60 * 24));
  return diff > 0 ? diff : 0;
}

function parseResetSpec(s) {
  const t = String(s || "").trim();
  if (!t) return null;
  if (/^\d{1,2}$/.test(t)) {
    const day = parseInt(t, 10);
    if (day >= 1 && day <= 31) return { type: "monthly", day };
    return null;
  }
  let m = t.match(/^(\d{4})[.\-\/年](\d{1,2})[.\-\/月](\d{1,2})/);
  if (m) {
    const year = parseInt(m[1], 10), month = parseInt(m[2], 10), day = parseInt(m[3], 10);
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) return { type: "absolute", year, month, day };
    return null;
  }
  m = t.match(/^(\d{1,2})[.\-\/月](\d{1,2})(?:日)?$/);
  if (m) {
    const month = parseInt(m[1], 10), day = parseInt(m[2], 10);
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) return { type: "yearly", month, day };
  }
  return null;
}

function nextResetDateFromSpec(spec) {
  const now = new Date();
  const today = startOfDay(now);
  if (spec.type === "yearly") {
    let d = new Date(now.getFullYear(), spec.month - 1, spec.day);
    if (startOfDay(d) <= today) d = new Date(now.getFullYear() + 1, spec.month - 1, spec.day);
    return d;
  }
  if (spec.type === "absolute") {
    let d = new Date(spec.year, spec.month - 1, spec.day);
    if (startOfDay(d) <= today) {
      let y = now.getFullYear();
      d = new Date(y, spec.month - 1, spec.day);
      if (startOfDay(d) <= today) d = new Date(y + 1, spec.month - 1, spec.day);
    }
    return d;
  }
  return null;
}

function getResetText(resetRaw) {
  if (!resetRaw) return null;
  const spec = parseResetSpec(resetRaw);
  if (!spec) return `重置：${resetRaw}`;
  if (spec.type === "monthly") {
    const left = getResetDaysLeft(spec.day);
    return `重置 ${left ?? 0}天`;
  }
  if (spec.type === "yearly" || spec.type === "absolute") {
    const nextDate = nextResetDateFromSpec(spec);
    if (nextDate) return `重置 ${daysUntilDate(nextDate)}天`;
    return `重置：${resetRaw}`;
  }
  return `重置：${resetRaw}`;
}

// ===== 颜色：剩余越多越绿，越少越红 =====
// remainPct: 0~100
function gaugeColor(remainPct) {
  const r = Math.round(255 * (1 - remainPct / 100));
  const g = Math.round(200 * (remainPct / 100));
  const b = 60;
  const toHex = v => pad2(Math.max(0, Math.min(255, v)).toString(16));
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

// ===== 参数读取 =====
const PLACEHOLDER_STRINGS = ["订阅链接", "机场名称", "重置日期"];

function isPlaceholder(s) {
  const t = String(s || "").trim();
  if (!t) return true;
  if (/^{{{[^}]+}}}$/.test(t)) return true;
  if (PLACEHOLDER_STRINGS.indexOf(t) !== -1) return true;
  const low = t.toLowerCase();
  return low === "null" || low === "undefined";
}

function cleanArg(val) {
  if (val === null || val === undefined) return null;
  const s = String(val).trim();
  if (!s || isPlaceholder(s)) return null;
  return s;
}

function isHttpUrl(s) {
  return /^https?:\/\//i.test(String(s || ""));
}

function normalizeUrl(src) {
  const s = cleanArg(src);
  if (!s) return null;
  if (isHttpUrl(s)) return s;
  try {
    const decoded = decodeURIComponent(s);
    if (isHttpUrl(decoded)) return decoded;
  } catch (_) {}
  return null;
}

// ===== 构建参数读取器（ctx.env > $argument > BoxJS）=====
function buildParamReader(ctx, boxSettings) {
  // 解析 $argument 字符串（Egern 通过 ctx.env 透传或者 arguments 字段）
  const argStr = ctx?.env?._compat?.$argument || ctx?.env?.["$argument"] || "";
  const argMap = {};
  String(argStr).split("&").forEach(p => {
    const idx = p.indexOf("=");
    if (idx === -1) return;
    const k = p.substring(0, idx).trim();
    const v = p.substring(idx + 1).trim();
    if (k) {
      try { argMap[k] = decodeURIComponent(v); } catch (_) { argMap[k] = v; }
    }
  });

  return function pick(lowerKey, upperKey, defVal, defArgRaw) {
    // 1. ctx.env 直接字段（最高优先）
    const envVal = ctx?.env?.[upperKey] ?? ctx?.env?.[lowerKey];
    const envClean = cleanArg(envVal);
    if (envClean != null) return envClean;

    // 2. $argument（检查是否被改过）
    const argRaw = argMap[lowerKey] ?? argMap[upperKey] ?? null;
    const argClean = cleanArg(argRaw);
    const argChanged = argRaw != null && String(argRaw).trim() !== String(defArgRaw || "").trim();
    if (argChanged && argClean != null) return argClean;

    // 3. BoxJS
    const boxVal = boxSettings?.[upperKey] ?? boxSettings?.[lowerKey];
    const boxClean = cleanArg(boxVal);
    if (boxClean != null) return boxClean;

    // 4. argument 未改但有值
    if (argClean != null) return argClean;

    // 5. 默认值
    return defVal ?? null;
  };
}

// ===== BoxJS 读取 =====
async function readBoxSettings(ctx) {
  try {
    const panel = await ctx.storage?.getJSON?.("Panel");
    if (panel?.SubscribeInfo?.Settings) return panel.SubscribeInfo.Settings;
    if (panel?.Settings) return panel.Settings;
  } catch (_) {}
  // 兼容旧 key
  for (const key of ["Panel.SubscribeInfo.Settings", "@Panel.SubscribeInfo.Settings"]) {
    try {
      const val = await ctx.storage?.getJSON?.(key);
      if (val?.Settings) return val.Settings;
      if (val && typeof val === "object") return val;
    } catch (_) {}
  }
  return {};
}

// ===== 订阅信息拉取 =====
async function fetchSubInfo(ctx, url) {
  const headers = { "User-Agent": "Clash/1.18.0" };
  let resp = null;
  // HEAD 优先
  try {
    resp = await ctx.http.head(url, { headers, timeout: 8000, redirect: "follow" });
    if (resp.status < 200 || resp.status >= 400) resp = null;
  } catch (_) { resp = null; }
  // 回退 GET
  if (!resp) {
    try {
      resp = await ctx.http.get(url, { headers, timeout: 8000, redirect: "follow" });
    } catch (e) {
      return { error: String(e) };
    }
  }
  if (!resp || resp.status < 200 || resp.status >= 400) {
    return { error: `HTTP ${resp?.status || "error"}` };
  }

  const headerKey = Object.keys(resp.headers || {}).find(k => k.toLowerCase() === "subscription-userinfo");
  const data = {};
  if (headerKey) {
    String(resp.headers[headerKey]).split(";").forEach(p => {
      const kv = p.trim().split("=");
      if (kv.length === 2) {
        const num = parseInt(kv[1], 10);
        if (!isNaN(num)) data[kv[0].trim()] = num;
      }
    });
  }

  const upload = data.upload || 0;
  const download = data.download || 0;
  const total = data.total || 0;
  const used = upload + download;
  let expireMs = new Date("2099-12-31").getTime();
  if (data.expire) {
    let exp = Number(data.expire);
    if (exp < 10000000000) exp *= 1000;
    expireMs = exp;
  }

  return { upload, download, total, used, expireMs };
}

// ===== 仪表盘 Widget 组件 =====
function buildGauge(info, title, resetRaw, isSmall) {
  const fontSize = isSmall ? "caption2" : "caption1";
  const arcSize = isSmall ? 44 : 56;

  if (info.error) {
    return {
      type: "stack",
      direction: "column",
      alignItems: "center",
      gap: 2,
      flex: 1,
      children: [
        {
          type: "arc",
          value: 0,
          total: 100,
          width: arcSize,
          height: arcSize / 2 + 4,
          lineWidth: isSmall ? 5 : 6,
          color: "#555555",
          backgroundColor: "#333333"
        },
        { type: "text", text: title, font: { size: fontSize, weight: "semibold" }, textColor: "#FFFFFF", maxLines: 1, minScale: 0.7, textAlign: "center" },
        { type: "text", text: "获取失败", font: { size: "caption2" }, textColor: "#FF6B6B", textAlign: "center" }
      ]
    };
  }

  const { used, total, expireMs } = info;
  const remainPct = remainPercent(used, total);
  const color = gaugeColor(remainPct);
  const expireStr = formatDate(expireMs);
  const resetText = getResetText(resetRaw);
  const usedStr = bytesToSize(used);
  const remainStr = bytesToSize(Math.max(0, total - used));
  const totalStr = bytesToSize(total);
  const pctLabel = `${remainPct.toFixed(1)}%`;

  const detailLines = isSmall
    ? [`${remainStr}/${totalStr}`, expireStr]
    : [`已用 ${usedStr}`, `剩余 ${remainStr}`, `共 ${totalStr}`, expireStr, resetText].filter(Boolean);

  return {
    type: "stack",
    direction: "column",
    alignItems: "center",
    gap: isSmall ? 2 : 3,
    flex: 1,
    children: [
      {
        type: "stack",
        direction: "column",
        alignItems: "center",
        children: [
          {
            type: "arc",
            value: remainPct,
            total: 100,
            width: arcSize,
            height: arcSize / 2 + 4,
            lineWidth: isSmall ? 5 : 6,
            color: color,
            backgroundColor: "#333333"
          },
          {
            type: "text",
            text: pctLabel,
            font: { size: isSmall ? "caption2" : "caption1", weight: "bold" },
            textColor: color,
            textAlign: "center"
          }
        ]
      },
      {
        type: "text",
        text: title,
        font: { size: fontSize, weight: "semibold" },
        textColor: "#FFFFFF",
        maxLines: 1,
        minScale: 0.65,
        textAlign: "center"
      },
      ...detailLines.map(line => ({
        type: "text",
        text: line,
        font: { size: "caption2" },
        textColor: "rgba(255,255,255,0.7)",
        maxLines: 1,
        minScale: 0.6,
        textAlign: "center"
      }))
    ]
  };
}

function buildRow(slots, isSmall) {
  return {
    type: "stack",
    direction: "row",
    alignItems: "start",
    gap: isSmall ? 4 : 6,
    children: slots.map(s => buildGauge(s.info, s.title, s.resetRaw, isSmall))
  };
}

// ===== 主入口 =====
export default async function(ctx) {
  try {
    const boxSettings = await readBoxSettings(ctx);
    const pick = buildParamReader(ctx, boxSettings);

    const family = String(ctx.widgetFamily || "").toLowerCase();
    const isLarge = family === "systemlarge" || family === "large";
    const slotsPerRow = 5;
    const totalSlots = isLarge ? 10 : slotsPerRow;

    // 读取所有订阅配置
    const configs = [];
    for (let i = 1; i <= totalSlots; i++) {
      const rawUrl = pick(`url${i}`, `URL${i}`, null, "订阅链接");
      const url = normalizeUrl(rawUrl);
      const title = pick(`title${i}`, `Title${i}`, `机场${i}`, "机场名称") || `机场${i}`;
      const resetRaw = pick(`resetDay${i}`, `ResetDay${i}`, null, "重置日期");
      configs.push({ url, title, resetRaw });
    }

    // 并发拉取（最多并发3）
    const CONCURRENCY = 3;
    const results = new Array(configs.length).fill(null);
    let cursor = 0;

    async function worker() {
      while (true) {
        const idx = cursor++;
        if (idx >= configs.length) break;
        const { url } = configs[idx];
        if (!url) { results[idx] = { error: "未配置" }; continue; }
        try { results[idx] = await fetchSubInfo(ctx, url); }
        catch (e) { results[idx] = { error: String(e) }; }
      }
    }

    await Promise.all(Array.from({ length: Math.min(CONCURRENCY, configs.length) }, worker));

    // 构建 slot 列表
    const slots = configs.map((c, i) => ({
      info: results[i] || { error: "无数据" },
      title: c.title,
      resetRaw: c.resetRaw,
      hasUrl: !!c.url
    })).filter(s => s.hasUrl);

    // 补齐到 slotsPerRow 的整数倍
    while (slots.length < slotsPerRow) slots.push({ info: { error: "未配置" }, title: `机场${slots.length + 1}`, resetRaw: null, hasUrl: false });

    const isSmall = !isLarge;

    // 标题行
    const headerRow = {
      type: "stack",
      direction: "row",
      alignItems: "center",
      gap: 5,
      padding: [0, 0, isSmall ? 4 : 6, 0],
      children: [
        {
          type: "text",
          text: "订阅信息",
          font: { size: "footnote", weight: "bold" },
          textColor: "#FFFFFF",
          flex: 1
        },
        {
          type: "text",
          text: nowStr(),
          font: { size: "caption2" },
          textColor: "rgba(255,255,255,0.5)"
        }
      ]
    };

    let content;
    if (isLarge) {
      const row1 = slots.slice(0, slotsPerRow);
      const row2 = slots.slice(slotsPerRow, slotsPerRow * 2);
      while (row2.length < slotsPerRow) row2.push({ info: { error: "未配置" }, title: `—`, resetRaw: null, hasUrl: false });
      content = {
        type: "stack",
        direction: "column",
        gap: 8,
        padding: [10, 12, 10, 12],
        justifyContent: "start",
        children: [
          headerRow,
          buildRow(row1, false),
          buildRow(row2, false)
        ]
      };
    } else {
      content = {
        type: "stack",
        direction: "column",
        gap: 4,
        padding: [8, 10, 8, 10],
        justifyContent: "start",
        children: [
          headerRow,
          buildRow(slots.slice(0, slotsPerRow), true)
        ]
      };
    }

    const refreshTime = new Date(Date.now() + 10 * 60 * 1000).toISOString();

    return {
      type: "widget",
      family: isLarge ? "large" : "medium",
      padding: [0, 0, 0, 0],
      backgroundColor: "transparent",
      refreshAfter: refreshTime,
      children: [content]
    };

  } catch (err) {
    const msg = String(err?.stack || err);
    console.log(`[SubscribeInfo][ERROR] ${msg}`);
    return {
      type: "widget",
      padding: [6, 6, 6, 6],
      backgroundColor: "transparent",
      refreshAfter: new Date(Date.now() + 60000).toISOString(),
      children: [{
        type: "text",
        text: `订阅信息组件异常\n${msg.slice(0, 200)}`,
        font: { size: "caption2" },
        textColor: "#FF6B6B",
        maxLines: 6
      }]
    };
  }
}
