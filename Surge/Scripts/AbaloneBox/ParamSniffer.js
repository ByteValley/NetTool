// Abalone.param.sniffer.js
// 作用：捕获 *.cloudfront.net/api/shop/getAppInfo?param=... 的完整 param 并缓存
// 存储键：abalone.param.latest
(function () {
  if (typeof $response !== 'undefined') { $done({}); return; }
  if (!$request || !$request.url) { $done({}); return; }
  try {
    const u = new URL($request.url);
    if (!/\.cloudfront\.net$/i.test(u.host)) { $done({}); return; }
    if (!/^\/api\/shop\/getAppInfo$/i.test(u.pathname)) { $done({}); return; }
    const p = u.searchParams.get('param');
    if (p) {
      $persistentStore.write(p, 'abalone.param.latest');
      const m = p.length > 18 ? p.slice(0,9) + '...' + p.slice(-7) : p;
      console.log('[Abalone][Sniffer] saved param=' + m);
    }
  } catch (e) { console.log('[Abalone][Sniffer][ERR] ' + e.message); }
  $done({});
})();
