/*
 * 名称：电信登录地址 + Cookie 捕获
 * 适配：Surge / Loon / Quantumult X / Stash / Shadowrocket
 * 作用：
 *  1) 请求阶段（http-request）解析并保存 loginUrl
 *  2) 响应阶段（http-response）从 Set-Cookie 合并持久化 Cookie；兜底用请求头 Cookie
 *
 * MITM：e.dlife.cn
 * 匹配：/user/loginMiddle 及与登录流程相关页面（可按需扩展）
 *
 * 键名（同命名空间下）：
 *  - china_telecom_loginUrl
 *  - china_telecom_cookie
 *
 * 作者：ByteValley
 * 更新时间：2025-09-28
 */

const NS = 'yy_10000'; // 命名空间（仅用于区分不同业务）
const KEY_LOGIN_URL = 'china_telecom_loginUrl';
const KEY_COOKIE    = 'china_telecom_cookie';

const ENV = (() => ({
  isQX: typeof $task !== 'undefined',
  isLoon: typeof $loon !== 'undefined',
  isSurge: typeof $httpClient !== 'undefined' && typeof $utils !== 'undefined',
  isStash: typeof $environment !== 'undefined' && $environment['stash-version'],
  isShadowrocket: typeof $rocket !== 'undefined',
  isRequest: typeof $request !== 'undefined',
}))();

function readKV(key) {
  const full = `${NS}.${key}`;
  if (ENV.isQX) return $prefs.valueForKey(full);
  if (ENV.isSurge || ENV.isLoon || ENV.isStash || ENV.isShadowrocket) return $persistentStore.read(full);
  return null;
}
function writeKV(key, val) {
  const full = `${NS}.${key}`;
  if (ENV.isQX) return $prefs.setValueForKey(val, full);
  if (ENV.isSurge || ENV.isLoon || ENV.isStash || ENV.isShadowrocket) return $persistentStore.write(val, full);
  return false;
}
function notify(title, subtitle, message) {
  if (ENV.isQX) $notify(title, subtitle, message);
  else $notification.post(title, subtitle, message);
}
function done(body) { $done(body); }

function safeDecode(s) {
  try { return decodeURIComponent(s); } catch { return s; }
}

function parseLoginUrlFrom(rawUrl) {
  // 1) 优先 query 参数 loginUrl / loginurl
  try {
    const u = new URL(rawUrl);
    const q = u.searchParams.get('loginUrl') || u.searchParams.get('loginurl');
    if (q) return safeDecode(q);
  } catch (_) {}

  // 2) 经典 &sign 之前的 http(s) 段
  let m = rawUrl.match(/(https?:\/\/.+?)&sign/i);
  if (m && m[1]) return safeDecode(m[1]);

  // 3) 兜底：整串里第一个 http 开头直到 & 或空格
  m = rawUrl.match(/https?:\/\/[^\s&'"]+/i);
  if (m && m[0]) return safeDecode(m[0]);

  return '';
}

function normalizeCookieStr(s) {
  if (!s) return '';
  // 把多余空白统一；去掉换行；去重键
  const parts = s.replace(/\r?\n/g, '').split(';').map(x => x.trim()).filter(Boolean);
  const map = {};
  for (const p of parts) {
    const i = p.indexOf('=');
    if (i <= 0) continue;
    const k = p.slice(0, i).trim();
    const v = p.slice(i + 1).trim();
    if (!k) continue;
    // 忽略 Path/Domain/Expires/SameSite/Secure/HttpOnly 等属性（仅保留 key=value）
    if (/^(path|domain|expires|max-age|samesite|secure|httponly)$/i.test(k)) continue;
    map[k] = v;
  }
  return Object.keys(map).map(k => `${k}=${map[k]}`).join('; ');
}

function mergeCookie(oldStr, addStr) {
  const oldMap = {};
  const addMap = {};
  const eat = (str, mp) => {
    (str || '').split(';').map(s => s.trim()).filter(Boolean).forEach(p => {
      const i = p.indexOf('=');
      if (i <= 0) return;
      const k = p.slice(0, i).trim();
      const v = p.slice(i + 1).trim();
      mp[k] = v;
    });
  };
  eat(oldStr, oldMap);
  eat(addStr, addMap);
  const merged = { ...oldMap, ...addMap };
  return Object.keys(merged).map(k => `${k}=${merged[k]}`).join('; ');
}

// ========== 主逻辑 ==========
(function main() {
  try {
    if (ENV.isRequest) {
      // —— 请求阶段：解析 loginUrl；兜底读取请求头 Cookie 保存一次（若有）
      const url = $request.url || '';
      if (/^https:\/\/e\.dlife\.cn\/user\/loginMiddle/i.test(url)) {
        const loginUrl = parseLoginUrlFrom(url);
        if (loginUrl) {
          writeKV(KEY_LOGIN_URL, loginUrl);
          notify('中国电信', '登录地址获取成功', loginUrl);
        }
      }
      // 兜底：如果请求里自带 Cookie，则先保存一份（不少 App 会先带 Cookie 去探测）
      const reqCookie = ($request.headers && ($request.headers.Cookie || $request.headers.cookie)) || '';
      if (reqCookie) {
        const norm = normalizeCookieStr(reqCookie);
        if (norm) {
          const existing = normalizeCookieStr(readKV(KEY_COOKIE) || '');
          const merged = mergeCookie(existing, norm);
          if (merged && merged !== existing) {
            writeKV(KEY_COOKIE, merged);
            // 不弹通知以免频繁打扰；如需提示可打开下一行
            // notify('中国电信', '请求阶段捕获 Cookie', merged);
          }
        }
      }
      return done({});
    } else {
      // —— 响应阶段：优先从 Set-Cookie 合并
      const headers = $response && $response.headers ? $response.headers : {};
      // 兼容大小写
      const setCookie = headers['Set-Cookie'] || headers['set-cookie'];
      let incoming = '';
      if (Array.isArray(setCookie)) {
        incoming = setCookie.map(x => (x || '').split(',')).flat().join('; ');
      } else if (typeof setCookie === 'string') {
        incoming = setCookie;
      }
      const normIncoming = normalizeCookieStr(incoming);

      if (normIncoming) {
        const existing = normalizeCookieStr(readKV(KEY_COOKIE) || '');
        const merged = mergeCookie(existing, normIncoming);
        if (merged && merged !== existing) {
          writeKV(KEY_COOKIE, merged);
          notify('中国电信', 'Cookie 更新成功', merged);
        }
      }
      return done($response.body);
    }
  } catch (err) {
    notify('中国电信', '脚本异常', String(err));
    return done({});
  }
})();
