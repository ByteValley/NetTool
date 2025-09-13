/* JD Price – unified (no CryptoJS; per-script logs; robust token) */
(() => {
  const APP = "京东比价";
  const SECRET = "3E41D1331F5DDAFCD0A38FE2D52FF66F";
  const KEY_BODY = "manmanbuy_val";   // 原始 body（含 c_mmbDevId）
  const KEY_DEVID = "慢慢买CK";       // 直接保存 c_mmbDevId
  const ARG = parseArg(typeof $argument === "string" ? $argument : "");
  const MODE = (ARG.mode || "").toLowerCase();     // token | popup | render
  const STYLE = (ARG.style || "line").toLowerCase(); // table|raw|line
  const LINE_ONLY = String(ARG.line_only || "").toLowerCase() === "true";
  const URL_REQ = ($request && $request.url) || "";

  /* ---------- 小工具 ---------- */
  function notify(t, s, b, ext) {
    try {
      if (typeof $notify === "function") $notify(t || "", s || "", b || "", ext || {});
      else if (typeof $notification !== "undefined") $notification.post(t || "", s || "", b || "", ext || {});
    } catch (_) {}
  }
  function done(v){ try { $done(v || {});} catch(_){} }
  function getval(k){ try{ return (typeof $prefs!=="undefined")?$prefs.valueForKey(k):$persistentStore.read(k);}catch(_){return null;} }
  function setval(k,v){ try{ return (typeof $prefs!=="undefined")?$prefs.setValueForKey(v,k):$persistentStore.write(v,k);}catch(_){return false;} }
  function parseArg(a){ const o={}; if(!a) return o; String(a).split(/[&;,]/).forEach(kv=>{const i=kv.indexOf("="); if(i===-1) return; o[decodeURIComponent(kv.slice(0,i))]=decodeURIComponent(kv.slice(i+1));}); return o; }
  function parseQS(q){const o={};(q||"").split("&").forEach(p=>{const kv=p.split("=");o[decodeURIComponent(kv[0]||"")]=decodeURIComponent(kv[1]||"");});return o;}
  function toQS(obj){return Object.keys(obj).map(k=>`${encodeURIComponent(k)}=${encodeURIComponent(obj[k])}`).join("&");}
  function toSigBase(obj){return Object.keys(obj).filter(k=>obj[k]!=="" && k.toLowerCase()!=="token").sort().map(k=>`${k.toUpperCase()}${String(obj[k]).toUpperCase()}`).join("");}
  function extractId(u){ let m=u.match(/\/product\/(?:[A-Za-z]+\/)?(\d+)\.html/); if(m) return m[1]; m=u.match(/[?&](?:wareId|sku|id)=(\d+)/); if(m) return m[1]; m=u.match(/\/(\d+)\.html(?:[#?]|$)/); if(m) return m[1]; return null; }

  /* ---------- 轻量文件日志（按脚本名拆文件） ---------- */
  const LOG_TS = () => new Date().toTimeString().split(" ")[0] + "." + String((Date.now()%1000)).padStart(3,"0");
  const LOG_TAG = () => {
    if (MODE === "token") return "获取token";
    if (MODE === "popup") return "弹窗";
    return (STYLE==="table"?"表格":STYLE==="raw"?"原始":"折线");
  };
  function logln(line){
    // console 输出 + 兼容 Surge 的“按脚本名落盘”
    try { console.log(`${LOG_TS()} ${line}`); } catch(_){}
  }
  function head(title){ logln(`—— ${title} ——`); }

  /* ---------- 纯 JS MD5（避免 CryptoJS 冲突） ---------- */
  // 摘自 blueimp-md5 简化版（仅 md5(string)）
  function md5(str){function l(a,b){return a<<b|a>>>32-b}function k(a,b){var c,d,e,f,g;return e=a&2147483648,f=b&2147483648,c=a&1073741824,d=b&1073741824,g=(a&1073741823)+(b&1073741823),c&d?g^2147483648^e^f:c|d?g&1073741824?g^3221225472^e^f:g^1073741824^e^f:g^e^f}function n(a,b,c){return a&b|~a&c}function m(a,b,c){return a&c|b&~c}function o(a,b,c){return a^b^c}function p(a,b,c){return b^(a|~c)}function q(a,b,c,d,e,f,g){a=k(a,k(k(n(b,c,d),e),g));return k(l(a,f),b)}function r(a,b,c,d,e,f,g){a=k(a,k(k(m(b,c,d),e),g));return k(l(a,f),b)}function s(a,b,c,d,e,f,g){a=k(a,k(k(o(b,c,d),e),g));return k(l(a,f),b)}function t(a,b,c,d,e,f,g){a=k(a,k(k(p(b,c,d),e),g));return k(l(a,f),b)}function u(a){var b,c=a.length,d=b=c+8,e=(d-d%64)/64,f=16*(e+1),g=Array(f-1),h=0,i=0;for(;i<c;)b=(i-i%4)/4,h=i%4*8,g[b]|=a.charCodeAt(i)<<h,i++;b=(i-i%4)/4,h=i%4*8,g[b]|=128<<h,g[f-2]=c<<3,g[f-1]=c>>>29;return g}function v(a){var b="",c="",d,e;for(e=0;e<=3;e++)d=a>>>8*e&255,c+="0"+d.toString(16),b+=c.substr(c.length-2,2);return b}var a,b,c,d,e,f,g,h,i=u(unescape(encodeURIComponent(str))),j=1732584193; a=4023233417; b=2562383102; c=271733878; for(e=0;e<i.length;e+=16)f=j,g=a,h=b,d=c,j=q(j,a,b,c,i[e+0],7,3614090360),c=q(c,j,a,b,i[e+1],12,3905402710),b=q(b,c,j,a,i[e+2],17,606105819),a=q(a,b,c,j,i[e+3],22,3250441966),j=q(j,a,b,c,i[e+4],7,4118548399),c=q(c,j,a,b,i[e+5],12,1200080426),b=q(b,c,j,a,i[e+6],17,2821735955),a=q(a,b,c,j,i[e+7],22,4249261313),j=q(j,a,b,c,i[e+8],7,1770035416),c=q(c,j,a,b,i[e+9],12,2336552879),b=q(b,c,j,a,i[e+10],17,4294925233),a=q(a,b,c,j,i[e+11],22,2304563134),j=q(j,a,b,c,i[e+12],7,1804603682),c=q(c,j,a,b,i[e+13],12,4254626195),b=q(b,c,j,a,i[e+14],17,2792965006),a=q(a,b,c,j,i[e+15],22,1236535329),j=r(j,a,b,c,i[e+1],5,4129170786),c=r(c,j,a,b,i[e+6],9,3225465664),b=r(b,c,j,a,i[e+11],14,643717713),a=r(a,b,c,j,i[e+0],20,3921069994),j=r(j,a,b,c,i[e+5],5,3593408605),c=r(c,j,a,b,i[e+10],9,38016083),b=r(b,c,j,a,i[e+15],14,3634488961),a=r(a,b,c,j,i[e+4],20,3889429448),j=r(j,a,b,c,i[e+9],5,568446438),c=r(c,j,a,b,i[e+14],9,3275163606),b=r(b,c,j,a,i[e+3],14,4107603335),a=r(a,b,c,j,i[e+8],20,1163531501),j=r(j,a,b,c,i[e+13],5,2850285829),c=r(c,j,a,b,i[e+2],9,4243563512),b=r(b,c,j,a,i[e+7],14,1735328473),a=r(a,b,c,j,i[e+12],20,2368359562),j=s(j,a,b,c,i[e+5],4,4294588738),c=s(c,j,a,b,i[e+8],11,2272392833),b=s(b,c,j,a,i[e+11],16,1839030562),a=s(a,b,c,j,i[e+14],23,4259657740),j=s(j,a,b,c,i[e+1],4,2763975236),c=s(c,j,a,b,i[e+4],11,1272893353),b=s(b,c,j,a,i[e+7],16,4139469664),a=s(a,b,c,j,i[e+10],23,3200236656),j=s(j,a,b,c,i[e+13],4,681279174),c=s(c,j,a,b,i[e+0],11,3936430074),b=s(b,c,j,a,i[e+3],16,3572445317),a=s(a,b,c,j,i[e+6],23,76029189),j=s(j,a,b,c,i[e+9],4,3654602809),c=s(c,j,a,b,i[e+12],11,3873151461),b=s(b,c,j,a,i[e+15],16,530742520),a=s(a,b,c,j,i[e+2],23,3299628645),j=t(j,a,b,c,i[e+0],6,4096336452),c=t(c,j,a,b,i[e+7],10,1126891415),b=t(b,c,j,a,i[e+14],15,2878612391),a=t(a,b,c,j,i[e+5],21,4237533241),j=t(j,a,b,c,i[e+12],6,1700485571),c=t(c,j,a,b,i[e+3],10,2399980690),b=t(b,c,j,a,i[e+10],15,4293915773),a=t(a,b,c,j,i[e+1],21,2240044497),j=t(j,a,b,c,i[e+8],6,1873313359),c=t(c,j,a,b,i[e+15],10,4264355552),b=t(b,c,j,a,i[e+6],15,2734768916),a=t(a,b,c,j,i[e+13],21,1309151649),j=t(j,a,b,c,i[e+4],6,4149444226),c=t(c,j,a,b,i[e+11],10,3174756917),b=t(b,c,j,a,i[e+2],15,718787259),a=t(a,b,c,j,i[e+9],21,3951481745),j=k(j,f),a=k(a,g),b=k(b,h),c=k(c,d); return (v(j)+v(a)+v(b)+v(c)).toUpperCase(); }

  /* ---------- HTTP 兼容 ---------- */
  function http(op, t = 8) {
    const { promise, resolve, reject } = Promise.withResolvers();
    const timer = setTimeout(() => reject(new Error("timeout")), op.$timeout ?? t*1000);
    function handle({error, status, statusCode, headers, body}) {
      const st = status || statusCode;
      const res = { error, status: st, headers, body };
      try { if (typeof body === "string") res.json = () => JSON.parse(body); } catch(_){}
      clearTimeout(timer);
      (error || st < 200 || st > 307) ? reject(res) : resolve(res);
    }
    try { this.$httpClient?.[op.method || "get"](op, (e,r,b)=>handle({error:e, status:r?.status||r?.statusCode, headers:r?.headers, body:b})); } catch(_) {}
    try { this.$task?.fetch({ url: op.url, ...op }).then(handle, handle); } catch(_) {}
    return promise;
  }

  /* ---------- token / share / trendData ---------- */
  function getDevId() {
    const raw = getval(KEY_BODY);
    if (!raw) return null;
    return parseQS(raw)?.c_mmbDevId || getval(KEY_DEVID);
  }
  function buildShareBodies(id, devid){
    const base = { methodName: "trendJava", spbh: `1|${id}`, url: `https://item.jd.com/${id}.html`, c_appver: "4.8.3.1", c_mmbDevId: devid };
    const nowMs = Date.now(), nowSec = Math.floor(nowMs/1000);
    const stamps = [nowMs, nowMs-1500, nowMs+1500, nowSec, nowSec-2, nowSec+2].map(x=>String(x));
    const variants = [];
    for (const t of stamps){
      const body = { ...base, t };
      const sigBase = SECRET + toSigBase(body) + SECRET;
      const candidates = [
        md5(encodeURIComponent(sigBase)),
        md5(sigBase),
      ];
      for (const tk of candidates){
        variants.push({ ...body, token: tk });
      }
    }
    return variants;
  }
  async function requestHistoryPrice(id){
    const devid = getDevId();
    if (!devid) throw new Error("no_devid");
    const headers = {
      "Content-Type": "application/x-www-form-urlencoded; charset=utf-8",
      "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 13_1_3 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 - mmbWebBrowse - ios",
      "Origin": "https://apapia-history-weblogic.manmanbuy.com",
      "Referer": "https://apapia-history-weblogic.manmanbuy.com/",
      "Accept": "*/*"
    };
    const bodies = buildShareBodies(id, devid);

    let shareOK = null, lastErr = null;
    logln(`[JD-比价] /app/share 尝试 ${bodies.length} 组 token`);
    for (let i=0;i<bodies.length;i++){
      try{
        const res = await http({ method:"post", url:"https://apapia-history-weblogic.manmanbuy.com/app/share", headers, body: toQS(bodies[i]) }, 8);
        const j = res.json && res.json();
        if (j && j.code === 2000 && j.data) { shareOK = j; break; }
        lastErr = j && j.msg || "share_fail";
      }catch(e){ lastErr = e && (e.error || e.status) || "net"; }
    }
    if (!shareOK) throw new Error(`token 校验失败: ${lastErr||"-"}`);

    const q = String(shareOK.data).split("?")[1] || "";
    const sp = parseQS(q);
    const fields = { shareId: sp.shareId||"", sign: sp.sign||"", spbh: sp.spbh||"", url: sp.url||"" };
    const mp = buildMultipart(fields);
    const res2 = await http({ method:"post", url:"https://apapia-history-weblogic.manmanbuy.com/h5/share/trendData", headers: { "content-type": `multipart/form-data; boundary=${mp.boundary}` }, body: mp.body }, 8);
    return res2.json && res2.json();
  }
  function buildMultipart(fields){
    const boundary="----WebKitFormBoundary"+Math.random().toString(36).slice(2);
    let body=""; for (const [k,v] of Object.entries(fields)){ body+=`--${boundary}\r\nContent-Disposition: form-data; name="${k}"\r\n\r\n${v||""}\r\n`; }
    body+=`--${boundary}--\r\n`; return { body, boundary };
  }

  /* ---------- 展示工具 ---------- */
  function lowerMsg(r){
    const lp = r?.priceRemark?.lowestPrice;
    const ld = (r?.priceRemark?.lowestDate||"").slice(0,10);
    return lp!=null ? `历史最低:¥${lp}${ld?`(${ld})`:""}` : "";
  }
  function summaryText(r){
    const arr = r?.priceRemark?.ListPriceDetail || [];
    const map = {"双11价格":"双十一价格","618价格":"六一八价格","30天最低价":"三十天最低","60天最低价":"六十天最低","180天最低价":"一百八最低"};
    const list = arr.filter(x=>!/历史最高|常购价/.test(x?.Name||"")).map(x=>({Name:map[x.Name]||x.Name, Price:String(x.Price??"-"), Date:x.Date||"", Difference:x.Difference||""}));
    const maxW = list.reduce((m,i)=>Math.max(m,i.Price.length),0);
    let out=""; for (const it of list){ if (it.Price==='-') continue; let p=it.Price; if (p.length<maxW){ p = p.includes('.') || (p.length+1===maxW) ? p : (p+'.'); const fill=p.includes('.')?'0':' '; while(p.length<maxW) p+=fill; } out += `${it.Name}  ${p}  ${it.Date}  ${it.Difference==='-'?'':it.Difference}\n`; }
    return out.trimEnd();
  }

  /* ================== A) 获取 token ================== */
  if (MODE==="token" && /baoliao\/center\/menu/.test(URL_REQ)){
    head(`[${APP}·获取token]`);
    try{
      const body=$request?.body||"";
      logln(`原始 body: ${String(body).slice(0,200)}...`);
      setval(KEY_BODY, body);
      let devId="";
      try{
        if (typeof URLSearchParams==="function") devId=new URLSearchParams(body).get("c_mmbDevId")||"";
        if (!devId) body.split("&").forEach(p=>{const kv=p.split("="); if(decodeURIComponent(kv[0]||"")==="c_mmbDevId") devId=decodeURIComponent(kv[1]||"");});
      }catch(_){}
      setval(KEY_DEVID, devId||"");
      notify(APP, "获取 ck 成功🎉", devId?("c_mmbDevId="+devId):body.slice(0,220));
      logln(`DevId: ${devId||"(空)"}`);
    }catch(e){
      notify(APP+"｜获取token异常","", String(e&&e.message||e));
      logln(`异常: ${String(e&&e.message||e)}`);
    }
    logln("[Script Completed]");
    return done({});
  }

  /* ================== B) 弹窗（request） ================== */
  if (MODE==="popup" && typeof $response === "undefined"){
    head(`[${APP}·弹窗] URL: ${URL_REQ}`);
    (async()=>{
      try{
        const id = extractId(URL_REQ); logln(`[${APP}·弹窗] 商品ID: ${id||"-"}`);
        if (!id) return done({});
        logln("[JD-比价] /app/share ←");
        const data = await requestHistoryPrice(id);
        logln("[JD-比价] /app/share →");
        if (data && data.ok===1){
          const r = data.result||{};
          const title = r?.trendData?.title || ("商品 "+id);
          const tip = (r?.priceRemark?.Tip||"")+"（仅供参考）";
          const lower = lowerMsg(r);
          const detail = summaryText(r);
          notify(title, `${lower} ${tip}`, detail, {"open-url": `https://item.jd.com/${id}.html`, "update-pasteboard": detail});
        }else{
          notify(APP+"｜接口异常","", String(data&&data.msg||"结构无效"));
        }
      }catch(e){
        notify(APP+"｜接口异常","", String(e&&e.message||e));
        logln(`异常: ${String(e&&e.message||e)}`);
      }
      logln("[Script Completed]");
      done({});
    })();
    return;
  }

  /* ================== C) 渲染（response） ================== */
  if (MODE==="render" && typeof $response !== "undefined"){
    head(`[${APP}·渲染] URL: ${URL_REQ}`);
    (async()=>{
      try{
        const id = extractId(URL_REQ); logln(`[${APP}·渲染] 商品ID: ${id||"-"}`);
        if (!id) return $done($response);
        logln("[JD-比价] /app/share ←");
        const data = await requestHistoryPrice(id);
        logln("[JD-比价] /app/share →");
        if (!(data && data.ok===1)) { logln(`[${APP}·渲染] 异常: ${data&&data.msg||"结构无效"}`); return $done($response); }

        const r = data.result||{};
        const title = r?.trendData?.title || ("商品 "+id);
        const tip = (r?.priceRemark?.Tip||"")+"（仅供参考）";
        const lower = lowerMsg(r);

        // 表格
        const arr = r?.priceRemark?.ListPriceDetail || [];
        const map = {"双11价格":"双十一价格","618价格":"六一八价格","30天最低价":"三十天最低","60天最低价":"六十天最低","180天最低价":"一百八最低"};
        let rows=""; for (const it of arr){ const nm=it?.Name||""; if (/历史最高|常购价/.test(nm)) continue; rows+=`<tr><td>${map[nm]||nm||""}</td><td>${it?.Price??"-"}</td><td>${it?.Date||""}</td><td>${it?.Difference==='-'?"":(it?.Difference||"")}</td></tr>`;}
        const tableHtml = rows ? `<table class="jd-price-table"><thead><tr><th>名称</th><th>价格</th><th>日期</th><th>差异</th></tr></thead><tbody>${rows}</tbody></table>` : '<div class="jd-price-muted">暂无表格数据</div>';

        // 折线
        const pts = (r.priceTrend||[]).map(x=>Number(x?.price ?? x?.Price ?? x?.p)).filter(x=>!Number.isNaN(x));
        let chartHtml = '<div class="jd-price-muted">暂无折线数据</div>';
        if (pts.length){
          const W=320,H=120,P=10,xmax=Math.max(1,pts.length-1);
          let ymin=Infinity,ymax=-Infinity; for (const p of pts){ ymin=Math.min(ymin,p); ymax=Math.max(ymax,p); }
          if (ymin===Infinity){ymin=0;ymax=1;}
          const sx=(W-2*P)/xmax, sy=(H-2*P)/Math.max(1,(ymax-ymin)||1);
          let points=""; for (let k=0;k<pts.length;k++){ const xx=P+k*sx; const yy=H-P-((pts[k]-ymin)*sy); points+=(k?",":"")+xx+","+yy; }
          chartHtml = `<svg class="jd-price-chart" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none"><polyline fill="none" stroke="#007aff" stroke-width="2" points="${points}"/></svg>`;
        }

        // 原始
        const raw = summaryText(r).replace(/[&<>]/g, s=>({"&":"&amp;","<":"&lt;",">":"&gt;"}[s]));

        let content="";
        if (STYLE==="table") content=tableHtml;
        else if (STYLE==="raw") content=`<pre class="jd-price-pre">${raw}</pre>`;
        else content=(LINE_ONLY?"":tableHtml)+chartHtml;

        const css = '<style>.jd-price-panel{font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,PingFang SC,Helvetica,Arial;line-height:1.35;box-shadow:0 6px 18px rgba(0,0,0,.08);border:1px solid #eee;border-radius:12px;padding:12px 14px;margin:10px 8px;background:#fff}.jd-price-panel h3{font-size:15px;margin:0 0 8px 0}.jd-price-meta{color:#666;font-size:12px;margin-bottom:8px}.jd-price-pre{font-size:12px;background:#fafafa;border:1px dashed #ddd;border-radius:8px;padding:8px;white-space:pre-wrap}.jd-price-table{width:100%;border-collapse:collapse;font-size:12px;margin-top:6px}.jd-price-table th,.jd-price-table td{border:1px solid #eee;padding:6px 8px;text-align:left}.jd-price-muted{color:#999}.jd-price-chart{width:100%;height:120px;margin-top:6px}</style>';
        const panel = `${css}<div class="jd-price-panel"><h3>🧾 ${title}</h3><div class="jd-price-meta">${lower} <span class="jd-price-muted">${tip}</span></div>${content}</div>`;
        let html = $response.body || "";
        if (/<\/body>/i.test(html)) html = html.replace(/<\/body>/i, panel + "</body>");
        else html = panel + html;
        $done({ body: html });
      }catch(e){
        logln(`[${APP}·渲染] 异常: ${String(e&&e.message||e)}`);
        try { $done($response); } catch(_) { done({}); }
      }
      logln("[Script Completed]");
    })();
    return;
  }

  /* 其它情况放行 */
  done({});

})();
