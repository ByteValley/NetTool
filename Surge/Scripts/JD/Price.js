/** 
 * 京东比价 · 统一渲染器（秒加载/互斥/去重/缓存优先）
 * Author: ByteValley
 * Mode:
 *   - argument=action=token                 // 仅处理慢慢买 token 获取并持久化
 *   - argument=mode=table|raw|line|popup    // 样式模式
 *   - argument=hideTable=true|false         // 折线模式是否隐藏表格
 *   - argument=cacheHours=24                // 缓存时长（小时）
 *
 * 外部脚本（按需异步加载，若你有自研接口可替换）：
 *   TABLE: https://fastly.jsdelivr.net/gh/githubdulong/Script@master/jd_price.js
 *   RAW  : https://fastly.jsdelivr.net/gh/wf021325/qx@master/js/jd_price.js
 *   LINE : https://fastly.jsdelivr.net/gh/mw418/Loon@main/script/jd_price2.js
 *   POPUP: https://fastly.jsdelivr.net/gh/mw418/Loon@main/script/jd_price.js  // 仅用于需要时
 */

(function () {
  const isResponse = typeof $response !== 'undefined';
  const isRequest = typeof $request !== 'undefined' && typeof $response === 'undefined';

  // --------- 参数解析 ---------
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

  const MODE = (ARG.mode || '').toLowerCase();           // table | raw | line | popup
  const HIDE_TABLE = String(ARG.hideTable || '').toLowerCase() === 'true';
  const CACHE_HOURS = Math.max(1, parseInt(ARG.cacheHours || '24', 10));
  const ACTION = ARG.action || '';

  // --------- 常量 & 工具 ---------
  const store = {
    get(k){ try { return JSON.parse($persistentStore.read(k) || 'null'); } catch(e){ return null; } },
    set(k,v){ try { $persistentStore.write(JSON.stringify(v), k); } catch(e){} },
    del(k){ try { $persistentStore.write('', k); } catch(e){} }
  };
  const now = () => Date.now();
  const ttlMs = CACHE_HOURS * 3600 * 1000;

  function log(...a){ try { console.log('[JDPricePlus]', ...a); } catch(e){} }
  function notify(title, sub, body){ try { $notify(title, sub, body); } catch(e){} }

  // SKU 从 URL 提取
  function extractSku(url){
    try {
      // graphext/123456.html
      const m = url.match(/\/graphext\/(\d+)\.html/);
      if (m) return m[1];
      // 兜底：item.jd.com/123456.html（若未来扩展）
      const n = url.match(/\/(\d+)\.html/);
      if (n) return n[1];
    } catch(e){}
    return '';
  }

  // --------- Token 获取专用 ---------
  if (ACTION === 'token') {
    // 这里只做“已命中慢慢买菜单接口”的标记；真实 token 仍由外部脚本获取
    store.set('JD_PRICE_TOKEN_HIT', { t: now(), url: ($request && $request.url) });
    return $done({});
  }

  const url = ($request && $request.url) || '';
  const sku = extractSku(url);
  const cacheKey = sku ? `JD_PRICE_CACHE_${sku}` : '';

  // --------- 把“秒加载”占位注入到页面（response 场景）---------
  if (isResponse) {
    // 防重复：全局哨兵。即便你误开多个版本，也只会渲染一次。
    const sentinel = 'window.__JD_PRICE_SENTINEL__';
    let body = $response.body;

    if (!body || typeof body !== 'string') {
      return $done($response);
    }

    if (body.indexOf('__JD_PRICE_SENTINEL__') !== -1 || body.indexOf('id="jd-price-box"') !== -1) {
      // 已注入过，直接返回，彻底杜绝“双表格”
      return $done($response);
    }

    const injectJS = `
<script>
(function(){
  if (window.__JD_PRICE_SENTINEL__) return;
  window.__JD_PRICE_SENTINEL__ = true;
  window.__JD_PRICE_MODE__ = ${JSON.stringify(MODE || 'table')};
  window.__JD_PRICE_HIDE_TABLE__ = ${HIDE_TABLE ? 'true' : 'false'};
  window.__JD_PRICE_SKU__ = ${JSON.stringify(sku || '')};

  // 占位：秒显，避免白屏
  try{
    var box = document.createElement('div');
    box.id = 'jd-price-box';
    box.style.cssText = 'margin:12px 12px 0;padding:10px;border:1px solid #eee;border-radius:8px;font-size:14px;';
    box.innerHTML = '<div style="opacity:.85">💴 价格趋势 · 正在获取…（不影响页面）</div>';
    document.addEventListener('DOMContentLoaded', function(){ 
      var mount = document.querySelector('#app,body') || document.body; 
      (mount||document.body).insertBefore(box, mount.firstChild);
    });
  }catch(e){}

  // 加载外部脚本（按模式）
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
    // 3.5s 超时：不再等待，以免卡体验；占位继续显示即可
    try{ var tip = document.querySelector('#jd-price-box'); if(tip){ tip.style.opacity='0.7'; tip.innerHTML='💴 价格趋势 · 暂无最新数据（稍后重试）'; } }catch(e){}
  }, 3500);

  load(chosen, function(ok){
    clearTimeout(timeout);
    if (!ok) {
      try{ var tip = document.querySelector('#jd-price-box'); if(tip){ tip.innerHTML='💴 价格趋势 · 加载脚本失败'; } }catch(e){}
      return;
    }
    // 去重策略：若外部脚本自己渲染了一套表格，保留一套即可
    try{
      var tables = Array.from(document.querySelectorAll('#jd-price-box, .history_price, .price_trend, .price-box'));
      if (tables.length > 1) {
        // 保留第一套，移除其余
        for (var i=1;i<tables.length;i++){
          if (tables[i] && tables[i].id === 'jd-price-box') continue;
          if (tables[i].parentNode) tables[i].parentNode.removeChild(tables[i]);
        }
      }
    }catch(e){}
  });
})();
</script>`;

    // 简单策略：在 </body> 前注入（若未找到则末尾追加）
    if (body.indexOf('</body>') !== -1) {
      body = body.replace('</body>', injectJS + '\n</body>');
    } else {
      body += injectJS;
    }

    return $done({ body });
  }

  // --------- 弹窗模式（request 不拦渲染，或 response 非 graphext 走摘要弹窗）---------
  if (isRequest || MODE === 'popup') {
    // 缓存优先：有缓存就直接弹，保证秒出；并后台刷新（这里预留）
    let cached = cacheKey ? store.get(cacheKey) : null;
    if (cached && cached.t && (now() - cached.t < ttlMs)) {
      notify('京东比价（缓存）', `SKU: ${sku}`, cached.msg || '已为你显示最近价格摘要');
    } else {
      notify('京东比价', `SKU: ${sku || '未知'}`, '正在获取价格数据… 不影响页面加载');
    }
    // 你若有直连接口，可在此用 $httpClient 异步刷新并写回 cacheKey
    return $done({});
  }

  // 默认兜底
  return $done({});
})();
