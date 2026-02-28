/**
 * =========================================================
 * 脚本：鲍鱼盒子18+ · 请求头修复（去混淆重写版）
 * 说明：
 *  - 主要用于覆盖 /api/ 相关请求的 User-Agent（抓包可见 CloudFront 接口只带 UA）
 *  - 支持两种模式：
 *      1) 完整 UA 覆盖（最高优先级）
 *      2) 在原 UA 后追加后缀（用于“UA 里夹带 token/版本串”的场景）
 *  - 顺手补齐常见头（Accept / Content-Type）以避免部分服务端挑剔
 *
 * 配置方式：
 *  - 直接在脚本顶部常量里改（最省事）
 *  - 或者用持久化存储覆盖（Surge：$persistentStore）
 *
 * =========================================================
 */

// =============== 手动配置区（你先用 HAR 里的 UA） ===============
const CFG = {
  // 完整 UA：不为空则直接覆盖为这个
  // 你 HAR 里抓到的是：鲍鱼盒子/186 CFNetwork/3860.200.71 Darwin/25.1.0（注意 HAR 内是 URL 编码后的）
  fullUA: "鲍鱼盒子/186 CFNetwork/3860.200.71 Darwin/25.1.0",

  // UA 后缀：当你发现服务端要你在 UA 里追加某段“密钥/版本串”时用这个
  // 例：";key=xxxxxxxx" 或 " " + token
  uaSuffix: "",

  // 是否强制对所有 /api/ 请求生效（包含非 cloudfront 的 /api/）
  forceForAllApiHosts: true,

  // 调试日志（Surge 可在脚本日志里看）
  debug: false,
};

// =============== 持久化配置覆盖（可选） ===============
const STORE_KEY = "byhz.header.fix";
const store = typeof $persistentStore !== "undefined" ? $persistentStore : null;

function loadStore() {
  if (!store) return null;
  try {
    const raw = store.read(STORE_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch (_) {
    return null;
  }
}

const stored = loadStore();
if (stored && typeof stored === "object") {
  if (typeof stored.fullUA === "string") CFG.fullUA = stored.fullUA;
  if (typeof stored.uaSuffix === "string") CFG.uaSuffix = stored.uaSuffix;
  if (typeof stored.forceForAllApiHosts === "boolean") CFG.forceForAllApiHosts = stored.forceForAllApiHosts;
  if (typeof stored.debug === "boolean") CFG.debug = stored.debug;
}

// =============== 工具函数 ===============
function log(...args) {
  if (CFG.debug) console.log("[byhz] ", ...args);
}

function getHeaders() {
  return $request && $request.headers ? $request.headers : {};
}

function setHeaderCaseInsensitive(headers, key, value) {
  const lower = key.toLowerCase();
  for (const k in headers) {
    if (k.toLowerCase() === lower) {
      headers[k] = value;
      return;
    }
  }
  headers[key] = value;
}

function isApiPath(url) {
  try {
    return /\/api\//i.test(url);
  } catch (_) {
    return false;
  }
}

function main() {
  const url = ($request && $request.url) || "";
  const headers = getHeaders();

  // 只处理 /api/ 请求（你的规则也只挂在 /api/ 上）
  if (!isApiPath(url)) {
    $done({ headers });
    return;
  }

  // 生成目标 UA
  const oldUAKey = Object.keys(headers).find(k => k.toLowerCase() === "user-agent");
  const oldUA = oldUAKey ? headers[oldUAKey] : "";

  let newUA = oldUA || "";
  if (CFG.fullUA && CFG.fullUA.trim()) {
    newUA = CFG.fullUA.trim();
  }
  if (CFG.uaSuffix && CFG.uaSuffix.length) {
    // 避免重复追加
    if (!newUA.includes(CFG.uaSuffix)) newUA = newUA + CFG.uaSuffix;
  }

  // 覆盖 UA
  setHeaderCaseInsensitive(headers, "User-Agent", newUA);

  // 补一些常见头（不影响则无所谓，有些后端会挑）
  if (!Object.keys(headers).some(k => k.toLowerCase() === "accept")) {
    setHeaderCaseInsensitive(headers, "Accept", "*/*");
  }
  if (!Object.keys(headers).some(k => k.toLowerCase() === "content-type")) {
    // GET 一般无所谓，补上也不碍事
    setHeaderCaseInsensitive(headers, "Content-Type", "application/json");
  }

  log("url:", url);
  log("ua(old):", oldUA);
  log("ua(new):", newUA);

  $done({ headers });
}

main();
