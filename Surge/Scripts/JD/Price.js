/**
 * 京东比价 · 秒加载统一脚本（原始 / 表格 / 折线 / 弹窗 + 获取token）
 * Author: ByteValley
 *
 * 传参（argument）：
 *   action=token                 // 仅用于慢慢买 token 捕获（配在 http-request 规则上）
 *   mode=table|raw|line|popup    // 指定样式（单值）；或用布尔开关
 *   table=true|false             // 表格模式开关（与 raw/line 互斥，脚本会按优先级选一）
 *   raw=true|false               // 原始模式
 *   line=true|false              // 折线模式
 *   popup=true|false             // 弹窗模式（不改页面，直接通知）
 *   hideTable=true|false         // 折线模式是否隐藏表格（通过 CSS 处理）
 *   cacheHours=24                // 预留：本地缓存时长（目前仅保留接口）
 *
 * 使用方式：
 *   1) http-request 命中  apapia-sqk-weblogic.manmanbuy.com/baoliao/center/menu
 *      argument=action=token   ——> 会弹“获取 ck 成功”并持久化
 *   2) http-response 命中  in.m.jd.com/product/graphext/xxx.html
 *      argument=table=...&raw=...&line=...&popup=...&hideTable=...
 *      ——> 秒显占位 + 异步加载第三方脚本；CSS + 观察器去重；>3.5s 降级不阻塞
 */

(function () {
  const isResp = typeof $response !== 'undefined';
  const isReq  = typeof $request  !== 'undefined' && typeof $response === 'undefined';

  // ---------- 工具 ----------
  const notify = (t, s, b) => { try { $notify(t, s || '', b || ''); } catch(e){} };
  const log    = (...a) => { try { console.log('[JD-INSTANT]', ...a); } catch(e){} };
  const now    = () => Date.now();

  // ---------- 参数解析 ----------
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

  // 单值或布尔开关 → 最终模式
  const FLAG = {
    table: BOOL(ARG.table),
    raw  : BOOL(ARG.raw),
    line : BOOL(ARG.line),
    popup: BOOL(ARG.popup),
  };
  const pickByFlag = () =>
    (FLAG.table && 'table') ||
    (FLAG.line  && 'line')  ||
    (FLAG.raw   && 'raw')   ||
    (FLAG.popup && 'popup') || '';

  const MODE       = (ARG.mode || '').toLowerCase() || pickByFlag() || 'table';
  const HIDE_TABLE = BOOL(ARG.hideTable);
  const CACHE_H    = Math.max(1, parseInt(ARG.cacheHours || '24', 10));
  const ACTION     = ARG.action || '';

  // ---------- URL / SKU ----------
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

  // ---------- 慢慢买 token 捕获 ----------
  if (isReq && ACTION === 'token') {
    // 仅当命中 /baoliao/center/menu 且带 body（与你“能用的旧配置”一致）
    const pathOK = /\/baoliao\/center\/menu($|\?)/.test(url);
    if (pathOK) {
      const body = $request.body || '';
      // 存整段 body
      try { $persistentStore.write(body || '', 'manmanbuy_val'); } catch(e){}
      // 解析 c_mmbDevId
      try {
        const params = new URLSearchParams(body);
        const devId  = params.get('c_mmbDevId') || '';
        if (devId) $persistentStore.write(devId, '慢慢买CK');
        notify('京东比价', '获取 ck 成功 🎉', devId ? ('c_mmbDevId=' + devId) : body.slice(0,120));
      } catch(e) {
        notify('京东比价', '获取 ck（解析失败）', body.slice(0,120));
      }
    }
    return $done({});
  }

  // ---------- 弹窗模式（不改页面，绝不阻塞） ----------
  if (isReq && MODE === 'popup') {
    notify('京东比价', sku ? ('SKU: ' + sku) : 'SKU 未识别', '正在获取价格数据…（不影响页面）');
    return $done({});
  }

  // ---------- response：页内嵌（原始/表格/折线） ----------
  if (!isResp || !$response.body || typeof $response.body !== 'string') {
    return $done(isResp ? $response : {});
  }

  let body = $response.body;

  // 已注入过就不再来一次（杜绝“双表格”）
  if (body.includes('__JD_PRICE_SENTINEL__') || body.includes('id="jd-price-box"')) {
    return $done($response);
  }

  // 外部脚本（按模式异步加载；你可换成自托管）
  const URLS = {
    table: 'https://fastly.jsdelivr.net/gh/githubdulong/Script@master/jd_price.js',
    raw  : 'https://fastly.jsdelivr.net/gh/wf021325/qx@master/js/jd_price.js',
    line : 'https://fastly.jsdelivr.net/gh/mw418/Loon@main/script/jd_price2.js'
  };
  const chosen = URLS[MODE] || URLS.table;

  const inject = `
<script>
(function(){
  if (window.__JD_PRICE_SENTINEL__) return;
  window.__JD_PRICE_SENTINEL__ = true;
  window.__JD_PRICE_MODE__ = ${JSON.stringify(MODE)};
  window.__JD_PRICE_HIDE_TABLE__ = ${HIDE_TABLE ? 'true' : 'false'};
  window.__JD_PRICE_SKU__ = ${JSON.stringify(sku || '')};

  // 1) CSS：强力去重（把第 2 份起的相同组件隐藏）
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

  // 3) 异步加载第三方脚本
  var chosen = ${JSON.stringify(chosen)};
  function load(u, cb){
    var s = document.createElement('script');
    s.src = u; s.defer = true;
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
    // 4) 观察 DOM，再做一次去重
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
