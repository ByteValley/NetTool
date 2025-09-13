/* JD Price – token/popup/render unified
 * - 纯 JS MD5（不再依赖 CryptoJS）避免 l.extend 报错
 * - 每个分支均 console.log，Surge 会按“脚本名”生成独立日志文件
 * - 仅需 MITM：in.m.jd.com, apapia-sqk-weblogic.manmanbuy.com
 */
(function () {
  var APP = "京东比价";
  var SECRET = "3E41D1331F5DDAFCD0A38FE2D52FF66F";
  var KEY_BODY = "manmanbuy_val";   // 原始 body（含 c_mmbDevId）
  var KEY_DEVID = "慢慢买CK";       // 直接保存 c_mmbDevId

  /* ---------- 基础工具 ---------- */
  function notify(t, s, b, ext) {
    try {
      if (typeof $notify === "function") $notify(t || "", s || "", b || "", ext || {});
      else if (typeof $notification !== "undefined") $notification.post(t || "", s || "", b || "", ext || {});
    } catch (_) {}
  }
  function done(v){ try{ $done(v||{});}catch(_){ } }
  function getval(k){ try{ return (typeof $prefs!=="undefined")?$prefs.valueForKey(k):$persistentStore.read(k);}catch(_){return null;} }
  function setval(k,v){ try{ return (typeof $prefs!=="undefined")?$prefs.setValueForKey(v,k):$persistentStore.write(v,k);}catch(_){return false;} }
  function argObj(a){ var o={}; if(!a) return o; String(a).split(/[&;,]/).forEach(function(kv){var i=kv.indexOf("="); if(i===-1) return; o[decodeURIComponent(kv.slice(0,i))]=decodeURIComponent(kv.slice(i+1));}); return o; }
  var ARG = argObj(typeof $argument==="string"?$argument:"");
  var DEBUG = String(ARG.debug||"").trim()==="1";
  function log(){ try{ console.log.apply(console, arguments);}catch(_){ } }
  function dbg(){ if (DEBUG) { try{ console.log.apply(console, arguments);}catch(_){ } } }

  /* ---------- 兼容 Promise.withResolvers ---------- */
  if (typeof Promise.withResolvers !== "function") {
    Promise.withResolvers = function () {
      var resolve, reject;
      var promise = new Promise(function (res, rej) { resolve = res; reject = rej; });
      return { promise: promise, resolve: resolve, reject: reject };
    };
  }

  /* ---------- 纯 JS MD5（十六进制字符串） ---------- */
  function md5Hex(str){
    function toBytes(s){ var i, bytes=[]; for(i=0;i<s.length;i++){ var c=s.charCodeAt(i); if(c<128) bytes.push(c); else if(c<2048){ bytes.push((c>>6)|192, (c&63)|128);} else if(c<55296||c>=57344){ bytes.push((c>>12)|224, ((c>>6)&63)|128, (c&63)|128);} else { i++; c=65536+(((c&1023)<<10)|(s.charCodeAt(i)&1023)); bytes.push((c>>18)|240, ((c>>12)&63)|128, ((c>>6)&63)|128, (c&63)|128);} } return bytes; }
    function rrot(x,n){ return (x>>>n)|(x<< (32-n)); }
    function add(x,y){ var l=(x&0xffff)+(y&0xffff); var h=(x>>>16)+(y>>>16)+(l>>>16); return (h<<16)|(l&0xffff); }
    function ff(a,b,c,d,x,s,t){ return add(rrot(add(add(a,(b&c)|(~b&d)),add(x,t)),32-s),b);}
    function gg(a,b,c,d,x,s,t){ return add(rrot(add(add(a,(b&d)|(c&~d)),add(x,t)),32-s),b);}
    function hh(a,b,c,d,x,s,t){ return add(rrot(add(add(a,b^c^d),add(x,t)),32-s),b);}
    function ii(a,b,c,d,x,s,t){ return add(rrot(add(add(a,c^(b|~d)),add(x,t)),32-s),b);}
    var i, j, x = [], bytes = toBytes(str), len = bytes.length;
    bytes.push(0x80);
    while ((bytes.length % 64) !== 56) bytes.push(0);
    var bitLen = len * 8;
    for (i=0;i<8;i++) bytes.push(bitLen >>> (8*i) & 0xff);
    for (i=0;i<bytes.length;i+=64){
      var a=1732584193, b=-271733879, c=-1732584194, d=271733878;
      for (j=0;j<64;j+=4) x[j>>2] = bytes[i+j] | (bytes[i+j+1]<<8) | (bytes[i+j+2]<<16) | (bytes[i+j+3]<<24);
      // Round 1
      a=ff(a,b,c,d,x[0],7,-680876936); d=ff(d,a,b,c,x[1],12,-389564586); c=ff(c,d,a,b,x[2],17,606105819); b=ff(b,c,d,a,x[3],22,-1044525330);
      a=ff(a,b,c,d,x[4],7,-176418897); d=ff(d,a,b,c,x[5],12,1200080426); c=ff(c,d,a,b,x[6],17,-1473231341); b=ff(b,c,d,a,x[7],22,-45705983);
      a=ff(a,b,c,d,x[8],7,1770035416); d=ff(d,a,b,c,x[9],12,-1958414417); c=ff(c,d,a,b,x[10],17,-42063); b=ff(b,c,d,a,x[11],22,-1990404162);
      a=ff(a,b,c,d,x[12],7,1804603682); d=ff(d,a,b,c,x[13],12,-40341101); c=ff(c,d,a,b,x[14],17,-1502002290); b=ff(b,c,d,a,x[15],22,1236535329);
      // Round 2
      a=gg(a,b,c,d,x[1],5,-165796510); d=gg(d,a,b,c,x[6],9,-1069501632); c=gg(c,d,a,b,x[11],14,643717713); b=gg(b,c,d,a,x[0],20,-373897302);
      a=gg(a,b,c,d,x[5],5,-701558691); d=gg(d,a,b,c,x[10],9,38016083); c=gg(c,d,a,b,x[15],14,-660478335); b=gg(b,c,d,a,x[4],20,-405537848);
      a=gg(a,b,c,d,x[9],5,568446438); d=gg(d,a,b,c,x[14],9,-1019803690); c=gg(c,d,a,b,x[3],14,-187363961); b=gg(b,c,d,a,x[8],20,1163531501);
      a=gg(a,b,c,d,x[13],5,-1444681467); d=gg(d,a,b,c,x[2],9,-51403784); c=gg(c,d,a,b,x[7],14,1735328473); b=gg(b,c,d,a,x[12],20,-1926607734);
      // Round 3
      a=hh(a,b,c,d,x[5],4,-378558); d=hh(d,a,b,c,x[8],11,-2022574463); c=hh(c,d,a,b,x[11],16,1839030562); b=hh(b,c,d,a,x[14],23,-35309556);
      a=hh(a,b,c,d,x[1],4,-1530992060); d=hh(d,a,b,c,x[4],11,1272893353); c=hh(c,d,a,b,x[7],16,-155497632); b=hh(b,c,d,a,x[10],23,-1094730640);
      a=hh(a,b,c,d,x[13],4,681279174); d=hh(d,a,b,c,x[0],11,-358537222); c=hh(c,d,a,b,x[3],16,-722521979); b=hh(b,c,d,a,x[6],23,76029189);
      a=hh(a,b,c,d,x[9],4,-640364487); d=hh(d,a,b,c,x[12],11,-421815835); c=hh(c,d,a,b,x[15],16,530742520); b=hh(b,c,d,a,x[2],23,-995338651);
      // Round 4
      a=ii(a,b,c,d,x[0],6,-198630844); d=ii(d,a,b,c,x[7],10,1126891415); c=ii(c,d,a,b,x[14],15,-1416354905); b=ii(b,c,d,a,x[5],21,-57434055);
      a=ii(a,b,c,d,x[12],6,1700485571); d=ii(d,a,b,c,x[3],10,-1894986606); c=ii(c,d,a,b,x[10],15,-1051523); b=ii(b,c,d,a,x[1],21,-2054922799);
      a=ii(a,b,c,d,x[8],6,1873313359); d=ii(d,a,b,c,x[15],10,-30611744); c=ii(c,d,a,b,x[6],15,-1560198380); b=ii(b,c,d,a,x[13],21,1309151649);
      a=add(a,1732584193); b=add(b,-271733879); c=add(c,-1732584194); d=add(d,271733878);
    }
    function hex(x){ var s="", v; for (var i=0;i<4;i++){ v = (x>>> (i*8)) & 255; s += ("0"+v.toString(16)).slice(-2); } return s; }
    return (hex(a)+hex(b)+hex(c)+hex(d)).replace(/.{8}(?=.)/g, function(m){return m;}); // 保留顺序
  }

  /* ---------- HTTP 兼容层 ---------- */
  function $http(op, t){
    var ttl = t || 8;
    var wr = Promise.withResolvers();
    var timer = setTimeout(function(){ wr.reject(new Error("timeout")); }, (op.$timeout || ttl*1000));
    function handle(res){
      try{
        res = res || {};
        res.status = res.status || res.statusCode;
        if (typeof res.body === "string") res.json = function(){ return JSON.parse(res.body); };
      }catch(_){}
      clearTimeout(timer);
      if (res.error || res.status < 200 || res.status > 307) wr.reject(res.error || new Error("http_error"));
      else wr.resolve(res);
    }
    try{ this.$httpClient && this.$httpClient[op.method||"get"](op, function(e, r, b){ handle({ error: e, status: r && (r.status||r.statusCode), headers: r && r.headers, body: b });}); }catch(_){}
    try{ this.$task && this.$task.fetch(Object.assign({ url: op.url }, op)).then(handle, handle); }catch(_){}
    return wr.promise;
  }

  /* ---------- 共用工具 ---------- */
  function parseQS(q){ var o={}; (q||"").split("&").forEach(function(p){ var kv=p.split("="); o[decodeURIComponent(kv[0]||"")] = decodeURIComponent(kv[1]||""); }); return o; }
  function toQS(obj){ return Object.keys(obj).map(function(k){ return encodeURIComponent(k)+"="+encodeURIComponent(obj[k]); }).join("&"); }
  function toCustomStr(obj){ return Object.keys(obj).filter(function(k){ return obj[k]!=="" && k.toLowerCase()!=="token"; }).sort().map(function(k){ return k.toUpperCase()+String(obj[k]).toUpperCase(); }).join(""); }
  function getCk(){ var ck=getval(KEY_BODY); if(!ck){ notify(APP,"请先打开【慢慢买】App 的“我的”页","看到“获取 ck 成功”后再回京东"); return null; } return parseQS(ck).c_mmbDevId || getval(KEY_DEVID); }
  function extractId(u){
    var m=u.match(/\/product\/(?:[A-Za-z]+\/)?(\d+)\.html/); if(m && m[1]) return m[1];
    m=u.match(/[?&](?:wareId|sku|id)=(\d+)/); if(m && m[1]) return m[1];
    m=u.match(/\/(\d+)\.html(?:[#?]|$)/); if(m && m[1]) return m[1];
    return null;
  }

  /* ---------- 慢慢买查询 ---------- */
  function requestHistoryPrice(id){
    var devid = getCk();
    if (!devid) return Promise.reject(new Error("no_devid"));

    var shareBody = { methodName:"trendJava", spbh:"1|"+id, url:"https://item.jd.com/"+id+".html", t:String(Date.now()), c_appver:"4.8.3.1", c_mmbDevId:devid };
    // token 计算（纯 JS MD5）
    var tokenStr = encodeURIComponent(SECRET + toCustomStr(shareBody) + SECRET);
    shareBody.token = md5Hex(tokenStr).toUpperCase();

    var headers = {
      "Content-Type":"application/x-www-form-urlencoded; charset=utf-8",
      "User-Agent":"Mozilla/5.0 (iPhone; CPU iPhone OS 13_1_3 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 - mmbWebBrowse - ios",
    };
    var reqShare = { method:"post", url:"https://apapia-history-weblogic.manmanbuy.com/app/share", headers:headers, body:toQS(shareBody) };
    log("[JD-比价] /app/share ←", JSON.stringify(shareBody));

    function buildMultipart(fields){
      var boundary="----WebKitFormBoundary"+Math.random().toString(36).slice(2);
      var body=""; Object.keys(fields).forEach(function(k){ body += "--"+boundary+"\r\nContent-Disposition: form-data; name=\""+k+"\"\r\n\r\n"+(fields[k]||"")+"\r\n"; });
      body += "--"+boundary+"--\r\n";
      return { body: body, boundary: boundary };
    }

    return $http(reqShare).then(function(res){
      var j = res.json && res.json();
      log("[JD-比价] /app/share →", j && ("code="+j.code+", msg="+j.msg));
      if (!j || j.code !== 2000 || !j.data) throw new Error((j && j.msg) || "share_error");
      var q = String(j.data).split("?")[1] || "";
      var sp = parseQS(q);
      var mp = buildMultipart({ shareId: sp.shareId||"", sign: sp.sign||"", spbh: sp.spbh||"", url: sp.url||"" });
      log("[JD-比价] /h5/share/trendData ←", JSON.stringify(sp));
      return $http({ method:"post", url:"https://apapia-history-weblogic.manmanbuy.com/h5/share/trendData", headers:{ "content-type":"multipart/form-data; boundary="+mp.boundary }, body: mp.body });
    }).then(function(res){
      var j = res.json && res.json();
      log("[JD-比价] trendData → ok=", j && j.ok, ", msg=", j && j.msg);
      return j;
    });
  }

  /* ---------- 文本格式化 ---------- */
  function lowerMsg(r){
    var lp = r && r.priceRemark && r.priceRemark.lowestPrice;
    var ld = r && r.priceRemark && r.priceRemark.lowestDate ? String(r.priceRemark.lowestDate).slice(0,10) : "";
    return lp!=null ? ("历史最低:¥"+lp+(ld?("("+ld+")"):"")) : "";
  }
  function summaryText(r){
    var arr = (r && r.priceRemark && r.priceRemark.ListPriceDetail) || [];
    var map = { "双11价格":"双十一价格","618价格":"六一八价格","30天最低价":"三十天最低","60天最低价":"六十天最低","180天最低价":"一百八最低" };
    var list=[], i, it, nm;
    for (i=0;i<arr.length;i++){ it=arr[i]; nm=(it&&it.Name)||""; if(/历史最高|常购价/.test(nm)) continue;
      list.push({ Name: map[nm]||nm, Price: String((it && it.Price)!=null?it.Price:"-"), Date:(it&&it.Date)||"", Difference:(it&&it.Difference)||"" });
    }
    var maxW=0; for (i=0;i<list.length;i++) maxW=Math.max(maxW, list[i].Price.length);
    var out=""; for (i=0;i<list.length;i++){ it=list[i]; if(it.Price==='-') continue;
      var p=it.Price; if(p.length<maxW){ p=(p.indexOf(".")>=0 || p.length+1===maxW)?p:(p+"."); var fill=(p.indexOf(".")>=0)?"0":" "; while(p.length<maxW) p+=fill; }
      out += it.Name+"  "+p+"  "+it.Date+"  "+(it.Difference==='-'?"":it.Difference)+"\n";
    }
    return out.replace(/\n$/,"");
  }

  /* ---------- 路由 ---------- */
  var REQ_URL = ($request && $request.url) || "";
  var MODE = (ARG.mode||"").toLowerCase();

  // A) 获取 token
  if (MODE==="token" && /baoliao\/center\/menu/.test(REQ_URL)) {
    try{
      log("[京东比价·获取token] URL:", REQ_URL);
      var body = ($request && $request.body) || "";
      setval(KEY_BODY, body);
      var devId = "";
      try{
        if (typeof URLSearchParams==="function") devId = new URLSearchParams(body).get("c_mmbDevId") || "";
        if (!devId){
          var ps = String(body).split("&");
          for (var i=0;i<ps.length;i++){ var kv=ps[i].split("="); if (decodeURIComponent(kv[0]||"")==="c_mmbDevId"){ devId = decodeURIComponent(kv[1]||""); break; } }
        }
      }catch(_){}
      setval(KEY_DEVID, devId||"");
      log("[京东比价·获取token] c_mmbDevId:", devId);
      notify(APP, "获取 ck 成功🎉", devId?("c_mmbDevId="+devId):body.slice(0,220));
    }catch(e){
      log("[京东比价·获取token] 异常:", String(e && e.stack || e));
      notify(APP+"｜获取token异常","", String(e && e.message || e));
    }
    return done({});
  }

  // B) 弹窗（request）
  if (MODE==="popup" && typeof $response === "undefined") {
    (async function(){
      try{
        log("[京东比价·弹窗] URL:", REQ_URL);
        var id = extractId(REQ_URL);
        log("[京东比价·弹窗] 商品ID:", id);
        if (!id) return done({});
        var data = await requestHistoryPrice(id);
        if (data && data.ok===1){
          var r = data.result || {};
          var title = (r.trendData && r.trendData.title) || ("商品 "+id);
          var tip = ((r.priceRemark && r.priceRemark.Tip) || "") + "（仅供参考）";
          var lower = lowerMsg(r);
          var detail = summaryText(r);
          notify(title, lower+" "+tip, detail, {"open-url":"https://item.jd.com/"+id+".html", "update-pasteboard": detail});
        }else if (data && data.ok===0 && data.msg){
          notify("比价结果", "", "慢慢买提示您："+data.msg);
        }else{
          notify(APP+"｜接口异常","", "返回结构无效");
        }
      }catch(e){
        log("[京东比价·弹窗] 异常:", String(e && e.stack || e));
        notify(APP+"｜接口异常","", String(e && e.message || e));
      }
      done({});
    })();
    return;
  }

  // C) 页面渲染（response）
  if (MODE==="render" && typeof $response !== "undefined") {
    (async function(){
      try{
        log("[京东比价·渲染] URL:", REQ_URL);
        var id = extractId(REQ_URL);
        log("[京东比价·渲染] 商品ID:", id);
        if (!id) return $done($response);
        var data = await requestHistoryPrice(id);
        if (!(data && data.ok===1)) return $done($response);
        var r = data.result || {};
        var title = (r.trendData && r.trendData.title) || ("商品 "+id);
        var tip = ((r.priceRemark && r.priceRemark.Tip) || "") + "（仅供参考）";
        var lower = lowerMsg(r);

        // 表格
        var arr = (r.priceRemark && r.priceRemark.ListPriceDetail) || [];
        var map = {"双11价格":"双十一价格","618价格":"六一八价格","30天最低价":"三十天最低","60天最低价":"六十天最低","180天最低价":"一百八最低"};
        var rows="";
        for (var i=0;i<arr.length;i++){
          var it=arr[i], nm=(it&&it.Name)||""; if(/历史最高|常购价/.test(nm)) continue;
          rows += "<tr><td>"+(map[nm]||nm||"")+"</td><td>"+((it&&it.Price)!=null?it.Price:"-")+"</td><td>"+((it&&it.Date)||"")+"</td><td>"+((it&&it.Difference==='-')?"":((it&&it.Difference)||""))+"</td></tr>";
        }
        var tableHtml = rows ? '<table class="jd-price-table"><thead><tr><th>名称</th><th>价格</th><th>日期</th><th>差异</th></tr></thead><tbody>'+rows+'</tbody></table>' : '<div class="jd-price-muted">暂无表格数据</div>';

        // 折线
        var pts = (r.priceTrend||[]).map(function(x){ return Number(x && (x.price!=null?x.price:(x.Price!=null?x.Price:x.p))); }).filter(function(x){ return !isNaN(x); });
        var chartHtml = '<div class="jd-price-muted">暂无折线数据</div>';
        if (pts.length){
          var W=320,H=120,P=10,xmax=Math.max(1,pts.length-1),ymin=Infinity,ymax=-Infinity;
          for (var j=0;j<pts.length;j++){ ymin=Math.min(ymin,pts[j]); ymax=Math.max(ymax,pts[j]); }
          if (ymin===Infinity){ymin=0;ymax=1;}
          var sx=(W-2*P)/xmax, sy=(H-2*P)/Math.max(1,(ymax-ymin)||1), points="";
          for (var k=0;k<pts.length;k++){ var xx=P+k*sx, yy=H-P-((pts[k]-ymin)*sy); points+=(k?",":"")+xx+","+yy; }
          chartHtml = '<svg class="jd-price-chart" viewBox="0 0 '+W+' '+H+'" preserveAspectRatio="none"><polyline fill="none" stroke="#007aff" stroke-width="2" points="'+points+'"/></svg>';
        }

        var css = '<style>.jd-price-panel{font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,PingFang SC,Helvetica,Arial;line-height:1.35;box-shadow:0 6px 18px rgba(0,0,0,.08);border:1px solid #eee;border-radius:12px;padding:12px 14px;margin:10px 8px;background:#fff}.jd-price-panel h3{font-size:15px;margin:0 0 8px 0}.jd-price-meta{color:#666;font-size:12px;margin-bottom:8px}.jd-price-pre{font-size:12px;background:#fafafa;border:1px dashed #ddd;border-radius:8px;padding:8px;white-space:pre-wrap}.jd-price-table{width:100%;border-collapse:collapse;font-size:12px;margin-top:6px}.jd-price-table th,.jd-price-table td{border:1px solid #eee;padding:6px 8px;text-align:left}.jd-price-muted{color:#999}.jd-price-chart{width:100%;height:120px;margin-top:6px}</style>';

        var style = (ARG.style || "line").toLowerCase();
        var lineOnly = String(ARG.line_only||"").toLowerCase()==="true";
        var content = "";
        if (style==="table") content = tableHtml;
        else if (style==="raw") content = '<pre class="jd-price-pre">'+summaryText(r).replace(/[&<>]/g, function(s){ return {"&":"&amp;","<":"&lt;",">":"&gt;"}[s]; })+'</pre>';
        else content = (lineOnly ? "" : tableHtml) + chartHtml;

        var panel = css+'<div class="jd-price-panel"><h3>价格趋势</h3><div class="jd-price-meta">'+lower+' <span class="jd-price-muted">'+tip+'</span></div>'+content+'</div>';
        var html = ($response && $response.body) || "";
        if (/<\/body>/i.test(html)) html = html.replace(/<\/body>/i, panel + "</body>"); else html = panel + html;
        $done({ body: html });
      }catch(e){
        log("[京东比价·渲染] 异常:", String(e && e.stack || e));
        try{ $done($response); }catch(_){ done({}); }
      }
    })();
    return;
  }

  // 默认放行
  done({});
})();
