/* ===== 京东比价 · 统一脚本（token / 弹窗 / 表格 / 原始 / 折线 / 助手）===== */
/* 兼容：Surge / Loon / Stash / Egern / Quantumult X */

const NAME = "京东比价";
const SECRET = "3E41D1331F5DDAFCD0A38FE2D52FF66F"; // mmb token 盐
const STORE_KEY = "manmanbuy_val";      // 保存原始 body（含 c_mmbDevId）
const STORE_ID  = "mmb_dev_id";          // 直接保存的 c_mmbDevId
const STORE_TS  = "mmb_dev_id_last_update";

if (typeof Promise.withResolvers !== "function") {
  Promise.withResolvers = function () { let resolve, reject; const promise = new Promise((res, rej)=>{ resolve=res; reject=rej; }); return { promise, resolve, reject }; };
}
intCryptoJS();

/* === 入口 === */
const url = ($request && $request.url) || "";
const arg = parseArgument($argument);
const mode = (arg.mode || "").toLowerCase();

try {
  if (!mode) return done({});
  if (mode === "token") return handleTokenCapture();                  // 获取 token（request）
  if (mode === "popup") return handlePopup(url, arg);                 // 弹窗版（request）
  if (mode === "render") return handleRender(url, arg);               // 页面注入（response）
  if (mode === "assistant") return handleAssistant(url, arg);         // 可选助手（response）
  done({});
} catch (e) {
  notify(NAME + "｜异常", "", String(e && (e.stack || e)));
  done({});
}

/* === 1) 获取 token：命中慢慢买「我的」接口 === */
function handleTokenCapture() {
  try {
    const body = ($request && $request.body) || "";
    set(STORE_KEY, body);
    // 解析 c_mmbDevId（两路）
    let devId = "";
    try {
      if (typeof URLSearchParams === "function") {
        const params = new URLSearchParams(body);
        devId = params.get("c_mmbDevId") || "";
      } else {
        const pairs = String(body).split("&");
        for (let i=0;i<pairs.length;i++){
          const kv = pairs[i].split("=");
          const k = decodeURIComponent(kv[0]||"");
          if (k==="c_mmbDevId") { devId = decodeURIComponent(kv[1]||""); break; }
        }
      }
    } catch (_) {}
    if (devId) {
      set(STORE_ID, devId);
      set(STORE_TS, String(Date.now()));
    }
    notify(NAME, "获取ck成功🎉", body.slice(0, 200));
  } catch (e) {
    notify(NAME+"｜获取token异常", "", String(e && (e.stack || e)));
  } finally {
    done({});
  }
}

/* === 2) 弹窗版：request 钩子，极速 === */
function handlePopup(url, arg) {
  const id = extractId(url);
  if (!id) return done({});
  const dev = getToken();
  if (!dev) { notify(NAME+"｜缺少token", "请先打开慢慢买App-我的获取", "已自动保存原始请求体"); return done({}); }
  fetchHistory(id, dev, function (err, j2) {
    if (err) { notify(NAME+"｜接口异常", "", String(err)); return done({}); }
    if (!j2 || j2.ok !== 1) { notify("比价结果", "", j2 && j2.msg ? "慢慢买："+j2.msg : "接口错误"); return done({}); }
    const r = j2.result || {};
    const title = (r.trendData && r.trendData.title) || ("商品 "+id);
    const tip = ((r.priceRemark && r.priceRemark.Tip) || "") + "（仅供参考）";
    const lower = lowestMsg(r);
    const summary = summaryText(r);
    notify(title, lower + " " + tip, summary, {"open-url":"https://item.jd.com/"+id+".html","update-pasteboard":summary});
    done({});
  });
}

