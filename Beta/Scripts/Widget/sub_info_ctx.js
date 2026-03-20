/* =========================================================
 * 模块：订阅信息 Widget（多机场流量展示）
 * 作者：ByteValley
 * 版本：2026-03-20R1
 * 环境：Egern Widget
 * 参数优先级：env > arguments > boxjs
 * 中卡：4个机场，2×2布局
 * 大卡：8个机场，2×4布局
 * 缓存：6小时自动刷新订阅
 * ========================================================= */

export default async function (ctx) {

  // ─────────────────────────────────────────────
  // 工具函数
  // ─────────────────────────────────────────────

  function bytesToSize(bytes) {
    const n = Number(bytes || 0);
    if (!n || n <= 0) return "0 B";
    const k = 1024;
    const sizes = ["B", "KB", "MB", "GB", "TB"];
    const i = Math.min(Math.floor(Math.log(n) / Math.log(k)), sizes.length - 1);
    return `${(n / Math.pow(k, i)).toFixed(2)} ${sizes[i]}`;
  }

  function usedPercent(used, total) {
    const u = Number(used || 0), t = Number(total || 0);
    if (!t) return 0;
    return Math.min((u / t) * 100, 100);
  }

  function formatDate(ts) {
    if (!ts) return "未知";
    const d = new Date(Number(ts));
    if (isNaN(d.getTime())) return "未知";
    return `${d.getFullYear()}.${String(d.getMonth()+1).padStart(2,"0")}.${String(d.getDate()).padStart(2,"0")}`;
  }

  function daysLeft(ts) {
    if (!ts) return null;
    const now = new Date();
    const exp = new Date(Number(ts));
    const diff = Math.ceil((exp - now) / 86400000);
    return diff > 0 ? diff : 0;
  }

  function parseUserInfo(raw) {
    const data = {};
    String(raw || "").split(";").forEach(p => {
      const idx = p.indexOf("=");
      if (idx === -1) return;
      const k = p.slice(0, idx).trim();
      const v = parseInt(p.slice(idx + 1).trim(), 10);
      if (k && !isNaN(v)) data[k] = v;
    });
    return data;
  }

  function findHeader(headers, name) {
    if (!headers) return null;
    const lc = name.toLowerCase();
    for (const k of Object.keys(headers)) {
      if (k.toLowerCase() === lc) return headers[k];
    }
    return null;
  }

  function isHttpUrl(s) {
    return /^https?:\/\//i.test(String(s || "").trim());
  }

  function cleanVal(v) {
    if (v == null) return null;
    const s = String(v).trim();
    if (!s || ["订阅链接","机场名称","重置日期","null","undefined"].includes(s)) return null;
    if (/^\{\{\{[^}]+\}\}\}$/.test(s)) return null;
    return s;
  }

  // ─────────────────────────────────────────────
  // 参数读取：env > arguments > boxjs
  // ─────────────────────────────────────────────

  function getParam(key, defVal = null) {
    // 1. env
    const envVal = cleanVal(ctx.env?.[key] ?? ctx.env?.[key.toLowerCase()] ?? ctx.env?.[key.toUpperCase()]);
    if (envVal) return envVal;

    // 2. arguments (ctx.arguments 或 ctx.env._compat.$argument)
    const argRaw = ctx.arguments ?? ctx.env?._compat?.["$argument"] ?? "";
    const argMap = {};
    String(argRaw).split("&").forEach(p => {
      const idx = p.indexOf("=");
      if (idx === -1) return;
      try { argMap[decodeURIComponent(p.slice(0, idx))] = decodeURIComponent(p.slice(idx + 1)); } catch (_) {}
    });
    const argVal = cleanVal(argMap[key] ?? argMap[key.toLowerCase()] ?? argMap[key.toUpperCase()]);
    if (argVal) return argVal;

    // 3. boxjs
    const boxRaw = ctx.storage?.getJSON?.("Panel") ?? null;
    if (boxRaw?.SubscribeInfo?.Settings) {
      const s = boxRaw.SubscribeInfo.Settings;
      const bv = cleanVal(s[key] ?? s[key.toLowerCase()] ?? s[key.toUpperCase()]);
      if (bv) return bv;
    }

    return defVal;
  }

  // ─────────────────────────────────────────────
  // 缓存（6小时）
  // ─────────────────────────────────────────────

  const CACHE_TTL = 6 * 60 * 60 * 1000;
  const CACHE_KEY = "SubscribeWidget_Cache";

  async function readCache() {
    try {
      const raw = await ctx.storage?.get?.(CACHE_KEY);
      if (!raw) return null;
      const parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
      if (Date.now() - (parsed.ts || 0) < CACHE_TTL) return parsed.data;
    } catch (_) {}
    return null;
  }

  async function writeCache(data) {
    try {
      await ctx.storage?.set?.(CACHE_KEY, JSON.stringify({ ts: Date.now(), data }));
    } catch (_) {}
  }

  // ─────────────────────────────────────────────
  // 拉取订阅
  // ─────────────────────────────────────────────

  async function fetchSub(url, title, index) {
    try {
      const resp = await ctx.http.get(url, { timeout: 8000 });
      const headerVal = findHeader(resp.headers, "subscription-userinfo");
      if (!headerVal) return { title, error: "无 userinfo 头" };

      const info = parseUserInfo(headerVal);
      const upload = Number(info.upload || 0);
      const download = Number(info.download || 0);
      const total = Number(info.total || 0);
      const used = upload + download;

      let expireMs = null;
      if (info.expire) {
        let exp = Number(info.expire);
        if (exp < 10000000000) exp *= 1000;
        expireMs = exp;
      }

      return { title, used, total, expireMs, ok: true };
    } catch (e) {
      return { title, error: String(e) };
    }
  }

  // ─────────────────────────────────────────────
  // 读取所有订阅配置
  // ─────────────────────────────────────────────

  const slots = [];
  for (let i = 1; i <= 10; i++) {
    const rawUrl = getParam(`url${i}`) ?? getParam(`URL${i}`);
    let url = cleanVal(rawUrl);
    if (url && !isHttpUrl(url)) {
      try { url = decodeURIComponent(url); } catch (_) {}
    }
    if (!url || !isHttpUrl(url)) continue;
    const title = getParam(`title${i}`) ?? getParam(`Title${i}`) ?? `机场${i}`;
    const resetDay = getParam(`resetDay${i}`) ?? getParam(`ResetDay${i}`);
    slots.push({ url, title, resetDay, index: i });
  }

  // ─────────────────────────────────────────────
  // 获取数据（缓存优先）
  // ─────────────────────────────────────────────

  let subData = await readCache();

  if (!subData) {
    const results = await Promise.all(slots.map(s => fetchSub(s.url, s.title, s.index)));
    subData = slots.map((s, i) => ({ ...results[i], resetDay: s.resetDay }));
    await writeCache(subData);
  }

  // ─────────────────────────────────────────────
  // 颜色系统（深浅色自适应）
  // ─────────────────────────────────────────────

  const C = {
    textMain:   { light: "#111827", dark: "#F3F4F6" },
    textSub:    { light: "#6B7280", dark: "#A1A1AA" },
    textSoft:   { light: "#9CA3AF", dark: "#71717A" },
    accent:     { light: "#1E90FF", dark: "#4DA3FF" },
    ok:         { light: "#10B981", dark: "#34D399" },
    warn:       { light: "#F59E0B", dark: "#FBBF24" },
    bad:        { light: "#EF4444", dark: "#F87171" },
    cardBg:     { light: "#FFFFFF", dark: "#23252A" },
    cardBorder: { light: "#E8EAEE", dark: "#343741" },
    barBg:      { light: "#E5E7EB", dark: "#374151" },
  };

  // ─────────────────────────────────────────────
  // 进度条渲染
  // ─────────────────────────────────────────────

  function progressBar(percent, width = 80) {
    const pct = Math.min(Math.max(Number(percent) || 0, 0), 100);
    const barColor = pct >= 80 ? C.bad : pct >= 60 ? C.warn : C.ok;

    return {
      type: "stack",
      direction: "column",
      gap: 2,
      children: [
        // 进度条轨道
        {
          type: "stack",
          direction: "row",
          height: 4,
          cornerRadius: 2,
          backgroundColor: C.barBg,
          children: [
            {
              type: "stack",
              width: `${pct}%`,
              height: 4,
              cornerRadius: 2,
              backgroundColor: barColor,
              children: []
            }
          ]
        }
      ]
    };
  }

  // ─────────────────────────────────────────────
  // 单个机场卡片
  // ─────────────────────────────────────────────

  function buildSubCard(item) {
    if (!item) {
      return {
        type: "stack",
        direction: "column",
        padding: [8, 8, 8, 8],
        backgroundColor: C.cardBg,
        borderRadius: 12,
        borderWidth: 0.5,
        borderColor: C.cardBorder,
        children: [
          { type: "text", text: "未配置", font: { size: 11, weight: "medium" }, textColor: C.textSoft }
        ]
      };
    }

    if (item.error) {
      return {
        type: "stack",
        direction: "column",
        gap: 4,
        padding: [8, 8, 8, 8],
        backgroundColor: C.cardBg,
        borderRadius: 12,
        borderWidth: 0.5,
        borderColor: C.cardBorder,
        children: [
          { type: "text", text: item.title, font: { size: 11, weight: "bold" }, textColor: C.textMain, maxLines: 1 },
          { type: "text", text: "获取失败", font: { size: 9 }, textColor: C.bad }
        ]
      };
    }

    const pct = usedPercent(item.used, item.total);
    const barColor = pct >= 80 ? C.bad : pct >= 60 ? C.warn : C.ok;
    const used = bytesToSize(item.used);
    const total = bytesToSize(item.total);
    const remain = bytesToSize(Math.max((item.total || 0) - (item.used || 0), 0));
    const expStr = item.expireMs ? formatDate(item.expireMs) : "未知";
    const expDays = item.expireMs ? daysLeft(item.expireMs) : null;

    // 重置日
    let resetStr = null;
    if (item.resetDay) {
      const day = parseInt(item.resetDay, 10);
      if (!isNaN(day) && day >= 1 && day <= 31) {
        const now = new Date();
        let reset = new Date(now.getFullYear(), now.getMonth(), day);
        if (reset <= now) reset = new Date(now.getFullYear(), now.getMonth() + 1, day);
        const left = Math.ceil((reset - now) / 86400000);
        resetStr = `重置 ${left}天`;
      }
    }

    return {
      type: "stack",
      direction: "column",
      gap: 5,
      padding: [8, 8, 8, 8],
      backgroundColor: C.cardBg,
      borderRadius: 12,
      borderWidth: 0.5,
      borderColor: C.cardBorder,
      children: [
        // 机场名
        {
          type: "text",
          text: item.title,
          font: { size: 11, weight: "bold" },
          textColor: C.textMain,
          maxLines: 1,
          minScale: 0.8
        },
        // 进度条
        {
          type: "stack",
          direction: "row",
          height: 5,
          cornerRadius: 2.5,
          backgroundColor: C.barBg,
          children: [
            {
              type: "stack",
              direction: "row",
              width: `${pct.toFixed(1)}%`,
              height: 5,
              cornerRadius: 2.5,
              backgroundColor: barColor,
              children: []
            }
          ]
        },
        // 已用/总量
        {
          type: "stack",
          direction: "row",
          alignItems: "center",
          children: [
            { type: "text", text: `${pct.toFixed(1)}%`, font: { size: 10, weight: "bold" }, textColor: barColor },
            { type: "spacer" },
            { type: "text", text: total, font: { size: 9 }, textColor: C.textSub }
          ]
        },
        // 已用 & 剩余
        {
          type: "stack",
          direction: "row",
          alignItems: "center",
          children: [
            { type: "text", text: `已用 ${used}`, font: { size: 9 }, textColor: C.textSub },
            { type: "spacer" },
            { type: "text", text: `剩 ${remain}`, font: { size: 9 }, textColor: C.textSub }
          ]
        },
        // 到期 & 重置
        {
          type: "stack",
          direction: "row",
          alignItems: "center",
          children: [
            {
              type: "text",
              text: `到期 ${expStr}`,
              font: { size: 9 },
              textColor: expDays != null && expDays <= 7 ? C.bad : expDays != null && expDays <= 30 ? C.warn : C.textSoft,
              maxLines: 1
            },
            { type: "spacer" },
            resetStr ? { type: "text", text: resetStr, font: { size: 9 }, textColor: C.textSoft } : { type: "spacer" }
          ]
        }
      ]
    };
  }

  // ─────────────────────────────────────────────
  // 2×N 网格布局
  // ─────────────────────────────────────────────

  function buildGrid(items, count) {
    const rows = [];
    for (let i = 0; i < count; i += 2) {
      const left = buildSubCard(items[i] || null);
      const right = buildSubCard(items[i + 1] || null);
      rows.push({
        type: "stack",
        direction: "row",
        gap: 8,
        children: [
          { type: "stack", flex: 1, children: [left] },
          { type: "stack", flex: 1, children: [right] }
        ]
      });
    }
    return rows;
  }

  // ─────────────────────────────────────────────
  // 时间
  // ─────────────────────────────────────────────

  function nowStr() {
    const d = new Date();
    return `${String(d.getHours()).padStart(2,"0")}:${String(d.getMinutes()).padStart(2,"0")}`;
  }

  const refreshTime = new Date(Date.now() + CACHE_TTL).toISOString();
  const family = String(ctx.widgetFamily || "").toLowerCase();
  const isLarge = family === "large" || family === "systemlarge";
  const showCount = isLarge ? 8 : 4;
  const displayData = subData ? subData.slice(0, showCount) : [];

  // 补齐到 showCount
  while (displayData.length < showCount) displayData.push(null);

  const gridRows = buildGrid(displayData, showCount);

  // ─────────────────────────────────────────────
  // 顶部标题行
  // ─────────────────────────────────────────────

  const headerRow = {
    type: "stack",
    direction: "row",
    alignItems: "center",
    padding: [0, 0, 4, 0],
    children: [
      {
        type: "image",
        src: "sf-symbol:antenna.radiowaves.left.and.right.circle.fill",
        width: 14,
        height: 14,
        color: C.accent
      },
      { type: "stack", width: 5, children: [] },
      {
        type: "text",
        text: "订阅信息",
        font: { size: 13, weight: "bold" },
        textColor: C.textMain
      },
      { type: "spacer" },
      {
        type: "text",
        text: nowStr(),
        font: { size: 12, weight: "semibold" },
        textColor: C.accent
      }
    ]
  };

  return {
    type: "widget",
    family: isLarge ? "large" : "medium",
    padding: [12, 12, 12, 12],
    backgroundColor: "transparent",
    refreshAfter: refreshTime,
    children: [
      {
        type: "stack",
        direction: "column",
        gap: 8,
        children: [headerRow, ...gridRows]
      }
    ]
  };
}
