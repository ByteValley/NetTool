/**
 * 京东比价（四合一 · 单脚本）
 * - mode=token    : 捕获慢慢买 c_mmbDevId（request）
 * - mode=popup    : 弹窗版（request）
 * - mode=render   : 页面内渲染（response）：表格/原始/折线 三选一（style_table/style_raw/style_line）
 * - 可选：line_only=true  折线不显示表格
 * - 可选：mute_jd=true    尽量减少与“京东助手”类脚本重叠提示
 */

const NAME = "京东比价";
const ARG  = parseArg($argument);
const STORE_ID = "mmb_dev_id";
const STORE_TS = "mmb_dev_id_last_update";
const secret = "3E41D1331F5DDAFCD0A38FE2D52FF66F";

// 入口分发
(() => {
  const url = ($request && $request.url) || "";
  if (!url) return done();

  if (ARG.mode === "token")       return handleTokenCapture();            // 慢慢买 ck
  if (ARG.mode === "popup")       return handlePopup(url);                // 弹窗版
  if (ARG.mode === "render")      return handleRender(url);               // 页面内渲染
  // 兜底：不做事
  done();
})();

/* ==================== token 捕获 ==================== */
function handleTokenCapture() {
  try {
    const body = ($request && $request.body) || "";
    let devId = "";
    try { devId = new URLSearchParams(body || "").get("c_mmbDevId") || ""; } catch {}
    if (devId) {
      set(STORE_ID, devId);
      set(STORE_TS, String(Date.now()));
      notify(`${NAME}｜获取ck成功🎉`, `c_mmbDevId: ${mask(devId)}`, "已写入本地");
    } else {
      notify(`${NAME}｜未解析到 c_mmbDevId`, "请在慢慢买App-我的 再触发", body ? body.slice(0,200) : "请求体为空");
    }
  } catch (e) { notify(`${NAME}｜捕获异常`, "", String(e && (e.stack||e))); }
  finally { done({}); }
}

/* ==================== 弹窗版 ==================== */
async function handlePopup(url) {
  try {
    const id = extractId(url);
    if (!id) return done({});
    const devId = getToken();
    if (!devId) { notify(`${NAME}｜缺少 token`, "先打开慢慢买App → 我的", "或在模块参数里传入 token"); return done({}); }

    const data = await fetchHistory(id, devId);
    if (!data) return done({});

    if (data.ok !== 1) {
      notify("比价结果", "", data.msg ? `慢慢买：${data.msg}` : "慢慢买返回异常");
      return done({});
    }
    const result = data.result;
    const title = result?.trendData?.title || `商品 ${id}`;
    const tip   = (result?.priceRemark?.Tip || "") + "（仅供参考）";
    const lower = renderLowest(result);
    const summary = renderSummary(result);

    // 若 mute_jd=true，避免与其它助手重复，仅保留一条通知
    notify(title, `${lower} ${tip}`, summary, {"open-url": `https://item.jd.com/${id}.html`, "update-pasteboard": summary});
  } catch (e) { notify(`${NAME}｜查询异常`, "", String(e && (e.stack||e))); }
  finally { done({}); }
}

