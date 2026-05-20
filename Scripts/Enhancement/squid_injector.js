/**
 * 乌贼增强 (Surge 适配版)
 * 逻辑：注入 itsme / code，并按接口替换加密请求体
 * 注意：fuck_u 需与登录态成套使用
 *
 * 传参：
 * itsme=xxxx
 * code=xxxx
 * nextplay=xxxx
 * topgear=xxxx
 * getplatformhost=xxxx
 * appconfig=xxxx
 */
(function () {
  if (typeof $response !== 'undefined') {
    $done({});
    return;
  }

  var url = ($request && $request.url) ? $request.url : '';
  try { console.log('[squid][hit] ' + url); } catch (e) {}

  var args = parseArgs(typeof $argument === 'string' ? $argument : '');
  var headers = ($request && $request.headers) ? { ...$request.headers } : {};
  var body = ($request && $request.body) ? $request.body : '';

  if (args.itsme) {
    setHeader(headers, 'itsme', args.itsme);
  }

  if (args.code) {
    setHeader(headers, 'code', args.code);
  }

  setHeader(headers, 'content-type', 'application/json');

  var bodyMap = {
    '/APl/Live/NextPlay': args.nextplay,
    '/APl/Live/TopGear': args.topgear,
    '/APl/Live/GetPlatformHost': args.getplatformhost,
    '/APl/App/Config': args.appconfig
  };

  for (var path in bodyMap) {
    if (url.indexOf(path) !== -1 && bodyMap[path]) {
      body = JSON.stringify({
        fuck_u: bodyMap[path]
      });

      try {
        console.log('[squid][body] replaced -> ' + path);
      } catch (e) {}

      break;
    }
  }

  $done({
    headers: headers,
    body: body
  });

  function parseArgs(str) {
    var obj = {};

    str.split('&').forEach(function (item) {
      var index = item.indexOf('=');
      if (index === -1) return;

      var key = item.slice(0, index).trim();
      var value = item.slice(index + 1).trim();

      if (key) {
        obj[key] = decodeURIComponent(value);
      }
    });

    return obj;
  }

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
