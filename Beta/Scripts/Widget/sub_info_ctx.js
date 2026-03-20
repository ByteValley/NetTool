/* =========================================================
 * 模块：订阅信息 Widget（多机场流量 / 到期展示）
 * 作者：ByteValley
 * 版本：2026-03-20R1
 *
 * 概述 · 功能边界
 * · 支持最多 10 组订阅链接，2×N 网格展示
 * · 中卡显示 4 个机场（2×2），大卡显示 8 个机场（2×4）
 * · 自动解析 subscription-userinfo 头（upload / download / total / expire）
 * · 支持每个订阅配置单独重置规则（按日 / 年月日 / 自定义文本）
 * · 缓存 12 小时，避免频繁拉订阅触发机场风控
 * · 渐变进度条：蓝→绿（<60%）/ 绿→黄（60~80%）/ 黄→红（>80%）
 * · 颜色提醒：用量 ≥80% 红 / ≥60% 黄 / 其余绿
 *
 * 运行环境 · 依赖接口
 * · 兼容：Egern Widget
 * · 依赖：ctx.http / ctx.storage / ctx.env
 *
 * 参数源 · BoxJS 结构
 * · BoxJS 存储根推荐结构：key = "Panel"
 *   {
 *     "NetworkInfo":  { "Settings": {...}, "Caches": ... },
 *     "SubscribeInfo":{ "Settings": {...}, "Caches": ... }
 *   }
 * · 本脚本优先读取 Panel.SubscribeInfo.Settings
 * · 兼容：
 *   - 直接 key = "Panel.SubscribeInfo.Settings"
 *   - 直接 key = "@Panel.SubscribeInfo.Settings"
 *
 * 参数 · 命名 & 取值优先级
 * · 所有参数均支持「小写 + 大写」两种键名：
 *   - url1 / URL1, url2 / URL2, ... url10 / URL10
 *   - name1 / NAME1 / title1 / Title1（机场名）
 *   - reset1 / RESET1 / resetDay1 / ResetDay1（重置日）
 *
 * · 单值参数优先级（最终逻辑）
 *   1）env 显式设置
 *   2）模块 arguments
 *   3）BoxJS（SubscribeInfo.Settings.*）
 *   4）脚本默认值
 *
 * URL 特性
 * · 支持原始 http(s) 链接
 * · 支持 encodeURIComponent 后的整串值（会自动解码一次）
 * · 以下视为占位符，等价"未配置"：订阅链接 / 机场名称 / 重置日期
 *
 * 网络请求策略
 * · head → get 双轮尝试
 * · 三个 UA 轮询（Quantumult X / clash-verge-rev / mihomo）
 * · 每个 URL 自动追加 flag=clash / flag=meta / target=clash 变体
 * · 单请求超时 9s
 * ========================================================= */

/**
 * ===============================
 * 重置时间（resetDay）使用说明
 * ===============================
 *
 * ① 每月重置（按日）
 *    RESET1=22
 *
 * ② 每年重置（按月-日）
 *    RESET1=1-22
 *    RESET1=01/22
 *    RESET1=1月22日
 *
 * ③ 指定日期（绝对日期）
 *    RESET1=2027-01-22
 *    RESET1=2027年1月22日
 *    若已过去，将自动滚动为下一年同月同日（无需每年改年份）
 *
 * 说明：
 * - 若填写非上述格式，将按文本原样显示
 * - 所有计算基于本地时间
 */

// =====================================================================
// 模块分类 · 日志工具
// =====================================================================

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
// 模块分类 · 工具函数
// =====================================================================

function bytesToSize(bytes) {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  const k = 1024, sizes = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(k)), sizes.length - 1);
  return `${(bytes / Math.pow(k, i)).toFixed(i === 0 ? 0 : 2)} ${sizes[i]}`;
}