/* ==================== 页面内渲染（response） ==================== */
async function handleRender(url) {
  // 三选一：表格 / 原始 / 折线（脚本内互斥）
  const enableTable = isTrue(ARG.style_table);
  const enableRaw   = isTrue(ARG.style_raw);
  const enableLine  = isTrue(ARG.style_line);
  const enabled = [enableTable, enableRaw, enableLine].filter(Boolean).length;

  try {
    if (enabled > 1) {
      // 强制互斥：同时开则只保留第一个为 true 的
      // 优先级：表格 > 折线 > 原始
      if (enableTable) { ARG.style_raw = ARG.style_line = "false"; }
      else if (enableLine){ ARG.style_table = ARG.style_raw = "false"; }
      else { ARG.style_table = ARG.style_line = "false"; }
    }

    const id = extractId(url);
    if (!id) return $done({}); // 不改 body，避免白屏

    const devId = getToken();
    if (!devId) return $done({}); // 无 token 不扰动页面

    const data = await fetchHistory(id, devId);
    if (!data || data.ok !== 1) return $done({}); // 保守：失败不改页面

    const result  = data.result;
    const title   = result?.trendData?.title || `商品 ${id}`;
    const tip     = (result?.priceRemark?.Tip || "") + "（仅供参考）";
    const lower   = renderLowest(result);
    const summary = renderSummary(result);
    const priceList = (result?.priceTrend || result?.trendData?.list || []).slice(0, 30); // 兜底取近 30 条

    let html = $response.body || "";
    const panelId = `jd-price-panel-${Date.now()}`;
    const css = `
      <style id="${panelId}-css">
        .jd-price-panel{font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,PingFang SC,Helvetica,Arial;line-height:1.35;box-shadow:0 6px 18px rgba(0,0,0,.08);border:1px solid #eee;border-radius:12px;padding:12px 14px;margin:10px 8px;background:#fff}
        .jd-price-panel h3{font-size:15px;margin:0 0 8px 0}
        .jd-price-meta{color:#666;font-size:12px;margin-bottom:8px}
        .jd-price-pre{font-size:12px;background:#fafafa;border:1px dashed #ddd;border-radius:8px;padding:8px;white-space:pre-wrap}
        .jd-price-table{width:100%;border-collapse:collapse;font-size:12px;margin-top:6px}
        .jd-price-table th,.jd-price-table td{border:1px solid #eee;padding:6px 8px;text-align:left}
        .jd-price-chart{width:100%;height:120px;margin-top:6px}
        .jd-price-muted{color:#999}
      </style>
    `;

    // 组装内容块
    const preBlock = `<pre class="jd-price-pre">${escapeHtml(summary)}</pre>`;
    const tableBlock = toTable(result);
    const chartBlock = toInlineChart(priceList);

    // 样式选择
    let content = "";
    if (isTrue(ARG.style_table)) {
      content = `${preBlock}${isTrue(ARG.line_only) ? "" : ""}${tableBlock}`;
      if (isTrue(ARG.style_line) && !isTrue(ARG.line_only)) content += chartBlock; // 理论上互斥，这里兼容
    } else if (isTrue(ARG.style_line)) {
      content = `${isTrue(ARG.line_only) ? "" : preBlock}${chartBlock}`;
    } else {
      // 原始
      content = `${preBlock}`;
    }

    const panel = `
      <div class="jd-price-panel" id="${panelId}">
        <h3>🧾 ${escapeHtml(title)}</h3>
        <div class="jd-price-meta">${escapeHtml(lower)} <span class="jd-price-muted">${escapeHtml(tip)}</span></div>
        ${content}
      </div>
    `;

    html = injectAfterHead(html, css + panel);

    $done({ body: html });
  } catch (e) {
    // 失败不干扰页面
    console.log(`[${NAME}] render error:`, e && (e.stack||e));
    $done({});
  }
}

/* ==================== 慢慢买请求 ==================== */
async function fetchHistory(jdId, devId) {
  const shareBody = {
    methodName: "trendJava",
    spbh: `1|${jdId}`,
    url: `https://item.jd.com/${jdId}.html`,
    t: Date.now().toString(),
    c_appver: "4.8.3.1",
    c_mmbDevId: devId
  };
  const tokenSrc = encodeURIComponent(secret + jsonToCustomString(shareBody) + secret);
  shareBody.token = md5(tokenSrc).toUpperCase();

  const h1 = {"Content-Type":"application/x-www-form-urlencoded; charset=utf-8","User-Agent":"Mozilla/5.0 (iPhone) mmbWebBrowse ios"};
  const r1 = await post("https://apapia-history-weblogic.manmanbuy.com/app/share", h1, toQuery(shareBody));
  const j1 = toJson(r1.body);
  if (j1.code !== 2000 || !j1.data) return { ok: 0, msg: j1.msg || "share无data" };

  const sp = new URL(j1.data).searchParams;
  const fields = { shareId: sp.get("shareId"), sign: sp.get("sign"), spbh: sp.get("spbh"), url: sp.get("url") };
  const { body, boundary } = toMultipart(fields);
  const h2 = {"content-type":`multipart/form-data; boundary=${boundary}`};
  const r2 = await post("https://apapia-history-weblogic.manmanbuy.com/h5/share/trendData", h2, body);
  return toJson(r2.body);
}

