/* JD Price – token / popup / render in one, dynamic style & per-mode log */
(function () {
  const APP = "京东比价";
  const SECRET = "3E41D1331F5DDAFCD0A38FE2D52FF66F";
  const KEY_BODY = "manmanbuy_val";   // 保存原始 body（含 c_mmbDevId）
  const KEY_DEVID = "慢慢买CK";       // 保存 c_mmbDevId
  const ARG = (function (a) { let o = {}; if (!a) return o; String(a).split(/[&;,]/).forEach(kv => { const i = kv.indexOf("="); if (i === -1) return; o[decodeURIComponent(kv.slice(0, i))] = decodeURIComponent(kv.slice(i + 1)); }); return o; })(typeof $argument === "string" ? $argument : "");
  const MODE = String(ARG.mode || "").toLowerCase();               // token / popup / render
  const REQ_URL = ($request && $request.url) || "";
  const STYLE  = String(ARG.style || "line").toLowerCase();        // table / raw / line
  const LINE_ONLY = String(ARG.line_only || "").toLowerCase() === "true";

  /* ---------- Notify & Done ---------- */
  function notify(t, s, b, ext) {
    try {
      if (typeof $notify === "function") $notify(t || "", s || "", b || "", ext || {});
      else if (typeof $notification !== "undefined") $notification.post(t || "", s || "", b || "", ext || {});
    } catch (_) {}
  }
  function done(v) { try { $done(v || {}); } catch (_) {} }

  /* ---------- Per-mode file logger (Surge) ---------- */
  const TS = () => new Date().toISOString().replace("T"," ").replace("Z","");
  const day = () => new Date().toISOString().slice(0,10);
  const logfile = (name) => `${APP}·${name}-${day()}.log`;
  async function flog(name, line) {
    try {
      if (typeof $httpAPI !== "function") { console.log(`[${name}] ${line}`); return; }
      await $httpAPI("POST", "/v1/files", {
        path: logfile(name),
        content: `${TS()} ${line}\n`,
        append: true
      });
    } catch (_) {}
  }
  const L = {
    token: (s) => flog("获取token", s),
    popup: (s) => flog("弹窗", s),
    render: (s) => flog("渲染", s)
  };

  /* ---------- MD5（纯 JS，避免 CryptoJS 冲突） ---------- */
  function md5(str) {
    function L(r, n) { return (r << n) | (r >>> (32 - n)); }
    function U(x, y, z) { return (x & y) | (~x & z); }
    function F(x, y, z) { return (x & z) | (y & ~z); }
    function G(x, y, z) { return x ^ y ^ z; }
    function H(x, y, z) { return y ^ (x | ~z); }
    function T(func, a, b, c, d, x, s, t) { return ((a = a + func(b, c, d) + x + t) | 0, (L(a, s) + b) | 0); }
    function toWords(s) {
      s = unescape(encodeURIComponent(s));
      const n = s.length, out = [];
      for (let i = 0; i < n; i++) out[i >> 2] |= s.charCodeAt(i) << ((i % 4) << 3);
      out[n >> 2] |= 0x80 << ((n % 4) << 3);
      out[((n + 8) >> 6 << 4) + 14] = n << 3;
      return out;
    }
    function toHex(a) {
      let s = "";
      for (let i = 0; i < 4; i++) s += ("0" + ((a >> (i * 8)) & 255).toString(16)).slice(-2);
      return s;
    }
    let x = toWords(str), a = 1732584193, b = -271733879, c = -1732584194, d = 271733878;
    for (let i = 0; i < x.length; i += 16) {
      let oa = a, ob = b, oc = c, od = d;
      a = T(U, a, b, c, d, x[i + 0]  | 0, 7,  -680876936);
      d = T(U, d, a, b, c, x[i + 1]  | 0, 12, -389564586);
      c = T(U, c, d, a, b, x[i + 2]  | 0, 17,  606105819);
      b = T(U, b, c, d, a, x[i + 3]  | 0, 22, -1044525330);
      a = T(U, a, b, c, d, x[i + 4]  | 0, 7,  -176418897);
      d = T(U, d, a, b, c, x[i + 5]  | 0, 12, 1200080426);
      c = T(U, c, d, a, b, x[i + 6]  | 0, 17, -1473231341);
      b = T(U, b, c, d, a, x[i + 7]  | 0, 22, -45705983);
      a = T(U, a, b, c, d, x[i + 8]  | 0, 7,  1770035416);
      d = T(U, d, a, b, c, x[i + 9]  | 0, 12, -1958414417);
      c = T(U, c, d, a, b, x[i +10]  | 0, 17, -42063);
      b = T(U, b, c, d, a, x[i +11]  | 0, 22, -1990404162);
      a = T(U, a, b, c, d, x[i +12]  | 0, 7,  1804603682);
      d = T(U, d, a, b, c, x[i +13]  | 0, 12, -40341101);
      c = T(U, c, d, a, b, x[i +14]  | 0, 17, -1502002290);
      b = T(U, b, c, d, a, x[i +15]  | 0, 22,  1236535329);

      a = T(F, a, b, c, d, x[i + 1]  | 0, 5,  -165796510);
      d = T(F, d, a, b, c, x[i + 6]  | 0, 9,  -1069501632);
      c = T(F, c, d, a, b, x[i +11]  | 0, 14,  643717713);
      b = T(F, b, c, d, a, x[i + 0]  | 0, 20, -373897302);
      a = T(F, a, b, c, d, x[i + 5]  | 0, 5,  -701558691);
      d = T(F, d, a, b, c, x[i +10]  | 0, 9,   38016083);
      c = T(F, c, d, a, b, x[i +15]  | 0, 14, -660478335);
      b = T(F, b, c, d, a, x[i + 4]  | 0, 20, -405537848);
      a = T(F, a, b, c, d, x[i + 9]  | 0, 5,   568446438);
      d = T(F, d, a, b, c, x[i +14]  | 0, 9,  -1019803690);
      c = T(F, c, d, a, b, x[i + 3]  | 0, 14, -187363961);
      b = T(F, b, c, d, a, x[i + 8]  | 0, 20,  1163531501);
      a = T(F, a, b, c, d, x[i +13]  | 0, 5,  -1444681467);
      d = T(F, d, a, b, c, x[i + 2]  | 0, 9,   -51403784);
      c = T(F, c, d, a, b, x[i + 7]  | 0, 14,  1735328473);
      b = T(F, b, c, d, a, x[i +12]  | 0, 20, -1926607734);

      a = T(G, a, b, c, d, x[i + 5]  | 0, 4,  -378558);
      d = T(G, d, a, b, c, x[i + 8]  | 0, 11, -2022574463);
      c = T(G, c, d, a, b, x[i +11]  | 0, 16,  1839030562);
      b = T(G, b, c, d, a, x[i +14]  | 0, 23,  -35309556);
      a = T(G, a, b, c, d, x[i + 1]  | 0, 4,  -1530992060);
      d = T(G, d, a, b, c, x[i + 4]  | 0, 11,  1272893353);
      c = T(G, c, d, a, b, x[i + 7]  | 0, 16, -155497632);
      b = T(G, b, c, d, a, x[i +10]  | 0, 23, -1094730640);
      a = T(G, a, b, c, d, x[i +13]  | 0, 4,   681279174);
      d = T(G, d, a, b, c, x[i + 0]  | 0, 11, -358537222);
      c = T(G, c, d, a, b, x[i + 3]  | 0, 16, -722521979);
      b = T(G, b, c, d, a, x[i + 6]  | 0, 23,   76029189);
      a = T(G, a, b, c, d, x[i + 9]  | 0, 4,  -640364487);
      d = T(G, d, a, b, c, x[i +12]  | 0, 11, -421815835);
      c = T(G, c, d, a, b, x[i +15]  | 0, 16,   530742520);
      b = T(G, b, c, d, a, x[i + 2]  | 0, 23,  -995338651);

      a = T(H, a, b, c, d, x[i + 0]  | 0, 6,  -198630844);
      d = T(H, d, a, b, c, x[i + 7]  | 0, 10,   1126891415);
      c = T(H, c, d, a, b, x[i +14]  | 0, 15,  -1416354905);
      b = T(H, b, c, d, a, x[i + 5]  | 0, 21,   -57434055);
      a = T(H, a, b, c, d, x[i +12]  | 0, 6,   1700485571);
      d = T(H, d, a, b, c, x[i + 3]  | 0, 10,  -1894986606);
      c = T(H, c, d, a, b, x[i +10]  | 0, 15,   -1051523);
      b = T(H, b, c, d, a, x[i + 1]  | 0, 21,  -2054922799);
      a = T(H, a, b, c, d, x[i + 8]  | 0, 6,   1873313359);
      d = T(H, d, a, b, c, x[i +15]  | 0, 10,   -30611744);
      c = T(H, c, d, a, b, x[i + 6]  | 0, 15,  -1560198380);
      b = T(H, b, c, d, a, x[i +13]  | 0, 21,   1309151649);

      a = (a + oa) | 0; b = (b + ob) | 0; c = (c + oc) | 0; d = (d + od) | 0;
    }
    return (toHex(a) + toHex(b) + toHex(c) + toHex(d)).toUpperCase();
  }

  /* ---------- HTTP wrapper ---------- */
  function http(op, ttl = 8) {
    const wr = Promise.withResolvers();
    const timer = setTimeout(() => wr.reject(new Error("timeout")), op.$timeout || ttl * 1000);
    function handle(res) {
      try {
        res = res || {};
        res.status = res.status || res.statusCode;
        if (typeof res.body === "string") res.json = () => JSON.parse(res.body);
      } catch (_) {}
      clearTimeout(timer);
      if (res.error || res.status < 200 || res.status > 307) wr.reject(res.error || new Error("http_error"));
      else wr.resolve(res);
    }
    try { this.$httpClient && this.$httpClient[op.method || "get"](op, (e, r, b) => handle({ error: e, status: (r && (r.status || r.statusCode)), headers: r && r.headers, body: b })); } catch(_) {}
    try { this.$task && this.$task.fetch(Object.assign({ url: op.url }, op)).then(handle, handle); } catch(_) {}
    return wr.promise;
  }

  /* ---------- Helpers ---------- */
  function parseQS(q){const o={};(q||"").split("&").forEach(p=>{const kv=p.split("="); o[decodeURIComponent(kv[0]||"")]=decodeURIComponent(kv[1]||"");}); return o;}
  function toQS(obj){return Object.keys(obj).map(k=>`${encodeURIComponent(k)}=${encodeURIComponent(obj[k])}`).join("&");}
  function toCustomStr(obj){return Object.keys(obj).filter(k=>obj[k]!=="" && k.toLowerCase()!=="token").sort().map(k=>`${k.toUpperCase()}${String(obj[k]).toUpperCase()}`).join("");}
  function getDevId(){
    const ck = (typeof $prefs !== "undefined") ? $prefs.valueForKey(KEY_BODY) : $persistentStore.read(KEY_BODY);
    const fallback = (typeof $prefs !== "undefined") ? $prefs.valueForKey(KEY_DEVID) : $persistentStore.read(KEY_DEVID);
    return (parseQS(ck||"").c_mmbDevId || fallback || "");
  }
  function extractId(u){
    let m=u.match(/\/product\/(?:[A-Za-z]+\/)?(\d+)\.html/); if(m&&m[1])return m[1];
    m=u.match(/[?&](?:wareId|sku|id)=(\d+)/); if(m&&m[1])return m[1];
    m=u.match(/\/(\d+)\.html(?:[#?]|$)/); if(m&&m[1])return m[1];
    return null;
  }

  /* ---------- Core API ---------- */
  async function requestHistoryPrice(id, logger){
    const devid = getDevId();
    logger(`[${APP}] 商品ID: ${id}`);
    if (!devid){ logger("缺少 c_mmbDevId"); throw new Error("no_devid"); }

    const shareBody = {
      methodName: "trendJava",
      spbh: `1|${id}`,
      url: `https://item.jd.com/${id}.html`,
      t: String(Date.now()),
      c_appver: "4.8.3.1",
      c_mmbDevId: devid,
    };
    const tokenStr = encodeURIComponent(SECRET + toCustomStr(shareBody) + SECRET);
    shareBody.token = md5(tokenStr);
    const headers = {
      "Content-Type": "application/x-www-form-urlencoded; charset=utf-8",
      "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 13_1_3 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 - mmbWebBrowse - ios",
    };

    logger("[JD-比价] /app/share ←");
    const res1 = await http({ method:"post", url:"https://apapia-history-weblogic.manmanbuy.com/app/share", headers, body: toQS(shareBody) }).catch(e=>({error:e}));
    logger("[JD-比价] /app/share →");
    if (!res1 || res1.error) throw new Error("接口异常1");

    const j1 = res1.json ? res1.json() : null;
    if (!j1 || j1.code !== 2000 || !j1.data){
      logger(`share 响应: ${JSON.stringify(j1||{})}`);
      throw new Error("接口异常2：token校验失败");
    }

    const q = String(j1.data).split("?")[1] || "";
    const sp = parseQS(q);
    const fields = { shareId: sp.shareId || "", sign: sp.sign || "", spbh: sp.spbh || "", url: sp.url || "" };

    // multipart
    const boundary="----WebKitFormBoundary"+Math.random().toString(36).slice(2);
    let body=""; Object.keys(fields).forEach(k=>{ body+=`--${boundary}\r\nContent-Disposition: form-data; name="${k}"\r\n\r\n${fields[k]||""}\r\n`; });
    body+=`--${boundary}--\r\n`;

    logger("[JD-比价] /h5/share/trendData ←");
    const res2 = await http({ method:"post", url:"https://apapia-history-weblogic.manmanbuy.com/h5/share/trendData", headers:{ "content-type": `multipart/form-data; boundary=${boundary}` }, body }).catch(e=>({error:e}));
    logger("[JD-比价] /h5/share/trendData →");
    if (!res2 || res2.error) throw new Error("接口异常3");

    const j2 = res2.json ? res2.json() : null;
    return j2;
  }

  /* ---------- Presenters ---------- */
  function lowerMsg(r){
    const lp = r?.priceRemark?.lowestPrice;
    const ld = (r?.priceRemark?.lowestDate||"").slice(0,10);
    return (lp!=null) ? `历史最低:¥${lp}${ld?`(${ld})`:""}` : "";
  }
  function summaryText(r){
    const arr = r?.priceRemark?.ListPriceDetail || [];
    const map = {"双11价格":"双十一价格","618价格":"六一八价格","30天最低价":"三十天最低","60天最低价":"六十天最低","180天最低价":"一百八最低"};
    const list = arr.filter(x=>!/历史最高|常购价/.test(x?.Name||"")).map(x=>({Name:map[x.Name]||x.Name, Price:String(x.Price??"-"), Date:x.Date||"", Difference:x.Difference||""}));
    const maxW = list.reduce((m,i)=>Math.max(m,i.Price.length),0);
    let out=""; for(const it of list){ if (it.Price==='-') continue; let p=it.Price;
      if (p.length<maxW){ p = p.includes('.') || (p.length+1===maxW) ? p : (p+'.'); const fill = p.includes('.')?'0':' '; while (p.length<maxW) p+=fill; }
      out += `${it.Name}  ${p}  ${it.Date}  ${it.Difference==='-'?'':it.Difference}\n`;
    }
    return out.trimEnd();
  }

  /* ---------- Branches ---------- */

  // A) 获取 token
  if (MODE==="token" && /baoliao\/center\/menu/.test(REQ_URL)) {
    (async ()=>{
      try{
        const body = ($request && $request.body) || "";
        (typeof $prefs!=="undefined" ? $prefs.setValueForKey(body, KEY_BODY) : $persistentStore.write(body, KEY_BODY));
        let devId = ""; try{
          if (typeof URLSearchParams==="function") devId = new URLSearchParams(body).get("c_mmbDevId") || "";
          if (!devId){ const ps = String(body).split("&"); for (let i=0;i<ps.length;i++){ const kv = ps[i].split("="); if (decodeURIComponent(kv[0]||"")==="c_mmbDevId"){ devId = decodeURIComponent(kv[1]||""); break; } } }
        }catch(_){}
        (typeof $prefs!=="undefined" ? $prefs.setValueForKey(devId, KEY_DEVID) : $persistentStore.write(devId, KEY_DEVID));
        notify(APP, "获取 ck 成功🎉", devId?(`c_mmbDevId=${devId}`):body.slice(0,220));
        await L.token(`[${APP}·token] 保存 devId=${devId}`);
      }catch(e){
        notify(APP+"｜获取token异常","", String(e&&e.message||e));
        await L.token(`[异常] ${String(e&&e.message||e)}`);
      }
      done({});
    })();
    return;
  }

  // B) 弹窗（request）
  if (MODE==="popup" && typeof $response === "undefined") {
    (async ()=>{
      try{
        await L.popup(`[${APP}·弹窗] URL: ${REQ_URL}`);
        const id = extractId(REQ_URL);
        await L.popup(`[${APP}·弹窗] 商品ID: ${id||"-"}`);
        if (!id) return done({});
        const data = await requestHistoryPrice(id, L.popup);
        if (data && data.ok === 1){
          const r = data.result || {};
          const title = r?.trendData?.title || ("商品 "+id);
          const tip = (r?.priceRemark?.Tip||"") + "（仅供参考）";
          const lower = lowerMsg(r);
          const detail = summaryText(r);
          notify(title, `${lower} ${tip}`, detail, {"open-url": `https://item.jd.com/${id}.html`, "update-pasteboard": detail});
        } else if (data && data.ok === 0 && data.msg){
          notify("比价结果", "", "慢慢买提示您：" + data.msg);
        } else {
          notify(APP+"｜接口异常","", "返回结构无效");
          await L.popup(`[异常] 结构无效: ${JSON.stringify(data||{})}`);
        }
      }catch(e){
        notify(APP+"｜接口异常","", String(e&&e.message||e));
        await L.popup(`[异常] ${String(e&&e.message||e)}`);
      }
      done({});
    })();
    return;
  }

  // C) 渲染（response）
  if (MODE==="render" && typeof $response !== "undefined") {
    (async ()=>{
      try{
        await L.render(`[${APP}·渲染] URL: ${REQ_URL}`);
        const id = extractId(REQ_URL);
        await L.render(`[${APP}·渲染] 商品ID: ${id||"-"}`);
        if (!id) return $done($response);

        const data = await requestHistoryPrice(id, L.render);
        if (!(data && data.ok === 1)) {
          await L.render(`[异常] 返回: ${JSON.stringify(data||{})}`);
          return $done($response);
        }

        const r = data.result || {};
        const tip = ((r.priceRemark && r.priceRemark.Tip) || "") + "（仅供参考）";
        const lower = lowerMsg(r);

        // 表格
        const arr = r?.priceRemark?.ListPriceDetail || [];
        const map = {"双11价格":"双十一价格","618价格":"六一八价格","30天最低价":"三十天最低","60天最低价":"六十天最低","180天最低价":"一百八最低"};
        let rows="";
        for (const it of arr){
          const nm = it?.Name || "";
          if (/历史最高|常购价/.test(nm)) continue;
          rows += `<tr><td>${map[nm]||nm||""}</td><td>${it?.Price ?? "-"}</td><td>${it?.Date || ""}</td><td>${(it?.Difference==="-"?"":(it?.Difference||""))}</td></tr>`;
        }
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

        // 原始文本
        const raw = summaryText(r).replace(/[&<>]/g, s=>({"&":"&amp;","<":"&lt;",">":"&gt;"}[s]));

        // 选择内容
        let content = "";
        if (STYLE==="table") content = tableHtml;
        else if (STYLE==="raw") content = `<pre class="jd-price-pre">${raw}</pre>`;
        else content = (LINE_ONLY ? "" : tableHtml) + chartHtml;

        const css = '<style>.jd-price-panel{font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,PingFang SC,Helvetica,Arial;line-height:1.35;box-shadow:0 6px 18px rgba(0,0,0,.08);border:1px solid #eee;border-radius:12px;padding:12px 14px;margin:10px 8px;background:#fff}.jd-price-panel h3{font-size:15px;margin:0 0 8px 0}.jd-price-meta{color:#666;font-size:12px;margin-bottom:8px}.jd-price-pre{font-size:12px;background:#fafafa;border:1px dashed #ddd;border-radius:8px;padding:8px;white-space:pre-wrap}.jd-price-table{width:100%;border-collapse:collapse;font-size:12px;margin-top:6px}.jd-price-table th,.jd-price-table td{border:1px solid #eee;padding:6px 8px;text-align:left}.jd-price-muted{color:#999}.jd-price-chart{width:100%;height:120px;margin-top:6px}</style>';
        const panel = `${css}<div class="jd-price-panel"><h3>价格趋势</h3><div class="jd-price-meta">${lower} <span class="jd-price-muted">${tip}</span></div>${content}</div>`;

        let html = $response.body || "";
        if (/<\/body>/i.test(html)) html = html.replace(/<\/body>/i, panel + "</body>");
        else html = panel + html;
        $done({ body: html });
      }catch(e){
        await L.render(`[异常] ${String(e&&e.message||e)}`);
        try { $done($response); } catch(_) { done({}); }
      }
    })();
    return;
  }

  // 其它直接放行
  done({});
})();
