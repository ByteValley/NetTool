/**
 * 京东比价 · 秒加载统一脚本（含命中通知·原始/表格/折线/弹窗 + 获取token）
 * Author: ByteValley
 *
 * argument：
 *   action=token
 *   mode=table|raw|line|popup  或布尔：table/raw/line/popup = true/false（优先级 table > line > raw > popup）
 *   hideTable=true|false        // 折线是否隐藏表格
 *   cacheHours=24               // 预留
 */
(function () {
  const isResp = typeof $response !== 'undefined';
  const isReq  = typeof $request  !== 'undefined' && typeof $response === 'undefined';
  const url    = ($request && $request.url) || ($response && $response.url) || '';

  const notify = (t,s,b)=>{ try{$notify(t,s||'',b||'')}catch(e){} };
  const log    = (...a)=>{ try{console.log('[JD-INSTANT]',...a)}catch(e){} };

  // 解析 argument
  const ARG = (()=>{
    const out={};
    const s = typeof $argument==='string'
      ? $argument
      : ($argument && typeof $argument==='object')
        ? Object.entries($argument).map(([k,v])=>`${k}=${v}`).join('&')
        : '';
    if(!s) return out;
    s.split('&').forEach(kv=>{
      const i=kv.indexOf('=');
      if(i<0) return;
      out[decodeURIComponent(kv.slice(0,i).trim())] = decodeURIComponent(kv.slice(i+1).trim());
    });
    return out;
  })();

  const BOOL = v => String(v||'').toLowerCase()==='true';
  const FLAG = { table:BOOL(ARG.table), raw:BOOL(ARG.raw), line:BOOL(ARG.line), popup:BOOL(ARG.popup) };
  const pickByFlag = () => (FLAG.table && 'table') || (FLAG.line && 'line') || (FLAG.raw && 'raw') || (FLAG.popup && 'popup') || '';
  const MODE       = (ARG.mode||'').toLowerCase() || pickByFlag() || 'table';
  const HIDE_TABLE = BOOL(ARG.hideTable);
  const ACTION     = ARG.action || '';

  // 识别 sku
  const sku = (()=>{
    try {
      const m = url.match(/\/graphext\/(\d+)\.html/);
      if (m) return m[1];
      const n = url.match(/\/(\d+)\.html/);
      if (n) return n[1];
    } catch(e){}
    return '';
  })();

  // ==== Token 捕获（request）====
  if (isReq && ACTION==='token') {
    const pathOK = /\/baoliao\/center\/menu($|\?)/.test(url);
    // 无论是否匹配到 menu，先提示你命中 request 了，方便排查
    notify('京东比价·Token分支命中', pathOK?'命中 /baoliao/center/menu':'命中其它 manmanbuy 请求', url);
    if (pathOK) {
      const body = $request.body || '';
      try { $persistentStore.write(body||'', 'manmanbuy_val'); } catch(e){}
      try {
        const params = new URLSearchParams(body);
        const devId  = params.get('c_mmbDevId') || '';
        if (devId) $persistentStore.write(devId, '慢慢买CK');
        notify('获取 ck 成功 🎉', devId?('c_mmbDevId='+devId):'原始body见持久化 manmanbuy_val', devId?url:(body.slice(0,120)||'无'));
      } catch(e) {
        notify('获取 ck（解析失败）', '', ( $request.body || '' ).slice(0,120));
      }
    }
    return $done({});
  }

  // ==== 弹窗模式（request 命中）====
  if (isReq && MODE==='popup') {
    notify('京东比价·弹窗模式', sku?('SKU: '+sku):'SKU 未识别', '已拦截请求，不阻塞页面');
    return $done({});
  }

  // ==== 页面内嵌（response 命中）====
  if (!isResp || !$response.body || typeof $response.body!=='string') {
    return $done(isResp ? $response : {});
  }

  // 到这里说明命中了 JD 详情页的 response 规则——立刻提示你
  notify('京东比价·统一渲染命中', `MODE=${MODE}${HIDE_TABLE?' / hideTable':''}`, url);

  let body = $response.body;
  if (body.includes('__JD_PRICE_SENTINEL__') || body.includes('id="jd-price-box"')) {
    // 已有哨兵，提示一次（避免你以为没生效）
    notify('京东比价·已注入过，跳过', '', url);
    return $done($response);
  }

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
  window.__JD_PRICE_MODE__=${JSON.stringify(MODE)};
  window.__JD_PRICE_HIDE_TABLE__=${HIDE_TABLE?'true':'false'};
  window.__JD_PRICE_SKU__=${JSON.stringify(sku||'')};

  // 1) CSS 去重（强力）：隐藏第2份起
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

  // 3) 异步加载对应脚本
  var chosen=${JSON.stringify(chosen)};
  function load(u,cb){ var s=document.createElement('script'); s.src=u; s.defer=true;
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