/* ==================== 渲染工具 ==================== */
function renderLowest(result){
  const p = result?.priceRemark?.lowestPrice;
  const d = (result?.priceRemark?.lowestDate || "").slice(0,10);
  return p==null ? "历史最低：无数据" : `历史最低：¥${p}${d?`（${d}）`:""}`;
}
function renderSummary(result){
  const arr = (result?.priceRemark?.ListPriceDetail || []).filter(x => !/(历史最高|常购价)/.test(x?.Name||""));
  if (!arr.length) return "暂无有效历史摘要";
  const width = arr.reduce((m,i)=>Math.max(m,(i.Price||"").length),0);
  const nameMap = {"双11价格":"双十一价格","618价格":"六一八价格","30天最低价":"三十天最低","60天最低价":"六十天最低","180天最低价":"一百八最低"};
  let out = "";
  for (const it of arr){
    let Price = it.Price || "-";
    if (Price !== "-"){
      if (Price.length < width){
        const hasDot = Price.includes(".");
        Price = Price.includes(".") || Price.length + 1 === width ? Price : `${Price}.`;
        Price = Price.padEnd(width, hasDot ? "0" : " ");
      }
    }
    out += `${nameMap[it.Name]||it.Name}  ${Price}  ${it.Date||""}  ${it.Difference==="-"?"":it.Difference}\n`;
  }
  return out.trimEnd();
}
function toTable(result){
  const arr = (result?.priceRemark?.ListPriceDetail || []).filter(x => !/(历史最高|常购价)/.test(x?.Name||""));
  if(!arr.length) return `<div class="jd-price-muted">暂无表格数据</div>`;
  const nameMap = {"双11价格":"双十一价格","618价格":"六一八价格","30天最低价":"三十天最低","60天最低价":"六十天最低","180天最低价":"一百八最低"};
  const rows = arr.map(it => `<tr><td>${esc(nameMap[it.Name]||it.Name)}</td><td>${esc(it.Price||"-")}</td><td>${esc(it.Date||"")}</td><td>${esc(it.Difference==="-"?"":it.Difference)}</td></tr>`).join("");
  return `<table class="jd-price-table"><thead><tr><th>名称</th><th>价格</th><th>日期</th><th>差异</th></tr></thead><tbody>${rows}</tbody></table>`;
}
function toInlineChart(list){
  // list: [{date: 'YYYY-MM-DD', price: 123}] 结构各接口不一，这里做容错
  const pts = normalizeTrend(list);
  if (!pts.length) return `<div class="jd-price-muted">暂无折线数据</div>`;
  const W=320,H=120,P=10;
  const xs = pts.map((_,i)=>i);
  const ys = pts.map(p=>p.price);
  const minY = Math.min(...ys), maxY = Math.max(...ys);
  const scaleX = (W-2*P)/Math.max(1, xs.length-1);
  const scaleY = (H-2*P)/Math.max(1, (maxY - minY)||1);
  const path = pts.map((p,i)=>{
    const x = P + i*scaleX;
    const y = H - P - ((p.price - minY) * scaleY);
    return (i===0?`M${x},${y}`:`L${x},${y}`);
  }).join(" ");
  const labels = `<text x="${P}" y="${H-2}" font-size="10">${minY}</text><text x="${W-P-20}" y="${H-2}" font-size="10">${maxY}</text>`;
  return `<svg class="jd-price-chart" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none"><polyline fill="none" stroke="#007aff" stroke-width="2" points="${polyPoints(pts, W, H, P, minY, scaleX, scaleY)}"/><path d="${path}" stroke="transparent" fill="none"/>${labels}</svg>`;
}
function normalizeTrend(list){
  // 尝试兼容多种字段：{d/Date/date, p/Price/price}
  const out = [];
  (list||[]).forEach(x=>{
    const price = Number(x.price ?? x.Price ?? x.p);
    const date  = String(x.date ?? x.Date ?? x.d ?? "").slice(0,10);
    if (!isNaN(price)) out.push({price, date});
  });
  return out;
}
function polyPoints(pts,W,H,P,minY,scaleX,scaleY){
  return pts.map((p,i)=>{
    const x = P + i*scaleX;
    const y = H - P - ((p.price - minY) * scaleY);
    return `${x},${y}`;
  }).join(" ");
}

