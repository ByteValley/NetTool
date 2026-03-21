/* =========================================================
 * 模块：订阅信息 Widget（多机场流量 / 到期展示）
 * 作者：ByteValley
 * 版本：2026-03-20R1
 *
 * 概述 · 功能边界
 * · 支持最多 10 组订阅链接，2×N 网格展示
 * · 中卡显示 4 个机场（2×2），大卡显示 10 个机场（2×5）
 * · 自动解析 subscription-userinfo 头（upload / download / total / expire）
 * · 支持每个订阅配置单独重置规则（按日 / 年月日 / 自定义文本）
 * · 缓存开关：CACHE=1（开）/ 0（关），默认开启
 * · 缓存时长：CACHE_TTL=小时数，默认 12 小时，支持 env/arguments/boxjs 传入
 * · 渐变进度条：蓝→绿（<60%）/ 绿→黄（60~80%）/ 黄→红（>80%）
 * · 颜色提醒：用量 ≥80% 红 / ≥60% 黄 / 其余绿
 * · 透明背景；不支持透明则回退深蓝 #202F44
 * · 百分比显示在进度条正下方居中
 * · 左下角：重置日期（YYYY-MM-DD 或原始文本）
 * · 右下角：到期日期（YYYY-MM-DD）
 * · 标题栏：执行时间，若缓存时间不同则附加显示 执行(缓存)
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
 *   - url1 / URL1 ... url10 / URL10
 *   - name1 / NAME1 / title1 / Title1（机场名）
 *   - reset1 / RESET1 / resetDay1 / ResetDay1（重置日）
 *   - cache / CACHE（缓存开关，1=开 0=关，默认 1）
 *   - cache_ttl / CACHE_TTL（缓存时长，单位小时，默认 12）
 *   - cache_reset / CACHE_RESET（重置缓存，1=清空并重新拉取，用后改回 0）
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
 * · UA：Clash/1.18.0
 * · 单请求超时 9s
 * ========================================================= */

/**
 * ===============================
 * 重置时间（resetDay）使用说明
 * ===============================
 *
 * ① 每月重置（按日）
 *    RESET1=22  → 显示下次重置日期，如 2026-04-22
 *
 * ② 每年重置（按月-日）
 *    RESET1=1-22 / RESET1=01/22 / RESET1=1月22日
 *    → 显示下次重置日期，如 2027-01-22
 *
 * ③ 指定日期（绝对日期）
 *    RESET1=2027-01-22 / RESET1=2027年1月22日
 *    若已过去，将自动滚动为下一年同月同日
 *
 * ④ 自定义文本（无法解析为日期时原样显示）
 *    RESET1=工单重置 → 显示为"工单重置"
 *
 * 说明：
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

function formatDateFull(ts) {
  const d = new Date(ts > 1e12 ? ts : ts * 1000);
  if (isNaN(d.getTime())) return "未知";
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function toHHMM(ts) {
  const d = new Date(ts);
  return `${String(d.getHours()).padStart(2,"0")}:${String(d.getMinutes()).padStart(2,"0")}`;
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

/**
 * 构建重置显示文本
 * · 能解析为日期 → 返回 YYYY-MM-DD（下次重置日期）
 * · 无法解析（如"工单重置"）→ 原样返回
 * · 未配置 → null
 */
function buildResetDisplay(resetDayRaw) {
  const resetClean = cleanArg(resetDayRaw);
  if (!resetClean) return null;

  const spec = parseResetSpec(resetClean);

  if (spec && spec.type === "monthly") {
    const now = new Date();
    let resetDate = new Date(now.getFullYear(), now.getMonth(), spec.day);
    if (startOfDay(resetDate) <= startOfDay(now)) {
      resetDate = new Date(now.getFullYear(), now.getMonth() + 1, spec.day);
    }
    return formatDateFull(resetDate.getTime());
  }

  if (spec && (spec.type === "yearly" || spec.type === "absolute")) {
    const nextDate = nextResetDateFromSpec(spec);
    if (nextDate) return formatDateFull(nextDate.getTime());
    return resetClean;
  }

  // 兜底：原样显示（如"工单重置"）
  return resetClean;
}