/* === 3) 页面注入：response 钩子（表格/原始/折线 三选一） === */
function handleRender(url, arg) {
  const id = extractId(url);
  if (!id) return $done({});
  const dev = getToken();
  if (!dev) return $done({});
  fetchHistory(id, dev, function (err, j2) {
    if (err || !j2 || j2.ok !== 1) return $done({});
    const r = j2.result || {};
    const title = (r.trendData && r.trendData.title) || ("商品 "+id);
    const tip = ((r.priceRemark && r.priceRemark.Tip) || "") + "（仅供参考）";
    const lower = lowestMsg(r);
    const summary = summaryText(r);

    let html = $response.body || "";
    const panelId = "jd-price-panel-" + Date.now();
    const css = '<style id="'+panelId+'-css">.jd-price-panel{font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,PingFang SC,Helvetica,Arial;line-height:1.35;box-shadow:0 6px 18px rgba(0,0,0,.08);border:1px solid #eee;border-radius:12px;padding:12px 14px;margin:10px 8px;background:#fff}.jd-price-panel h3{font-size:15px;margin:0 0 8px 0}.jd-price-meta{color:#666;font-size:12px;margin-bottom:8px}.jd-price-pre{font-size:12px;background:#fafafa;border:1px dashed #ddd;border-radius:8px;padding:8px;white-space:pre-wrap}.jd-price-table{width:100%;border-collapse:collapse;font-size:12px;margin-top:6px}.jd-price-table th,.jd-price-table td{border:1px solid #eee;padding:6px 8px;text-align:left}.jd-price-chart{width:100%;height:120px;margin-top:6px}.jd-price-muted{color:#999}</style>';
    let content = "";
    if (isTrue(arg.style_table)) {
      content += toTable(r);
    } else if (isTrue(arg.style_line)) {
      if (!isTrue(arg.line_only)) content += toTable(r);
      content += toLineChart(r.priceTrend || []);
    } else {
      // 原始文本
      content += '<pre class="jd-price-pre">'+esc(summary)+'</pre>';
    }
    const panel = '<div class="jd-price-panel" id="'+panelId+'"><h3>🧾 '+esc(title)+'</h3><div class="jd-price-meta">'+esc(lower)+' <span class="jd-price-muted">'+esc(tip)+'</span></div>'+content+'</div>';
    html = injectAfterHead(html, css + panel);
    $done({ body: html });
  });
}

/* === 4) 京东助手（可选的轻量提示）=== */
function handleAssistant(url, arg) {
  if (isTrue(arg.mute_jd)) return $done($response); // 被禁用
  // 这里不做复杂改写，仅在页面注入一个轻提示（不影响性能）
  try {
    let html = $response.body || "";
    const tag = '<div style="position:fixed;right:8px;bottom:8px;background:#000;color:#fff;font-size:11px;padding:6px 8px;border-radius:8px;opacity:.5;z-index:99999">京东助手已启用</div>';
    html = html.replace(/<\/body>/i, tag + "</body>");
    $done({ body: html });
  } catch(_) {
    $done($response);
  }
}

/* ====== 请求慢慢买：share -> trendData ====== */
function fetchHistory(jdId, devId, cb) {
  try {
    const shareBody = {
      methodName: "trendJava",
      spbh: "1|"+jdId,
      url: "https://item.jd.com/"+jdId+".html",
      t: String(Date.now()),
      c_appver: "4.8.3.1",
      c_mmbDevId: devId
    };
    shareBody.token = md5(encodeURIComponent(SECRET + jsonToCustomString(shareBody) + SECRET)).toUpperCase();

    const headers1 = {"Content-Type":"application/x-www-form-urlencoded; charset=utf-8","User-Agent":"Mozilla/5.0 (iPhone) mmbWebBrowse ios"};
    httpPost("https://apapia-history-weblogic.manmanbuy.com/app/share", headers1, toQuery(shareBody), function(e1, r1){
      if (e1) return cb(e1);
      const j1 = safeJson(r1 && r1.body);
      if (!j1 || j1.code !== 2000 || !j1.data) return cb(null, { ok:0, msg: (j1 && j1.msg) || "share无data" });
      const sp = parseQueryFromUrl(j1.data);
      const mp = toMultipart({ shareId: sp.shareId||"", sign: sp.sign||"", spbh: sp.spbh||"", url: sp.url||"" });
      const headers2 = {"content-type":"multipart/form-data; boundary="+mp.boundary};
      httpPost("https://apapia-history-weblogic.manmanbuy.com/h5/share/trendData", headers2, mp.body, function(e2, r2){
        if (e2) return cb(e2);
        const j2 = safeJson(r2 && r2.body) || {};
        cb(null, j2);
      });
    });
  } catch (e) {
    cb(String(e && (e.stack || e)));
  }
}

