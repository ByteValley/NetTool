/*
 * 电信登录地址 + Cookie 捕获（Surge 专用）
 * 功能：
 *  - 捕获 loginUrl 并保存
 *  - 捕获 Cookie 并保存
 *  - 每次更新时：在 Surge 日志输出详细记录，同时弹窗提示
 *
 * 持久化键：
 *   yy_10000.china_telecom_loginUrl
 *   yy_10000.china_telecom_cookie
 *
 * MITM: e.dlife.cn
 */

const NS = 'yy_10000';
const KEY_LOGIN = `${NS}.china_telecom_loginUrl`;
const KEY_COOKIE = `${NS}.china_telecom_cookie`;

function read(k) { return $persistentStore.read(k) || ''; }
function write(k, v) { return $persistentStore.write(v, k); }
function notify(t, s, m) { $notification.post(t, s, m); }
function done(b) { $done(b); }

function log(msg) { console.log(`[CT_CAPTURE] ${msg}`); }

function safeDecode(s) { try { return decodeURIComponent(s); } catch { return s; } }

function parseLoginUrl(url) {
  try {
    const u = new URL(url);
    const q = u.searchParams.get('loginUrl') || u.searchParams.get('loginurl');
    if (q) return safeDecode(q);
  } catch {}
  const m = url.match(/(https?:\/\/.+?)&sign/i);
  if (m && m[1]) return safeDecode(m[1]);
  return '';
}

function normalizeCookie(s) {
  if (!s) return '';
  return s.split(';')
    .map(x => x.trim())
    .filter(x => x && !/^(path|domain|expires|max-age|samesite|secure|httponly)$/i.test(x.split('=')[0]))
    .join('; ');
}

function mergeCookie(oldC, newC) {
  const m = {};
  function eat(str) {
    (str||'').split(';').map(x=>x.trim()).filter(Boolean).forEach(p=>{
      const i = p.indexOf('=');
      if (i>0) m[p.slice(0,i)] = p.slice(i+1);
    });
  }
  eat(oldC); eat(newC);
  return Object.entries(m).map(([k,v])=>`${k}=${v}`).join('; ');
}

// 请求阶段
if (typeof $request !== 'undefined' && $request.url) {
  const url = $request.url;
  if (/^https:\/\/e\.dlife\.cn\/user\/loginMiddle/i.test(url)) {
    const loginUrl = parseLoginUrl(url);
    if (loginUrl) {
      const prev = read(KEY_LOGIN);
      if (prev !== loginUrl) {
        write(KEY_LOGIN, loginUrl);
        log(`登录地址已更新：${loginUrl}`);
        notify('中国电信', '登录地址已捕获', loginUrl);
      }
    }
  }
  const ck = $request.headers.Cookie || $request.headers.cookie || '';
  if (ck) {
    const norm = normalizeCookie(ck);
    if (norm) {
      const prevC = normalizeCookie(read(KEY_COOKIE));
      const merged = mergeCookie(prevC, norm);
      if (merged !== prevC) {
        write(KEY_COOKIE, merged);
        log(`请求阶段 Cookie 更新：${merged}`);
        notify('中国电信', 'Cookie 已捕获（请求）', merged);
      }
    }
  }
  done({});
}

// 响应阶段
else if (typeof $response !== 'undefined' && $response.headers) {
  let sc = $response.headers['Set-Cookie'] || $response.headers['set-cookie'] || '';
  if (Array.isArray(sc)) sc = sc.join('; ');
  const norm = normalizeCookie(sc);
  if (norm) {
    const prevC = normalizeCookie(read(KEY_COOKIE));
    const merged = mergeCookie(prevC, norm);
    if (merged !== prevC) {
      write(KEY_COOKIE, merged);
      log(`响应阶段 Cookie 更新：${merged}`);
      notify('中国电信', 'Cookie 已捕获（响应）', merged);
    }
  }
  done($response.body);
}
else {
  done({});
}
