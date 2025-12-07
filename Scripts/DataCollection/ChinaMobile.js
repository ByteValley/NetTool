/**
 * 中国移动 App 登录 Cookie → BoxJs
 *
 * 写入位置（BoxJs）：
 * - DataCollection.ChinaMobile.Settings.Cookie
 * - DataCollection.ChinaMobile.Settings.Token   （可选：能抓到就写）
 * - DataCollection.ChinaMobile.Settings.UpdatedAt
 *
 * 触发建议：
 * - 打开「中国移动/手机营业厅」App → 完成登录 → 进入“我的/个人中心”刷新一次
 *
 * 适用：
 * - Surge / Loon / Stash / Egern：$request/$response + $persistentStore
 * - Quantumult X：$request/$response + $prefs
 */

const BOXJS_COOKIE_KEY = "DataCollection.ChinaMobile.Settings.Cookie";
const BOXJS_TOKEN_KEY = "DataCollection.ChinaMobile.Settings.Token";
const BOXJS_UPDATED_KEY = "DataCollection.ChinaMobile.Settings.UpdatedAt";

// ================= 工具：跨环境封装 =================
class Env {
  constructor(name) {
    this.name = name;
  }
  isQX() {
    return typeof $prefs !== "undefined";
  }
  isSurgeLike() {
    return typeof $persistentStore !== "undefined";
  }
  getdata(key) {
    if (this.isQX()) return $prefs.valueForKey(key);
    if (this.isSurgeLike()) return $persistentStore.read(key);
    return null;
  }
  setdata(val, key) {
    if (this.isQX()) return $prefs.setValueForKey(String(val), key);
    if (this.isSurgeLike()) return $persistentStore.write(String(val), key);
    return false;
  }
  log(...args) {
    console.log(`[${this.name}]`, ...args);
  }
  done(obj = {}) {
    if (typeof $done !== "undefined") $done(obj);
  }
}
const $ = new Env("CM→BoxJs Cookie");

// ================= 工具：Header 读取（大小写兼容） =================
function getHeader(headers, name) {
  if (!headers) return "";
  const lower = name.toLowerCase();
  for (const k of Object.keys(headers)) {
    if (k.toLowerCase() === lower) return headers[k] ?? "";
  }
  return "";
}

// ================= 工具：Cookie 解析/合并 =================
function parseCookieHeader(cookieHeader) {
  const map = new Map();
  if (!cookieHeader || typeof cookieHeader !== "string") return map;

  cookieHeader
    .split(/;\s*/)
    .map((s) => s.trim())
    .filter(Boolean)
    .forEach((pair) => {
      const idx = pair.indexOf("=");
      if (idx <= 0) return;
      const name = pair.slice(0, idx).trim();
      const value = pair.slice(idx + 1).trim();
      if (!name) return;
      map.set(name, value);
    });

  return map;
}

function parseSetCookieHeader(setCookie) {
  const map = new Map();
  if (!setCookie) return map;

  const raw = Array.isArray(setCookie) ? setCookie.join(",") : String(setCookie);

  // 关键点：避免把 Expires=Wed, 21 Oct... 的逗号切开
  const parts = raw.split(/,(?=[^;]+?=)/g);

  for (const item of parts) {
    const first = item.split(";")[0]?.trim();
    if (!first) continue;
    const idx = first.indexOf("=");
    if (idx <= 0) continue;
    const name = first.slice(0, idx).trim();
    const value = first.slice(idx + 1).trim();
    if (!name) continue;
    map.set(name, value);
  }

  return map;
}

function mergeCookieMaps(...maps) {
  const merged = new Map();
  for (const m of maps) {
    if (!m || !(m instanceof Map)) continue;
    for (const [k, v] of m.entries()) {
      if (v === "" || v == null) continue;
      merged.set(k, v);
    }
  }
  return merged;
}

function buildCookieString(map) {
  return Array.from(map.entries())
    .map(([k, v]) => `${k}=${v}`)
    .join("; ");
}

function mask(s) {
  if (!s) return "";
  const str = String(s);
  if (str.length <= 10) return "***";
  return str.slice(0, 6) + "…" + str.slice(-4);
}

// ================= 主逻辑：抓 Cookie/Token → 写 BoxJs =================
try {
  const isRequest = typeof $request !== "undefined" && $request && !$response;
  const isResponse = typeof $response !== "undefined" && $response;

  const reqHeaders = (isRequest || isResponse) ? ($request?.headers || {}) : {};
  const respHeaders = isResponse ? ($response?.headers || {}) : {};

  // 1) 优先从 Request 的 Cookie 抓（登录后最稳）
  const reqCookie = getHeader(reqHeaders, "Cookie");
  const reqCookieMap = parseCookieHeader(reqCookie);

  // 2) 其次从 Response 的 Set-Cookie 抓
  const setCookie = getHeader(respHeaders, "Set-Cookie");
  const setCookieMap = parseSetCookieHeader(setCookie);

  // 3) 合并并落库（保留更全的 cookie 集合）
  const merged = mergeCookieMaps(setCookieMap, reqCookieMap);
  const cookieStr = buildCookieString(merged);

  // 4) Token：从常见 Header 里试着抓（抓不到就不写）
  const tokenCandidates = [
    getHeader(reqHeaders, "Authorization"),
    getHeader(reqHeaders, "Token"),
    getHeader(reqHeaders, "X-Token"),
    getHeader(respHeaders, "Authorization"),
    getHeader(respHeaders, "Token"),
    getHeader(respHeaders, "X-Token"),
  ].map((x) => (typeof x === "string" ? x.trim() : "")).filter(Boolean);

  // 也从 Cookie 里猜一个 token（例如 *token* / *auth* / *sso*）
  let guessedToken = "";
  for (const [k, v] of merged.entries()) {
    if (/(token|auth|sso)/i.test(k) && v) {
      guessedToken = v;
      break;
    }
  }
  const tokenStr = tokenCandidates[0] || guessedToken;

  let wrote = false;

  if (cookieStr) {
    $.setdata(cookieStr, BOXJS_COOKIE_KEY);
    wrote = true;
    $.log(`✅ Cookie 写入 BoxJs：${BOXJS_COOKIE_KEY} = ${mask(cookieStr)}`);
  } else {
    $.log("⚠️ 未抓到 Cookie（请在登录后进入“我的/个人中心”再触发一次）");
  }

  if (tokenStr) {
    $.setdata(tokenStr, BOXJS_TOKEN_KEY);
    $.log(`✅ Token 写入 BoxJs：${BOXJS_TOKEN_KEY} = ${mask(tokenStr)}`);
  }

  if (wrote) {
    $.setdata(new Date().toISOString(), BOXJS_UPDATED_KEY);
  }
} catch (e) {
  $.log("❌ 脚本异常：", e && (e.stack || e.message || e));
}

$.done({});
