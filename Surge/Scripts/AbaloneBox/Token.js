/*
 * 脚本功能：鲍鱼盒子18+，支持外部参数传递token
 * 脚本作者：基于@WeiGiegie脚本解密重写
 * 更新时间：2025年9月10日
 * 电报频道：https://t.me/GieGie777
 * 使用声明：此脚本仅供学习与交流，请在下载使用24小时内删除！
 *
 * 配置文件示例：
 * [Script]
 * # 鲍鱼盒子增强
 * 鲍鱼盒子增强 = type=http-request, pattern=^https?:\/\/.+\/api\/(video\/report_item?|live\/room\/detail?|video\/related?|video\/detail|socialposts_info|my\/profile), script-path=https://raw.githubusercontent.com/你的用户名/你的仓库/path/to/DecryptedScript.js, argument=token=baoyuvip
 *
 *
 *
 * 用途：为匹配到的请求设置 Authorization 头，token 通过外部参数传入
 * 只处理请求阶段；未提供 token 时不做任何修改
 *
 * 传参方式（任选其一）：
 * 1) argument=token=Bearer%20xxxx
 * 2) argument=token=xxxx                // 自动补上 "Bearer "
 *
 * 也兼容 $argument 为对象：{ "token": "xxxx" } 或 { "token": "Bearer xxxx" }
 */

(function () {
  // 仅处理请求阶段
  if (typeof $response !== 'undefined') { $done({}); return; } else {
    try {
      console.log('[byhz][hit] ' + ($request && $request.url));
    } catch (e) {}
    $done({});
  }

  // 读取并解析参数
  var TOKEN = '';
  try {
    if (typeof $argument === 'string') {
      // 例：token=Bearer%20xxxx&foo=bar 或 token=xxxx;foo=bar
      var dec = decodeURIComponent($argument);
      dec.split(/[&;,]/).forEach(function (pair) {
        var kv = pair.split('=');
        if (kv.length >= 2 && kv[0].trim() === 'token') {
          TOKEN = kv.slice(1).join('=').trim();
        }
      });
    } else if ($argument && typeof $argument === 'object') {
      TOKEN = ($argument.token || '').trim();
    }
  } catch (e) {}

  var headers = ($request && $request.headers) ? $request.headers : {};

  if (!TOKEN) {
    // 没传 token 就原样放行
    $done({ headers });
    return;
  }

  // 如果未带前缀就自动补上
  if (!/^Bearer\s+/i.test(TOKEN)) {
    TOKEN = 'Bearer ' + TOKEN;
  }

  // 找到已存在的 Authorization（大小写不敏感），没有就用标准写法
  var authKey = 'Authorization';
  for (var k in headers) {
    if (Object.prototype.hasOwnProperty.call(headers, k)) {
      if (String(k).toLowerCase() === 'authorization') { authKey = k; break; }
    }
  }

  headers[authKey] = TOKEN;
  $done({ headers });
})();
