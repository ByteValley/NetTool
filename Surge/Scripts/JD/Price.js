/**
 * 京东比价 · 秒加载统一脚本（原始 / 表格 / 折线 / 弹窗 + 获取token）
 * Author: ByteValley
 *
 * argument 参数（Surge/Loon 规则里传）：
 *   action=token                 // 仅用于慢慢买 token 捕获（挂在 http-request 规则上）
 *   mode=table|raw|line|popup    // 指定样式（单值）；或用布尔开关
 *   table=true|false             // 表格模式（与 raw/line 互斥，脚本会按优先级选一）
 *   raw=true|false               // 原始模式
 *   line=true|false              // 折线模式
 *   popup=true|false             // 弹窗模式（不改页面，直接通知）
 *   hideTable=true|false         // 折线是否隐藏表格
 *   cacheHours=24                // 预留缓存参数（当前未强依赖）
 */

(function () {
  const isResp = typeof $response !== 'undefined';
  const isReq  = typeof $request  !== 'undefined' && typeof $response === 'undefined';

  const url = ($request && $request.url) || ($response && $response.url) || '';
  const notify = (t, s, b) => { try { $notify(t, s || '', b || ''); } catch(e){} };
  const BOOL = v => String(v || '').toLowerCase() === 'true';
  const now  = () => Date.now();

  // -------- 参数解析：同时支持 , 和 &
  const ARG = (()=>{
    const out = {};
    const s =
      typeof $argument === 'string' ? $argument :
      ($argument && typeof $argument === 'object')
        ? Object.entries($argument).map(([k,v]) => `${k}=${v}`).join('&') : '';
    if (!s) return out;
    (s || '').split(/[,&]/).forEach(kv => {
      const i = kv.indexOf('=');
      if (i < 0) return;
      const k = decodeURIComponent(kv.slice(0, i).trim());
      const v = decodeURIComponent(kv.slice(i + 1).trim());
      if (k) out[k] = v;
    });
    return out;
  })();

  // -------- 模式选择：mode 优先；否则按布尔优先级 table > line > raw > popup
  const FLAG = { table: BOOL(ARG.table), raw: BOOL(ARG.raw), line: BOOL(ARG.line), popup: BOOL(ARG.popup) };
  const pickByFlag = () => (FLAG.table && 'table') || (FLAG.line && 'line') || (FLAG.raw && 'raw') || (FLAG.popup && 'popup') || '';
  const MODE       = (ARG.mode || '').toLowerCase() || pickByFlag() || 'table';
  const HIDE_TABLE = BOOL(ARG.hideTable);
  const ACTION     = ARG.action || '';
  const CACHE_H    = Math.max(1, parseInt(ARG.cacheHours || '24', 10)); // 预留

  // -------- SKU 提取
  const sku = (()=>{
    try {
      const m = url.match(/\/graphext\/(\d+)\.html/);
      if (m) return m[1];
      const n = url.match(/\/(\d+)\.html/);
      if (n) return n[1];
    } catch(e){}
    return '';
  })();

  // ===================== 1) Token 捕获（慢慢买） =====================
  // 放在 http-request 规则上，argument=action=token
  if (isReq && ACTION === 'token') {
    if (/\/baoliao\/center\/menu($|\?)/.test(url)) {
      const body = $request.body || '';
      try { $persistentStore.write(body || '', 'manmanbuy_val'); } catch(e){}
      try {
        const params = new URLSearchParams(body);
        const devId  = params.get('c_mmbDevId') || '';
        if (devId) $persistentStore.write(devId, '慢慢买CK');
        notify('京东比价', '获取 ck 成功 🎉', devId ? ('c_mmbDevId=' + devId) : '已写入 manmanbuy_val');
      } catch (e) {
        notify('京东比价', '获取 ck（解析失败）', (body || '').slice(0, 120));
      }
    }
    return $done({});
  }

  // ===================== 2) 弹窗模式（request 阶段，不阻塞） =====================
  if (isReq && MODE === 'popup') {
    notify('京东比价（弹窗）', sku ? ('SKU: ' + sku) : 'SKU 未识别', '正在获取价格数据…（不影响页面）');
    return $done({});
  }

  // ===================== 3) 页内嵌渲染（response 阶段） =====================
  if (!isResp || !$response.body || typeof $response.body !== 'string') {
    return $done(isResp ? $response : {});
  }

  let body = $response.body;

  // 已注入过就跳过（杜绝重复注入）
  if (body.includes('__JD_PRICE_SENTINEL__') || body.includes('id="jd-price-box"')) {
    return $done($response);
  }

  // 外部脚本地址（可改成你自托管）
  const URLS = {
    table: 'https://fastly.jsdelivr.net/gh/githubdulong/Script@master/jd_price.js',
    raw  : 'https://fastly.jsdelivr.net/gh/wf021325/qx@master/js/jd_price.js',
    line : 'https://fastly.jsdelivr.net/gh/mw418/Loon@main/script/jd_price2.js'
  };
  const chosen = URLS[MODE] || URLS.table;

  const inject = `
<script>
(function(){
  if (window.__JD_PRICE_SENTINEL__) return; window.__JD_PRICE_SENTINEL__ = true;
  window.__JD_PRICE_MODE__ = ${JSON.stringify(MODE)};
  window.__JD_PRICE_HIDE_TABLE__ = ${HIDE_TABLE ? 'true' : 'false'};
  window.__JD_PRICE_SKU__ = ${JSON.stringify(sku || '')};

  // 1) CSS：强力去重（隐藏第 2 份起）
  document.addEventListener('DOMContentLoaded', function(){
    try{
      var style = document.createElement('style');
      style.setAttribute('data-jd-price','dedupe');
      style.textContent = [
        '.history_price:not(:first-of-type){display:none!important;}',
        '.price_trend:not(:first-of-type){display:none!important;}',
        '.price-box:not(:first-of-type){display:none!important;}',
        '.pp-box:not(:first-of-type){display:none!important;}',
        '.pp-wrap:not(:first-of-type){display:none!important;}',
        ${HIDE_TABLE ? "'.history_price{display:none!important;}'," : ''}
      ].join('\\n');
      document.head.appendChild(style);
    }catch(e){}
  });

  // 2) 秒显占位（不阻塞页面）
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

  // 3) 异步加载对应脚本
  var chosen = ${JSON.stringify(chosen)};
  function load(u, cb){
    var s = document.createElement('script');
    s.src = u; s.defer = true;
    s.onload = function(){ cb(true); };
    s.onerror = function(){ cb(false); };
    document.head.appendChild(s);
  }

  // 4) 3.5s 超时降级：不再等待
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
    // 5) 观察 DOM，再次去重
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
        mo.observe(document.documentElement, { childList: true, subtree: true });
      });
    }catch(e){}
  });
})();
</script>`;

  body = body.includes('</body>') ? body.replace('</body>', inject + '\n</body>') : (body + inject);
  return $done({ body });
})();
