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

const NS_PREFIX = 'yy_10000';
const KEY_LOGIN = 'china_telecom_loginUrl';
const KEY_COOKIE = 'china_telecom_cookie';
const KEY_LOG = 'china_telecom_log';

// 日志项限制（最近多少条），避免无限增长（可根据需要调整）
const LOG_MAX_ENTRIES = 120;

// 是否在每次写入都弹窗（true = 每次弹，false = 仅首次或变更时弹）
const NOTIFY_ON_EVERY_WRITE = false;

const ENV = {
  isQX: typeof $task !== 'undefined',
  isSurge: typeof $httpClient !== 'undefined' && typeof $utils !== 'undefined',
  isLoon: typeof $loon !== 'undefined',
  isStash: typeof $environment !== 'undefined' && !!$environment['stash-version'],
  isNode: typeof require === 'function' && typeof process !== 'undefined' && !this.isQX,
};

function readKV(k) {
  try {
    const full = `${NS_PREFIX}.${k}`;
    if (ENV.isQX) return $prefs.valueForKey(full);
    if (ENV.isSurge || ENV.isLoon || ENV.isStash) return $persistentStore.read(full);
    if (ENV.isNode) {
      const fs = require('fs');
      const p = `${full}.json`;
      if (fs.existsSync(p)) return fs.readFileSync(p, 'utf8');
      return null;
    }
  } catch (e) { console.log(`[ct_log] readKV error ${e}`); }
  return null;
}
function writeKV(k, v) {
  try {
    const full = `${NS_PREFIX}.${k}`;
    if (ENV.isQX) return $prefs.setValueForKey(v, full);
    if (ENV.isSurge || ENV.isLoon || ENV.isStash) return $persistentStore.write(v, full);
    if (ENV.isNode) {
      const fs = require('fs');
      const p = `${full}.json`;
      fs.writeFileSync(p, v, { encoding: 'utf8' });
      return true;
    }
  } catch (e) { console.log(`[ct_log] writeKV error ${e}`); }
  return false;
}
function notify(title, subtitle, message) {
  try {
    if (ENV.isQX) return $notify(title, subtitle, message);
    if (ENV.isSurge || ENV.isLoon || ENV.isStash || ENV.isShadowrocket) return $notification.post(title, subtitle, message);
    if (ENV.isNode) console.log(`${title} - ${subtitle}\n${message}`);
  } catch (e) { console.log(`[ct_log] notify error ${e}`); }
}
function doneSafe(body) { try { if (typeof $done === 'function') $done(body); } catch (e) { /* ignore */ } }

function nowTs() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

function safeDecode(s) { try { return decodeURIComponent(s); } catch { return s || ''; } }