function formatDate(ts) {
  const d = new Date(ts > 1e12 ? ts : ts * 1000);
  if (isNaN(d.getTime())) return "未知";
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
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

function getResetDaysLeft(resetDayNum) {
  if (!resetDayNum) return null;
  const now = new Date();
  let resetDate = new Date(now.getFullYear(), now.getMonth(), resetDayNum);
  if (startOfDay(resetDate) <= startOfDay(now)) {
    resetDate = new Date(now.getFullYear(), now.getMonth() + 1, resetDayNum);
  }
  return daysUntilDate(resetDate);
}

function isHttpUrl(s) {
  return /^https?:\/\//i.test(String(s || "").trim());
}

function inferName(url) {
  const m = String(url || "").match(/^https?:\/\/([^\/?#]+)/i);
  return m ? m[1] : "未命名订阅";
}

// =====================================================================
// 模块分类 · 占位符 / 清洗
// =====================================================================

const PLACEHOLDER_STRINGS = ["订阅链接", "机场名称", "重置日期"];

function isPlaceholderString(s) {
  const t = String(s || "").trim();
  if (!t) return false;
  if (/^\{\{\{[^}]+\}\}\}$/.test(t)) return true;
  if (PLACEHOLDER_STRINGS.indexOf(t) !== -1) return true;
  const low = t.toLowerCase();
  return low === "null" || low === "undefined";
}

function cleanArg(val) {
  if (val === null || val === undefined) return null;
  const s = String(val).trim();
  if (!s || isPlaceholderString(s)) return null;
  return s;
}

function normalizeUrl(src, label) {
  const s = cleanArg(src);
  if (!s) { log("normalizeUrl", label, "=> empty/placeholder, skip"); return null; }
  if (isHttpUrl(s)) { log("normalizeUrl", label, "use raw http(s):", s); return s; }
  try {
    const decoded = decodeURIComponent(s);
    if (isHttpUrl(decoded)) { log("normalizeUrl", label, "decoded to http(s):", decoded); return decoded; }
    log("normalizeUrl", label, "decoded but still not http(s):", decoded);
  } catch (e) {
    log("normalizeUrl", label, "decodeURIComponent error:", String(e), "raw:", s);
  }
  log("normalizeUrl", label, "invalid http(s):", s);
  return null;
}

// =====================================================================
// 模块分类 · resetDay 解析
// =====================================================================

/**
 * 解析 resetDay：
 * - "22"            => { type: "monthly", day: 22 }
 * - "1-22"/"01/22"  => { type: "yearly", month: 1, day: 22 }
 * - "1月22日"        => { type: "yearly", month: 1, day: 22 }
 * - "2027-01-22"    => { type: "absolute", year: 2027, month: 1, day: 22 }
 * - "2027年1月22日"  => { type: "absolute", year: 2027, month: 1, day: 22 }
 */
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
      d = new Date(now.getFullYear(), spec.month - 1, spec.day);
      if (startOfDay(d) <= today) d = new Date(now.getFullYear() + 1, spec.month - 1, spec.day);
    }
    return d;
  }

  return null;
}

function buildResetText(resetDayRaw) {
  const resetClean = cleanArg(resetDayRaw);
  if (!resetClean) return null;

  const spec = parseResetSpec(resetClean);

  if (spec && spec.type === "monthly") {
    const left = getResetDaysLeft(spec.day);
    return `${left ?? 0}天重置`;
  }

  if (spec && (spec.type === "yearly" || spec.type === "absolute")) {
    const nextDate = nextResetDateFromSpec(spec);
    if (nextDate) return `${daysUntilDate(nextDate)}天重置`;
    return `重置：${resetClean}`;
  }

  // 兜底：原样显示
  return resetClean;
}

// =====================================================================
// 模块分类 · 网络请求策略
// =====================================================================

const UA_LIST = [
  { "User-Agent": "Clash/1.18.0" },
];

function buildVariants(url) {
  const seen = new Set(), out = [];
  const add = u => { if (u && !seen.has(u)) { seen.add(u); out.push(u); } };
  add(url);
  add(withParam(url, "flag",   "clash"));
  add(withParam(url, "flag",   "meta"));
  add(withParam(url, "target", "clash"));
  return out;
}

function withParam(url, key, value) {
  return `${url}${url.includes("?") ? "&" : "?"}${key}=${encodeURIComponent(value)}`;
}

function parseUserInfo(header) {
  if (!header) return null;
  const pairs = header.match(/\w+=[\d.eE+-]+/g) || [];
  if (!pairs.length) return null;
  return Object.fromEntries(
    pairs.map(p => { const [k, v] = p.split("="); return [k, Number(v)]; })
  );
}

