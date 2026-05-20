/**
 * 乌贼增强 (Surge 适配版)
 * 逻辑：脚本内置 itsme / code，并按接口替换加密请求体
 * 注意：fuck_u 需与登录态成套使用
 *
 * 使用方式：
 * 1. 不建议在公开仓库填写真实 itsme / code / fuck_u
 * 2. 如需自用，请复制到私有仓库或本地脚本后填写 CONFIG
 */
(function () {
  if (typeof $response !== 'undefined') {
    $done({});
    return;
  }

  var CONFIG = {
    itsme: '',
    code: '',
    body: {
      nextplay: '',
      topgear: '',
      getplatformhost: '',
      appconfig: ''
    }
  };

  var url = ($request && $request.url) ? $request.url : '';
  var headers = ($request && $request.headers) ? { ...$request.headers } : {};
  var body = ($request && $request.body) ? $request.body : '';

  try { console.log('[squid][hit] ' + url); } catch (e) {}

  if (CONFIG.itsme) {
    setHeader(headers, 'itsme', CONFIG.itsme);
  }

  if (CONFIG.code) {
    setHeader(headers, 'code', CONFIG.code);
  }

  setHeader(headers, 'content-type', 'application/json');

  var bodyMap = {
    '/APl/Live/NextPlay': CONFIG.body.nextplay,
    '/APl/Live/TopGear': CONFIG.body.topgear,
    '/APl/Live/GetPlatformHost': CONFIG.body.getplatformhost,
    '/APl/App/Config': CONFIG.body.appconfig
  };

  for (var path in bodyMap) {
    if (url.indexOf(path) !== -1 && bodyMap[path]) {
      body = JSON.stringify({
        fuck_u: bodyMap[path]
      });

      try { console.log('[squid][body] replaced -> ' + path); } catch (e) {}
      break;
    }
  }

  $done({
    headers: headers,
    body: body
  });

  function setHeader(headers, name, value) {
    var oldKey = Object.keys(headers).find(function (k) {
      return String(k).toLowerCase() === String(name).toLowerCase();
    });

    if (oldKey) {
      headers[oldKey] = value;
    } else {
      headers[name] = value;
    }
  }
})();
