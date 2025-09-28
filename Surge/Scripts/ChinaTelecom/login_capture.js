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
const KEY_LAST_NOTIFY_AT = `${NS}.china_telecom_last_notify_at`; // 通知节流

// 通知节流（秒）；同类提示在该时间窗口内不再重复弹窗
const NOTIFY_THROTTLE_SECONDS = 10;

// —— 工具函数 —— //
function read(k){ try { return $persistentStore.read(k) || ''; } catch(e){ return ''; } }
function write(k,v){ try { return $persistentStore.write(v,k); } catch(e){ return false; } }
function nowSec(){ return Math.floor(Date.now()/1000); }
function canNotify(){
  const last = parseInt(read(KEY_LAST_NOTIFY_AT) || '0', 10) || 0;
  if (nowSec() - last >= NOTIFY_THROTTLE_SECONDS) { write(KEY_LAST_NOTIFY_AT, String(nowSec())); return true; }
  return false;
}
function notify(title, subtitle, message){
  try {
    // 节流：避免连环弹窗影响体验
    if (canNotify()) $notification.post(title, subtitle, message);
  } catch(e){}
}
function log(line){ try { console.log('[CT_SAFE] ' + line); } catch(e){} }
function doneSafe(body){ try { if (typeof $done === 'function') $done(body); } catch(e){} }

function safeDecode(s){ try { return decodeURIComponent(s); } catch { return s || ''; } }

function parseLoginUrl(rawUrl){
  try {
    // 1) query 参数 loginUrl / loginurl
    try {
      const u = new URL(rawUrl);
      const q = u.searchParams.get('loginUrl') || u.searchParams.get('loginurl');
      if (q) return safeDecode(q);
    } catch(_) {}
    // 2) &sign 之前的 http 段
    const m = String(rawUrl).match(/(https?:\/\/.+?)&sign/i);
    if (m && m[1]) return safeDecode(m[1]);
    // 3) 兜底：首个 http 段
    const m2 = String(rawUrl).match(/https?:\/\/[^\s&'"]+/i);
    if (m2) return safeDecode(m2[0]);
  } catch(e){}
  return '';
}

function normalizeCookie(s){
  if (!s) return '';
  try {
    return String(s)
      .replace(/\r?\n/g, ';')
      .split(';')
      .map(x => x.trim())
      .filter(Boolean)
      .filter(kv => {
        const k = kv.split('=')[0].trim();
        return k && !/^(path|domain|expires|max-age|samesite|secure|httponly)$/i.test(k);
      })
      .join('; ');
  } catch(e){
    return String(s).split(';').map(x=>x.trim()).filter(Boolean).join('; ');
  }
}
function mergeCookie(oldStr, newStr){
  const map = {};
  function eat(str){
    (str||'').split(';').map(x=>x.trim()).filter(Boolean).forEach(p=>{
      const i = p.indexOf('=');
      if (i > 0) {
        const k = p.slice(0,i).trim();
        const v = p.slice(i+1).trim();
        if (!/^(path|domain|expires|max-age|samesite|secure|httponly)$/i.test(k)) map[k] = v;
      }
    });
  }
  eat(oldStr); eat(newStr);
  // 限制长度，避免极端情况下存入过长 cookie（保护宿主）
  const merged = Object.keys(map).map(k => `${k}=${map[k]}`).join('; ');
  return merged.length > 8192 ? merged.slice(0, 8192) : merged;
}

// —— 主流程 —— //
try {
  // 请求阶段：只匹配 loginMiddle，写 loginUrl；顺便兜底保存请求头 Cookie（若存在）
  if (typeof $request !== 'undefined' && $request && $request.url) {
    const url = $request.url || '';

    // 仅对 loginMiddle 触发（避免影响 BoxJS）
    if (/^https:\/\/e\.dlife\.cn\/user\/loginMiddle/i.test(url)) {
      // 1) 登录地址
      const loginUrl = parseLoginUrl(url);
      if (loginUrl) {
        const prev = read(KEY_LOGIN);
        if (prev !== loginUrl) {
          write(KEY_LOGIN, loginUrl);
          log(`登录地址更新：${loginUrl}`);
          notify('中国电信', '登录地址已捕获', loginUrl);
        }
      }

      // 2) 兜底：请求头里的 Cookie
      const reqCk = ($request.headers && ($request.headers.Cookie || $request.headers.cookie)) || '';
      if (reqCk) {
        const norm = normalizeCookie(reqCk);
        if (norm) {
          const prevC = normalizeCookie(read(KEY_COOKIE));
          const merged = mergeCookie(prevC, norm);
          if (merged !== prevC) {
            write(KEY_COOKIE, merged);
            log(`Cookie（请求阶段）更新：${merged}`);
            notify('中国电信', 'Cookie 已捕获（请求）', merged);
          }
        }
      }
    }

    // 总是快速结束
    return doneSafe({});
  }

  // 响应阶段：只匹配登录页响应（index.do 或 loginMiddle 的响应），合并 Set-Cookie
  if (typeof $response !== 'undefined' && $response && $response.headers && $request && $request.url) {
    const url = $request.url || '';
    if (/^https:\/\/e\.dlife\.cn\/(user\/loginMiddle|index\.do)/i.test(url)) {
      let sc = $response.headers['Set-Cookie'] || $response.headers['set-cookie'] || '';
      if (Array.isArray(sc)) sc = sc.join('; ');
      const incoming = normalizeCookie(sc);
      if (incoming) {
        const prevC = normalizeCookie(read(KEY_COOKIE));
        const merged = mergeCookie(prevC, incoming);
        if (merged !== prevC) {
          write(KEY_COOKIE, merged);
          log(`Cookie（响应阶段）更新：${merged}`);
          notify('中国电信', 'Cookie 已捕获（响应）', merged);
        }
      }
    }
    return doneSafe($response.body);
  }

  // 其它环境：安静退出
  return doneSafe({});
} catch (err) {
  try { log('异常：' + String(err)); } catch(e){}
  return doneSafe({});
}
