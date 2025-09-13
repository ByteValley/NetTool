/* JD Price – token/popup/render unified. Adaptive token & ts. Per-mode file logs. */
(function () {
  const APP = "京东比价";
  const SECRET = "3E41D1331F5DDAFCD0A38FE2D52FF66F";
  const KEY_BODY = "manmanbuy_val";
  const KEY_DEVID = "慢慢买CK";

  // ----- args -----
  const ARG = (function (a) { let o = {}; if (!a) return o; String(a).split(/[&;,]/).forEach(kv => { const i = kv.indexOf("="); if (i === -1) return; o[decodeURIComponent(kv.slice(0, i))] = decodeURIComponent(kv.slice(i + 1)); }); return o; })(typeof $argument === "string" ? $argument : "");
  const MODE = String(ARG.mode || "").toLowerCase();     // token / popup / render
  const STYLE = String(ARG.style || "line").toLowerCase();// table / raw / line
  const LINE_ONLY = String(ARG.line_only || "").toLowerCase() === "true";
  const REQ_URL = ($request && $request.url) || "";

  // ----- notify/done -----
  function notify(t, s, b, ext) { try { if (typeof $notify === "function") $notify(t||"",s||"",b||"",ext||{}); else if (typeof $notification!=="undefined") $notification.post(t||"",s||"",b||"",ext||{});} catch(_){} }
  function done(v){ try{$done(v||{});}catch(_){} }

  // ----- simple file logger (Surge) -----
  const TS = () => new Date().toISOString().replace("T"," ").replace("Z","");
  const day = () => new Date().toISOString().slice(0,10);
  const logfile = n => `${APP}·${n}-${day()}.log`;
  async function flog(name, line){
    try{
      if (typeof $httpAPI === "function") {
        await $httpAPI("POST","/v1/files",{path:logfile(name),content:`${TS()} ${line}\n`,append:true});
      } else {
        console.log(`[${name}] ${line}`);
      }
    }catch(_){}
  }
  const L = { token:s=>flog("获取token",s), popup:s=>flog("弹窗",s), render:s=>flog("渲染",s) };

  // ----- tiny MD5 (纯 JS) -----
  function md5(str){
    function R(r,n){return(r<<n)|(r>>>32-n)}
    function C(q,a,b,c,d,x,s,t){q=(q+((a&b)|(~a&c))+x+t)|0;return (R(q,s)+a)|0}
    function D(q,a,b,c,d,x,s,t){q=(q+((a&c)|(b&~c))+x+t)|0;return (R(q,s)+a)|0}
    function E(q,a,b,c,d,x,s,t){q=(q+(a^b^c)+x+t)|0;return (R(q,s)+a)|0}
    function F(q,a,b,c,d,x,s,t){q=(q+(b^(a|~c))+x+t)|0;return (R(q,s)+a)|0}
    function G(s){s=unescape(encodeURIComponent(s));const n=s.length,w=[];for(let i=0;i<n;i++)w[i>>2]|=s.charCodeAt(i)<<((i%4)<<3);w[n>>2]|=0x80<<((n%4)<<3);w[((n+8)>>6<<4)+14]=n<<3;return w}
    function H(a){let s="";for(let i=0;i<4;i++)s+=("0"+((a>>>(i*8))&255).toString(16)).slice(-2);return s}
    let x=G(str),a=1732584193,b=-271733879,c=-1732584194,d=271733878;
    for(let i=0;i<x.length;i+=16){let oa=a,ob=b,oc=c,od=d;
      a=C(a,b,c,d,0,x[i+0],7,-680876936); d=C(d,a,b,c,0,x[i+1],12,-389564586); c=C(c,d,a,b,0,x[i+2],17,606105819); b=C(b,c,d,a,0,x[i+3],22,-1044525330);
      a=C(a,b,c,d,0,x[i+4],7,-176418897); d=C(d,a,b,c,0,x[i+5],12,1200080426); c=C(c,d,a,b,0,x[i+6],17,-1473231341); b=C(b,c,d,a,0,x[i+7],22,-45705983);
      a=C(a,b,c,d,0,x[i+8],7,1770035416); d=C(d,a,b,c,0,x[i+9],12,-1958414417); c=C(c,d,a,b,0,x[i+10],17,-42063); b=C(b,c,d,a,0,x[i+11],22,-1990404162);
      a=C(a,b,c,d,0,x[i+12],7,1804603682); d=C(d,a,b,c,0,x[i+13],12,-40341101); c=C(c,d,a,b,0,x[i+14],17,-1502002290); b=C(b,c,d,a,0,x[i+15],22,1236535329);

      a=D(a,b,c,d,0,x[i+1],5,-165796510); d=D(d,a,b,c,0,x[i+6],9,-1069501632); c=D(c,d,a,b,0,x[i+11],14,643717713); b=D(b,c,d,a,0,x[i+0],20,-373897302);
      a=D(a,b,c,d,0,x[i+5],5,-701558691); d=D(d,a,b,c,0,x[i+10],9,38016083); c=D(c,d,a,b,0,x[i+15],14,-660478335); b=D(b,c,d,a,0,x[i+4],20,-405537848);
      a=D(a,b,c,d,0,x[i+9],5,568446438); d=D(d,a,b,c,0,x[i+14],9,-1019803690); c=D(c,d,a,b,0,x[i+3],14,-187363961); b=D(b,c,d,a,0,x[i+8],20,1163531501);
      a=D(a,b,c,d,0,x[i+13],5,-1444681467); d=D(d,a,b,c,0,x[i+2],9,-51403784); c=D(c,d,a,b,0,x[i+7],14,1735328473); b=D(b,c,d,a,0,x[i+12],20,-1926607734);

      a=E(a,b,c,d,0,x[i+5],4,-378558); d=E(d,a,b,c,0,x[i+8],11,-2022574463); c=E(c,d,a,b,0,x[i+11],16,1839030562); b=E(b,c,d,a,0,x[i+14],23,-35309556);
      a=E(a,b,c,d,0,x[i+1],4,-1530992060); d=E(d,a,b,c,0,x[i+4],11,1272893353); c=E(c,d,a,b,0,x[i+7],16,-155497632); b=E(b,c,d,a,0,x[i+10],23,-1094730640);
      a=E(a,b,c,d,0,x[i+13],4,681279174); d=E(d,a,b,c,0,x[i+0],11,-358537222); c=E(c,d,a,b,0,x[i+3],16,-722521979); b=E(b,c,d,a,0,x[i+6],23,76029189);
      a=E(a,b,c,d,0,x[i+9],4,-640364487); d=E(d,a,b,c,0,x[i+12],11,-421815835); c=E(c,d,a,b,0,x[i+15],16,530742520); b=E(b,c,d,a,0,x[i+2],23,-995338651);

      a=F(a,b,c,d,0,x[i+0],6,-198630844); d=F(d,a,b,c,0,x[i+7],10,1126891415); c=F(c,d,a,b,0,x[i+14],15,-1416354905); b=F(b,c,d,a,0,x[i+5],21,-57434055);
      a=F(a,b,c,d,0,x[i+12],6,1700485571); d=F(d,a,b,c,0,x[i+3],10,-1894986606); c=F(c,d,a,b,0,x[i+10],15,-1051523); b=F(b,c,d,a,0,x[i+1],21,-2054922799);
      a=F(a,b,c,d,0,x[i+8],6,1873313359); d=F(d,a,b,c,0,x[i+15],10,-30611744); c=F(c,d,a,b,0,x[i+6],15,-1560198380); b=F(b,c,d,a,0,x[i+13],21,1309151649);

      a=(a+oa)|0; b=(b+ob)|0; c=(c+oc)|0; d=(d+od)|0;
    }
    function hex(x){return (H(a)+H(b)+H(c)+H(d)).toUpperCase()}
    return hex();
  }

  // ----- HTTP -----
  function http(op, ttl=8){
    const wr = Promise.withResolvers();
    const timer = setTimeout(()=>wr.reject(new Error("timeout")), op.$timeout || ttl*1000);
    function handle(res){
      try{res=res||{};res.status=res.status||res.statusCode; if(typeof res.body==="string") res.json=()=>JSON.parse(res.body);}catch(_){}
      clearTimeout(timer);
      if (res.error || res.status<200 || res.status>307) wr.reject(res.error || new Error("http_error")); else wr.resolve(res);
    }
    try{ this.$httpClient && this.$httpClient[op.method||"get"](op,(e,r,b)=>handle({error:e,status:(r&&(r.status||r.statusCode)),headers:r&&r.headers,body:b})); }catch(_){}
    try{ this.$task && this.$task.fetch(Object.assign({url:op.url},op)).then(handle,handle);}catch(_){}
    return wr.promise;
  }

  // ----- helpers -----
  function parseQS(q){const o={};(q||"").split("&").forEach(p=>{const kv=p.split("=");o[decodeURIComponent(kv[0]||"")]=decodeURIComponent(kv[1]||"");});return o;}
  function toQS(obj){return Object.keys(obj).map(k=>`${encodeURIComponent(k)}=${encodeURIComponent(obj[k])}`).join("&");}
  function toCustomStr(obj){return Object.keys(obj).filter(k=>obj[k]!=="" && k.toLowerCase()!=="token").sort().map(k=>`${k.toUpperCase()}${String(obj[k]).toUpperCase()}`).join("");}
  function getDevId(){const ck=(typeof $prefs!=="undefined")?$prefs.valueForKey(KEY_BODY):$persistentStore.read(KEY_BODY); const fb=(typeof $prefs!=="undefined")?$prefs.valueForKey(KEY_DEVID):$persistentStore.read(KEY_DEVID); return (parseQS(ck||"").c_mmbDevId || fb || "");}
  function extractId(u){let m=u.match(/\/product\/(?:[A-Za-z]+\/)?(\d+)\.html/); if(m&&m[1])return m[1]; m=u.match(/[?&](?:wareId|sku|id)=(\d+)/); if(m&&m[1])return m[1]; m=u.match(/\/(\d+)\.html(?:[#?]|$)/); if(m&&m[1])return m[1]; return null;}

  // ----- token candidates -----
  function genCandidates(id,devid){
    const base = { methodName:"trendJava", spbh:`1|${id}`, url:`https://item.jd.com/${id}.html`, c_appver:"4.8.3.1", c_mmbDevId:devid };
    const ts = [ String(Date.now()), String(Math.floor(Date.now()/1000)) ]; // ms / s
    const modes = [
      {name:"md5(encode(SECRET+S+SECRET)).UP", f:(S)=>md5(encodeURIComponent(SECRET+S+SECRET)), up:true},
      {name:"md5(SECRET+S+SECRET).UP",        f:(S)=>md5(SECRET+S+SECRET), up:true},
      {name:"md5(encode(SECRET+S+SECRET)).LO",f:(S)=>md5(encodeURIComponent(SECRET+S+SECRET)), up:false},
      {name:"md5(SECRET+S+SECRET).LO",        f:(S)=>md5(SECRET+S+SECRET), up:false},
    ];
    const out=[];
    for (const t of ts){
      for (const m of modes){
        const body = Object.assign({}, base, { t });
        const S = toCustomStr(body);
        let token = m.f(S);
        token = m.up ? token.toUpperCase() : token.toLowerCase();
        out.push({ body:Object.assign({}, body, { token }), mode:m.name });
      }
    }
    return out;
  }

  async function requestHistoryPrice(id, logger){
    const devid = getDevId();
    if (!devid) { logger("缺少 c_mmbDevId"); throw new Error("no_devid"); }

    const headers = {
      "Content-Type": "application/x-www-form-urlencoded; charset=utf-8",
      "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 13_1_3 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 - mmbWebBrowse - ios",
    };

    // 逐个尝试
    const candidates = genCandidates(id,devid);
    let picked = null, lastResp = null;
    for (let i=0;i<candidates.length;i++){
      const c = candidates[i];
      await logger(`[share尝试 ${i+1}/${candidates.length}] ${c.mode}  t=${c.body.t}`);
      const res = await http({ method:"post", url:"https://apapia-history-weblogic.manmanbuy.com/app/share", headers, body: toQS(c.body) }).catch(e=>({error:String(e)}));
      if (!res || res.error){ await logger(`↳ 网络异常: ${String(res && res.error || "unknown")}`); lastResp = res; continue; }
      const j = res.json ? res.json() : null;
      await logger(`↳ 返回: ${JSON.stringify(j||{})}`);
      if (j && j.code === 2000 && j.data){ picked = { share:j, cand:c }; break; }
      lastResp = j;
    }
    if (!picked) throw new Error("接口异常2：token校验失败");

    // trendData
    const q = String(picked.share.data).split("?")[1] || "";
    const sp = parseQS(q);
    const fields = { shareId: sp.shareId || "", sign: sp.sign || "", spbh: sp.spbh || "", url: sp.url || "" };
    const boundary = "----WebKitFormBoundary"+Math.random().toString(36).slice(2);
    let body=""; Object.keys(fields).forEach(k=>{ body+=`--${boundary}\r\nContent-Disposition: form-data; name="${k}"\r\n\r\n${fields[k]||""}\r\n`; }); body+=`--${boundary}--\r\n`;
    await logger("[trendData] 请求 ←");
    const res2 = await http({ method:"post", url:"https://apapia-history-weblogic.manmanbuy.com/h5/share/trendData", headers:{ "content-type": `multipart/form-data; boundary=${boundary}` }, body }).catch(e=>({error:String(e)}));
    await logger("[trendData] 响应 →");
    if (!res2 || res2.error) throw new Error("接口异常3");
    return res2.json ? res2.json() : null;
  }

  // ----- present -----
  function lowerMsg(r){ const lp=r?.priceRemark?.lowestPrice; const ld=(r?.priceRemark?.lowestDate||"").slice(0,10); return (lp!=null)?`历史最低:¥${lp}${ld?`(${ld})`:""}`:""; }
  function summaryText(r){
    const arr=r?.priceRemark?.ListPriceDetail||[];
    const map={"双11价格":"双十一价格","618价格":"六一八价格","30天最低价":"三十天最低","60天最低价":"六十天最低","180天最低价":"一百八最低"};
    const list=arr.filter(x=>!/历史最高|常购价/.test(x?.Name||"")).map(x=>({Name:map[x.Name]||x.Name,Price:String(x.Price??"-"),Date:x.Date||"",Difference:x.Difference||""}));
    const maxW=list.reduce((m,i)=>Math.max(m,i.Price.length),0);
    let out=""; for(const it of list){ if(it.Price==='-')continue; let p=it.Price; if(p.length<maxW){ p=p.includes('.')||(p.length+1===maxW)?p:(p+'.'); const fill=p.includes('.')?'0':' '; while(p.length<maxW)p+=fill;} out+=`${it.Name}  ${p}  ${it.Date}  ${it.Difference==='-'?'':it.Difference}\n`; }
    return out.trimEnd();
  }

  // ----- branches -----
  if (MODE==="token" && /baoliao\/center\/menu/.test(REQ_URL)) {
    (async ()=>{
      try{
        const body=($request&&$request.body)||"";
        (typeof $prefs!=="undefined"?$prefs.setValueForKey(body,KEY_BODY):$persistentStore.write(body,KEY_BODY));
        let devId=""; try{
          if (typeof URLSearchParams==="function") devId=new URLSearchParams(body).get("c_mmbDevId")||"";
          if (!devId){ const ps=String(body).split("&"); for (let i=0;i<ps.length;i++){ const kv=ps[i].split("="); if (decodeURIComponent(kv[0]||"")==="c_mmbDevId"){ devId=decodeURIComponent(kv[1]||""); break; } } }
        }catch(_){}
        (typeof $prefs!=="undefined"?$prefs.setValueForKey(devId,KEY_DEVID):$persistentStore.write(devId,KEY_DEVID));
        notify(APP,"获取 ck 成功🎉",devId?("c_mmbDevId="+devId):body.slice(0,220));
        await L.token(`保存 devId=${devId}`);
      }catch(e){ notify(APP+"｜获取token异常","",String(e&&e.message||e)); await L.token(`[异常] ${String(e&&e.message||e)}`); }
      done({});
    })(); return;
  }

  if (MODE==="popup" && typeof $response === "undefined") {
    (async ()=>{
      try{
        await L.popup(`URL: ${REQ_URL}`);
        const id=extractId(REQ_URL); await L.popup(`商品ID: ${id||"-"}`); if(!id) return done({});
        const data=await requestHistoryPrice(id, L.popup);
        if (data && data.ok===1){
          const r=data.result||{}, title=r?.trendData?.title||("商品 "+id), tip=(r?.priceRemark?.Tip||"")+"（仅供参考）", lower=lowerMsg(r), detail=summaryText(r);
          notify(title, `${lower} ${tip}`, detail, {"open-url": `https://item.jd.com/${id}.html`, "update-pasteboard": detail});
        } else if (data && data.ok===0 && data.msg){ notify("比价结果","", "慢慢买提示您："+data.msg); }
        else { await L.popup(`[异常] 结构: ${JSON.stringify(data||{})}`); notify(APP+"｜接口异常","", "返回结构无效"); }
      }catch(e){ await L.popup(`[异常] ${String(e&&e.message||e)}`); notify(APP+"｜接口异常","",String(e&&e.message||e)); }
      done({});
    })(); return;
  }

  if (MODE==="render" && typeof $response !== "undefined") {
    (async ()=>{
      try{
        await L.render(`URL: ${REQ_URL}`);
        const id=extractId(REQ_URL); await L.render(`商品ID: ${id||"-"}`); if(!id) return $done($response);
        const data=await requestHistoryPrice(id, L.render);
        if (!(data && data.ok===1)) { await L.render(`[异常] 返回: ${JSON.stringify(data||{})}`); return $done($response); }

        const r=data.result||{}, tip=(r?.priceRemark?.Tip||"")+"（仅供参考）", lower=lowerMsg(r);

        // 表格
        const arr=r?.priceRemark?.ListPriceDetail||[], map={"双11价格":"双十一价格","618价格":"六一八价格","30天最低价":"三十天最低","60天最低价":"六十天最低","180天最低价":"一百八最低"};
        let rows=""; for (const it of arr){ const nm=it?.Name||""; if(/历史最高|常购价/.test(nm))continue; rows+=`<tr><td>${map[nm]||nm||""}</td><td>${it?.Price??"-"}</td><td>${it?.Date||""}</td><td>${(it?.Difference==="-"?"":(it?.Difference||""))}</td></tr>`; }
        const tableHtml = rows ? `<table class="jd-price-table"><thead><tr><th>名称</th><th>价格</th><th>日期</th><th>差异</th></tr></thead><tbody>${rows}</tbody></table>` : '<div class="jd-price-muted">暂无表格数据</div>';

        // 折线
        const pts=(r.priceTrend||[]).map(x=>Number(x?.price??x?.Price??x?.p)).filter(x=>!Number.isNaN(x));
        let chartHtml='<div class="jd-price-muted">暂无折线数据</div>';
        if(pts.length){ const W=320,H=120,P=10,xmax=Math.max(1,pts.length-1); let ymin=Infinity,ymax=-Infinity; for(const p of pts){ ymin=Math.min(ymin,p); ymax=Math.max(ymax,p); } if(ymin===Infinity){ymin=0;ymax=1;} const sx=(W-2*P)/xmax, sy=(H-2*P)/Math.max(1,(ymax-ymin)||1); let points=""; for(let k=0;k<pts.length;k++){ const xx=P+k*sx, yy=H-P-((pts[k]-ymin)*sy); points+=(k?",":"")+xx+","+yy;} chartHtml=`<svg class="jd-price-chart" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none"><polyline fill="none" stroke="#007aff" stroke-width="2" points="${points}"/></svg>`; }

        // 原始文本
        const raw=summaryText(r).replace(/[&<>]/g,s=>({"&":"&amp;","<":"&lt;",">":"&gt;"}[s]));
        let content=""; if (STYLE==="table") content=tableHtml; else if (STYLE==="raw") content=`<pre class="jd-price-pre">${raw}</pre>`; else content=(LINE_ONLY?"":tableHtml)+chartHtml;

        const css='<style>.jd-price-panel{font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,PingFang SC,Helvetica,Arial;line-height:1.35;box-shadow:0 6px 18px rgba(0,0,0,.08);border:1px solid #eee;border-radius:12px;padding:12px 14px;margin:10px 8px;background:#fff}.jd-price-panel h3{font-size:15px;margin:0 0 8px 0}.jd-price-meta{color:#666;font-size:12px;margin-bottom:8px}.jd-price-pre{font-size:12px;background:#fafafa;border:1px dashed #ddd;border-radius:8px;padding:8px;white-space:pre-wrap}.jd-price-table{width:100%;border-collapse:collapse;font-size:12px;margin-top:6px}.jd-price-table th,.jd-price-table td{border:1px solid #eee;padding:6px 8px;text-align:left}.jd-price-muted{color:#999}.jd-price-chart{width:100%;height:120px;margin-top:6px}</style>';
        const panel = `${css}<div class="jd-price-panel"><h3>价格趋势</h3><div class="jd-price-meta">${lower} <span class="jd-price-muted">${tip}</span></div>${content}</div>`;
        let html=$response.body||""; if (/<\/body>/i.test(html)) html=html.replace(/<\/body>/i, panel+"</body>"); else html=panel+html;
        $done({ body: html });
      }catch(e){ await L.render(`[异常] ${String(e&&e.message||e)}`); try{$done($response);}catch(_){done({});} }
    })(); return;
  }

  done({});
})();
