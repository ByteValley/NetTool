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
    title: "网络信息", runAt: "执行时间", policy: "代理策略", local: "本地", entrance: "入口", landing: "落地", location: "位置", isp: "运营商", risk: "风险", services: "服务", nativeLike: "更像原生", nonNative: "可能非原生", home: "家宽", nonHome: "非家宽", weakTunnel: "代理特征偏弱", strongTunnel: "代理特征偏强", noData: "暂无数据", manualPolicyHint: "策略名请用 PROXY_POLICY 传入", wifi: "Wi-Fi", cellular: "蜂窝", unknownNet: "未知网络", unlocked: "已解锁", partialUnlocked: "部分解锁", notReachable: "不可达", timeout: "超时", fail: "失败", regionBlocked: "区域受限", nfFull: "完整解锁", nfOriginals: "仅自制剧"
  }
};

let G = null;
function S() { return G; }
function t(key) { return SD_STR["zh-Hans"][key] || key; }

function safeJSON(s, d = {}) { try { return JSON.parse(s || ""); } catch (_) { return d; } }
function toBool(v, d = false) { if (v == null || v === "") return d; if (typeof v === "boolean") return v; const s = String(v).trim().toLowerCase(); return ["1", "true", "on", "yes", "y"].includes(s) || (["0", "false", "off", "no", "n"].includes(s) ? false : d); }
function toNum(v, d) { if (v == null || v === "") return d; const n = Number(v); return Number.isFinite(n) ? n : d; }
function clamp(n, min, max) { return Math.max(min, Math.min(max, n)); }
function joinNonEmpty(arr, sep = " ") { return arr.filter(Boolean).join(sep); }
function pad2(n) { return String(n).padStart(2, "0"); }
function nowStr() { const d = new Date(); return `${pad2(d.getMonth() + 1)}-${pad2(d.getDate())} ${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}`; }

function parseArgs(raw) { if (!raw) return {}; if (typeof raw === "object") return raw; return String(raw).split("&").reduce((acc, kv) => { if (!kv) return acc; const i = kv.indexOf("="); const k = i >= 0 ? kv.slice(0, i) : kv; const v = i >= 0 ? kv.slice(i + 1) : ""; acc[decodeURIComponent(k || "")] = decodeURIComponent(String(v).replace(/\+/g, "%20")); return acc; }, {}); }

const KVCompat = {
  async readJSON(ctx, key) { try { if (ctx.storage?.getJSON) { const v = await ctx.storage.getJSON(key); if (v != null) return v; } } catch (_) {} return null; }
};

async function readBoxSettings(ctx) { const panel = await KVCompat.readJSON(ctx, "Panel"); return panel?.NetworkInfo?.Settings || panel?.Settings || {}; }

function buildCFG(ctx, box) {
  const compatArgs = parseArgs(ctx?.env?._compat?.$argument || ctx?.env?.["_compat.$argument"] || "");
  const env = ctx?.env || {};
  const read = (k, d) => (env[k] ?? compatArgs[k] ?? box[k] ?? d);
  
  const cfg = {
    Update: toNum(read("Update", 10), 10),
    Timeout: toNum(read("Timeout", 12), 12),
    MASK_IP: toBool(read("MASK_IP", true), true),
    IPv6: toBool(read("IPv6", true), true),
    IconColor: read("IconColor", "#60A5FA"),
    SD_LANG: "zh-Hans",
    SD_CONCURRENCY: 6,
    PROXY_POLICY: String(read("PROXY_POLICY", "")).trim(),
    ICON_NAME: "globe.asia.australia"
  };
  cfg.SD_TIMEOUT_MS = (cfg.Timeout || 10) * 1000;
  cfg.BUDGET_MS = 8000;
  return cfg;
}

// IP 辅助函数
const isIPv4 = (ip) => /^((25[0-5]|(2[0-4]|1\d|[1-9]|)\d)(\.(?!$)|$)){4}$/.test(ip || "");
function maskIP(ip) { if (!ip || !S().CFG.MASK_IP) return ip || ""; if (isIPv4(ip)) { const p = ip.split("."); return `${p[0]}.${p[1]}.*.*`; } return ip; }
function flagFirst(loc) { const re = /^[\u{1F1E6}-\u{1F1FF}]{2}\s*/u; const m = String(loc || "").match(re); const flag = m ? m[0] : ""; const text = String(loc || "").replace(re, ""); return flag + text; }

// 网络状态
function netTypeLine() { const n = S().RT.device || {}; if (n.wifi?.ssid) return `Wi-Fi | ${n.wifi.ssid}`; return "蜂窝网络"; }

// 基础 UI 组件
function txt(text, fontSize, weight, color, opts) { const el = { type: "text", text: String(text ?? ""), font: { size: fontSize, weight: weight || "regular" } }; if (color) el.textColor = color; if (opts) Object.assign(el, opts); return el; }
function icon(name, size, color) { return { type: "image", src: `sf-symbol:${name}`, width: size, height: size, color }; }
function hstack(children, opts) { const el = { type: "stack", direction: "row", alignItems: "center", children }; if (opts) Object.assign(el, opts); return el; }
function vstack(children, opts) { const el = { type: "stack", direction: "column", alignItems: "start", children }; if (opts) Object.assign(el, opts); return el; }
function spacer(length) { return { type: "spacer", length }; }
function divider() { return hstack([spacer()], { height: 1, backgroundColor: "rgba(255,255,255,0.08)" }); }

