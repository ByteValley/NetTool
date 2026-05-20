/**
 * 乌贼增强 (Surge 适配版)
 * 逻辑：优先使用模块参数，其次使用脚本内置配置
 * 注意：fuck_u 需与登录态成套使用
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

  var args = parseArgs(typeof $argument === 'string' ? $argument : '');

  CONFIG.itsme = args.itsme || CONFIG.itsme;
  CONFIG.code = args.code || CONFIG.code;

  CONFIG.body.nextplay = args.nextplay || CONFIG.body.nextplay;
  CONFIG.body.topgear = args.topgear || CONFIG.body.topgear;
  CONFIG.body.getplatformhost = args.getplatformhost || CONFIG.body.getplatformhost;
  CONFIG.body.appconfig = args.appconfig || CONFIG.body.appconfig;

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
