/**
 * 鲍鱼盒子 18+ (Surge 适配版)
 * 逻辑：注入授权头，优先使用外部参数，仅在缺失前缀时补上 "bearer "
 * 传参：argument=token=47516c8088984f2c4f1788be51216289
 */
(function () {
  // 1. 响应阶段快速放行
  if (typeof $response !== 'undefined') { 
    $done({}); 
    return; 
  }

  // 2. 请求阶段：日志记录命中 URL
  var url = ($request && $request.url) ? $request.url : '';
  try { console.log('[byhz][hit] ' + url); } catch (e) {}

  // 3. 读取并解析参数 (Token)
  // 内置默认 Token
  var TOKEN = "bearer 47516c8088984f2c4f1788be51216289"; 
  
  try {
    if (typeof $argument === 'string' && $argument.indexOf('token=') !== -1) {
      var dec = decodeURIComponent($argument);
      dec.split(/[&;,]/).forEach(function (pair) {
        var kv = pair.split('=');
        if (kv.length >= 2 && kv[0].trim() === 'token') {
          TOKEN = kv.slice(1).join('=').trim();
        }
      });
      try { console.log('[byhz][arg] 已读取外部传入 Token'); } catch (e) {}
    }
  } catch (e) {}

  var headers = ($request && $request.headers) ? { ...$request.headers } : {};

  // 4. 核心逻辑：条件补全前缀
  if (TOKEN) {
    // 只有当字符串中完全不包含 bearer (不区分大小写) 时才补上小写的 "bearer "
    if (!/bearer\s+/i.test(TOKEN)) {
      TOKEN = 'bearer ' + TOKEN;
    }
  }

  // 找到已存在的 authorization 键名（保持原始大小写，或默认小写）
  var authKey = 'authorization'; 
  for (var k in headers) {
    if (Object.prototype.hasOwnProperty.call(headers, k) &&
        String(k).toLowerCase() === 'authorization') { 
      authKey = k; 
      break; 
    }
  }
  
  headers[authKey] = TOKEN;

  // 5. 打印最终结果日志
  try { console.log('[byhz][set] ' + authKey + ': ' + headers[authKey]); } catch (e) {}

  // 6. 调用 $done，不改动 URL 和 Host
  $done({ headers: headers });
})();
