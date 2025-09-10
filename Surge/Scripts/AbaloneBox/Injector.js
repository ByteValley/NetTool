/**
 * 用途：为匹配到的请求设置 Authorization 头，token 通过外部参数传入
 * 只处理请求阶段；未提供 token 时不做任何修改
 *
 * 传参：
 *  - argument=token=Bearer%20xxxx
 *  - argument=token=xxxx   // 自动补上 "Bearer "
 *  - 兼容 $argument 为对象：{ "token": "xxxx" }
 */
(function () {
  // —— 仅在响应阶段快速放行 —— 
  if (typeof $response !== 'undefined') { 
    $done({}); 
    return; 
  }

  // —— 请求阶段：先打印命中 URL —— 
  try { console.log('[byhz][hit] ' + ($request && $request.url)); } catch (e) {}

  // —— 读取并解析参数 —— 
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
      TOKEN = String($argument.token || '').trim();
    }
  } catch (e) {}

  var headers = ($request && $request.headers) ? $request.headers : {};

  if (!TOKEN) {
    // 没传 token 就原样放行
    $done({ headers });
    return;
  }

  // 未带前缀则补上；已带 bearer/Bearer 均保持
  if (!/^Bearer\s+/i.test(TOKEN)) {
    TOKEN = 'Bearer ' + TOKEN;
  }

  // 找到已存在的 Authorization（大小写不敏感），没有就用标准写法
  var authKey = 'Authorization';
  for (var k in headers) {
    if (Object.prototype.hasOwnProperty.call(headers, k) &&
        String(k).toLowerCase() === 'authorization') { 
      authKey = k; 
      break; 
    }
  }

  headers[authKey] = TOKEN;

  // 打一行确认已设置的值（可选）
  try { console.log('[byhz][set] ' + authKey + ': ' + headers[authKey]); } catch (e) {}

  // —— 只调用一次 $done —— 
  $done({ headers });
})();
