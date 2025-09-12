/* ===== 京东比价 · 统一脚本（token / 弹窗 / 表格 / 原始 / 折线 / 助手）===== */
/* 兼容：Surge / Loon / Stash / Egern / Quantumult X */

var NAME = "京东比价";
var SECRET = "3E41D1331F5DDAFCD0A38FE2D52FF66F"; // mmb token 盐
var STORE_KEY = "manmanbuy_val";      // 保存原始 body（含 c_mmbDevId）
var STORE_ID  = "mmb_dev_id";          // 直接保存的 c_mmbDevId
var STORE_TS  = "mmb_dev_id_last_update";

/* ---- 公共工具（不依赖任何重库） ---- */
function parseArgument(a){ var o={}; try{ if(a){ var s=decodeURIComponent(a); var arr=s.split(/[&;,]/); for (var i=0;i<arr.length;i++){ var kv=arr[i].split("="); if(kv[0]) o[kv[0].trim()]=(kv.slice(1).join("=")||"").trim(); } } }catch(e){} return o; }
function notify(t,s,b,e){ try{ if(typeof $task!=="undefined") $notify(t||"",s||"",b||"",e||{}); else $notification.post(t||"",s||"",b||"",e||{});}catch(_){} }
function done(v){ try{$done(v||{});}catch(_){} }
function get(k){ try{ return (typeof $task!=="undefined")?$prefs.valueForKey(k):$persistentStore.read(k);}catch(_){ return null; } }
function set(k,v){ try{ return (typeof $task!=="undefined")?$prefs.setValueForKey(v,k):$persistentStore.write(v,k);}catch(_){ return false; } }

/* ---- 入口参数 ---- */
var url = ($request && $request.url) || "";
var arg = parseArgument(typeof $argument === "string" ? $argument : "");
var mode = (arg.mode || "").toLowerCase();

/* =========================
 *  A. 抓 token 分支 —— 极简版
 *  提前 return：不加载任何重代码，避免 0:0 崩溃
 * ========================= */
if (mode === "token") {
  try {
    var body = ($request && $request.body) || "";
    set(STORE_KEY, body);

    // 把 c_mmbDevId 单独提取保存（避免后来再解析失败）
    var devId = "";
    try {
      var pairs = String(body).split("&");
      for (var i=0;i<pairs.length;i++){
        var kv = pairs[i].split("=");
        var k = decodeURIComponent(kv[0]||"");
        if (k === "c_mmbDevId") { devId = decodeURIComponent(kv[1]||""); break; }
      }
    } catch(_) {}
    if (devId) {
      set(STORE_ID, devId);
      set(STORE_TS, String(Date.now()));
    }

    notify(NAME, "获取ck成功🎉", body.slice(0, 200));
  } catch (e) {
    notify(NAME+"｜获取token异常", "", String(e && (e.stack || e)));
  }
  done({});
  // 提前结束，后续任何代码都不执行
}

/* =========================
 *  B. 之后的分支才需要较重的工具
 * ========================= */

/* 可兼容的 Promise.withResolvers（少量环境用得到） */
if (typeof Promise.withResolvers !== "function") {
  Promise.withResolvers = function () { var resolve, reject; var promise = new Promise(function(res, rej){ resolve=res; reject=rej; }); return { promise: promise, resolve: resolve, reject: reject }; };
}

/* HTTP 帮助函数（最小依赖） */
function httpPost(u,h,b,cb){ try{
  if (typeof $task!=="undefined"){ // QX
    $task.fetch({url:u,method:"POST",headers:h,body:b}).then(function(resp){ cb(null,{status:resp.statusCode,headers:resp.headers,body:resp.body}); },function(err){ cb(err); });
  } else { // Surge/Loon/Egern/Stash
    $httpClient.post({url:u,headers:h,body:b,timeout:15000}, function(err,resp,data){ cb(err,{status:(resp&&(resp.status||resp.statusCode)),headers:resp&&resp.headers,body:data}); });
  }
}catch(e){ cb(String(e)); } }

