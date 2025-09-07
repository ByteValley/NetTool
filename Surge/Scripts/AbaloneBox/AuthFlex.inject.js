// AuthFlex.inject.js —— 灵活定向把 token 注入到 Header/Cookie/Query/Body
// 用法示例（Surge [Script] argument）：
// argument=mode=header;key=authorization;token=Bearer%20xxxx;hosts=d3a5cafdn5ny45.cloudfront.net;paths=/api/shop/|/api/user/;exclude=*.aliyuncs.com|pv.sohu.com

(function () {
  // ——————————————————————————————
  // 入口 | 仅处理请求阶段
  // ——————————————————————————————
  if (typeof $response !== 'undefined') { $done({}); return; }
  if (typeof $request === 'undefined' || !$request.url) { $done({}); return; }

  // ——————————————————————————————
  // 参数 | 解析 argument
  // ——————————————————————————————
  var ARGSTR = (typeof $argument === 'string') ? decodeURIComponent($argument) : '';
  var ARGOBJ = (typeof $argument === 'object' && $argument) ? $argument : {};
  function pick(k, d) {
    if (ARGOBJ[k] != null) return String(ARGOBJ[k]);
    if (!ARGSTR) return d;
    var out = d;
    ARGSTR.split(/[&;,]/).forEach(function (pair) {
      var i = pair.indexOf('=');
      var kk = (i >= 0 ? pair.slice(0, i) : pair).trim();
      var vv = (i >= 0 ? pair.slice(i + 1) : '').trim();
      if (kk === k) out = vv;
    });
    return out;
  }

  // 模式：header | cookie | query | body
  var MODE = pick('mode', 'header').toLowerCase();
  var TOKEN = pick('token', '');
  var KEY   = pick('key', MODE === 'header' ? 'authorization' : 'token');
  var HOSTS = pick('hosts', '').split('|').map(s => s.trim()).filter(Boolean);
  var PATHS = pick('paths', '').split('|').map(s => s.trim()).filter(Boolean); // 作为 startsWith 前缀匹配
  var EXCL  = pick('exclude', '').split('|').map(s => s.trim()).filter(Boolean);

  if (!TOKEN) { try { console.log('[AuthFlex][WARN] 缺少 token'); } catch(e){}; $done({}); return; }

  // ——————————————————————————————
  // 过滤 | host / path 白名单与排除
  // ——————————————————————————————
  var url = $request.url;
  var host = '';
  try { host = url.split('/')[2] || ''; } catch(e) {}
  var path = '';
  try { path = url.split(host)[1] || ''; } catch(e) {}

  function matchHost(host, rule) {
    host = (host || '').toLowerCase(); rule = (rule || '').toLowerCase();
    if (rule === '*') return true;
    if (rule.startsWith('*.')) return host.endsWith(rule.slice(1));
    return host === rule;
  }
  function inList(val, list) { return list.some(r => matchHost(val, r)); }
  function pathMatch(p, prefixes) { return prefixes.length ? prefixes.some(s => p.startsWith(s)) : true; }

  if (EXCL.length && inList(host, EXCL)) { $done({}); return; }
  if (HOSTS.length && !inList(host, HOSTS)) { $done({}); return; }
  if (!pathMatch(path, PATHS)) { $done({}); return; }

  // ——————————————————————————————
  // 保护 | Authorization 已签名制式
  // ——————————————————————————————
  var inHeaders = $request.headers || {};
  var lowerMap = {}; Object.keys(inHeaders).forEach(k => lowerMap[k.toLowerCase()] = k);
  if (MODE === 'header') {
    var exist = inHeaders[ lowerMap[KEY.toLowerCase()] ];
    if (exist) {
      var v = String(exist).toLowerCase();
      var PROTECT = ['oss ', 'aws4-hmac-sha256 ', 'qiniu ', 'cos ', 'sharedkey ', 'hmac ', 'signature '];
      if (PROTECT.some(pf => v.startsWith(pf))) {
        try { console.log('[AuthFlex][SKIP] 保护已签名头：' + KEY + ' @ ' + host + path); } catch(e){}
        $done({}); return;
      }
    }
  }

  // ——————————————————————————————
  // 处理 | 规范 Bearer（仅在 header/authorization 时自动补）
  // ——————————————————————————————
  var outToken = TOKEN.trim();
  if (MODE === 'header' && KEY.toLowerCase() === 'authorization' && !/^(bearer|basic|digest|hmac|token)\s+/i.test(outToken)) {
    outToken = 'Bearer ' + outToken;
  }

  // ——————————————————————————————
  // 注入 | 按模式写回
  // ——————————————————————————————
  var out = { headers: {} };
  // 复制原始头
  Object.keys(inHeaders).forEach(function (k) { out.headers[k] = inHeaders[k]; });

  if (MODE === 'header') {
    // 覆盖目标头名（大小写以 KEY 为准）
    // 先删已有同名（不区分大小写）
    Object.keys(out.headers).forEach(function (k) { if (k.toLowerCase() === KEY.toLowerCase()) delete out.headers[k]; });
    out.headers[KEY] = outToken;

  } else if (MODE === 'cookie') {
    var oldCk = out.headers['Cookie'] || out.headers['cookie'] || '';
    var parts = oldCk ? oldCk.split(/;\s*/) : [];
    // 删除同名 cookie
    parts = parts.filter(kv => kv.split('=')[0].trim().toLowerCase() !== KEY.toLowerCase());
    parts.push(KEY + '=' + encodeURIComponent(outToken));
    // 统一写回 Cookie
    Object.keys(out.headers).forEach(function (k) { if (k.toLowerCase() === 'cookie') delete out.headers[k]; });
    out.headers['Cookie'] = parts.join('; ');

  } else if (MODE === 'query') {
    // 追加/替换查询参数
    try {
      var u = new URL(url);
      u.searchParams.delete(KEY);
      u.searchParams.append(KEY, outToken);
      url = u.toString();
      out.url = url; // QuanX/Loon 支持，Surge 亦可
    } catch (e) {}

  } else if (MODE === 'body') {
    // 仅对有 body 的方法改写
    var m = ($request.method || 'GET').toUpperCase();
    var body = $request.body || '';
    var ctype = (out.headers['Content-Type'] || out.headers['content-type'] || '').toLowerCase();

    if (m === 'POST' || m === 'PUT' || m === 'PATCH') {
      if (ctype.includes('application/json')) {
        try {
          var j = body ? JSON.parse(body) : {};
          j[KEY] = outToken;
          body = JSON.stringify(j);
          out.body = body;
        } catch (e) {}
      } else if (ctype.includes('application/x-www-form-urlencoded')) {
        var params = [];
        (body || '').split('&').forEach(function (pair) {
          if (!pair) return;
          var i = pair.indexOf('=');
          var k = i >= 0 ? pair.slice(0, i) : pair;
          if (k.trim().toLowerCase() !== KEY.toLowerCase()) params.push(pair);
        });
        params.push(KEY + '=' + encodeURIComponent(outToken));
        out.body = params.join('&');
      } else {
        // 其他类型不动
      }
    }
  }

  if (out.url) {
    try { console.log('[AuthFlex][SET] ' + MODE + ' ' + KEY + ' -> (url) ' + out.url); } catch(e){}
    $done(out);
  } else {
    try { console.log('[AuthFlex][SET] ' + MODE + ' ' + KEY + ' @ ' + host + path); } catch(e){}
    $done(out);
  }
})();