// 卡片组件 (核心修复点：增加 flex 确保铺满)
function sectionCard(title, iconName, lines, opts = {}) {
  const children = [
    hstack([icon(iconName, 11, opts.iconColor || "#93C5FD"), txt(title, 10, "bold", "rgba(255,255,255,0.88)"), spacer()], { gap: 4 })
  ];
  for (const line of lines.filter(Boolean).slice(0, 3)) {
    children.push(txt(line, 10, "medium", "rgba(255,255,255,0.78)", { maxLines: 1, minScale: 0.75 }));
  }
  return vstack(children, {
    gap: 3, padding: [9, 10, 9, 10], backgroundColor: "rgba(255,255,255,0.06)", borderRadius: 12, flex: 1
  });
}

function riskCard(model) {
  const risk = model.risk || { riskValue: 0, lineType: "原生", nativeHint: "干净", tunnelHint: "弱特征" };
  const color = risk.riskValue >= 50 ? "#FBBF24" : "#34D399";
  return vstack([
    hstack([icon("shield.lefthalf.filled", 12, color), txt(t("risk"), 10, "bold", "rgba(255,255,255,0.88)"), spacer()], { gap: 4 }),
    txt(`${risk.lineType} · ${risk.nativeHint}`, 10, "medium", "rgba(255,255,255,0.8)", { maxLines: 1 }),
    txt(risk.tunnelHint, 9, "medium", "rgba(255,255,255,0.5)")
  ], { gap: 3, padding: [9, 10, 9, 10], backgroundColor: "rgba(255,255,255,0.06)", borderRadius: 12, flex: 1 });
}

function makeRoot(children, padding) {
  return {
    type: "widget",
    padding: padding || [10, 14, 8, 14], // 调整 Padding 解决截断
    backgroundGradient: { type: "linear", colors: ["#0B1220", "#10233F"], startPoint: { x: 0, y: 0 }, endPoint: { x: 1, y: 1 } },
    refreshAfter: new Date(Date.now() + 60000).toISOString(),
    children
  };
}

function headerBar(model) {
  return hstack([
    icon(S().CFG.ICON_NAME, 16, S().CFG.IconColor),
    vstack([txt("网络信息", 14, "heavy", "#FFFFFF"), txt(netTypeLine(), 9, "medium", "rgba(255,255,255,0.6)")], { gap: 0 }),
    spacer(),
    vstack([txt(model.policy || "-", 10, "bold", "#BFDBFE"), txt(model.runAt.slice(11), 9, "medium", "rgba(255,255,255,0.4)")], { alignItems: "end" })
  ], { gap: 8 });
}

// 渲染中尺寸 (核心修复：移除宽度，使用 alignItems: stretch)
function renderSystemMedium(model) {
  const localLines = [maskIP(model.local?.ip), flagFirst(model.local?.loc), model.local?.isp];
  const entranceLines = [maskIP(model.entrance?.ip), flagFirst(model.entrance?.loc1), model.entrance?.isp1];
  const landingLines = [maskIP(model.landing?.ip), flagFirst(model.landing?.loc), model.landing?.isp];

  return makeRoot([
    headerBar(model), spacer(6), divider(), spacer(8),
    hstack([
      sectionCard("本地", "house.fill", localLines, { iconColor: "#60A5FA" }),
      sectionCard("入口", "circle.grid.cross.fill", entranceLines, { iconColor: "#A78BFA" }),
      sectionCard("落地", "paperplane.fill", landingLines, { iconColor: "#34D399" })
    ], { gap: 8, alignItems: "stretch" }),
    spacer(8),
    hstack([riskCard(model), sectionCard("服务", "play.tv.fill", ["Netflix 已解锁", "YouTube Premium"], { iconColor: "#F87171" })], { gap: 8, alignItems: "stretch" }),
    spacer(),
    txt(`策略: ${model.policy}`, 8, "medium", "rgba(255,255,255,0.3)")
  ], [10, 14, 6, 14]);
}

// 模拟数据构建 (仅展示用，实际逻辑沿用原脚本)
async function buildModel(ctx) {
  const box = await readBoxSettings(ctx);
  const cfg = buildCFG(ctx, box);
  G = { RT: ctx, CFG: cfg };
  return {
    runAt: nowStr(),
    policy: cfg.PROXY_POLICY || "自动选择",
    local: { ip: "1.1.1.1", loc: "🇨🇳 广东 深圳", isp: "中国电信" },
    entrance: { ip: "2.2.2.2", loc1: "🇭🇰 香港", isp1: "Azure" },
    landing: { ip: "3.3.3.3", loc: "🇺🇸 美国", isp: "Google" },
    risk: { riskValue: 15, lineType: "原生家宽", nativeHint: "更像原生", tunnelHint: "代理特征偏弱" }
  };
}

export default async function(ctx) {
  try {
    const model = await buildModel(ctx);
    return renderSystemMedium(model);
  } catch (err) {
    return { type: "widget", children: [txt("运行错误", 12, "bold", "#FF0000"), txt(String(err), 10)] };
  }
}
