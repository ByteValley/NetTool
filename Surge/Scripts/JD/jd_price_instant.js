/**
 * 京东比价 · 秒加载统一脚本（原始 / 表格 / 折线 / 弹窗）
 * - 与 token 无关；token 交给 mw418 脚本处理
 * 参数（argument）：
 *   mode=table|raw|line|popup  或 布尔：table/raw/line/popup=true/false（优先级 table>line>raw>popup）
 *   hideTable=true|false       // 折线是否隐藏表格
 *   cacheHours=24              // 预留
 */
(function () {
  const isResp = typeof $response !== 'undefined';
  const isReq  = typeof $request  !== 'undefined' && typeof $response === 'undefined';
  const url    = ($request && $request.url) || ($response && $response.url) || '';

  const BOOL = v => String(v || '').toLowerCase() === 'true';

  // 解析参数：兼容 & 和 ,
  const ARG = (()=>{
    const out = {};
    const s =
      typeof $argument === 'string' ? $argument :
      ($argument && typeof $argument === 'object')
        ? Object.entries($argument).map(([k,v])=>`${k}=${v}`).join('&') : '';
    (s||'').split(/[,&]/).forEach(kv=>{
      const i = kv.indexOf('=');
      if (i<0) return;
      const k = decodeURIComponent(kv.slice(0,i).trim());
      const v = decodeURIComponent(kv.slice(i+1).trim());
      if (k) out[k]=v;
    });
    return out;
  })();

  // 选择模式
  const FLAG = { table: BOOL(ARG.table), raw: BOOL(ARG.raw), line: BOOL(ARG.line), popup: BOOL(ARG.popup) };
  const pickByFlag = () => (FLAG.table && 'table') || (FLAG.line && 'line') || (FLAG.raw && 'raw') || (FLAG.popup && 'popup') || '';
  const MODE       = (ARG.mode || '').toLowerCase() || pickByFlag() || 'table';
  const HIDE_TABLE = BOOL(ARG.hideTable);
  const CACHE_H    = Math.max(1, parseInt(ARG.cacheHours || '24', 10));

  // 仅弹窗模式：request 阶段不阻塞页面
  if (isReq && MODE === 'popup') {
    try { $notify('京东比价（弹窗）', '', '已触发弹窗模式（不修改页面）'); } catch(e){}
    return $done({});
  }

  // 页内嵌渲染：必须是 response
  if (!isResp || !$response.body || typeof $response.body !== 'string') {
    return $done(isResp ? $response : {});
  }

  let body = $response.body;

  // 防重复注入
  if (body.includes('__JD_PRICE_SENTINEL__') || body.includes('id="jd-price-box"')) {
    return $done($response);
  }

  // 外部渲染脚本（可改自托管）
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

  // 1) CSS 强力去重
  document.addEventListener('DOMContentLoaded', function(){
    try{
      var style=document.createElement('style');
      style.setAttribute('data-jd-price','dedupe');
      style.textContent=[
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

  // 2) 秒显占位
  try{
    var box=document.createElement('div');
    box.id='jd-price-box';
    box.style.cssText='margin:12px 12px 0;padding:10px;border:1px solid #eee;border-radius:8px;font-size:14px;background:#fff';
    box.innerHTML='<div style="opacity:.85">💴 价格趋势 · 正在获取…（不影响页面）</div>';
    document.addEventListener('DOMContentLoaded', function(){
      var mount=document.querySelector('#app')||document.body;
      (mount||document.body).insertBefore(box, mount.firstChild);
    });
  }catch(e){}

  // 3) 异步加载外部脚本 + 3.5s 降级
  var chosen=${JSON.stringify(chosen)};
  function load(u, cb){ var s=document.createElement('script'); s.src=u; s.defer=true;
    s.onload=function(){ cb(true); }; s.onerror=function(){ cb(false); };
    document.head.appendChild(s); }
  var timeout=setTimeout(function(){
    var tip=document.querySelector('#jd-price-box');
    if(tip){ tip.style.opacity='0.7'; tip.innerHTML='💴 价格趋势 · 暂无最新数据（稍后再试）'; }
  },3500);

  load(chosen,function(ok){
    clearTimeout(timeout);
    if(!ok){
      var tip=document.querySelector('#jd-price-box');
      if(tip){ tip.innerHTML='💴 价格趋势 · 外部脚本加载失败'; }
      return;
    }
    // 4) 观察器二次去重
    try{
      var SEL=['#jd-price-box','.history_price','.price_trend','.price-box','.pp-box','.pp-wrap'];
      function dedupe(){
        var nodes=[]; SEL.forEach(function(s){ nodes=nodes.concat(Array.from(document.querySelectorAll(s))); });
        if(nodes.length>1){
          var keep=nodes[0];
          for(var i=1;i<nodes.length;i++){
            var n=nodes[i]; if(!n||n===keep) continue;
            if(n.parentNode) n.parentNode.removeChild(n);
          }
        }
      }
      document.addEventListener('DOMContentLoaded',function(){
        setTimeout(dedupe,300);
        var mo=new MutationObserver(function(){ setTimeout(dedupe,120); });
        mo.observe(document.documentElement,{childList:true,subtree:true});
      });
    }catch(e){}
  });
})();
</script>`;

  body = body.includes('</body>') ? body.replace('</body>', inject + '\n</body>') : (body + inject);
  return $done({ body });
})();
