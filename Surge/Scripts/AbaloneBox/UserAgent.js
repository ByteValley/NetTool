/*
*
*
脚本功能：鲍鱼盒子18+
软件版本：
下载地址：无法变身或者无网络拷贝右边数字符号重新打开👉~@85910590@~👈
脚本作者：
更新时间：2025
电报频道：https://t.me/GieGie777
问题反馈：
使用声明：此脚本仅供学习与交流，请在下载使用24小时内删除！请勿在中国大陆转载与贩卖！
*******************************
[rewrite_local]
# >鲍鱼盒子18+
^https?:\/\/.+\/api\/(video\/report_item?|live\/room\/detail?|video\/related?|video\/detail|socialposts_info|my\/profile) url script-request-header https://raw.githubusercontent.com/WeiGiegie/666/main/byhz.js, argument=userAgent=baoyuvip
^https?://siajksslwiso\.anningsh\.com/report url reject-200

[mitm] 
hostname = w1c2.ooat88.com,tu.dfgfdg.win,103.44.236.*,*.artrg.cn,vkfqb.ojyrz.com,byapi.*.com,211.99.98.*,103.39.222.*,yubaoyu.oss-cn-shenzhen.aliyuncs.com,*api.h8h4h.com,42.157.129.25,siajksslwiso.anningsh.com,211.99.98.63,111.180.204.11,88.gbvdfe.com,vkfqb.ojyrz.com,211.99.98.*,vdop.fqoas.com,ica.ooat88.com
*
*
*/
(function() {
  // Only process request headers
  if (typeof $response !== 'undefined') {
    $done({});
    return;
  }

  let userAgentValue = '';
  const defaultAgent = 'baoyuvip';

  // Handle $argument, which can be a string or an object
  try {
    if (typeof $argument === 'string') {
      // e.g. userAgent=baoyuvip&foo=bar or userAgent=baoyuvip;foo=bar
      const decodedArg = decodeURIComponent($argument);
      decodedArg.split(/[&;,]/).forEach(pair => {
        const [key, value] = pair.split('=');
        if (key && key.trim() === 'userAgent') {
          userAgentValue = value ? value.trim() : defaultAgent;
        }
      });
    } else if ($argument && typeof $argument === 'object') {
      userAgentValue = $argument.userAgent || defaultAgent;
    } else {
      userAgentValue = defaultAgent;
    }
  } catch (e) {
    userAgentValue = defaultAgent;
  }

  // If no user agent value is found, use the default
  if (!userAgentValue) {
    try {
      console.log('[byhz][WARN] Failed to get user agent value. Using default.');
    } catch (e) {}
    userAgentValue = defaultAgent;
  }

  // Get current headers
  const inHeaders = ($request && $request.headers) ? $request.headers : {};
  const outHeaders = {};

  // Copy existing headers, avoiding duplicate User-Agent
  for (const k in inHeaders) {
    if (Object.prototype.hasOwnProperty.call(inHeaders, k)) {
      if (k.toLowerCase() === 'user-agent') {
        continue;
      }
      outHeaders[k] = inHeaders[k];
    }
  }

  // Set the new User-Agent
  outHeaders['User！-Agent'] = userAgentValue;

  try {
    console.log(`[byhz][REQ] set User-Agent => ${userAgentValue} | ${$request && $request.url}`);
  } catch (e) {}
  
  $done({ headers: outHeaders });
})();