async function fetchInfo(ctx, slot) {
  log("fetchInfo start", "name:", slot.name, "url:", slot.url, "resetDay:", slot.resetDay);

  for (const method of ["head", "get"]) {
    try {
      const resp = await ctx.http[method](slot.url, {
        headers: { "User-Agent": "Clash/1.18.0" },
        timeout: 9000
      });
      const raw  = resp.headers.get("subscription-userinfo") || "";
      const info = parseUserInfo(raw);

      if (info) {
        const upload     = info.upload   || 0;
        const download   = info.download || 0;
        const totalBytes = info.total    || 0;
        const used       = upload + download;
        const percent    = totalBytes > 0 ? (used / totalBytes) * 100 : 0;

        let expire = null;
        if (info.expire) {
          let exp = Number(info.expire);
          if (exp < 10000000000) exp *= 1000;
          expire = exp;
        }

        const resetText = buildResetText(slot.resetDay);
        log("fetchInfo done", "name:", slot.name, "percent:", percent.toFixed(1) + "%");
        return { name: slot.name, error: null, used, totalBytes, percent, expire, resetText };
      }
    } catch (e) {
      log("fetchInfo attempt fail", "method:", method, "err:", String(e));
    }
  }

  log("fetchInfo final error", "name:", slot.name);
  return { name: slot.name, error: true };
}

// =====================================================================
// 模块分类 · 主入口
// =====================================================================

