/**
 * 京东比价 · 统一渲染器（秒加载 / 互斥 / 去重 / 缓存优先）
 * Author: ByteValley
 *
 * argument:
 *   action=token                 // 仅用于慢慢买 token 获取（挂在 manmanbuy 域的某些请求上）
 *   mode=table|raw|line|popup    // 指定样式；或用 table/raw/line/popup 布尔开关
 *   table=true|false             // 布尔开关：表格
 *   raw=true|false               // 布尔开关：原始
 *   line=true|false              // 布尔开关：折线
 *   popup=true|false             // 布尔开关：弹窗
 *   hideTable=true|false         // 折线是否隐藏表格
 *   cacheHours=24                // 本地缓存时长（预留）
 */

(function () {
  const isResponse = typeof $response !== 'undefined';
  const isRequest  = typeof $request  !== 'undefined' && typeof $response === 'undefined';

  // ---------- 参数解析 ----------
  const ARG = (function parseArg(s) {
    const out = {};
    if (!s) return out;
    try {
      s.split(/[&]/).forEach(kv => {
        const [k, ...rest] = kv.split('=');
        if (!k) return;
        out[decodeURIComponent(k.trim())] = decodeURIComponent(rest.join('=').trim());
      });
    } catch (e) {}
    return out;
  })(
    (typeof $argument === 'string') ? $argument :
    ($argument && typeof $argument === 'object') ? Object.entries($argument).map(([k,v])=>`${k}=${v}`).join('&') : ''
  );

  // ---------- 布尔开关 → MODE ----------
  const BOOL = (v) => String(v || '').toLowerCase() === 'true';
  const FLAG = {
    table: BOOL(ARG.table),
    raw  : BOOL(ARG.raw),
    line : BOOL(ARG.line),
    popup: BOOL(ARG.popup),
  };
  const PICK_BY_FLAG = () => {
    if (FLAG.table) return 'table';
    if (FLAG.line)  return 'line';
    if (FLAG.raw)   return 'raw';
    if (FLAG.popup) return 'popup';
    return '';
  };
  const MODE        = ((ARG.mode || '').toLowerCase() || PICK_BY_FLAG() || 'table');
  const HIDE_TABLE  = BOOL(ARG.hideTable);
  const CACHE_HOURS = Math.max(1, parseInt(ARG.cacheHours || '24', 10));
  const ACTION      = ARG.action || '';

  // ---------- 工具 ----------
  const store = {
    get(k){ try { return JSON.parse($persistentStore.read(k) || 'null'); } catch(e){ return null; } },
    set(k,v){ try { $persistentStore.write(JSON.stringify(v), k); } catch(e){} },
    del(k){ try { $persistentStore.write('', k); } catch(e){} }
  };
  const now = () => Date.now();
  const ttlMs = CACHE_HOURS * 3600 * 1000;

  function log(){ try { console.log('[JDPricePlus]', ...arguments); } catch(e){} }
  function notify(t, s, b){ try { $notify(t, s || '', b || ''); } catch(e){} }

  // ---------- SKU 提取 ----------
  const url = ($request && $request.url) || ($response && $response.url) || '';
  function extractSku(u){
    try {
      const m = u.match(/\/graphext\/(\d+)\.html/);
      if (m) return m[1];
      const n = u.match(/\/(\d+)\.html/);
      if (n) return n[1];
    } catch(e){}
    return '';
  }
  const sku = extractSku(url);
  const cacheKey = sku ? `JD_PRICE_CACHE_${sku}` : '';

  // ---------- Token 获取专用 ----------
  if (ACTION === 'token') {
    // 给你明确提示 + 日志
    notify('京东比价', '慢慢买 Cookie 捕获', (url || '').slice(0,120));
    log('TOKEN_HIT', url);
    store.set('JD_PRICE_TOKEN_HIT', { t: now(), url });
    return $done({});
  }

  // ---------- response：注入占位 + 异步加载外部脚本 ----------
  if (isResponse) {
    let body = $response.body;
    if (!body || typeof body !== 'string') return $done($response);

    if (body.includes('__JD_PRICE_SENTINEL__') || body.includes('id="jd-price-box"')) {
      log('sentinel exists, skip inject');
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

  var urls = {
    table: 'https://fastly.jsdelivr.net/gh/githubdulong/Script@master/jd_price.js',
    raw  : 'https://fastly.jsdelivr.net/gh/wf021325/qx@master/js/jd_price.js',
    line : 'https://fastly.jsdelivr.net/gh/mw418/Loon@main/script/jd_price2.js',
    popup: 'https://fastly.jsdelivr.net/gh/mw418/Loon@main/script/jd_price.js'
  };
  var chosen = urls[(window.__JD_PRICE_MODE__||'table')] || urls.table;

  function load(u, cb){
    var s = document.createElement('script');
    s.src = u; s.defer = true; s.onload = function(){ cb(true); };
    s.onerror = function(){ cb(false); };
    document.head.appendChild(s);
  }

  var timeout = setTimeout(function(){
    try{
      var tip = document.querySelector('#jd-price-box');
      if(tip){ tip.style.opacity='0.7'; tip.innerHTML='💴 价格趋势 · 暂无最新数据（稍后再试）'; }
    }catch(e){}
  }, 3500);

  load(chosen, function(ok){
    clearTimeout(timeout);
    if (!ok) {
      try{ var tip = document.querySelector('#jd-price-box'); if(tip){ tip.innerHTML='💴 价格趋势 · 脚本加载失败'; } }catch(e){}
      return;
    }
    try{
      var nodes = Array.from(document.querySelectorAll('#jd-price-box, .history_price, .price_trend, .price-box'));
      if (nodes.length > 1) {
        for (var i=1;i<nodes.length;i++){
          if (!nodes[i]) continue;
          if (nodes[i].id === 'jd-price-box') continue;
          if (nodes[i].parentNode) nodes[i].parentNode.removeChild(nodes[i]);
        }
      }
    }catch(e){}
  });
})();
</script>`;

    if (body.includes('</body>')) {
      body = body.replace('</body>', inject + '\n</body>');
    } else {
      body += inject;
    }
    return $done({ body });
  }

  // ---------- request 或 popup：弹窗摘要（不阻塞页面） ----------
  if (isRequest || MODE === 'popup') {
    const cached = cacheKey ? store.get(cacheKey) : null;
    if (cached && cached.t && (now() - cached.t < ttlMs)) {
      notify('京东比价（缓存）', 'SKU: ' + (sku || '未知'), cached.msg || '最近价格摘要');
    } else {
      notify('京东比价', 'SKU: ' + (sku || '未知'), '正在获取数据… 页面不受影响');
    }
    return $done({});
  }

  return $done({});
})();
