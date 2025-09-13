/* JD Price (debounced, no-retry, per-mode logs) */
(function () {
  var APP = "京东比价";
  var SECRET = "3E41D1331F5DDAFCD0A38FE2D52FF66F";
  var KEY_BODY = "manmanbuy_val";
  var KEY_DEVID = "慢慢买CK";
  var GUARD_TTL = 3000; // 同 sku+mode 3 秒内只请求一次

  /* ---------- 小工具 ---------- */
  function notify(t, s, b, ext) {
    try {
      if (typeof $notify === "function") $notify(t || "", s || "", b || "", ext || {});
      else if (typeof $notification !== "undefined") $notification.post(t || "", s || "", b || "", ext || {});
    } catch (_) {}
  }
  function done(v) { try { $done(v || {}); } catch (_) {} }
  function getval(k) { try { return (typeof $prefs !== "undefined") ? $prefs.valueForKey(k) : $persistentStore.read(k); } catch (_) { return null; } }
  function setval(k, v) { try { return (typeof $prefs !== "undefined") ? $prefs.setValueForKey(v, k) : $persistentStore.write(v, k); } catch (_) { return false; } }
  function argObj(a) { var o = {}; if (!a) return o; String(a).split(/[&;,]/).forEach(function (kv) { var i = kv.indexOf("="); if (i === -1) return; o[decodeURIComponent(kv.slice(0, i))] = decodeURIComponent(kv.slice(i + 1)); }); return o; }
  var ARG = argObj(typeof $argument === "string" ? $argument : "");
  var MODE = (ARG.mode || "").toLowerCase();
  var REQ_URL = ($request && $request.url) || "";

  /* 独立日志（Surge App → 设置 → 日志） */
  var LOG_TAG = (MODE === "token" ? "获取token" : MODE === "popup" ? "弹窗" : "渲染");
  function flog(line) { try { console.log("[" + APP + "·" + LOG_TAG + "] " + line); } catch (_) {} }

  /* ---------- 纯 JS MD5（blueimp 精简版） ---------- */
  function md5(s){function l(n,t){return(n<<t)|(n>>>32-t)}function k(n,t){var r=(65535&n)+(65535&t);return(n>>16)+(t>>16)+(r>>16)<<16|65535&r}function m(n,t,r,e,o,u){return k(l(k(k(t,n),k(e,u)),o),r)}function p(n,t,r,e,o,u,a){return m(t&r|~t&e,n,t,o,u,a)}function q(n,t,r,e,o,u,a){return m(t&e|r&~e,n,t,o,u,a)}function g(n,t,r,e,o,u,a){return m(t^r^e,n,t,o,u,a)}function v(n,t,r,e,o,u,a){return m(r^(t|~e),n,t,o,u,a)}function x(n){for(var t=[],r=0;r<64;r+=4)t[r>>2]=n.charCodeAt(r)+(n.charCodeAt(r+1)<<8)+(n.charCodeAt(r+2)<<16)+(n.charCodeAt(r+3)<<24);return t}function y(n){var t,r="",e=32*n.length;for(t=0;t<e;t+=8)r+=String.fromCharCode(n[t>>5]>>>t%32&255);return r}function z(n){var t,r=[];for(r[(n.length>>2)-1]=void 0,t=0;t<r.length;t+=1)r[t]=0;var e=8*n.length;for(t=0;t<e;t+=8)r[t>>5]|=(255&n.charCodeAt(t/8))<<t%32;return r}function A(n){var t,r="0123456789abcdef",e="";for(t=0;t<n.length;t+=1){var o=n.charCodeAt(t);e+=r.charAt(o>>>4&15)+r.charAt(15&o)}return e}function B(n){return unescape(encodeURIComponent(n))}function C(n){return y(D(z(n),8*n.length))}function D(n,t){n[t>>5]|=128<<t%32,n[14+(t+64>>>9<<4)]=t;var r,e,o,u,a,c=1732584193,f=-271733879,i=-1732584194,d=271733878;for(r=0;r<n.length;r+=16)e=c,o=f,u=i,a=d,c=p(c,f,i,d,n[r],7,-680876936),d=p(d,c,f,i,n[r+1],12,-389564586),i=p(i,d,c,f,n[r+2],17,606105819),f=p(f,i,d,c,n[r+3],22,-1044525330),c=p(c,f,i,d,n[r+4],7,-176418897),d=p(d,c,f,i,n[r+5],12,1200080426),i=p(i,d,c,f,n[r+6],17,-1473231341),f=p(f,i,d,c,n[r+7],22,-45705983),c=p(c,f,i,d,n[r+8],7,1770035416),d=p(d,c,f,i,n[r+9],12,-1958414417),i=p(i,d,c,f,n[r+10],17,-42063),f=p(f,i,d,c,n[r+11],22,-1990404162),c=p(c,f,i,d,n[r+12],7,1804603682),d=p(d,c,f,i,n[r+13],12,-40341101),i=p(i,d,c,f,n[r+14],17,-1502002290),f=p(f,i,d,c,n[r+15],22,1236535329),c=q(c,f,i,d,n[r+1],5,-165796510),d=q(d,c,f,i,n[r+6],9,-1069501632),i=q(i,d,c,f,n[r+11],14,643717713),f=q(f,i,d,c,n[r],20,-373897302),c=q(c,f,i,d,n[r+5],5,-701558691),d=q(d,c,f,i,n[r+10],9,38016083),i=q(i,d,c,f,n[r+15],14,-660478335),f=q(f,i,d,c,n[r+4],20,-405537848),c=q(c,f,i,d,n[r+9],5,568446438),d=q(d,c,f,i,n[r+14],9,-1019803690),i=q(i,d,c,f,n[r+3],14,-187363961),f=q(f,i,d,c,n[r+8],20,1163531501),c=q(c,f,i,d,n[r+13],5,-1444681467),d=q(d,c,f,i,n[r+2],9,-51403784),i=q(i,d,c,f,n[r+7],14,1735328473),f=q(f,i,d,c,n[r+12],20,-1926607734),c=g(c,f,i,d,n[r+5],4,-378558),d=g(d,c,f,i,n[r+8],11,-2022574463),i=g(i,d,c,f,n[r+11],16,1839030562),f=g(f,i,d,c,n[r+14],23,-35309556),c=g(c,f,i,d,n[r+1],4,-1530992060),d=g(d,c,f,i,n[r+4],11,1272893353),i=g(i,d,c,f,n[r+7],16,-155497632),f=g(f,i,d,c,n[r+10],23,-1094730640),c=g(c,f,i,d,n[r+13],4,681279174),d=g(d,c,f,i,n[r],11,-358537222),i=g(i,d,c,f,n[r+3],16,-722521979),f=g(f,i,d,c,n[r+6],23,76029189),c=g(c,f,i,d,n[r+9],4,-640364487),d=g(d,c,f,i,n[r+12],11,-421815835),i=g(i,d,c,f,n[r+15],16,-995338651),f=g(f,i,d,c,n[r+2],23,-198630844),c=v(c,f,i,d,n[r],6,1700485571),d=v(d,c,f,i,n[r+7],10,-1894986606),i=v(i,d,c,f,n[r+14],15,-1051523),f=v(f,i,d,c,n[r+5],21,-2054922799),c=v(c,f,i,d,n[r+12],6,1873313359),d=v(d,c,f,i,n[r+3],10,-30611744),i=v(i,d,c,f,n[r+10],15,-1560198380),f=v(f,i,d,c,n[r+1],21,1309151649),c=k(c,e),f=k(f,o),i=k(i,u),d=k(d,a);return [c,f,i,d]}return A(C(B(s))).toLowerCase()}
  function md5U(s){ return md5(s).toUpperCase(); }

  /* ---------- HTTP ---------- */
  if (typeof Promise.withResolvers !== "function") {
    Promise.withResolvers = function () { var rj, rs; var p = new Promise(function (res, rej){ rs = res; rj = rej; }); return { promise: p, resolve: rs, reject: rj }; };
  }
  function http(op, ttl) {
    var wr = Promise.withResolvers(), to = setTimeout(function(){ wr.reject(new Error("timeout")); }, (op.$timeout || (ttl||8)*1000));
    function h(res){ try{ res.status = res.status || res.statusCode; if (typeof res.body === "string") res.json = function(){ return JSON.parse(res.body); }; }catch(_){}
      clearTimeout(to); if (res.error || res.status<200 || res.status>307) wr.reject(res.error||new Error("http_error")); else wr.resolve(res); }
    try{ this.$httpClient && this.$httpClient[op.method||"get"](op,function(e,r,b){ h({error:e,status:r&&(r.status||r.statusCode),headers:r&&r.headers,body:b}); }); }catch(_){}
    try{ this.$task && this.$task.fetch(Object.assign({url:op.url},op)).then(h,h);}catch(_){}
    return wr.promise;
  }

  /* ---------- 业务工具 ---------- */
  function parseQS(q){ var o={}; (q||"").split("&").forEach(function(p){ var kv=p.split("="); o[decodeURIComponent(kv[0]||"")] = decodeURIComponent(kv[1]||""); }); return o; }
  function toQS(obj){ return Object.keys(obj).map(function(k){ return encodeURIComponent(k)+"="+encodeURIComponent(obj[k]); }).join("&"); }
  function toCustomStr(obj){ return Object.keys(obj).filter(function(k){ return obj[k]!=="" && k.toLowerCase()!=="token"; }).sort().map(function(k){ return k.toUpperCase()+String(obj[k]).toUpperCase(); }).join(""); }
  function getCk(){ var ck=getval(KEY_BODY); if(!ck){ notify(APP,"请先打开【慢慢买】App 的“我的”页","看到“获取 ck 成功”后再回京东"); return null; } return parseQS(ck).c_mmbDevId || getval(KEY_DEVID); }
  function extractId(u){ var m=u.match(/\/product\/(?:[A-Za-z]+\/)?(\d+)\.html/); if(m&&m[1])return m[1]; m=u.match(/[?&](?:wareId|sku|id)=(\d+)/); if(m&&m[1])return m[1]; m=u.match(/\/(\d+)\.html(?:[#?]|$)/); if(m&&m[1])return m[1]; return null; }

  /* 去抖：同 sku+mode 3 秒只打一次 */
  function hitGuard(sku, mode){
    try{
      var k="jdprice_guard_"+mode+"_"+sku;
      var last=Number(getval(k)||0), now=Date.now();
      if (last && (now - last) < GUARD_TTL) { flog("GUARD 命中："+sku+" @"+mode); return true; }
      setval(k,String(now));
    }catch(_){}
    return false;
  }

  /* ---------- 慢慢买接口 ---------- */
  function requestHistoryPrice(id){
    var devid = getCk(); if (!devid) return Promise.reject(new Error("no_devid"));
    var body = { methodName:"trendJava", spbh:"1|"+id, url:"https://item.jd.com/"+id+".html", t:String(Date.now()), c_appver:"4.9.1.4", c_mmbDevId:devid };
    var signSrc = SECRET + toCustomStr(body) + SECRET; var token = md5U(signSrc);
    body.token = token;

    flog("[JD-比价] /app/share ↓");
    return http({
      method:"post",
      url:"https://apapia-history-weblogic.manmanbuy.com/app/share",
      headers:{
        "Content-Type":"application/x-www-form-urlencoded; charset=utf-8",
        "User-Agent":"Mozilla/5.0 (iPhone; CPU iPhone OS 13_1_3 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 - mmbWebBrowse - ios"
      },
      body: toQS(body)
    }, 8).then(function(res){
      flog("[JD-比价] /app/share ↑");
      var j = res.json && res.json(); if (!j || j.code!==2000 || !j.data) throw new Error("token 校验失败：访问太频繁了，请验证后继续使用");
      var q = String(j.data).split("?")[1] || ""; var sp = parseQS(q);
      var boundary="----WebKitFormBoundary"+Math.random().toString(36).slice(2);
      var fd=""; ["shareId","sign","spbh","url"].forEach(function(k){ fd += "--"+boundary+"\r\nContent-Disposition: form-data; name=\""+k+"\"\r\n\r\n"+(sp[k]||"")+"\r\n"; });
      fd += "--"+boundary+"--\r\n";
      return http({
        method:"post",
        url:"https://apapia-history-weblogic.manmanbuy.com/h5/share/trendData",
        headers:{ "content-type": "multipart/form-data; boundary="+boundary },
        body: fd
      }, 8).then(function(r){ return r.json && r.json(); });
    });
  }

  /* ---------- 文本/渲染 ---------- */
  function lowerMsg(r){ var lp=r&&r.priceRemark&&r.priceRemark.lowestPrice; var ld=r&&r.priceRemark&&r.priceRemark.lowestDate?String(r.priceRemark.lowestDate).slice(0,10):""; return (lp!=null)?("历史最低:¥"+lp+(ld?("("+ld+")"):"")):""; }
  function summaryText(r){
    var arr=(r&&r.priceRemark&&r.priceRemark.ListPriceDetail)||[];
    var map={"双11价格":"双十一价格","618价格":"六一八价格","30天最低价":"三十天最低","60天最低价":"六十天最低","180天最低价":"一百八最低"};
    var list=[]; for (var i=0;i<arr.length;i++){ var it=arr[i]; var nm=(it&&it.Name)||""; if(/历史最高|常购价/.test(nm)) continue;
      list.push({Name:map[nm]||nm, Price:String((it&&it.Price)!=null?it.Price:"-"), Date:(it&&it.Date)||"", Difference:(it&&it.Difference)||""});
    }
    var maxW=0; for (var j=0;j<list.length;j++) maxW=Math.max(maxW,list[j].Price.length);
    var out=""; for (var k=0;k<list.length;k++){ var it2=list[k]; if (it2.Price==='-') continue;
      var p=it2.Price; if(p.length<maxW){ p=(p.indexOf(".")>=0||p.length+1===maxW)?p:(p+"."); var fill=(p.indexOf(".")>=0)?"0":" "; while(p.length<maxW) p+=fill; }
      out+=it2.Name+"  "+p+"  "+it2.Date+"  "+(it2.Difference==='-'?"":it2.Difference)+"\n";
    }
    return out.replace(/\n$/,"");
  }

  /* ---------- A) 获取 token ---------- */
  if (MODE==="token" && /baoliao\/center\/menu/.test(REQ_URL)) {
    flog("— [京东比价·获取token] —");
    try{
      var body=$request&&$request.body||"";
      flog("原始 body: "+body.slice(0,220)+"...");
      setval(KEY_BODY, body);
      var devId=""; try{
        if (typeof URLSearchParams==="function") devId=new URLSearchParams(body).get("c_mmbDevId")||"";
        if (!devId){ var ps=String(body).split("&"); for (var i=0;i<ps.length;i++){ var kv=ps[i].split("="); if (decodeURIComponent(kv[0]||"")==="c_mmbDevId"){ devId=decodeURIComponent(kv[1]||""); break; } } }
      }catch(_){}
      setval(KEY_DEVID, devId||"");
      flog("DevId: "+(devId||"(空)"));
      notify(APP,"获取 ck 成功🎉", devId?("c_mmbDevId="+devId):"");
    }catch(e){
      notify(APP+"｜获取token异常","", String((e&&e.message)||e));
    }
    return done({});
  }

  /* ---------- B) 弹窗 ---------- */
  if (MODE==="popup" && typeof $response === "undefined") {
    flog("URL: "+REQ_URL);
    var id1=extractId(REQ_URL); flog("商品ID: "+(id1||"(未识别)"));
    if (!id1 || hitGuard(id1,"popup")) return done({});
    requestHistoryPrice(id1).then(function(data){
      if (data && data.ok===1){
        var r=data.result||{}, title=(r.trendData&&r.trendData.title)||("商品 "+id1);
        var tip=((r.priceRemark&&r.priceRemark.Tip)||"")+"（仅供参考）";
        var lower=lowerMsg(r), detail=summaryText(r);
        notify(title, lower+" "+tip, detail, {"open-url":"https://item.jd.com/"+id1+".html", "update-pasteboard": detail});
      }else{
        notify(APP+"｜接口异常","", (data&&data.msg)||"无效返回");
      }
    }).catch(function(e){ notify(APP+"｜接口异常","", String((e&&e.message)||e)); }).finally(function(){ done({}); });
    return;
  }

  /* ---------- C) 页面渲染（表格/原始/折线） ---------- */
  if (MODE==="render" && typeof $response !== "undefined") {
    flog("URL: "+REQ_URL);
    var id2=extractId(REQ_URL); flog("商品ID: "+(id2||"(未识别)"));
    if (!id2 || hitGuard(id2,"render")) { try{ $done($response); }catch(_){ done({}); } return; }
    requestHistoryPrice(id2).then(function(data){
      if (!(data && data.ok===1)) { flog("异常: "+((data&&data.msg)||"无效返回")); try{ $done($response); }catch(_){ done({}); } return; }
      var r=data.result||{}, tip=((r.priceRemark&&r.priceRemark.Tip)||"")+"（仅供参考）", lower=lowerMsg(r);

      var rows="", arr=(r.priceRemark&&r.priceRemark.ListPriceDetail)||[], map={"双11价格":"双十一价格","618价格":"六一八价格","30天最低价":"三十天最低","60天最低价":"六十天最低","180天最低价":"一百八最低"};
      for (var i=0;i<arr.length;i++){ var it=arr[i]; var nm=(it&&it.Name)||""; if(/历史最高|常购价/.test(nm)) continue;
        rows += "<tr><td>"+(map[nm]||nm||"")+"</td><td>"+((it&&it.Price!=null)?it.Price:"-")+"</td><td>"+((it&&it.Date)||"")+"</td><td>"+((it&&it.Difference==='-')?"":((it&&it.Difference)||""))+"</td></tr>";
      }
      var tableHtml = rows ? '<table class="jd-price-table"><thead><tr><th>名称</th><th>价格</th><th>日期</th><th>差异</th></tr></thead><tbody>'+rows+'</tbody></table>' : '<div class="jd-price-muted">暂无表格数据</div>';

      var ptsSrc=r.priceTrend||[], pts=[]; for (var j=0;j<ptsSrc.length;j++){ var v=ptsSrc[j]; var num=Number(v && (v.price!=null?v.price:(v.Price!=null?v.Price:v.p))); if(!isNaN(num)) pts.push(num); }
      var chartHtml = '<div class="jd-price-muted">暂无折线数据</div>';
      if (pts.length){ var W=320,H=120,P=10,xmax=Math.max(1,pts.length-1); var ymin=Infinity,ymax=-Infinity; for (var k=0;k<pts.length;k++){ ymin=Math.min(ymin,pts[k]); ymax=Math.max(ymax,pts[k]); }
        if (ymin===Infinity){ ymin=0; ymax=1; }
        var sx=(W-2*P)/xmax, sy=(H-2*P)/Math.max(1,(ymax-ymin)||1);
        var points=""; for (var m=0;m<pts.length;m++){ var xx=P+m*sx; var yy=H-P-((pts[m]-ymin)*sy); points+=(m?",":"")+xx+","+yy; }
        chartHtml = '<svg class="jd-price-chart" viewBox="0 0 '+W+' '+H+'" preserveAspectRatio="none"><polyline fill="none" stroke="#007aff" stroke-width="2" points="'+points+'"/></svg>';
      }

      var style = (ARG.style || "line").toLowerCase();
      var lineOnly = String(ARG.line_only || "").toLowerCase()==="true";
      var content = "";
      if (style==="table") content = tableHtml;
      else if (style==="raw") content = '<pre class="jd-price-pre">'+summaryText(r).replace(/[&<>]/g,function(s){return({"&":"&amp;","<":"&lt;",">":"&gt;"})[s];})+'</pre>';
      else content = (lineOnly?"":tableHtml) + chartHtml;

      var css = '<style>.jd-price-panel{font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,PingFang SC,Helvetica,Arial;line-height:1.35;box-shadow:0 6px 18px rgba(0,0,0,.08);border:1px solid #eee;border-radius:12px;padding:12px 14px;margin:10px 8px;background:#fff}.jd-price-panel h3{font-size:15px;margin:0 0 8px 0}.jd-price-meta{color:#666;font-size:12px;margin-bottom:8px}.jd-price-pre{font-size:12px;background:#fafafa;border:1px dashed #ddd;border-radius:8px;padding:8px;white-space:pre-wrap}.jd-price-table{width:100%;border-collapse:collapse;font-size:12px;margin-top:6px}.jd-price-table th,.jd-price-table td{border:1px solid #eee;padding:6px 8px;text-align:left}.jd-price-muted{color:#999}.jd-price-chart{width:100%;height:120px;margin-top:6px}</style>';
      var panel = css + '<div class="jd-price-panel"><h3>价格趋势</h3><div class="jd-price-meta">'+lower+' <span class="jd-price-muted">'+tip+'</span></div>'+content+'</div>';

      var html = ($response && $response.body) || "";
      if (/<\/body>/i.test(html)) html = html.replace(/<\/body>/i, panel + "</body>"); else html = panel + html;
      $done({ body: html });
    }).catch(function(e){
      flog("异常: "+String((e&&e.message)||e));
      try{ $done($response); }catch(_){ done({}); }
    });
    return;
  }

  done({});
})();