function parseLoginUrlFrom(rawUrl) {
  try {
    const U = (() => { try { return new URL(rawUrl); } catch(e) { return null; } })();
    if (U) {
      const q = U.searchParams.get('loginUrl') || U.searchParams.get('loginurl');
      if (q) return safeDecode(q);
    }
    let m = String(rawUrl).match(/(https?:\/\/.+?)&sign/i);
    if (m && m[1]) return safeDecode(m[1]);
    m = String(rawUrl).match(/https?:\/\/[^\s&'"]+/i);
    if (m) return safeDecode(m[0]);
  } catch (e) { console.log('[ct_log] parseLoginUrl err', e); }
  return '';
}

function normalizeCookieStr(s) {
  if (!s) return '';
  try {
    s = String(s).replace(/\r?\n/g, ';').replace(/\s*;\s*/g, ';').trim();
    const parts = s.split(';').filter(Boolean);
    const map = {};
    parts.forEach(p => {
      const idx = p.indexOf('=');
      if (idx <= 0) return;
      const k = p.slice(0, idx).trim();
      const v = p.slice(idx+1).trim();
      if (!/^(path|domain|expires|max-age|samesite|secure|httponly)$/i.test(k)) map[k] = v;
    });
    return Object.keys(map).map(k => `${k}=${map[k]}`).join('; ');
  } catch (e) {
    return String(s).split(';').map(x => x.trim()).filter(Boolean).join('; ');
  }
}

function mergeCookie(oldStr, newStr) {
  const m = {};
  (oldStr ? oldStr.split(';') : []).concat(newStr ? newStr.split(';') : []).forEach(p => {
    const s = String(p||'').trim();
    if (!s) return;
    const i = s.indexOf('=');
    if (i <= 0) return;
    const k = s.slice(0, i).trim();
    const v = s.slice(i+1).trim();
    if (/^(path|domain|expires|max-age|samesite|secure|httponly)$/i.test(k)) return;
    m[k] = v;
  });
  return Object.keys(m).map(k => `${k}=${m[k]}`).join('; ');
}

// --- 日志管理：追加条目（按时间戳），并保留最近 N 条 ---
function appendLog(entry) {
  try {
    const raw = readKV(KEY_LOG) || '';
    const arr = raw ? JSON.parse(raw) : [];
    arr.unshift(entry); // 最新项放前面
    if (arr.length > LOG_MAX_ENTRIES) arr.length = LOG_MAX_ENTRIES;
    writeKV(KEY_LOG, JSON.stringify(arr, null, 2));
  } catch (e) {
    // 若 JSON 解析异常则覆盖为新数组
    try { writeKV(KEY_LOG, JSON.stringify([entry], null, 2)); } catch(e2){}
  }
}

// 主逻辑
(function main() {
  try {
    // 请求阶段
    if (typeof $request !== 'undefined' && $request && $request.url) {
      try {
        const url = $request.url || '';
        // 1) loginUrl 捕获（针对 user/loginMiddle）
        if (/^https:\/\/e\.dlife\.cn\/user\/loginMiddle/i.test(url)) {
          const login = parseLoginUrlFrom(url);
          if (login) {
            const prev = readKV(KEY_LOGIN) || '';
            if (!prev || prev !== login) {
              writeKV(KEY_LOGIN, login);
              const entry = { time: nowTs(), type: 'loginUrl', value: login, note: '来自 request' };
              appendLog(entry);
              if (NOTIFY_ON_EVERY_WRITE || !prev || prev !== login) notify('中国电信', '已保存 loginUrl', login);
            } else {
              // 若一致，仍写一条轻量日志（可注释）
              appendLog({ time: nowTs(), type: 'loginUrl', value: login, note: '未变更' });
            }
          }
        }

        // 2) 兜底：请求头里有 Cookie 就先合并保存（部分 App 在请求时已经带上 Cookie）
        const reqCookie = ($request.headers && ($request.headers.Cookie || $request.headers.cookie)) || '';
        if (reqCookie) {
          const norm = normalizeCookieStr(reqCookie);
          if (norm) {
            const prevC = normalizeCookieStr(readKV(KEY_COOKIE) || '');
            const merged = mergeCookie(prevC, norm);
            if (merged && merged !== prevC) {
              writeKV(KEY_COOKIE, merged);
              appendLog({ time: nowTs(), type: 'cookie', value: merged, note: '来自 request headers' });
              if (NOTIFY_ON_EVERY_WRITE) notify('中国电信', 'Cookie（请求阶段）已保存/更新', merged);
            } else {
              appendLog({ time: nowTs(), type: 'cookie', value: norm, note: '请求阶段无变更' });
            }
          }
        }
      } catch (e) {
        appendLog({ time: nowTs(), type: 'error', value: String(e), note: 'request stage error' });
      }
      return doneSafe({});
    }

    // 响应阶段
    if (typeof $response !== 'undefined' && $response && $response.headers) {
      try {
        let sc = $response.headers['Set-Cookie'] || $response.headers['set-cookie'] || '';
        if (Array.isArray(sc)) sc = sc.join('; ');
        const incoming = normalizeCookieStr(sc || '');
        if (incoming) {
          const prevC = normalizeCookieStr(readKV(KEY_COOKIE) || '');
          const merged = mergeCookie(prevC, incoming);
          if (merged && merged !== prevC) {
            writeKV(KEY_COOKIE, merged);
            appendLog({ time: nowTs(), type: 'cookie', value: merged, note: '来自 Set-Cookie' });
            notify('中国电信', 'Cookie 已更新（响应阶段）', merged);
          } else {
            appendLog({ time: nowTs(), type: 'cookie', value: incoming, note: '响应阶段无变更' });
          }
        } else {
          appendLog({ time: nowTs(), type: 'response', value: 'no set-cookie', note: ($response.url||'') });
        }
      } catch (e) {
        appendLog({ time: nowTs(), type: 'error', value: String(e), note: 'response stage error' });
      }
      return doneSafe($response.body);
    }

    // 非请求/响应环境：安静退出
    return doneSafe({});
  } catch (err) {
    try { appendLog({ time: nowTs(), type: 'fatal', value: String(err), note: '主流程异常' }); } catch(e){}
    try { notify('ct_capture', '脚本异常', String(err)); } catch(e){}
    return doneSafe({});
  }
})();
