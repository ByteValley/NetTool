/**
 * 京东比价 · 统一渲染器（秒加载 / 互斥 / 去重 / 缓存优先）
 * Author: ByteValley & ChatGPT
 *
 * 传参方式（Surge/Loon 的 argument）：
 *   - action=token                // 仅用于慢慢买 token 获取（挂在 apapia-sqk-weblogic 的请求上）
 *   - mode=table|raw|line|popup   // 指定样式模式（单一值）
 *   - 或者使用布尔开关（脚本会自动按优先级挑一个）：
 *        table=true / raw=true / line=true / popup=true
 *        优先级默认：table > line > raw > popup
 *   - hideTable=true|false        // 折线模式是否隐藏表格
 *   - cacheHours=24               // 本地缓存时长（小时），预留给后续直拉接口时使用
 */

(function () {
  const isResponse = typeof $response !== 'undefined';
  const isRequest = typeof $request !== 'undefined' && typeof $response === 'undefined';

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

  // 用户布尔开关
  const FLAG = {
    table: BOOL(ARG.table),
    raw  : BOOL(ARG.raw),
    line : BOOL(ARG.line),
    popup: BOOL(ARG.popup),
  };

  // 你想要的优先级（可按需调整）
  const PICK_BY_FLAG = () => {
    if (FLAG.table) return 'table';
    if (FLAG.line)  return 'line';
    if (FLAG.raw)   return 'raw';
    if (FLAG.popup) return 'popup';
    return ''; // 没开任何就留空，后面再兜底
  };

  // 最终模式：优先 mode=...；否则按布尔开关优先级挑；仍为空则默认 table
  const MODE = ((ARG.mode || '').toLowerCase() || PICK_BY_FLAG() || 'table');

  const HIDE_TABLE  = String(ARG.hideTable  || '').toLowerCase() === 'true';
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

  // ---------- Token 获取专用 ----------
  if (ACTION === 'token') {
    // 命中慢慢买菜单接口时仅做一个标记，真实 token 仍由第三方脚本完成
    store.set('JD_PRICE_TOKEN_HIT', { t: now(), url: ($request && $request.url) });
    return $done({});
  }

  const url = ($request && $request.url) || ($response && $response.url) || '';
  const sku = extractSku(url);
  const cacheKey = sku ? `JD_PRICE_CACHE_${sku}` : '';

  // ---------- response：向页面注入“秒加载”占位 + 异步加载对应样式脚本 ----------
  if (isResponse) {
    let body = $response.body;
    if (!body || typeof body !== 'string') {
      return $done($response);
    }

    // 防重复：哨兵 + 容器判断。即使被多条规则命中，也只会渲染一次
    if (body.indexOf('__JD_PRICE_SENTINEL__') !== -1 || body.indexOf('id="jd-price-box"') !== -1) {
      return $done($response);
    }

    const injectJS = `
<script>
(function(){
  if (window.__JD_PRICE_SENTINEL__) return;
  window.__JD_PRICE_SENTINEL__ = true;
  window.__JD_PRICE_MODE__ = ${JSON.stringify(MODE)};
  window.__JD_PRICE_HIDE_TABLE__ = ${HIDE_TABLE ? 'true' : 'false'};
  window.__JD_PRICE_SKU__ = ${JSON.stringify(sku || '')};

  // 秒显占位，避免等待时页面空白
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

  // 根据模式选择外部脚本（可替换为你自托管地址）
  var urls = {
    table: 'https://fastly.jsdelivr.net/gh/githubdulong/Script@master/jd_price.js',
    raw  : 'https://fastly.jsdelivr.net/gh/wf021325/qx@master/js/jd_price.js',
    line : 'https://fastly.jsdelivr.net/gh/mw418/Loon@main/script/jd_price2.js',
    popup: 'https://fastly.jsdelivr.net/gh/mw418/Loon@main/script/jd_price.js' // popup 仅作兜底
  };
  var chosen = urls[(window.__JD_PRICE_MODE__||'table')] || urls.table;

  function load(u, cb){
    var s = document.createElement('script');
    s.src = u; s.defer = true; s.onload = function(){ cb(true); };
    s.onerror = function(){ cb(false); };
    document.head.appendChild(s);
  }

  // 3.5s 超时：不再等待，保证体验；占位保留
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
    // 去重：若外部脚本也渲染了 DOM，合并/保留一份
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

    // 在 </body> 前注入（若没有 </body> 就直接追加）
    if (body.indexOf('</body>') !== -1) {
      body = body.replace('</body>', injectJS + '\n</body>');
    } else {
      body += injectJS;
    }

    return $done({ body });
  }

  // ---------- request 或 popup 模式：弹窗摘要（不阻塞页面） ----------
  if (isRequest || MODE === 'popup') {
    // 缓存优先：若已有缓存则秒弹；（直拉接口刷新缓存的逻辑留作后续扩展）
    let cached = cacheKey ? store.get(cacheKey) : null;
    if (cached && cached.t && (now() - cached.t < ttlMs)) {
      notify('京东比价（缓存）', 'SKU: ' + (sku || '未知'), cached.msg || '已展示最近价格摘要');
    } else {
      notify('京东比价', 'SKU: ' + (sku || '未知'), '正在获取价格数据… 页面不受影响');
    }
    return $done({});
  }

  // 兜底
  return $done({});
})();