// =====================================================================
// 模块分类 · 网络请求策略
// =====================================================================

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

        // 重置显示文本在请求时计算并缓存，避免缓存字段丢失
        const resetDisplay = buildResetDisplay(slot.resetDay);

        log("fetchInfo done", "name:", slot.name, "percent:", percent.toFixed(1) + "%",
            "expire:", expire, "resetDisplay:", resetDisplay);
        return { name: slot.name, error: null, used, totalBytes, percent, expire, resetDisplay };
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
  
    // ─── 环境探测（调试用，确认后删除）──────────────────────────
  try {
    log("ctx keys:", Object.keys(ctx).join(", "));
    log("widgetFamily:", ctx.widgetFamily);
    log("env keys:", Object.keys(ctx.env || {}).join(", "));
  } catch (e) {
    log("ctx inspect error:", String(e));
  }

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

  // ─── 缓存参数 ───────────────────────────────────────────────

  // 缓存开关：CACHE=1（开）/ 0（关），默认开
  const cacheEnabled = (getParam("CACHE") ?? getParam("cache") ?? "1") !== "0";

  // 缓存时长：CACHE_TTL=小时数，默认 12
  const cacheTtlHours = Math.max(0.1, parseFloat(getParam("CACHE_TTL") ?? getParam("cache_ttl") ?? "12") || 12);
  const CACHE_TTL = cacheTtlHours * 60 * 60 * 1000;
  const CACHE_KEY = "SubscribeWidget_Cache";

  // 缓存重置：CACHE_RESET=1 时清空缓存并强制重新拉取，用完自动恢复
  const cacheReset = (getParam("CACHE_RESET") ?? getParam("cache_reset") ?? "0") === "1";
  if (cacheReset) {
    log("cache reset triggered, clearing cache");
    try { await ctx.storage.set(CACHE_KEY, ""); } catch (_) {}
  }

  log("cache enabled:", cacheEnabled, "ttl(h):", cacheTtlHours, "reset:", cacheReset);


  // ─── 读取订阅配置 ──────────────────────────────────────────

  const slots = [];
  for (let i = 1; i <= 10; i++) {
    const rawUrl = getParam(`URL${i}`) ?? getParam(`url${i}`);
    const url = normalizeUrl(rawUrl, `url${i}`);
    if (!url) { log("slot", i, "no valid url, skip"); continue; }

    const name = getParam(`NAME${i}`) ?? getParam(`name${i}`)
              ?? getParam(`Title${i}`) ?? getParam(`title${i}`)
              ?? inferName(url);

    const resetDay = getParam(`RESET${i}`) ?? getParam(`reset${i}`)
                  ?? getParam(`ResetDay${i}`) ?? getParam(`resetDay${i}`);

    log("slot", i, "| name:", name, "| url:", url, "| resetDay:", resetDay);
    slots.push({ name, url, resetDay });
  }

  // ─── 时间 & 刷新 ───────────────────────────────────────────

  const execTs     = Date.now();
  const execHHMM   = toHHMM(execTs);
  const refreshTime = new Date(execTs + CACHE_TTL).toISOString();

  // ─── 缓存读写 ───────────────────────────────────────────────

  let cacheTs = null; // 记录缓存写入时间戳

  async function readCache() {
    if (!cacheEnabled) { log("cache disabled, skip read"); return null; }
    try {
      const raw = await ctx.storage.get(CACHE_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      if (execTs - (parsed.ts || 0) < CACHE_TTL) {
        cacheTs = parsed.ts;
        log("cache hit, age(min):", Math.round((execTs - parsed.ts) / 60000));
        return parsed.data;
      }
      log("cache expired");
    } catch (_) {}
    return null;
  }

  async function writeCache(data) {
    if (!cacheEnabled) { log("cache disabled, skip write"); return; }
    try {
      await ctx.storage.set(CACHE_KEY, JSON.stringify({ ts: execTs, data }));
      log("cache written, count:", data.length);
    } catch (e) {
      log("cache write error:", String(e));
    }
  }

  // ─── 样式常量 ───────────────────────────────────────────────

  const useTransparent = (getParam("TRANSPARENT") ?? getParam("transparent") ?? "0") === "1";

  // 透明模式和主题色模式共用同一套颜色，系统自动适配
  const BG_COLOR = useTransparent
    ? "transparent"
    : { light: "#F2F2F7", dark: "#202F44" };

  const CARD_BG = useTransparent
    ? "systemUltraThinMaterial"
    : { light: "#FFFFFF",   dark: "#1E2B3D" };

  const CARD_BG_ERR = { light: "#FF453A10", dark: "#FF453A20" };

  // 文字颜色统一用系统自适应，不强制白色
  const TEXT_PRIMARY  = { light: "#1C1C1E",   dark: "#FFFFFF" };
  const TEXT_SECOND   = { light: "#3C3C43CC", dark: "#EBEBF5CC" };
  const TEXT_SOFT     = { light: "#3C3C4399", dark: "#EBEBF566" };
  const BORDER_NORMAL = { light: "#00000010", dark: "#FFFFFF18" };
  const BORDER_ERR    = { light: "#FF453A20", dark: "#FF453A30" };

  function usageColor(pct) {
    if (pct >= 80) return "#FF453A";
    if (pct >= 60) return "#FF9F0A";
    return "#34D399";
  }

  function barGradientColors(pct) {
    if (pct >= 80) return ["#FF9F0A", "#FF453A"];
    if (pct >= 60) return ["#34D399", "#FF9F0A"];
    return ["#38BDF8", "#34D399"];
  }

  // ─── 无配置兜底 ─────────────────────────────────────────────

  if (!slots.length) {
    log("no slots configured");
    return {
      type: "widget", padding: 16, gap: 10,
      backgroundColor: BG_COLOR, refreshAfter: refreshTime,
      children: [
        {
          type: "stack", direction: "row", alignItems: "center", gap: 6,
          children: [
            { type: "image", src: "sf-symbol:chart.bar.fill", width: 13, height: 13, color: "#6E7FF3" },
            { type: "text", text: "订阅流量", font: { size: "caption1", weight: "semibold" }, textColor: TEXT_PRIMARY },
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

  // ─── 标题栏时间：执行时间(缓存时间) ────────────────────────
  // · 若有缓存且缓存时间与执行时间分钟不同，显示 "17:08(16:49)"
  // · 否则只显示执行时间 "17:08"

  const cacheHHMM   = cacheTs ? toHHMM(cacheTs) : null;
  const timeDisplay = (cacheHHMM && cacheHHMM !== execHHMM)
    ? `${execHHMM}(${cacheHHMM})`
    : execHHMM;

  // ─── 布局参数 ───────────────────────────────────────────────

  const family    = String(ctx.widgetFamily || "").toLowerCase();
  const isLarge   = family === "large" || family === "systemlarge";
  const showCount = isLarge ? 10 : 4;
  const compact   = isLarge;

  const display = results.slice(0, showCount);
  while (display.length < showCount) display.push(null);

  log("render", family, "showCount:", showCount, "results:", results.length,
      "execTime:", execHHMM, "cacheTime:", cacheHHMM);

  // ─── 单张卡片构建 ───────────────────────────────────────────

  function buildCard(result, compact) {

    if (!result) {
      return {
        type: "stack", flex: 1, direction: "column",
        padding: compact ? [5, 8, 5, 8] : [7, 10, 7, 10],
        backgroundColor: CARD_BG,
        borderRadius: 10, borderWidth: 0.5, borderColor: BORDER_NORMAL,
        children: [
          { type: "text", text: "—", font: { size: "caption2" }, textColor: TEXT_SOFT, textAlign: "center" },
        ],
      };
    }

    const { name, error, used, totalBytes, percent, expire, resetDisplay } = result;

    if (error) {
      return {
        type: "stack", flex: 1, direction: "row", alignItems: "center", gap: 5,
        padding: compact ? [5, 8, 5, 8] : [7, 10, 7, 10],
        backgroundColor: CARD_BG_ERR,
        borderRadius: 10, borderWidth: 0.5, borderColor: BORDER_ERR,
        children: [
          { type: "image", src: "sf-symbol:exclamationmark.circle.fill", width: 10, height: 10, color: "#FF453A" },
          { type: "text", text: name, font: { size: compact ? 9 : "caption1", weight: "semibold" }, textColor: "#FFFFFFCC", maxLines: 1, minScale: 0.8, flex: 1 },
          { type: "text", text: "失败", font: { size: 9 }, textColor: "#FF453A" },
        ],
      };
    }

    const pct      = Math.min(Math.max(percent || 0, 0), 100);
    const uc       = usageColor(pct);
    const filled   = Math.round(pct);
    const empty    = 100 - filled;
    const barH     = compact ? 10 : 13;
    const nameSize = compact ? 9  : "caption1";
    const dataSize = compact ? 8  : "caption2";
    const gapTop   = compact ? 4  : 6;
    const gapMid   = compact ? 3  : 5;
    const pad      = compact ? [5, 8, 5, 8] : [7, 10, 7, 10];

    // ── 到期文字 & 颜色（右下角）──
    let expireText  = null;
    let expireColor = TEXT_SOFT;

    if (expire) {
      const daysLeft = Math.ceil((expire - Date.now()) / 86400000);
      if (daysLeft < 0)      { expireText = "已过期";              expireColor = "#FF453A"; }
      else if (daysLeft <= 7){ expireText = formatDateFull(expire); expireColor = "#FF9F0A"; }
      else                   { expireText = formatDateFull(expire); expireColor = TEXT_SOFT; }
    }

    // ── 底部行：左=重置  右=到期 ──
    const bottomChildren = [];
    if (resetDisplay) {
      bottomChildren.push({
        type: "text", text: resetDisplay,
        font: { size: dataSize }, textColor: TEXT_SOFT,
        maxLines: 1, minScale: 0.8, flex: 1,
      });
    } else {
      bottomChildren.push({ type: "spacer" });
    }
    if (expireText) {
      bottomChildren.push({
        type: "text", text: expireText,
        font: { size: dataSize }, textColor: expireColor,
        maxLines: 1, minScale: 0.8, textAlign: "right",
      });
    }

    return {
      type: "stack", flex: 1, direction: "column", gap: 0,
      padding: pad,
      backgroundColor: CARD_BG,
      borderRadius: 10, borderWidth: 0.5, borderColor: BORDER_NORMAL,
      children: [

        // ── 第一行：机场名 + 已用/总量 ──
        {
          type: "stack", direction: "row", alignItems: "center", gap: 4,
          children: [
            { type: "image", src: "sf-symbol:dot.radiowaves.left.and.right",
              width: compact ? 9 : 11, height: compact ? 9 : 11, color: uc },
            { type: "text", text: name,
              font: { size: nameSize, weight: "semibold" }, textColor: TEXT_PRIMARY,
              maxLines: 1, minScale: 0.75, flex: 1 },
            { type: "text", text: `${bytesToSize(used)}/${bytesToSize(totalBytes)}`,
              font: { size: dataSize, weight: "medium" }, textColor: TEXT_SECOND,
              maxLines: 1, minScale: 0.75 },
          ],
        },

        { type: "stack", height: gapTop, children: [] },

        // ── 第二行：渐变进度条 ──
        {
          type: "stack", direction: "row", height: barH, gap: 0,
          children: [
            ...(filled > 0 ? [{
              type: "stack", flex: filled, height: barH, borderRadius: 99,
              backgroundGradient: {
                type: "linear",
                colors: barGradientColors(pct),
                stops: [0, 1],
                startPoint: { x: 0, y: 0 },
                endPoint:   { x: 1, y: 0 },
              },
              children: [],
            }] : []),
            ...(empty > 0 ? [{
              type: "stack", flex: empty, height: barH, borderRadius: 99,
              backgroundColor: { light: "#00000015", dark: "#FFFFFF15" },
              children: [],
            }] : []),
          ],
        },

        // ── 百分比居中 ──
        {
          type: "text", text: `${pct.toFixed(1)}%`,
          font: { size: compact ? 7 : 8, weight: "bold" },
          textColor: uc, textAlign: "center",
        },

        { type: "stack", height: gapMid, children: [] },

        // ── 第三行：左=重置  右=到期 ──
        {
          type: "stack", direction: "row", alignItems: "center",
          children: bottomChildren,
        },

      ],
    };
  }

  // ─── 2×N 网格构建 ───────────────────────────────────────────

  function buildGrid(items, compact) {
    const rows = [];
    for (let i = 0; i < items.length; i += 2) {
      rows.push({
        type: "stack", direction: "row", gap: compact ? 6 : 8,
        children: [buildCard(items[i], compact), buildCard(items[i + 1] ?? null, compact)],
      });
    }
    return rows;
  }

  // ─── 最终 Widget 输出 ────────────────────────────────────────

  return {
    type: "widget",
    family: isLarge ? "large" : "medium",
    padding: compact ? [10, 10, 8, 10] : [14, 14, 12, 14],
    gap: compact ? 5 : 8,
    backgroundColor: BG_COLOR,
    refreshAfter: refreshTime,
    children: [

      // ── 标题栏 ──
      {
        type: "stack", direction: "row", alignItems: "center", gap: 5,
        children: [
          { type: "image", src: "sf-symbol:chart.bar.fill", width: 12, height: 12, color: "#6E7FF3" },
          { type: "text", text: "订阅流量",
            font: { size: compact ? 9 : "caption1", weight: "semibold" }, textColor: TEXT_SECOND },
          { type: "spacer" },
          { type: "image", src: "sf-symbol:clock", width: 10, height: 10, color: TEXT_SOFT },
          { type: "text", text: timeDisplay,
            font: { size: compact ? 9 : "caption2" }, textColor: TEXT_SOFT },
        ],
      },

      // ── 卡片网格 ──
      {
        type: "stack", direction: "column", gap: compact ? 5 : 8,
        children: buildGrid(display, compact),
      },

      { type: "spacer" },

    ],
  };
}
