// AbaloneBoxUnlockVIP.js —— 从 argument 读取 token，统一覆盖 authorization
(function () {
  // 仅处理请求阶段
  if (typeof $response !== 'undefined') { $done({}); return; }

  // 兼容 $argument 是对象或字符串
  var TOKEN = '';
  try {
    if (typeof $argument === 'string') {
      // 例：token=Bearer%20xxxx&foo=bar or token=Bearer%20xxxx;foo=bar
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

  // 覆盖请求头
  var inHeaders = ($request && $request.headers) ? $request.headers : {};
  var outHeaders = {};
  for (var k in inHeaders) if (Object.prototype.hasOwnProperty.call(inHeaders, k)) {
    if (String(k).toLowerCase() === 'authorization') continue; // 去重
    outHeaders[k] = inHeaders[k];
  }
  outHeaders['authorization'] = TOKEN; // 只写一份小写

  try { console.log('[byhz][REQ] set authorization => ' + TOKEN + ' | ' + ($request && $request.url)); } catch(e){}
  $done({ headers: outHeaders });
})();