/* ====== 渲染与工具 ====== */
function extractId(u){
  let m=u.match(/\/product\/(?:[A-Za-z]+\/)?(\d+)\.html/); if(m&&m[1])return m[1];
  m=u.match(/[?&](?:wareId|sku|id)=(\d+)/); if(m&&m[1])return m[1];
  m=u.match(/\/(\d+)\.html(?:[#?]|$)/); if(m&&m[1])return m[1];
  return null;
}
function lowestMsg(r){
  const p = r && r.priceRemark && r.priceRemark.lowestPrice;
  const d = (r && r.priceRemark && r.priceRemark.lowestDate || "").slice(0,10);
  return p==null ? "历史最低：无数据" : ("历史最低：¥"+p+(d?("（"+d+"）"):""));
}
function summaryText(r){
  const arr = (r && r.priceRemark && r.priceRemark.ListPriceDetail) || [];
  const list = []; // 过滤“历史最高/常购价”
  for (let i=0;i<arr.length;i++){ const it = arr[i]||{}; if (/历史最高|常购价/.test(it.Name||"")) continue; list.push(it); }
  if (!list.length) return "暂无有效历史摘要";
  const map={"双11价格":"双十一价格","618价格":"六一八价格","30天最低价":"三十天最低","60天最低价":"六十天最低","180天最低价":"一百八最低"};
  let width=0; for (let j=0;j<list.length;j++){ const pr=String(list[j].Price||"-"); width=Math.max(width,pr.length); }
  let out="";
  for (let k=0;k<list.length;k++){
    const it=list[k], nm=map[it.Name]||it.Name, pr=String(it.Price||"-"), dt=it.Date||"", diff=it.Difference==="-"?"":it.Difference;
    let price = pr;
    if (pr!=="-" && pr.length<width){
      if (price.indexOf(".")<0 && pr.length+1===width) price+=".";
      price = padEnd(price, width, price.indexOf(".")>=0 ? "0" : " ");
    }
    out += nm+"  "+price+"  "+dt+"  "+diff+"\n";
  }
  return out.replace(/\n$/,"");
}
function toTable(r){
  const arr = (r && r.priceRemark && r.priceRemark.ListPriceDetail) || [];
  const map={"双11价格":"双十一价格","618价格":"六一八价格","30天最低价":"三十天最低","60天最低价":"六十天最低","180天最低价":"一百八最低"};
  let rows="";
  for (let i=0;i<arr.length;i++){
    const it=arr[i]||{}; if (/历史最高|常购价/.test(it.Name||"")) continue;
    rows += "<tr><td>"+esc(map[it.Name]||it.Name)+"</td><td>"+esc(it.Price||"-")+"</td><td>"+esc(it.Date||"")+"</td><td>"+esc(it.Difference==="-"?"":it.Difference)+"</td></tr>";
  }
  if (!rows) return '<div class="jd-price-muted">暂无表格数据</div>';
  return '<table class="jd-price-table"><thead><tr><th>名称</th><th>价格</th><th>日期</th><th>差异</th></tr></thead><tbody>'+rows+'</tbody></table>';
}
function toLineChart(list){
  const pts=[]; for (let i=0;i<(list||[]).length;i++){ const x=list[i]; const p=Number(x&& (x.price ?? x.Price ?? x.p)); if(!isNaN(p)) pts.push({p}); }
  if (!pts.length) return '<div class="jd-price-muted">暂无折线数据</div>';
  const W=320,H=120,P=10,xmax=Math.max(1,pts.length-1);
  let ymin=Infinity,ymax=-Infinity; for (let j=0;j<pts.length;j++){ ymin=Math.min(ymin,pts[j].p); ymax=Math.max(ymax,pts[j].p); }
  if (ymin===Infinity){ymin=0;ymax=1;}
  const sx=(W-2*P)/xmax, sy=(H-2*P)/Math.max(1,(ymax-ymin)||1);
  let points=""; for (let k=0;k<pts.length;k++){ const x=P+k*sx; const y=H-P-((pts[k].p-ymin)*sy); points+=(k?",":"")+x+","+y; }
  return '<svg class="jd-price-chart" viewBox="0 0 '+W+' '+H+'" preserveAspectRatio="none"><polyline fill="none" stroke="#007aff" stroke-width="2" points="'+points+'"/></svg>';
}

/* ====== 基础工具 ====== */
function parseArgument(a){ const o={}; try{ if(a){ const s=decodeURIComponent(a); const arr=s.split(/[&;,]/); for (let i=0;i<arr.length;i++){ const kv=arr[i].split("="); if(kv[0]) o[kv[0].trim()]=(kv.slice(1).join("=")||"").trim(); } } }catch(e){} return o; }
function padEnd(s,len,ch){ s=String(s); while(s.length<len){ s+=ch; } return s; }
function esc(s){ return String(s).replace(/[&<>"']/g, c=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[c])); }
function injectAfterHead(html,sn){ if(/<\/head>/i.test(html)) return html.replace(/<\/head>/i,"</head>"+sn); if(/<body[^>]*>/i.test(html)) return html.replace(/<body[^>]*>/i, m=>m+sn); return sn+html; }
function isTrue(v){ return String(v).toLowerCase()==="true"||v==="1"; }
function parseQueryFromUrl(u){ const out={}; try{ let q=""; if(u.indexOf("?")>=0) q=u.split("?")[1]; else if(u.indexOf("#")>=0) q=u.split("#")[1]; const arr=(q||"").split("&"); for(let i=0;i<arr.length;i++){ const kv=arr[i].split("="); const k=decodeURIComponent(kv[0]||""); const v=decodeURIComponent(kv[1]||""); out[k]=v; } }catch(e){} return out; }

function httpPost(url,headers,body,cb){ try{ if (typeof $task!=="undefined"){ // QX
    $task.fetch({url:url,method:"POST",headers:headers,body:body}).then(resp=>cb(null,{status:resp.statusCode,headers:resp.headers,body:resp.body}),err=>cb(err));
  } else { // Surge/Loon/Egern/Stash
    $httpClient.post({url:url,headers:headers,body:body,timeout:15000}, (err,resp,data)=>cb(err,{status:(resp&&(resp.status||resp.statusCode)),headers:resp&&resp.headers,body:data}));
  }}catch(e){ cb(String(e)); } }

function toQuery(o){ const a=[]; for (const k in o){ if(Object.prototype.hasOwnProperty.call(o,k)) a.push(encodeURIComponent(k)+"="+encodeURIComponent(String(o[k])));} return a.join("&"); }
function toMultipart(fields){ const boundary="----WebKitFormBoundary"+Math.random().toString(36).substr(2); let body=""; for (const k in fields){ body += "--"+boundary+"\r\nContent-Disposition: form-data; name=\""+k+"\"\r\n\r\n"+fields[k]+"\r\n"; } body += "--"+boundary+"--\r\n"; return { body, boundary }; }
function jsonToCustomString(obj){ const keys=[]; for (const k in obj){ if(Object.prototype.hasOwnProperty.call(obj,k)){ if(String(k).toLowerCase()==="token") continue; if(obj[k]==="") continue; keys.push(k); } } keys.sort(); let s=""; for (let i=0;i<keys.length;i++){ const kk=keys[i]; s+=kk.toUpperCase()+String(obj[kk]).toUpperCase(); } return s; }
function safeJson(t){ try{ return JSON.parse(t||"{}"); }catch(e){ return {}; } }
function getToken(){ const raw = get(STORE_ID); if (raw) return raw; const ck = get(STORE_KEY); if (!ck) return ""; // 兼容从原始 body 中再解析一次
  try{ if (typeof URLSearchParams==="function"){ const p=new URLSearchParams(ck); return p.get("c_mmbDevId")||""; }
    const pairs=String(ck).split("&"); for (let i=0;i<pairs.length;i++){ const kv=pairs[i].split("="); const k=decodeURIComponent(kv[0]||""); if(k==="c_mmbDevId") return decodeURIComponent(kv[1]||""); } }catch(_){}
  return "";
}
function notify(t,s,b,e){ try{ if(typeof $task!=="undefined") $notify(t,s,b,e||{}); else $notification.post(t,s,b,e||{});}catch(_){ } }
function done(v){ try{$done(v||{});}catch(_){ } }
function get(k){ try{ return (typeof $task!=="undefined")?$prefs.valueForKey(k):$persistentStore.read(k);}catch(_){ return null; } }
function set(k,v){ try{ return (typeof $task!=="undefined")?$prefs.setValueForKey(v,k):$persistentStore.write(v,k);}catch(_){ return false; } }

/* ==== 极简 MD5（CryptoJS） ==== */
function md5(e){return CryptoJS.MD5(e).toString()}
function intCryptoJS(){CryptoJS=function(t,r){var n;if("undefined"!=typeof window&&window.crypto&&(n=window.crypto),"undefined"!=typeof self&&self.crypto&&(n=self.crypto),"undefined"!=typeof globalThis&&globalThis.crypto&&(n=globalThis.crypto),!n&&"undefined"!=typeof window&&window.msCrypto&&(n=window.msCrypto),!n&&"undefined"!=typeof global&&global.crypto&&(n=global.crypto),!n&&"function"==typeof require)try{n=require("crypto")}catch(t){}var e=function(){if(n){if("function"==typeof n.getRandomValues)try{return n.getRandomValues(new Uint32Array(1))[0]}catch(t){}if("function"==typeof n.randomBytes)try{return n.randomBytes(4).readInt32LE()}catch(t){}}throw new Error("Native crypto module could not be used to get secure random number.")},i=Object.create||function(){function t(){}return function(r){var n;return t.prototype=r,n=new t,t.prototype=null,n}}(),o={},a=o.lib={},s=a.Base={extend:function(t){var r=i(this);return t&&r.mixIn(t),r.hasOwnProperty("init")&&this.init!==r.init||(r.init=function(){r.$super.init.apply(this,arguments)}),r.init.prototype=r,r.$super=this,r},create:function(){var t=this.extend();return t.init.apply(this,arguments),t},init:function(){},mixIn:function(t){for(var r in t)t.hasOwnProperty(r)&&(this[r]=t[r]);t.hasOwnProperty("toString")&&(this.toString=t.toString)},clone:function(){return this.init.prototype.extend(this)}},c=a.WordArray=s.extend({init:function(t,r){t=this.words=t||[],this.sigBytes=null!=r?r:4*t.length},toString:function(t){return(t||f).stringify(this)},concat:function(t){var r=this.words,n=t.words,e=this.sigBytes,i=t.sigBytes;if(this.clamp(),e%4)for(var o=0;o<i;o++){var a=n[o>>>2]>>>24-o%4*8&255;r[e+o>>>2]|=a<<24-(e+o)%4*8}else for(var s=0;s<i;s+=4)r[e+s>>>2]=n[s>>>2];return this.sigBytes+=i,this},clamp:function(){var r=this.words,n=this.sigBytes;r[n>>>2]&=4294967295<<32-n%4*8,r.length=t.ceil(n/4)},clone:function(){var t=s.clone.call(this);return t.words=this.words.slice(0),t},random:function(r){var n,i=[],o=function(r){r=r;var n=987654321,e=4294967295;return function(){var i=((n=36969*(65535&n)+(n>>16)&e)<<16)+(r=18e3*(65535&r)+(r>>16)&e)&e;return i/=4294967296,(i+=.5)*(t.random()>.5?1:-1)}},a=!1;try{e(),a=!0}catch(t){}for(var s,u=0;u<r;u+=4)a?i.push(e()):(s=987654071*(n=o(4294967296*(s||t.random())))(),i.push(4294967296*n()|0));return new c.init(i,r)}}),u=o.enc={},f=u.Hex={stringify:function(t){for(var r=t.words,n=t.sigBytes,e=[],i=0;i<n;i++){var o=r[i>>>2]>>>24-i%4*8&255;e.push((o>>>4).toString(16)),e.push((15&o).toString(16))}return e.join("")},parse:function(t){for(var r=t.length,n=[],e=0;e<r;e+=2)n[e>>>3]|=parseInt(t.substr(e,2),16)<<24-e%8*4;return new c.init(n,r/2)}},h=u.Latin1={stringify:function(t){for(var r=t.words,n=t.sigBytes,e=[],i=0;i<n;i++){var o=r[i>>>2]>>>24-i%4*8&255;e.push(String.fromCharCode(o))}return e.join("")},parse:function(t){for(var r=t.length,n=[],e=0;e<r;e++)n[e>>>2]|=(255&t.charCodeAt(e))<<24-e%4*8;return new c.init(n,r)}},p=u.Utf8={stringify:function(t){try{return decodeURIComponent(escape(h.stringify(t)))}catch(t){throw new Error("Malformed UTF-8 data")}},parse:function(t){return h.parse(unescape(encodeURIComponent(t)))}},d=a.BufferedBlockAlgorithm=s.extend({reset:function(){this._data=new c.init,this._nDataBytes=0},_append:function(t){"string"==typeof t&&(t=p.parse(t)),this._data.concat(t),this._nDataBytes+=t.sigBytes},_process:function(r){var n,e=this._data,i=e.words,o=e.sigBytes,a=this.blockSize,s=o/(4*a),u=(s=r?t.ceil(s):t.max((0|s)-this._minBufferSize,0))*a,f=t.min(4*u,o);if(u){for(var h=0;h<u;h+=a)this._doProcessBlock(i,h);n=i.splice(0,u),e.sigBytes-=f}return new c.init(n,f)},clone:function(){var t=s.clone.call(this);return t._data=this._data.clone(),t},_minBufferSize:0}),l=(a.Hasher=d.extend({cfg:s.extend(),init:function(t){this.cfg=this.cfg.extend(t),this.reset()},reset:function(){d.reset.call(this),this._doReset()},update:function(t){return this._append(t),this._process(),this},finalize:function(t){return t&&this._append(t),this._doFinalize()},blockSize:16,_createHelper:function(t){return function(r,n){return new t.init(n).finalize(r)}},_createHmacHelper:function(t){return function(r,n){return new l.HMAC.init(t,n).finalize(r)}}}),o.algo={});return o}(Math);!function(t){var r=CryptoJS,n=r.lib,e=n.WordArray,i=n.Hasher,o=r.algo,a=[];!function(){for(var r=0;r<64;r++)a[r]=4294967296*t.abs(t.sin(r+1))|0}();var s=o.MD5=i.extend({_doReset:function(){this._hash=new e.init([1732584193,4023233417,2562383102,271733878])},_doProcessBlock:function(t,r){for(var n=0;n<16;n++){var e=r+n,i=t[e];t[e]=16711935&(i<<8|i>>>24)|4278255360&(i<<24|i>>>8)}var o=this._hash.words,s=t[r+0],p=t[r+1],d=t[r+2],l=t[r+3],y=t[r+4],v=t[r+5],g=t[r+6],w=t[r+7],_=t[r+8],m=t[r+9],B=t[r+10],b=t[r+11],C=t[r+12],S=t[r+13],x=t[r+14],A=t[r+15],H=o[0],z=o[1],M=o[2],D=o[3];z=h(z=h(z=h(z=h(z=f(z=f(z=f(z=f(z=u(z=u(z*u(z*u(z=c(z*c(z*c(z*c(z,M=c(M,D=c(D,H=c(H,z,M,D,s,7,a[0]),z,M,p,12,a[1]),H,z,d,17,a[2]),D,H,l,22,a[3]),M=c(M,D=c(D,H=c(H,z,M,D,y,7,a[4]),z,M,v,12,a[5]),H,z,g,17,a[6]),D,H,w,22,a[7]),M=c(M,D=c(D,H=c(H,z,M,D,_,7,a[8]),z,M,m,12,a[9]),H,z,B,17,a[10]),D,H,b,22,a[11]),M=c(M,D=c(D,H=c(H,z,M,D,C,7,a[12]),z,M,S,12,a[13]),H,z,x,17,a[14]),D,H,A,22,a[15]),M=u(M,D=u(D,H*u(H,z,M,D,p,5,a[16]),z,M,g,9,a[17]),H,z,b,14,a[18]),D,H,s,20,a[19]),M=u(M,D=u(D,H*u(H,z,M,D,v,5,a[20]),z,M,B,9,a[21]),H,z,A,14,a[22]),D,H,y,20,a[23]),M=u(M,D=u(D,H*u(H,z,M,D,m,5,a[24]),z,M,x,9,a[25]),H,z,l,14,a[26]),D,H,_,20,a[27]),M=u(M,D=u(D,H*u(H,z,M,D,S,5,a[28]),z,M,d,9,a[29]),H,z,w,14,a[30]),D,H,C,20,a[31]),M=f(M,D=f(D,H*f(H,z,M,D,v,4,a[32]),z,M,_,11,a[33]),H,z,b,16,a[34]),D,H,x,23,a[35]),M=f(M,D=f(D,H*f(H,z,M,D,p,4,a[36]),z,M,y,11,a[37]),H,z,w,16,a[38]),D,H,B,23,a[39]),M=f(M,D=f(D,H*f(H,z,M,D,S,4,a[40]),z,M,s,11,a[41]),H,z,l,16,a[42]),D,H,g,23,a[43]),M=f(M,D=f(D,H*f(H,z,M,D,m,4,a[44]),z,M,C,11,a[45]),H,z,A,16,a[46]),D,H,d,23,a[47]),M=h(M,D=h(D,H*h(H,z,M,D,s,6,a[48]),z,M,w,10,a[49]),H,z,x,15,a[50]),D,H,v,21,a[51]),M=h(M,D=h(D,H*h(H,z,M,D,C,6,a[52]),z,M,l,10,a[53]),H,z,B,15,a[54]),D,H,p,21,a[55]),M=h(M,D=h(D,H*h(H,z,M,D,_,6,a[56]),z,M,A,10,a[57]),H,z,g,15,a[58]),D,H,S,21,a[59]),M=h(M,D=h(D,H*h(H,z,M,D,y,6,a[60]),z,M,b,10,a[61]),H,z,d,15,a[62]),D,H,m,21,a[63]),o[0]=o[0]+H|0,o[1]=o[1]+z|0,o[2]=o[2]+M|0,o[3]=o[3]+D|0},_doFinalize:function(){var r=this._data,n=r.words,e=8*this._nDataBytes,i=8*r.sigBytes;n[i>>>5]|=128<<24-i%32;var o=t.floor(e/4294967296),a=e;n[15+(i+64>>>9<<4)]=16711935&(o<<8|o>>>24)|4278255360&(o<<24|o>>>8),n[14+(i+64>>>9<<4)]=16711935&(a<<8|a>>>24)|4278255360&(a<<24|a>>>8),r.sigBytes=4*(n.length+1),this._process();for(var s=this._hash,c=s.words,u=0;u<4;u++){var f=c[u];c[u]=16711935&(f<<8|f>>>24)|4278255360&(f<<24|f>>>8)}return s},clone:function(){var t=i.clone.call(this);return t._hash=this._hash.clone(),t}});r.MD5=i._createHelper(s)}(Math);}; 