/* ==================== 通用工具 & 适配 ==================== */
function extractId(u){
  let m = u.match(/\/product\/(?:[A-Za-z]+\/)?(\d+)\.html/); if(m&&m[1]) return m[1];
  m = u.match(/[?&](?:wareId|sku|id)=(\d+)/); if(m&&m[1]) return m[1];
  m = u.match(/\/(\d+)\.html(?:[#?]|$)/); if(m&&m[1]) return m[1];
  return null;
}
function getToken(){ const v=get("mmb_dev_id"); if(v) return v; if(ARG.token) return ARG.token; return ""; }
function parseArg(a){ const o={}; try{
  if(!a) return o; const s=decodeURIComponent(a); s.split(/[&;,]/).forEach(kv=>{const[k,...r]=kv.split("="); if(k)o[k.trim()]=(r.join("=")||"").trim();});
}catch{} return o;}
function isTrue(v){ return String(v).toLowerCase()==="true" || v==="1"; }
function toQuery(o){ return Object.keys(o).map(k=>`${encodeURIComponent(k)}=${encodeURIComponent(String(o[k]))}`).join("&"); }
function toMultipart(fields){ const bd="----WebKitFormBoundary"+Math.random().toString(36).slice(2); let b=""; for(const[k,v] of Object.entries(fields)){b+=`--${bd}\r\nContent-Disposition: form-data; name="${k}"\r\n\r\n${v}\r\n`;} b+=`--${bd}--\r\n`; return {body:b,boundary:bd}; }
function jsonToCustomString(obj){ return Object.keys(obj).filter(k=>obj[k]!=="" && k.toLowerCase()!=="token").sort().map(k=>`${k.toUpperCase()}${String(obj[k]).toUpperCase()}`).join(""); }
function toJson(t){ try{ return JSON.parse(t||"{}"); }catch{ return {}; } }
function esc(s){ return String(s).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[c])); }
function escapeHtml(s){ return esc(s); }
function injectAfterHead(html, snippet){
  // 尽量稳地插到 </head> 之后；若找不到，就插到 <body> 起始
  if (/<\/head>/i.test(html)) return html.replace(/<\/head>/i, `</head>${snippet}`);
  if (/<body[^>]*>/i.test(html)) return html.replace(/<body[^>]*>/i, m=>`${m}${snippet}`);
  return snippet + html;
}
function mask(s){ if(!s) return ""; return s.length<=4? "*".repeat(s.length) : s.slice(0,2)+"***"+s.slice(-2); }
function notify(t,s,b,e={}){ try{ if(typeof $task!=="undefined") $notify(t,s,b,e); else $notification.post(t,s,b,e);}catch{} }
function done(v={}){ try{$done(v);}catch{} }
function get(k){ try{ return typeof $task!=="undefined" ? $prefs.valueForKey(k) : $persistentStore.read(k);}catch{return null} }
function set(k,v){ try{ return typeof $task!=="undefined" ? $prefs.setValueForKey(v,k) : $persistentStore.write(v,k);}catch{return false} }

// —— 极简 MD5 —— //
function md5(e){return CryptoJS.MD5(e).toString()}
!function(){var CryptoJS=function(t){var r={lib:{}},n=r.lib,e=n.Base={extend:function(t){var r=function(){};return r.prototype=this,new r,t&&this.mixIn(t),r},mixIn:function(t){for(var r in t)t.hasOwnProperty(r)&&(this[r]=t[r])}},i=n.WordArray=e.extend({init:function(t,r){t=this.words=t||[],this.sigBytes=null!=r?r:4*t.length}});r.algo={};var o=r;return o.MD5=function(){function r(t,r){var n=(t&65535)+(r&65535);return(t>>16)+(r>>16)+(n>>16)<<16|65535&n}function n(t,r){return t<<r|t>>>32-r}function e(t,r,e,i,o,a,s){return r=r+((t&r|~t&i)+o+s|0)>>>0,r=r<<a|r>>>32-a,(r=r+e>>>0)>>>0}return function(t){for(var e=unescape(encodeURIComponent(t)),i=[],o=0;o<e.length;o++)i[o>>2]|=e.charCodeAt(o)<<24-8*(o%4);var a=1732584193,s=-271733879,c=-1732584194,u=271733878;for(var f=0;f<i.length;f+=16){var h=a,p=s,d=c,l=u;a=e(a,s,c,u,i[f],7,-680876936),u=e(u,a,s,c,i[f+1],12,-389564586),c=e(c,u,a,s,i[f+2],17,606105819),s=e(s,c,u,a,i[f+3],22,-1044525330),a=e(a,s,c,u,i[f+4],7,1770035416),u=e(u,a,s,c,i[f+5],12,1200080426),c=e(c,u,a,s,i[f+6],17,-1473231341),s=e(s,c,u,a,i[f+7],22,-45705983),a=e(a,s,c,u,i[f+8],7,1770035416),u=e(u,a,s,c,i[f+9],12,-1958414417),c=e(c,u,a,s,i[f+10],17,-42063),s=e(s,c,u,a,i[f+11],22,-1990404162),a=e(a,s,c,u,i[f+12],7,1804603682),u=e(u,a,s,c,i[f+13],12,-40341101),c=e(c,u,a,s,i[f+14],17,-1502002290),s=e(s,c,u,a,i[f+15],22,1236535329),a=(a=a+1732584193|0)>>>0,s=(s-271733879|0)>>>0,c=(c-1732584194|0)>>>0,u=(u+271733878|0)>>>0}return([a,s,c,u]).map(function(t){return("00000000"+(t>>>0).toString(16)).slice(-8)}).join("")}}()}(),r}();
var CryptoJS=CryptoJS}();
