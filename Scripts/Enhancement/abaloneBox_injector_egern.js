/**
 * 鲍鱼盒子 18+ (Egern 优化版)
 * 逻辑：注入授权头，优先使用外部参数，仅在缺失前缀时补上 "bearer "
 * 传参：argument=token=47516c8088984f2c4f1788be51216289
 */
(function () {
  // 1. 响应阶段快速放行
  if (typeof $response !== 'undefined') {
    $done({});
    return;
  }

  // 2. 读取并解析参数 (Token)
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
    }
  } catch (e) {}

  // 3. 条件补全前缀
  if (TOKEN && !/bearer\s+/i.test(TOKEN)) {
    TOKEN = 'bearer ' + TOKEN;
  }

  // 4. 构造 headers（避免 spread，用 Object.assign）
  var headers = Object.assign({}, $request.headers || {});

  // 5. 找到已存在的 authorization 键名（保持原始大小写）
  var authKey = 'authorization';
  for (var k in headers) {
    if (Object.prototype.hasOwnProperty.call(headers, k) &&
        k.toLowerCase() === 'authorization') {
      authKey = k;
      break;
    }
  }

  headers[authKey] = TOKEN;

  $done({ headers: headers });
})();
