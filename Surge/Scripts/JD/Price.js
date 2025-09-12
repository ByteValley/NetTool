/**
 * 京东比价 · 秒加载统一脚本（原始 / 表格 / 折线 / 弹窗）
 * - 互斥：只渲染一种样式（按 mode 或布尔开关决定）
 * - 秒显：先注入占位，不阻塞页面；再异步加载外部脚本
 * - 去重：哨兵 + CSS + 观察器，杜绝“双表格”
 * - 降级：外部脚本 >3.5s 未就绪则轻提示，不卡页面
 * - Token：action=token 时弹通知，便于确认命中
 *
 * argument 支持：
 *   action=token
 *   mode=table|raw|line|popup   // 指定样式（单值）
 *   或布尔：table=true/raw=true/line=true/popup=true（按优先级挑一个）
 *   hideTable=true|false        // 折线是否隐藏表格
 *   cacheHours=24               // 预留本地缓存时长
 */

(function () {
  const isResp = typeof $response !== 'undefined';
  const isReq  = typeof $request  !== 'undefined' && typeof $response === 'undefined';

  // -------- 参数解析 --------
  const ARG = (function (s) {
    const out = {};
    if (!s) return out;
    try {
      s.split('&').forEach(kv => {
        const i = kv.indexOf('=');
        if (i < 0) return;
        const k = decodeURIComponent(kv.slice(0, i).trim());
        const v = decodeURIComponent(kv.slice(i + 1).trim());
        out[k] = v;
      });
    } catch (e) {}
    return out;
  })(
    typeof $argument === 'string'
      ? $argument
      : $argument && typeof $argument === 'object'
      ? Object.entries($argument).map(([k, v]) => `${k}=${v}`).join('&')
      : ''
  );

  const BOOL = v => String(v || '').toLowerCase() === 'true';

  // 布尔开关 → 模式
  const FLAG = {
    table: BOOL(ARG.table),
    raw  : BOOL(ARG.raw),
    line : BOOL(ARG.line),
    popup: BOOL(ARG.popup),
  };
  const pickByFlag = () => (FLAG.table && 'table') || (FLAG.line && 'line') || (FLAG.raw && 'raw') || (FLAG.popup && 'popup') || '';
  const MODE       = (ARG.mode || '').toLowerCase() || pickByFlag() || 'table';
  const HIDE_TABLE = BOOL(ARG.hideTable);
  const CACHE_H    = Math.max(1, parseInt(ARG.cacheHours || '24', 10));
  const ACTION     = ARG.action || '';

  // 工具
  const notify = (t, s, b) => { try { $notify(t, s || '', b || ''); } catch(e){} };
  const now = () => Date.now();

  // URL / SKU
  const url = ($request && $request.url) || ($response && $response.url) || '';
  const sku = (function(u){
    try {
      const m = u.match(/\/graphext\/(\d+)\.html/);
      if (m) return m[1];
      const n = u.match(/\/(\d+)\.html/);
      if (n) return n[1];
    } catch(e){}
    return '';
  })(url);

  // -------- Token 捕获分支 --------
  if (ACTION === 'token') {
    notify('京东比价', '捕获慢慢买请求', url);
    try { $persistentStore.write(JSON.stringify({t: now(), url}), 'JD_PRICE_TOKEN_HIT'); } catch(e){}
    return $done({});
  }

  // -------- 弹窗模式（request 或显式 popup）不阻塞页面 --------
  if (isReq || MODE === 'popup') {
    notify('京东比价', sku ? ('SKU: ' + sku) : 'SKU 未识别', '正在获取价格数据…（不影响页面）');
    return $done({});
  }

  // -------- response：注入占位 + 外部脚本 + 去重 --------
  if (!isResp || !$response.body || typeof $response.body !== 'string') return $done($response);

  let body = $response.body;

  // 已注入则跳过
  if (body.includes('__JD_PRICE_SENTINEL__') || body.includes('id="jd-price-box"')) {
    return $done($response);
  }

  const inject = `
<script>
(function(){
  if (window.__JD_PRICE_SENTINEL__) return;
  window.__JD_PRICE_SENTINEL__ = true;
  window.__JD_PRICE_MODE__ = ${JSON.stringify(MODE)};
  window.__JD_PRICE_HIDE_TABLE__ = ${HIDE_TABLE ? 'true' : 'false'};
  window.__JD_PRICE_SKU__ = ${JSON.stringify(sku || '')};

  // 1) CSS：强力去重（隐藏第 2 份起）
  try{
    var style = document.createElement('style');
    style.setAttribute('data-jd-price','dedupe');
    style.textContent = [
      '.history_price:not(:first-of-type){display:none!important;}',
      '.price_trend:not(:first-of-type){display:none!important;}',
      '.price-box:not(:first-of-type){display:none!important;}',
      '.pp-box:not(:first-of-type){display:none!important;}',
      '.pp-wrap:not(:first-of-type){display:none!important;}'
    ].join('\\n');
    document.addEventListener('DOMContentLoaded', function(){ document.head.appendChild(style); });
  }catch(e){}

  // 2) 秒显占位
  try{
    var box = document.createElement('div');
    box.id = 'jd-price-box';
    box.style.cssText = 'margin:12px 12px 0;padding:10px;border:1px solid #eee;border-radius:8px;font-size:14px;background:#fff';
    box.innerHTML = '<div style="opacity:.85">💴 价格趋势 · 正在获取…（不影响页面）</div>';
    document.addEventListener('DOMContentLoaded', function(){
      var mount = document.querySelector('#app') || document.body;
      (mount||document.body).insertBefore(box, mount.firstChild);
    });
  }catch(e){}

  // 3) 异步加载对应脚本（可改自托管）
  var urls = {
    table: 'https://fastly.jsdelivr.net/gh/githubdulong/Script@master/jd_price.js',
    raw  : 'https://fastly.jsdelivr.net/gh/wf021325/qx@master/js/jd_price.js',
    line : 'https://fastly.jsdelivr.net/gh/mw418/Loon@main/script/jd_price2.js'
  };
  var chosen = urls[(window.__JD_PRICE_MODE__||'table')] || urls.table;

  function load(u, cb){
    var s = document.createElement('script');
    s.src = u;
    s.defer = true;
    s.onload = function(){ cb(true); };
    s.onerror = function(){ cb(false); };
    document.head.appendChild(s);
  }

  var timeout = setTimeout(function(){
    var tip = document.querySelector('#jd-price-box');
    if(tip){ tip.style.opacity='0.7'; tip.innerHTML='💴 价格趋势 · 暂无最新数据（稍后再试）'; }
  }, 3500);

  load(chosen, function(ok){
    clearTimeout(timeout);
    if (!ok) {
      var tip = document.querySelector('#jd-price-box');
      if(tip){ tip.innerHTML='💴 价格趋势 · 外部脚本加载失败'; }
      return;
    }
    // 4) 观察 DOM，若仍出现重复则移除后续
    try{
      var SEL = ['#jd-price-box','.history_price','.price_trend','.price-box','.pp-box','.pp-wrap'];
      function dedupe(){
        var nodes = [];
        SEL.forEach(function(s){ nodes = nodes.concat(Array.from(document.querySelectorAll(s))); });
        if (nodes.length > 1){
          var keep = nodes[0];
          for (var i=1;i<nodes.length;i++){
            var n = nodes[i];
            if (!n || n === keep) continue;
            if (n.parentNode) n.parentNode.removeChild(n);
          }
        }
      }
      document.addEventListener('DOMContentLoaded', function(){
        setTimeout(dedupe, 300);
        var mo = new MutationObserver(function(){ setTimeout(dedupe, 120); });
        mo.observe(document.documentElement, { childList:true, subtree:true });
      });
    }catch(e){}
  });
})();
</script>`;

  body = body.includes('</body>') ? body.replace('</body>', inject + '\n</body>') : (body + inject);
  return $done({ body });
})();
