// Abalone.param.injector.js
// 作用：对目标 CloudFront 接口自动注入/替换 query.param
// 优先使用缓存（abalone.param.latest），没有就用 FALLBACK（模块参数）
(function () {
  if (typeof $response !== 'undefined') { $done({}); return; }
  if (!$request || !$request.url) { $done({}); return; }

  const arg = typeof $argument === 'string' ? $argument : '';
  const pick = (k, d='') => {
    if (!arg) return d;
    for (const seg of arg.split(/[&;,]/)) {
      const i = seg.indexOf('=');
      const kk = (i>=0?seg.slice(0,i):seg).trim();
      const vv = (i>=0?seg.slice(i+1):'').trim();
      if (kk === k) return vv;
    }
    return d;
  };
  const PATHS = (pick('PATHS','/api/shop/getAppInfo') || '').split('|').filter(Boolean);
  const FALLBACK = pick('FALLBACK','');

  try {
    const u = new URL($request.url);
    if (!/\.cloudfront\.net$/i.test(u.host)) { $done({}); return; }
    if (PATHS.length && !PATHS.some(p => u.pathname.startsWith(p))) { $done({}); return; }

    const cached = ($persistentStore.read('abalone.param.latest') || '').trim();
    const chosen = cached || FALLBACK;
    if (!chosen) { $done({}); return; }

    u.searchParams.delete('param');
    u.searchParams.append('param', chosen);
    const newUrl = u.toString();
    if (newUrl !== $request.url) console.log('[Abalone][Injector] param injected @ ' + u.pathname);
    $done({ url: newUrl });
  } catch (e) {
    console.log('[Abalone][Injector][ERR] ' + e.message);
    $done({});
  }
})();