export default async function (ctx) {

  // ─── 参数读取：env > arguments > boxjs ─────────────────────

  function getParam(key) {
    // 1. env
    const envVal = cleanArg(ctx.env?.[key] ?? ctx.env?.[key.toUpperCase()] ?? ctx.env?.[key.toLowerCase()]);
    if (envVal) return envVal;

    // 2. arguments
    const argRaw = ctx.arguments ?? ctx.env?._compat?.["$argument"] ?? "";
    const argMap = {};
    String(argRaw).split("&").forEach(p => {
      const idx = p.indexOf("=");
      if (idx === -1) return;
      try { argMap[decodeURIComponent(p.slice(0, idx))] = decodeURIComponent(p.slice(idx + 1)); } catch (_) {}
    });
    const argVal = cleanArg(argMap[key] ?? argMap[key.toUpperCase()] ?? argMap[key.toLowerCase()]);
    if (argVal) return argVal;

    // 3. boxjs
    try {
      const raw = ctx.storage?.getJSON?.("Panel");
      const settings = raw?.SubscribeInfo?.Settings ?? {};
      const bv = cleanArg(settings[key] ?? settings[key.toUpperCase()] ?? settings[key.toLowerCase()]);
      if (bv) return bv;
    } catch (_) {}

    return null;
  }

  // ─── 读取订阅配置 ──────────────────────────────────────────

  const slots = [];
  for (let i = 1; i <= 10; i++) {
    // URL：支持 URL1 / url1
    const rawUrl = getParam(`URL${i}`) ?? getParam(`url${i}`);
    const url = normalizeUrl(rawUrl, `url${i}`);
    if (!url) { log("slot", i, "no valid url, skip"); continue; }

    // 机场名：NAME1 / name1 / Title1 / title1，兜底用域名
    const name = getParam(`NAME${i}`) ?? getParam(`name${i}`)
              ?? getParam(`Title${i}`) ?? getParam(`title${i}`)
              ?? inferName(url);

    // 重置日：RESET1 / reset1 / ResetDay1 / resetDay1
    const resetDay = getParam(`RESET${i}`) ?? getParam(`reset${i}`)
                  ?? getParam(`ResetDay${i}`) ?? getParam(`resetDay${i}`);

    log("slot", i, "| name:", name, "| url:", url, "| resetDay:", resetDay);
    slots.push({ name, url, resetDay });
  }

  // ─── 时间 & 刷新 ───────────────────────────────────────────

  const CACHE_TTL   = 12 * 60 * 60 * 1000;
  const CACHE_KEY   = "SubscribeWidget_Cache_v1";
  const now         = new Date();
  const timeStr     = `${String(now.getHours()).padStart(2,"0")}:${String(now.getMinutes()).padStart(2,"0")}`;
  const refreshTime = new Date(Date.now() + CACHE_TTL).toISOString();

  // ─── 缓存读写 ───────────────────────────────────────────────

  async function readCache() {
    try {
      const raw = await ctx.storage.get(CACHE_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      if (Date.now() - (parsed.ts || 0) < CACHE_TTL) {
        log("cache hit, age(min):", Math.round((Date.now() - parsed.ts) / 60000));
        return parsed.data;
      }
      log("cache expired");
    } catch (_) {}
    return null;
  }

  async function writeCache(data) {
    try {
      await ctx.storage.set(CACHE_KEY, JSON.stringify({ ts: Date.now(), data }));
      log("cache written, count:", data.length);
    } catch (e) {
      log("cache write error:", String(e));
    }
  }

  // ─── 样式常量 ───────────────────────────────────────────────

  const bgGradient = {
    type: "linear",
    colors: ["#1B3A6B", "#1E3A8A", "#2D1B69", "#1A1040"],
    stops: [0, 0.35, 0.7, 1],
    startPoint: { x: 0, y: 0 },
    endPoint:   { x: 0.8, y: 1 },
  };

  // 用量颜色：≥80% 红 / ≥60% 黄 / 其余绿
  function usageColor(pct) {
    if (pct >= 80) return "#FF453A";
    if (pct >= 60) return "#FF9F0A";
    return "#34D399";
  }

  // 渐变进度条色段：蓝→绿 / 绿→黄 / 黄→红
  function barGradientColors(pct) {
    if (pct >= 80) return ["#FF9F0A", "#FF453A"];
    if (pct >= 60) return ["#34D399", "#FF9F0A"];
    return ["#38BDF8", "#34D399"];
  }

  // ─── 无配置兜底 ─────────────────────────────────────────────

  if (!slots.length) {
    log("no slots configured");
    return {
      type: "widget",
      padding: 16,
      gap: 10,
      backgroundGradient: bgGradient,
      refreshAfter: refreshTime,
      children: [
        {
          type: "stack", direction: "row", alignItems: "center", gap: 6,
          children: [
            { type: "image", src: "sf-symbol:chart.bar.fill", width: 13, height: 13, color: "#6E7FF3" },
            { type: "text", text: "订阅流量", font: { size: "caption1", weight: "semibold" }, textColor: "#FFFFFF66" },
          ],
        },
        { type: "spacer" },
        { type: "text", text: "请配置 URL1 环境变量", font: { size: "caption1" }, textColor: "#FF453A", textAlign: "center" },
      ],
    };
  }

  // ─── 获取数据（缓存优先）────────────────────────────────────

  let results = await readCache();
  if (!results) {
    log("cache miss, fetching", slots.length, "slots");
    results = await Promise.all(slots.map(s => fetchInfo(ctx, s)));
    await writeCache(results);
  }

  // ─── 布局参数 ───────────────────────────────────────────────

  const family    = String(ctx.widgetFamily || "").toLowerCase();
  const isLarge   = family === "large" || family === "systemlarge";
  const showCount = isLarge ? 8 : 4;

  // 补齐到 showCount（空位用 null 占位）
  const display = results.slice(0, showCount);
  while (display.length < showCount) display.push(null);

  log("render", family, "showCount:", showCount, "results:", results.length);

  // ─── 单张卡片构建 ───────────────────────────────────────────

  function buildCard(result) {

    // 空占位卡
    if (!result) {
      return {
        type: "stack", flex: 1, direction: "column",
        padding: [9, 11, 9, 11],
        backgroundColor: "#FFFFFF05",
        borderRadius: 11, borderWidth: 0.5, borderColor: "#FFFFFF08",
        children: [
          { type: "text", text: "—", font: { size: "caption2" }, textColor: "#FFFFFF20", textAlign: "center" },
        ],
      };
    }

    const { name, error, used, totalBytes, percent, expire, resetText } = result;

    // 错误卡
    if (error) {
      return {
        type: "stack", flex: 1, direction: "row", alignItems: "center", gap: 6,
        padding: [9, 11, 9, 11],
        backgroundColor: "#FFFFFF07",
        borderRadius: 11, borderWidth: 0.5, borderColor: "#FF453A28",
        children: [
          { type: "image", src: "sf-symbol:exclamationmark.circle.fill", width: 12, height: 12, color: "#FF453A" },
          { type: "text", text: name, font: { size: "caption1", weight: "semibold" }, textColor: "#FFFFFFCC", maxLines: 1, minScale: 0.8, flex: 1 },
          { type: "text", text: "获取失败", font: { size: "caption2" }, textColor: "#FF453A" },
        ],
      };
    }

    const pct = Math.min(Math.max(percent || 0, 0), 100);
    const uc  = usageColor(pct);

    // 到期文字 & 颜色
    let expireText  = resetText || "";
    let expireColor = "#FFFFFF40";

    if (expire) {
      const daysLeft = Math.ceil((expire - Date.now()) / 86400000);
      if (daysLeft < 0)       { expireText = "已到期";               expireColor = "#FF453A"; }
      else if (daysLeft <= 7) { expireText = `${daysLeft}天后到期`;  expireColor = "#FF9F0A"; }
      else                    { expireText = formatDate(expire);      expireColor = "#FFFFFF40"; }
    }

    // 渐变进度条（flex 分段模拟）
    const filled = Math.round(pct);
    const empty  = 100 - filled;
    const barChildren = [];

    if (filled > 0) {
      barChildren.push({
        type: "stack", flex: filled, height: 4, borderRadius: 99,
        backgroundGradient: {
          type: "linear",
          colors: barGradientColors(pct),
          stops: [0, 1],
          startPoint: { x: 0, y: 0 },
          endPoint:   { x: 1, y: 0 },
        },
        children: [],
      });
    }
    if (empty > 0) {
      barChildren.push({
        type: "stack", flex: empty, height: 4, borderRadius: 99,
        backgroundColor: "#FFFFFF15",
        children: [],
      });
    }

    return {
      type: "stack", flex: 1, direction: "column", gap: 0,
      padding: [9, 11, 9, 11],
      backgroundColor: "#FFFFFF08",
      borderRadius: 11, borderWidth: 0.5, borderColor: "#FFFFFF10",
      children: [

        // ── 第一行：机场名 + 到期/重置 ──
        {
          type: "stack", direction: "row", alignItems: "center", gap: 5,
          children: [
            { type: "image", src: "sf-symbol:dot.radiowaves.left.and.right", width: 12, height: 12, color: uc },
            { type: "text", text: name, font: { size: "caption1", weight: "semibold" }, textColor: "#FFFFFFDD", maxLines: 1, minScale: 0.75, flex: 1 },
            ...(expireText ? [{ type: "text", text: expireText, font: { size: "caption2" }, textColor: expireColor }] : []),
          ],
        },

        // ── 间距 ──
        { type: "stack", height: 8, children: [] },

        // ── 第二行：渐变进度条 ──
        { type: "stack", direction: "row", gap: 0, alignItems: "center", children: barChildren },

        // ── 间距 ──
        { type: "stack", height: 5, children: [] },

        // ── 第三行：已用/总量 + 百分比 ──
        {
          type: "stack", direction: "row", alignItems: "center",
          children: [
            {
              type: "text",
              text: `${bytesToSize(used)} / ${bytesToSize(totalBytes)}`,
              font: { size: "caption2", weight: "medium" },
              textColor: "#FFFFFFAA",
            },
            { type: "spacer" },
            {
              type: "text",
              text: `${pct.toFixed(1)}%`,
              font: { size: "caption2", weight: "semibold" },
              textColor: uc,
            },
          ],
        },

      ],
    };
  }

  // ─── 2×N 网格构建 ───────────────────────────────────────────

  function buildGrid(items) {
    const rows = [];
    for (let i = 0; i < items.length; i += 2) {
      rows.push({
        type: "stack", direction: "row", gap: 8,
        children: [buildCard(items[i]), buildCard(items[i + 1] ?? null)],
      });
    }
    return rows;
  }

  // ─── 最终 Widget 输出 ────────────────────────────────────────

  return {
    type: "widget",
    family: isLarge ? "large" : "medium",
    padding: [14, 14, 12, 14],
    gap: 8,
    backgroundGradient: bgGradient,
    refreshAfter: refreshTime,
    children: [

      // 标题栏
      {
        type: "stack", direction: "row", alignItems: "center", gap: 5,
        children: [
          { type: "image", src: "sf-symbol:chart.bar.fill", width: 13, height: 13, color: "#6E7FF3" },
          { type: "text", text: "订阅流量", font: { size: "caption1", weight: "semibold" }, textColor: "#FFFFFF55" },
          { type: "spacer" },
          { type: "image", src: "sf-symbol:clock", width: 11, height: 11, color: "#FFFFFF33" },
          { type: "text", text: timeStr, font: { size: "caption2" }, textColor: "#FFFFFF44" },
        ],
      },

      // 卡片网格
      {
        type: "stack", direction: "column", gap: 8,
        children: buildGrid(display),
      },

      { type: "spacer" },

    ],
  };
}
