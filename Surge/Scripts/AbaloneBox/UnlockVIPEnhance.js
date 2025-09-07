// AbaloneBox.guard.auth.js —— 按 host 定向覆盖鉴权，保护云存储/签名制式
// 用法示例（Surge [Script] 行添加 argument）：
// argument=token=Bearer%20xxxx;hosts=api.example.com|*.cloudfront.net;header=authorization;exclude=*.aliyuncs.com|pv.sohu.com

(function () {
  // ——————————————————————————————
  // 入口 | 仅处理请求阶段
  // ——————————————————————————————
  if (typeof $response !== 'undefined') { $done({}); return; }
  if (typeof $request === 'undefined' || !$request.url) { $done({}); return; }

  // ——————————————————————————————
  // 参数 | 解析 argument
  // ——————————————————————————————
  var ARG = (typeof $argument === 'string') ? decodeURIComponent($argument) : '';
  var TOKEN = '';
  var HOSTS = [];        // 允许生效的 host 白名单（| 分隔，支持 * 通配）
  var EXCLUDE = [];      // 排除名单（优先级更高）
  var HDR_NAME = 'authorization'; // 目标头名（默认 authorization）
  try {
    if (ARG) {
      ARG.split(/[&;,]/).forEach(function (pair) {
        var i = pair.indexOf('=');
        var k = (i >= 0 ? pair.slice(0, i) : pair).trim();
        var v = (i >= 0 ? pair.slice(i + 1) : '').trim();
        if (!k) return;
        if (k === 'token') TOKEN = v;
        else if (k === 'hosts') HOSTS = v.split('|').map(s => s.trim()).filter(Boolean);
        else if (k === 'exclude') EXCLUDE = v.split('|').map(s => s.trim()).filter(Boolean);
        else if (k === 'header') HDR_NAME = v ? v.toLowerCase() : 'authorization';
      });
    } else if ($argument && typeof $argument === 'object') {
      TOKEN = $argument.token || '';
      if ($argument.hosts) HOSTS = String($argument.hosts).split('|').map(s => s.trim()).filter(Boolean);
      if ($argument.exclude) EXCLUDE = String($argument.exclude).split('|').map(s => s.trim()).filter(Boolean);
      if ($argument.header) HDR_NAME = String($argument.header).toLowerCase();
    }
  } catch (e) {}

  // 没 token 就不做任何修改
  if (!TOKEN) { try { console.log('[AbaloneBox][WARN] 未获取到 token（请在 argument 中提供 token=...）'); } catch(e){}; $done({}); return; }

  // ——————————————————————————————
  // 规则 | host 匹配与排除
  // ——————————————————————————————
  function matchHostRule(host, rule) {
    // 支持 *.example.com 通配；单个词等价于完全匹配
    if (!rule) return false;
    rule = rule.toLowerCase();
    host = String(host || '').toLowerCase();
    if (rule === '*') return true;
    if (rule.startsWith('*.')) {
      var suf = rule.slice(1); // ".example.com"
      return host.endsWith(suf);
    }
    return host === rule;
  }
  function inList(host, list) {
    for (var i = 0; i < list.length; i++) {
      if (matchHostRule(host, list[i])) return true;
    }
    return false;
  }

  var url = $request.url;
  var host = '';
  try { host = url.split('/')[2] || ''; } catch(e) { host = ''; }

  // 有 exclude 命中 => 直接跳过
  if (EXCLUDE.length && inList(host, EXCLUDE)) {
    $done({}); return;
  }

  // 若配置了 HOSTS，则只有命中才生效；若未配置 HOSTS，默认不生效（避免全局误伤）
  var shouldApply = HOSTS.length ? inList(host, HOSTS) : false;
  if (!shouldApply) { $done({}); return; }

  // ——————————————————————————————
  // 保护 | 识别并保护已签名制式的 Authorization
  // ——————————————————————————————
  // 避免覆盖云存储/云日志等已签名头：OSS / AWS4-HMAC-SHA256 / Qiniu / COS / Azure 等
  var PROTECT_PREFIX = [
    'oss ',                    // 阿里云 OSS
    'aws4-hmac-sha256 ',       // AWS SigV4
    'qiniu ',                  // 七牛
    'cos ',                    // 腾讯云 COS（少见放在 Authorization 前缀，但一并保护）
    'sharedkey ',              // Azure（简化处理）
    'hmac ', 'signature '      // 兜底其他可能前缀
  ];

  var inHeaders = ($request.headers || {});
  var lowerMap = {};
  Object.keys(inHeaders).forEach(function (k) { lowerMap[k.toLowerCase()] = k; });

  var existingAuth = inHeaders[ lowerMap['authorization'] ];
  if (existingAuth) {
    var ea = String(existingAuth).toLowerCase();
    for (var i = 0; i < PROTECT_PREFIX.length; i++) {
      if (ea.startsWith(PROTECT_PREFIX[i])) {
        // 命中保护前缀，不覆盖，直接退出
        try { console.log('[AbaloneBox][SKIP] 保护已签名 Authorization（' + PROTECT_PREFIX[i].trim().toUpperCase() + '）：' + host); } catch(e){}
        $done({}); return;
      }
    }
  }

  // ——————————————————————————————
  // 处理 | 规范化 Token（自动补全 Bearer）
  // ——————————————————————————————
  var outToken = TOKEN.trim();
  if (!/^(bearer|basic|digest|hmac|token)\s+/i.test(outToken)) {
    // 没有任何前缀，且常见是 Bearer，自动补全
    outToken = 'Bearer ' + outToken;
  }

  // ——————————————————————————————
  // 输出 | 写回新的请求头（仅写目标头名，避免多处冲突）
  // ——————————————————————————————
  var outHeaders = {};
  // 复制原始头，删除目标头（大小写统一）
  Object.keys(inHeaders).forEach(function (k) {
    if (k.toLowerCase() === HDR_NAME) return;
    outHeaders[k] = inHeaders[k];
  });
  outHeaders[HDR_NAME] = outToken;

  try { console.log('[AbaloneBox][SET] ' + HDR_NAME + ' => ' + outToken + ' | ' + url); } catch(e){}
  $done({ headers: outHeaders });
})();
