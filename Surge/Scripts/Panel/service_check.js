/**
 * 服務檢測 / 服务检测（深测 · Surge）
 * 作者：ByteValley（参考 LucaLin233/Rabbit-Spec）
 * 功能：Netflix/Disney+/YouTube Premium/ChatGPT Web+App/Hulu(US/JP)/HBO Max + GEO
 * 新增：i18n(zh-Hant/zh-Hans) + Style(pretty/compact) + 可选是否显示耗时/HTTP码
 */

(() => {
  // ---------- 参数 ----------
  const args = ($argument || "").split("&").reduce((m, kv) => {
    const i = kv.indexOf("="); if (i===-1) return m;
    const k = decodeURIComponent(kv.slice(0,i));
    const v = decodeURIComponent(kv.slice(i+1));
    m[k] = v; return m;
  }, {});
  const get = (k, def=null) => {
    const v = args[k]; if (v==null || /^{{{[^}]+}}}$/.test(v) || /^null|undefined$/i.test(v)) return def;
    return String(v).trim();
  };

  const TIMEOUT = parseInt(get("timeout","5000"), 10);
  const ICON = get("defaultIcon","globe");
  const ICON_COLOR = get("defaultIconColor","#1E90FF");
  const LANG = /^zh-hans$/i.test(get("lang","zh-Hant")) ? "zh-Hans" : "zh-Hant";
  const STYLE = /^compact$/i.test(get("style","pretty")) ? "compact" : "pretty";
  const SHOW_LAT = /^true$/i.test(get("showLatency","true"));
  const SHOW_HTTP = /^true$/i.test(get("showHttp","true"));
  const TITLE_PARAM = get("title", "");

  // ---------- i18n ----------
  const T = {
    "zh-Hant": {
      panel: TITLE_PARAM || "服務檢測",
      geo: "出口資訊",
      unreachable: "不可達",
      timeout: "檢測超時",
      fail: "檢測失敗，請刷新面板",
      regionBlocked: "區域受限",
      unlocked: "已解鎖",
      soon: "即將登陸",
      full: "完整解鎖",
      originals: "僅自製劇",
      youTube: "YouTube",
      chatgpt: "ChatGPT",
      chatgpt_app: "ChatGPT App(API)",
      netflix: "Netflix",
      disney: "Disney+",
      huluUS: "Hulu(美)",
      huluJP: "Hulu(日)",
      hbo: "Max(HBO)",
      geoLine: (s)=>`🌐 ${s}`,
      nf_full: (cc)=>`已完整解鎖 ➟ ${cc}`,
      nf_origs:(cc)=>`僅解鎖自製劇 ➟ ${cc}`,
      nf_block:"該節點不支持解鎖",
      d_ok:(cc)=>`已解鎖 ➟ ${cc}`,
      d_soon:(cc)=>`即將登陸~${cc}`,
      hulu_ok:(cc)=>`已解鎖 ➟ ${cc}`,
      hulu_blk:"區域受限 🚫",
      max_ok:(cc)=>`已解鎖${cc?` ➟ ${cc}`:""}`,
      max_blk:"區域受限 🚫"
    },
    "zh-Hans": {
      panel: TITLE_PARAM || "服务检测",
      geo: "出口信息",
      unreachable: "不可达",
      timeout: "检测超时",
      fail: "检测失败，请刷新面板",
      regionBlocked: "区域受限",
      unlocked: "已解锁",
      soon: "即将登陆",
      full: "完整解锁",
      originals: "仅自制剧",
      youTube: "YouTube",
      chatgpt: "ChatGPT",
      chatgpt_app: "ChatGPT App(API)",
      netflix: "Netflix",
      disney: "Disney+",
      huluUS: "Hulu(美)",
      huluJP: "Hulu(日)",
      hbo: "Max(HBO)",
      geoLine: (s)=>`🌐 ${s}`,
      nf_full: (cc)=>`已完整解锁 ➟ ${cc}`,
      nf_origs:(cc)=>`仅解锁自制剧 ➟ ${cc}`,
      nf_block:"该节点不支持解锁",
      d_ok:(cc)=>`已解锁 ➟ ${cc}`,
      d_soon:(cc)=>`即将登陆~${cc}`,
      hulu_ok:(cc)=>`已解锁 ➟ ${cc}`,
      hulu_blk:"区域受限 🚫",
      max_ok:(cc)=>`已解锁${cc?` ➟ ${cc}`:""}`,
      max_blk:"区域受限 🚫"
    }
  }[LANG];

  // ---------- 工具 ----------
  const UA_STR = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
  const BASE_HEADERS = {"User-Agent": UA_STR, "Accept-Language":"en"};

  const now=()=>Date.now(); const ms=(n)=>`${n}ms`;
  const pick=(...xs)=>{for(const x of xs){if(x) return x;}return ""};
  const okIcon = STYLE==="pretty" ? "✅" : "[OK]";
  const noIcon = STYLE==="pretty" ? "❌" : "[X]";

  function httpGet(url, headers={}, followRedirect=true){
    return new Promise((resolve)=>{
      const start=now();
      $httpClient.get({ url, headers:{...BASE_HEADERS,...headers}, timeout: TIMEOUT, followRedirect },(err,resp,data)=>{
        const cost=now()-start;
        if (err || !resp) return resolve({ok:false,status:0,cost,headers:{},data:""});
        resolve({ok:true,status:resp.status||0,cost,headers:resp.headers||{},data:data||""});
      });
    });
  }
  function httpPost(url, headers={}, body=""){
    return new Promise((resolve)=>{
      const start=now();
      $httpClient.post({ url, headers:{...BASE_HEADERS,...headers}, body, timeout: TIMEOUT },(err,resp,data)=>{
        const cost=now()-start;
        if (err || !resp) return resolve({ok:false,status:0,cost,headers:{},data:""});
        resolve({ok:true,status:resp.status||0,cost,headers:resp.headers||{},data:data||""});
      });
    });
  }
  const addParts=(parts, cost, status)=>{
    if (SHOW_LAT && cost!=null) parts.push(ms(cost));
    if (SHOW_HTTP && status>0) parts.push(`HTTP ${status}`);
    return parts.join(STYLE==="pretty"?" ｜ ":" | ");
  };

  // ---------- GEO ----------
  async function getGEO(){
    const sources=["https://ipapi.co/json","https://api.ip.sb/geoip","https://ifconfig.co/json"];
    for (const u of sources){
      const r=await httpGet(u);
      if (r.ok && r.status>=200 && r.status<500){
        try{
          const j=JSON.parse(r.data||"{}");
          const ip=pick(j.ip,j.query,j.ip_address);
          const cc=pick(j.country,j.country_name,j.country_code);
          const isp=pick(j.org,j.isp,j.asn);
          return { ok:true, text:[ip,cc,isp].filter(Boolean).join(" / "), cc:(cc||"").toUpperCase() };
        }catch(_){}
      }
    }
    return { ok:false, text:T.fail, cc:"" };
  }

  // ---------- YouTube Premium ----------
  async function testYouTube(){
    const r=await httpGet("https://www.youtube.com/premium?hl=en",{},true);
    if (!r.ok) return `${noIcon} ${T.youTube}${SHOW_LAT?` ${ms(r.cost)}`:""}${SHOW_HTTP?" | "+T.unreachable:""}`;
    let cc=""; try{
      let m = r.data.match(/"countryCode":"([A-Z]{2})"/);
      if (!m) m = r.data.match(/["']INNERTUBE_CONTEXT_GL["']\s*:\s*["']([A-Z]{2})["']/);
      if (m) cc = m[1];
      else if (r.data.includes("www.google.cn")) cc="CN"; else cc="US";
    }catch(_){}
    const parts=[`${okIcon} ${T.youTube}`, cc];
    return addParts(parts, r.cost, r.status);
  }

  // ---------- ChatGPT Web ----------
  async function testChatGPTWeb(){
    const r=await httpGet("https://chatgpt.com/cdn-cgi/trace",{},true);
    if (!r.ok) return `${noIcon} ${T.chatgpt}${SHOW_LAT?` ${ms(r.cost)}`:""}${SHOW_HTTP?" | "+T.unreachable:""}`;
    let loc=""; try{ const m=r.data.match(/loc=([A-Z]{2})/); if (m) loc=m[1]; }catch(_){}
    const parts=[`${okIcon} ${T.chatgpt}`, loc];
    return addParts(parts, r.cost, r.status);
  }

  // ---------- ChatGPT App(API) ----------
  async function testChatGPTAppAPI(){
    const r=await httpGet("https://api.openai.com/v1/models",{},true);
    if (!r.ok) return `${noIcon} ${T.chatgpt_app}${SHOW_LAT?` ${ms(r.cost)}`:""}${SHOW_HTTP?" | "+T.unreachable:""}`;
    const parts=[`${okIcon} ${T.chatgpt_app}`]; // 2xx/3xx/4xx 皆可达
    return addParts(parts, r.cost, r.status);
  }

  // ---------- Netflix ----------
  const NF_ORIGINAL="80018499";
  const NF_NONORIG="81280792";
  function parseNFRegion(resp){
    try{
      const x=resp.headers && (resp.headers["x-originating-url"]||resp.headers["X-Originating-URL"]);
      if (x){
        const seg=String(x).split("/"); if (seg.length>=4){
          const cc=seg[3].split("-")[0]; if (cc && cc.length===2) return cc.toUpperCase();
        }
      }
      const m=String(resp.data||"").match(/"countryCode"\s*:\s*"([A-Z]{2})"/i);
      if (m) return m[1].toUpperCase();
    }catch(_){}
    return "";
  }
  async function nfCheck(id){ return await httpGet(`https://www.netflix.com/title/${id}`,{},true); }
  async function testNetflix(fallback){
    let txt="";
    try{
      const r1=await nfCheck(NF_NONORIG);
      if (!r1.ok){ txt=T.fail; }
      else if (r1.status===403){ txt=T.nf_block; }
      else if (r1.status===404){
        const r2=await nfCheck(NF_ORIGINAL);
        if (!r2.ok){ txt=T.fail; }
        else if (r2.status===404){ txt=T.nf_block; }
        else{
          const cc=parseNFRegion(r2) || (fallback||"").toUpperCase();
          txt=T.nf_origs(cc||"—");
        }
      } else if (r1.status===200){
        const cc=parseNFRegion(r1) || (fallback||"").toUpperCase();
        txt=T.nf_full(cc||"—");
      } else {
        txt=`HTTP ${r1.status}`;
      }
    }catch(_){ txt=T.fail; }
    return `${T.netflix}: ${txt}`;
  }

  // ---------- Disney+（BAM API 优先） ----------
  async function testDisney(){
    async function home(){
      const r=await httpGet("https://www.disneyplus.com/",{"Accept-Language":"en"},true);
      if (!r.ok || r.status!==200 || /Sorry,\s*Disney\+\s*is\s*not\s*available\s*in\s*your\s*region/i.test(r.data||"")) throw "NA";
      let region=""; try{
        const m=r.data.match(/"countryCode"\s*:\s*"([A-Z]{2})"/i) || r.data.match(/data-country=["']([A-Z]{2})["']/i);
        if (m) region=m[1];
      }catch(_){}
      return { region, cost:r.cost, status:r.status };
    }
    async function bam(){
      const headers={
        "Accept-Language":"en",
        "Authorization":"ZGlzbmV5JmJyb3dzZXImMS4wLjA.Cu56AgSfBTDag5NiRA81oLHkDZfu5L3CKadnefEAY84",
        "Content-Type":"application/json",
        "User-Agent":UA_STR
      };
      const body=JSON.stringify({
        query:'mutation registerDevice($input: RegisterDeviceInput!) { registerDevice(registerDevice: $input) { grant { grantType assertion } } }',
        variables:{ input:{ applicationRuntime:'chrome', attributes:{ browserName:'chrome', browserVersion:'120.0.0.0', manufacturer:'apple', model:null, operatingSystem:'macintosh', operatingSystemVersion:'10.15.7', osDeviceIds:[] }, deviceFamily:'browser', deviceLanguage:'en', deviceProfile:'macosx' } }
      });
      const r=await httpPost("https://disney.api.edge.bamgrid.com/graph/v1/device/graphql",headers,body);
      if (!r.ok) throw "ERR";
      if (r.status!==200) throw "NA";
      const d=JSON.parse(r.data||"{}");
      if (d?.errors) throw "NA";
      const inLoc=d?.extensions?.sdk?.session?.inSupportedLocation;
      const cc=d?.extensions?.sdk?.session?.location?.countryCode;
      return { inLoc, cc, cost:r.cost, status:r.status };
    }
    try{
      const h=await Promise.race([home(), waitReject(7000,"TO")]);
      const b=await Promise.race([bam(), waitReject(7000,"TO")]);
      const cc=(b.cc || h.region || "").toUpperCase();
      if (b.inLoc===false || b.inLoc==='false') return `${T.disney}: ${T.d_soon(cc||"—")}`;
      return `${T.disney}: ${T.d_ok(cc||"—")}`;
    }catch(e){
      if (e==="NA") return `${T.disney}: ${T.regionBlocked} 🚫`;
      if (e==="TO") return `${T.disney}: ${T.timeout} 🚦`;
      return `${T.disney}: ${T.fail}`;
    }
  }
  function waitReject(ms, code){ return new Promise((_,rej)=>setTimeout(()=>rej(code),ms)); }

  // ---------- Hulu(US/JP) ----------
  async function testHuluUS(){
    const r=await httpGet("https://www.hulu.com/",{},true);
    if (!r.ok) return `Hulu(US): ${T.unreachable}`;
    const blk=/not\s+available\s+in\s+your\s+region/i.test(r.data||"");
    return blk ? `Hulu(US): ${T.hulu_blk}` : `Hulu(US): ${T.hulu_ok("US")}`;
  }
  async function testHuluJP(){
    const r=await httpGet("https://www.hulu.jp/",{"Accept-Language":"ja"},true);
    if (!r.ok) return `Hulu(JP): ${T.unreachable}`;
    const blk=/ご利用いただけません|サービスをご利用いただけません|not available/i.test(r.data||"");
    return blk ? `Hulu(JP): ${T.hulu_blk}` : `Hulu(JP): ${T.hulu_ok("JP")}`;
  }

  // ---------- Max(HBO) ----------
  async function testHBO(){
    const r=await httpGet("https://www.max.com/",{},true);
    if (!r.ok) return `${T.hbo}: ${T.unreachable}`;
    const blk=/not\s+available\s+in\s+your\s+region|country\s+not\s+supported/i.test(r.data||"");
    let cc=""; try{ const m=String(r.data||"").match(/"countryCode"\s*:\s*"([A-Z]{2})"/i); if (m) cc=m[1].toUpperCase(); }catch(_){}
    return blk ? `${T.hbo}: ${T.max_blk}` : `${T.hbo}: ${T.max_ok(cc)}`;
  }

  // ---------- 主流程 ----------
  (async () => {
    const lines=[];
    const geo=await getGEO();
    lines.push(T.geoLine(`${T.geo} ｜ ${geo.ok?geo.text:T.fail}`));

    const [yt, cgptW, cgptA, nf, d, hu, hj, hb] = await Promise.all([
      testYouTube(), testChatGPTWeb(), testChatGPTAppAPI(),
      testNetflix(geo.cc), testDisney(), testHuluUS(), testHuluJP(), testHBO()
    ]);
    lines.push(yt, cgptW, cgptA, nf, d, hu, hj, hb);

    const sep = "\n";
    $done({
      title: T.panel,
      content: lines.join(sep),
      icon: ICON,
      iconColor: ICON_COLOR
    });
  })();
})();