function toQuery(o){ var a=[], k; for (k in o){ if(Object.prototype.hasOwnProperty.call(o,k)) a.push(encodeURIComponent(k)+"="+encodeURIComponent(String(o[k])));} return a.join("&"); }
function toMultipart(fields){ var boundary="----WebKitFormBoundary"+Math.random().toString(36).substr(2); var body=""; var k; for (k in fields){ body += "--"+boundary+"\r\nContent-Disposition: form-data; name=\""+k+"\"\r\n\r\n"+fields[k]+"\r\n"; } body += "--"+boundary+"--\r\n"; return { body: body, boundary: boundary }; }
function safeJson(t){ try{ return JSON.parse(t||"{}"); }catch(e){ return {}; } }
function parseQueryFromUrl(u){ var out={}, q=""; try{ if(u.indexOf("?")>=0) q=u.split("?")[1]; else if(u.indexOf("#")>=0) q=u.split("#")[1]; var arr=(q||"").split("&"); for(var i=0;i<arr.length;i++){ var kv=arr[i].split("="); var kk=decodeURIComponent(kv[0]||""); var vv=decodeURIComponent(kv[1]||""); out[kk]=vv; } }catch(e){} return out; }
function extractId(u){
  var m=u.match(/\/product\/(?:[A-Za-z]+\/)?(\d+)\.html/); if(m&&m[1])return m[1];
  m=u.match(/[?&](?:wareId|sku|id)=(\d+)/); if(m&&m[1])return m[1];
  m=u.match(/\/(\d+)\.html(?:[#?]|$)/); if(m&&m[1])return m[1];
  return null;
}
function getToken(){ // 先读独立存储，再兜底原始 body
  var raw = get(STORE_ID);
  if (raw) return raw;
  var ck = get(STORE_KEY);
  if (!ck) return "";
  try{
    var pairs=String(ck).split("&");
    for (var i=0;i<pairs.length;i++){ var kv=pairs[i].split("="); var k=decodeURIComponent(kv[0]||""); if(k==="c_mmbDevId") return decodeURIComponent(kv[1]||""); }
  }catch(_){}
  return "";
}

/* ====== 价格/渲染相关轻工具（无 CryptoJS 依赖）====== */
function lowestMsg(r){
  var p = r && r.priceRemark && r.priceRemark.lowestPrice;
  var d = (r && r.priceRemark && r.priceRemark.lowestDate || "").slice(0,10);
  return p==null ? "历史最低：无数据" : ("历史最低：¥"+p+(d?("（"+d+"）"):""));
}
function summaryText(r){
  var arr = (r && r.priceRemark && r.priceRemark.ListPriceDetail) || [];
  var list = [];
  for (var i=0;i<arr.length;i++){ var it = arr[i]||{}; if (/历史最高|常购价/.test(it.Name||"")) continue; list.push(it); }
  if (!list.length) return "暂无有效历史摘要";
  var map={"双11价格":"双十一价格","618价格":"六一八价格","30天最低价":"三十天最低","60天最低价":"六十天最低","180天最低价":"一百八最低"};
  var width=0, j, k;
  for (j=0;j<list.length;j++){ var pr=String(list[j].Price||"-"); width=Math.max(width,pr.length); }
  var out="";
  for (k=0;k<list.length;k++){
    var it=list[k], nm=map[it.Name]||it.Name, pr2=String(it.Price||"-"), dt=it.Date||"", diff=(it.Difference==="-"?"":it.Difference);
    var price = pr2;
    if (pr2!=="-" && pr2.length<width){
      if (price.indexOf(".")<0 && pr2.length+1===width) price+=".";
      price = padEnd(price, width, price.indexOf(".")>=0 ? "0" : " ");
    }
    out += nm+"  "+price+"  "+dt+"  "+diff+"\n";
  }
  return out.replace(/\n$/,"");
}
function toTable(r){
  var arr = (r && r.priceRemark && r.priceRemark.ListPriceDetail) || [];
  var map={"双11价格":"双十一价格","618价格":"六一八价格","30天最低价":"三十天最低","60天最低价":"六十天最低","180天最低价":"一百八最低"};
  var rows="", i, it;
  for (i=0;i<arr.length;i++){
    it=arr[i]||{}; if (/历史最高|常购价/.test(it.Name||"")) continue;
    rows += "<tr><td>"+esc(map[it.Name]||it.Name)+"</td><td>"+esc(it.Price||"-")+"</td><td>"+esc(it.Date||"")+"</td><td>"+esc(it.Difference==="-"?"":it.Difference)+"</td></tr>";
  }
  if (!rows) return '<div class="jd-price-muted">暂无表格数据</div>';
  return '<table class="jd-price-table"><thead><tr><th>名称</th><th>价格</th><th>日期</th><th>差异</th></tr></thead><tbody>'+rows+'</tbody></table>';
}
function toLineChart(list){
  var pts=[], i, x;
  for (i=0;i<(list||[]).length;i++){ x=list[i]; var p=Number(x && (x.price!=null?x.price:(x.Price!=null?x.Price:x.p))); if(!isNaN(p)) pts.push({p:p}); }
  if (!pts.length) return '<div class="jd-price-muted">暂无折线数据</div>';
  var W=320,H=120,P=10,xmax=Math.max(1,pts.length-1);
  var ymin=Infinity,ymax=-Infinity, j;
  for (j=0;j<pts.length;j++){ ymin=Math.min(ymin,pts[j].p); ymax=Math.max(ymax,pts[j].p); }
  if (ymin===Infinity){ymin=0;ymax=1;}
  var sx=(W-2*P)/xmax, sy=(H-2*P)/Math.max(1,(ymax-ymin)||1);
  var points="", k;
  for (k=0;k<pts.length;k++){ var xx=P+k*sx; var yy=H-P-((pts[k].p-ymin)*sy); points+=(k?",":"")+xx+","+yy; }
  return '<svg class="jd-price-chart" viewBox="0 0 '+W+' '+H+'" preserveAspectRatio="none"><polyline fill="none" stroke="#007aff" stroke-width="2" points="'+points+'"/></svg>';
}
function padEnd(s,len,ch){ s=String(s); while(s.length<len){ s+=ch; } return s; }
function esc(s){ return String(s).replace(/[&<>"']/g, function(c){return {"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[c];}); }
function injectAfterHead(html,sn){ if(/<\/head>/i.test(html)) return html.replace(/<\/head>/i,"</head>"+sn); if(/<body[^>]*>/i.test(html)) return html.replace(/<body[^>]*>/i, function(m){return m+sn;}); return sn+html; }
function isTrue(v){ return String(v).toLowerCase()==="true"||v==="1"; }

/* =========================
 *  C. 需要 CryptoJS 的部分才加载（弹窗/渲染）
 * ========================= */
function md5(e){return CryptoJS.MD5(e).toString()}
function intCryptoJS(){ /* —— 精简 CryptoJS：仅 MD5，略 —— */ 
/* 为节省篇幅，这里保持你现有的 CryptoJS MD5 实现，完整粘贴在此处（与之前版本相同） */
}

/* ====== MMB 调用 ====== */
function jsonToCustomString(obj){ var keys=[], k; for (k in obj){ if(Object.prototype.hasOwnProperty.call(obj,k)){ if(String(k).toLowerCase()==="token") continue; if(obj[k]==="") continue; keys.push(k); } } keys.sort(); var s=""; for (var i=0;i<keys.length;i++){ var kk=keys[i]; s+=kk.toUpperCase()+String(obj[kk]).toUpperCase(); } return s; }
function fetchHistory(jdId, devId, cb) {
  try {
    // 懒加载：只在真正用到时才加载 CryptoJS，避免 token 分支崩溃
    if (typeof CryptoJS === "undefined") intCryptoJS();

    var shareBody = {
      methodName: "trendJava",
      spbh: "1|"+jdId,
      url: "https://item.jd.com/"+jdId+".html",
      t: String(Date.now()),
      c_appver: "4.8.3.1",
      c_mmbDevId: devId
    };
    shareBody.token = md5(encodeURIComponent(SECRET + jsonToCustomString(shareBody) + SECRET)).toUpperCase();

    var headers1 = {"Content-Type":"application/x-www-form-urlencoded; charset=utf-8","User-Agent":"Mozilla/5.0 (iPhone) mmbWebBrowse ios"};
    httpPost("https://apapia-history-weblogic.manmanbuy.com/app/share", headers1, toQuery(shareBody), function(e1, r1){
      if (e1) return cb(e1);
      var j1 = safeJson(r1 && r1.body);
      if (!j1 || j1.code !== 2000 || !j1.data) return cb(null, { ok:0, msg: (j1 && j1.msg) || "share无data" });
      var sp = parseQueryFromUrl(j1.data);
      var mp = toMultipart({ shareId: sp.shareId||"", sign: sp.sign||"", spbh: sp.spbh||"", url: sp.url||"" });
      var headers2 = {"content-type":"multipart/form-data; boundary="+mp.boundary};
      httpPost("https://apapia-history-weblogic.manmanbuy.com/h5/share/trendData", headers2, mp.body, function(e2, r2){
        if (e2) return cb(e2);
        var j2 = safeJson(r2 && r2.body) || {};
        cb(null, j2);
      });
    });
  } catch (e) {
    cb(String(e && (e.stack || e)));
  }
}

/* ===== 弹窗 / 页面渲染 / 助手 分支 ===== */
if (mode === "popup") {
  var id = extractId(url);
  if (!id) return done({});
  var dev = getToken();
  if (!dev) { notify(NAME+"｜缺少token", "请先打开慢慢买App-我的获取", ""); return done({}); }
  fetchHistory(id, dev, function (err, j2) {
    if (err) { notify(NAME+"｜接口异常", "", String(err)); return done({}); }
    if (!j2 || j2.ok !== 1) { notify("比价结果", "", j2 && j2.msg ? "慢慢买："+j2.msg : "接口错误"); return done({}); }
    var r = j2.result || {};
    var title = (r.trendData && r.trendData.title) || ("商品 "+id);
    var tip = ((r.priceRemark && r.priceRemark.Tip) || "") + "（仅供参考）";
    var lower = lowestMsg(r);
    var summary = summaryText(r);
    notify(title, lower + " " + tip, summary, {"open-url":"https://item.jd.com/"+id+".html","update-pasteboard":summary});
    done({});
  });
} else if (mode === "render") {
  var id2 = extractId(url);
  if (!id2) { try{$done($response);}catch(_){done({});} return; }
  var dev2 = getToken();
  if (!dev2) { try{$done($response);}catch(_){done({});} return; }
  fetchHistory(id2, dev2, function (err, j22) {
    if (err || !j22 || j22.ok !== 1) { try{$done($response);}catch(_){done({});} return; }
    var r = j22.result || {};
    var title = (r.trendData && r.trendData.title) || ("商品 "+id2);
    var tip = ((r.priceRemark && r.priceRemark.Tip) || "") + "（仅供参考）";
    var lower = lowestMsg(r);
    var summary = summaryText(r);

    var html = $response.body || "";
    var panelId = "jd-price-panel-" + Date.now();
    var css = '<style id="'+panelId+'-css">.jd-price-panel{font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,PingFang SC,Helvetica,Arial;line-height:1.35;box-shadow:0 6px 18px rgba(0,0,0,.08);border:1px solid #eee;border-radius:12px;padding:12px 14px;margin:10px 8px;background:#fff}.jd-price-panel h3{font-size:15px;margin:0 0 8px 0}.jd-price-meta{color:#666;font-size:12px;margin-bottom:8px}.jd-price-pre{font-size:12px;background:#fafafa;border:1px dashed #ddd;border-radius:8px;padding:8px;white-space:pre-wrap}.jd-price-table{width:100%;border-collapse:collapse;font-size:12px;margin-top:6px}.jd-price-table th,.jd-price-table td{border:1px solid #eee;padding:6px 8px;text-align:left}.jd-price-chart{width:100%;height:120px;margin-top:6px}.jd-price-muted{color:#999}</style>';
    var content = "";
    if (isTrue(arg.style_table)) {
      content += toTable(r);
    } else if (isTrue(arg.style_line)) {
      if (!isTrue(arg.line_only)) content += toTable(r);
      content += toLineChart(r.priceTrend || []);
    } else {
      content += '<pre class="jd-price-pre">'+summary.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;")+'</pre>';
    }
    var panel = '<div class="jd-price-panel" id="'+panelId+'"><h3>🧾 '+(title||"")+'</h3><div class="jd-price-meta">'+(lower||"")+' <span class="jd-price-muted">'+(tip||"")+'</span></div>'+content+'</div>';
    html = injectAfterHead(html, css + panel);
    $done({ body: html });
  });
} else if (mode === "assistant") {
  if (isTrue(arg.mute_jd)) { try{$done($response);}catch(_){done({});} }
  else {
    try {
      var html2 = $response.body || "";
      var tag = '<div style="position:fixed;right:8px;bottom:8px;background:#000;color:#fff;font-size:11px;padding:6px 8px;border-radius:8px;opacity:.5;z-index:99999">京东助手已启用</div>';
      html2 = html2.replace(/<\/body>/i, tag + "</body>");
      $done({ body: html2 });
    } catch(_) { try{$done($response);}catch(_){done({});} }
  }
} else {
  done({});
}
