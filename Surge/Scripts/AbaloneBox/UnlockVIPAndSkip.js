// AbaloneBoxUnlockVIP.js —— 从 argument 读取 token，统一覆盖 authorization（排除 like/like_list）
(function () {
  // 仅处理请求阶段
  if (typeof $response !== 'undefined') { $done({}); return; }

  // 兼容 $argument 是对象或字符串
  var TOKEN = '';
  try {
    if (typeof $argument === 'string') {
      var dec = decodeURIComponent($argument);
      dec.split(/[&;,]/).forEach(function (pair) {
        var kv = pair.split('=');
        if (kv.length >= 2 && kv[0].trim() === 'token') {
          TOKEN = kv.slice(1).join('=').trim();
        }
      });
    } else if ($argument && typeof $argument === 'object') {
      TOKEN = $argument.token || '';
    }
  } catch (e) {}

  if (!TOKEN) {
    try { console.log('[byhz][WARN] 未获取到 token（请在 [Script] 行加 argument=token=...）'); } catch(e){}
    $done({}); return;
  }

  // —— 排除关注相关接口：/api/live/room/like_list 和 /api/live/room/like
  // 兼容可能出现的双斜杠 //api/...
  var url = ($request && $request.url) ? $request.url : '';
  var EXCLUDE_RE = /\/+api\/live\/room\/(?:like_list|like)(?:\?|$)/i;
  if (EXCLUDE_RE.test(url)) {
    try { console.log('[byhz][SKIP] exclude like endpoints => ' + url); } catch(e){}
    $done({}); // 不修改请求头，原样放行
    return;
  }

  // —— 覆盖请求头（去重后只写一份小写 authorization）
  var inHeaders = ($request && $request.headers) ? $request.headers : {};
  var outHeaders = {};
  for (var k in inHeaders) if (Object.prototype.hasOwnProperty.call(inHeaders, k)) {
    if (String(k).toLowerCase() === 'authorization') continue;
    outHeaders[k] = inHeaders[k];
  }
  outHeaders['authorization'] = TOKEN;

  try { console.log('[byhz][REQ] set authorization => ' + TOKEN + ' | ' + url); } catch(e){}
  $done({ headers: outHeaders });
})();
