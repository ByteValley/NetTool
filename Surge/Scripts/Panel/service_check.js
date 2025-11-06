/**
 * 服务检测 / 服務檢測
 * 作者：ByteValley（参考 LucaLin233/Rabbit-Spec）
 * 功能：Netflix/Disney+/YouTube Premium/ChatGPT Web+App/Hulu(US/JP)/HBO Max + GEO
 * 新增：i18n(简/繁) + 两种样式（pretty/icon） + 国旗显示（区域码 -> Emoji Flag）
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
  const STYLE = /^(icon)$/i.test(get("style","pretty")) ? "icon" : "pretty";
  const SHOW_LAT = /^true$/i.test(get("showLatency","true"));
  const SHOW_HTTP = /^true$/i.test(get("showHttp","true"));
  const TITLE_PARAM = get("title","");

  // ---------- i18n ----------
  const I18N = {
    "zh-Hant": {
      panel: TITLE_PARAM || "服務檢測",
      geo: "出口資訊",
      unreachable: "不可達",
      timeout: "檢測超時",
      fail: "檢測失敗，請刷新面板",
      regionBlocked: "區域受限",
      unlocked: "已解鎖",
      soon: "即將登陸",
      full: "已完整解鎖",
      originals: "僅自製劇",
      youTube: "YouTube",
      chatgpt: "ChatGPT",
      chatgpt_app: "ChatGPT App(API)",
      netflix: "Netflix",
      disney: "Disney+",
      huluUS: "Hulu(美)",
      huluJP: "Hulu(日)",
      hbo: "Max(HBO)",
      regionLabel: "地區",
      // 行文模板
      geoLine: (s)=>`🌐 ${s}`,
      nf_full: (cc)=>`已完整解鎖， 地區: ${cc}`,
      nf_origs:(cc)=>`僅解鎖自製劇， 地區: ${cc}`,
      nf_block:"該節點不支持解鎖",
      d_ok:(cc)=>`已解鎖， 地區: ${cc}`,
      d_soon:(cc)=>`即將登陸， 地區: ${cc}`,
      hulu_ok:(cc)=>`已解鎖， 地區: ${cc}`,
      hulu_blk:"區域受限 🚫",
      max_ok:(cc)=>`已解鎖， 地區: ${cc}`,
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
      full: "已完整解锁",
      originals: "仅自制剧",
      youTube: "YouTube",
      chatgpt: "ChatGPT",
      chatgpt_app: "ChatGPT App(API)",
      netflix: "Netflix",
      disney: "Disney+",
      huluUS: "Hulu(美)",
      huluJP: "Hulu(日)",
      hbo: "Max(HBO)",
      regionLabel: "区域",
      geoLine: (s)=>`🌐 ${s}`,
      nf_full: (cc)=>`已完整解锁， 区域: ${cc}`,
      nf_origs:(cc)=>`仅解锁自制剧， 区域: ${cc}`,
      nf_block:"该节点不支持解锁",
      d_ok:(cc)=>`已解锁， 区域: ${cc}`,
      d_soon:(cc)=>`即将登陆， 区域: ${cc}`,
      hulu_ok:(cc)=>`已解锁， 区域: ${cc}`,
      hulu_blk:"区域受限 🚫",
      max_ok:(cc)=>`已解锁， 区域: ${cc}`,
      max_blk:"区域受限 🚫"
    }
  }[LANG];

  // ---------- 工具 ----------
  const UA_STR = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
  const BASE_HEADERS = {"User-Agent": UA_STR, "Accept-Language":"en"};
  const now=()=>Date.now(); const ms=(n)=>`${n}ms`;
  const pick=(...xs)=>{for(const x of xs){if(x) return x;}return ""};
  const okIcon = "✅"; const noIcon = "❌";

  // cc -> 🇹🇼 旗帜
  function ccFlag(cc){
    cc = (cc||"").toUpperCase();
    if (!/^[A-Z]{2}$/.test(cc)) return cc || "—";
    const codePoints = [...cc].map(c => 0x1F1E6 + (c.charCodeAt(0) - 65));
    try { return String.fromCodePoint(...codePoints) + " " + cc; } catch { return cc; }
  }

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
  const joinPretty=(parts, cost, status)=>{
    const seg = [];
    if (parts.length) seg.push(parts.join(" ｜ "));
    if (SHOW_LAT && cost!=null) seg.push(ms(cost));
    if (SHOW_HTTP && status>0) seg.push(`HTTP ${status}`);
    return seg.join(" ｜ ");
  };
  const lineIcon=(name, tail)=> `${name}: ${tail}`;

  // ---------- GEO ----------
  async function getGEO(){
    const sources=["https://ipapi.co/json","https://api.ip.sb/geoip","https://ifconfig.co/json"];
    for (const u of sources){
      const r=await httpGet(u);
      if (r.ok && r.status>=200 && r.status<500){
        try{
          const j=JSON.parse(r.data||"{}");
          const ip=pick(j.ip,j.query,j.ip_address);
          const cc=(pick(j.country,j.country_name,j.country_code)||"").toUpperCase();
          const isp=pick(j.org,j.isp,j.asn);
          return { ok:true, text:[ip, ccFlag(cc), isp].filter(Boolean).join(" / "), cc };
        }catch(_){}
      }
    }
    return { ok:false, text:I18N.fail, cc:"" };
  }

  // ---------- YouTube Premium ----------
  async function testYouTube(){
    const r=await httpGet("https://www.youtube.com/premium?hl=en",{},true);
    if (!r.ok){
      if (STYLE==="icon") return lineIcon(I18N.youTube, I18N.unreachable);
      return joinPretty([`${noIcon} ${I18N.youTube}`], r.cost, r.status);
    }
    let cc=""; try{
      let m = r.data.match(/"countryCode":"([A-Z]{2})"/);
      if (!m) m = r.data.match(/["']INNERTUBE_CONTEXT_GL["']\s*:\s*["']([A-Z]{2})["']/);
      if (m) cc = m[1]; else if (r.data.includes("www.google.cn")) cc="CN"; else cc="US";
    }catch(_){}
    const region = ccFlag(cc || "");
    if (STYLE==="icon") return lineIcon(I18N.youTube, `${I18N.unlocked}， ${I18N.regionLabel}: ${region||"—"}`);
    return joinPretty([`${okIcon} ${I18N.youTube}`, region], r.cost, r.status);
  }

  // ---------- ChatGPT Web ----------
  async function testChatGPTWeb(){
    const r=await httpGet("https://chatgpt.com/cdn-cgi/trace",{},true);
    if (!r.ok){
      if (STYLE==="icon") return lineIcon(I18N.chatgpt, I18N.unreachable);
      return joinPretty([`${noIcon} ${I18N.chatgpt}`], r.cost, r.status);
    }
    let loc=""; try{ const m=r.data.match(/loc=([A-Z]{2})/); if (m) loc=m[1]; }catch(_){}
    const region = ccFlag(loc || "");
    if (STYLE==="icon") return lineIcon(I18N.chatgpt, `${I18N.unlocked}， ${I18N.regionLabel}: ${region||"—"}`);
    return joinPretty([`${okIcon} ${I18N.chatgpt}`, region], r.cost, r.status);
  }

  // ---------- ChatGPT App(API) ----------
  async function testChatGPTAppAPI(){
    const r=await httpGet("https://api.openai.com/v1/models",{},true);
    if (!r.ok){
      if (STYLE==="icon") return lineIcon(I18N.chatgpt_app, I18N.unreachable);
      return joinPretty([`${noIcon} ${I18N.chatgpt_app}`], r.cost, r.status);
    }
    if (STYLE==="icon") return lineIcon(I18N.chatgpt_app, I18N.unlocked);
    return joinPretty([`${okIcon} ${I18N.chatgpt_app}`], r.cost, r.status);
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
    let txt="", cc="";
    try{
      const r1=await nfCheck(NF_NONORIG);
      if (!r1.ok){ txt=I18N.fail; }
      else if (r1.status===403){ txt=I18N.nf_block; }
      else if (r1.status===404){
        const r2=await nfCheck(NF_ORIGINAL);
        if (!r2.ok){ txt=I18N.fail; }
        else if (r2.status===404){ txt=I18N.nf_block; }
        else { cc = parseNFRegion(r2) || (fallback||""); txt = I18N.nf_origs(ccFlag(cc||"—")); }
      } else if (r1.status===200){
        cc = parseNFRegion(r1) || (fallback||""); txt = I18N.nf_full(ccFlag(cc||"—"));
      } else { txt=`HTTP ${r1.status}`; }
    }catch(_){ txt=I18N.fail; }
    if (STYLE==="icon") return lineIcon(I18N.netflix, txt);
    return `${I18N.netflix}: ${txt}`;
  }

  // ---------- Disney+（BAM API 优先） ----------
  async function testDisney(){
    async function home(){
      const r=await httpGet("https://www.disneyplus.com/",{"Accept-Language":"en"},true);
      if (!r.ok || r.status!==200 || /Sorry,\s*Disney\+\s*is\s*not\s*available\s*in\s*your\s*region/i.test(r.data||"")) throw "NA";
      let cc=""; try{
        const m=r.data.match(/"countryCode"\s*:\s*"([A-Z]{2})"/i) || r.data.match(/data-country=["']([A-Z]{2})["']/i);
        if (m) cc=m[1];
      }catch(_){}
      return { cc, cost:r.cost, status:r.status };
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
      const cc=(b.cc || h.cc || "");
      const region = ccFlag(cc||"—");
      const text = (b.inLoc===false || b.inLoc==='false') ? I18N.d_soon(region) : I18N.d_ok(region);
      if (STYLE==="icon") return lineIcon(I18N.disney, text);
      return `${I18N.disney}: ${text}`;
    }catch(e){
      const text = e==="NA" ? (I18N.regionBlocked+" 🚫") : e==="TO" ? (I18N.timeout+" 🚦") : I18N.fail;
      if (STYLE==="icon") return lineIcon(I18N.disney, text);
      return `${I18N.disney}: ${text}`;
    }
  }
  function waitReject(ms, code){ return new Promise((_,rej)=>setTimeout(()=>rej(code),ms)); }

  // ---------- Hulu(US/JP) ----------
  async function testHuluUS(){
    const r=await httpGet("https://www.hulu.com/",{},true);
    if (!r.ok){
      if (STYLE==="icon") return lineIcon(I18N.huluUS, I18N.unreachable);
      return `${I18N.huluUS}: ${I18N.unreachable}`;
    }
    const blk=/not\s+available\s+in\s+your\s+region/i.test(r.data||"");
    if (STYLE==="icon") return lineIcon(I18N.huluUS, blk? I18N.hulu_blk : I18N.hulu_ok(ccFlag("US")));
    return `${I18N.huluUS}: ${blk? I18N.hulu_blk : I18N.hulu_ok(ccFlag("US"))}`;
  }
  async function testHuluJP(){
    const r=await httpGet("https://www.hulu.jp/",{"Accept-Language":"ja"},true);
    if (!r.ok){
      if (STYLE==="icon") return lineIcon(I18N.huluJP, I18N.unreachable);
      return `${I18N.huluJP}: ${I18N.unreachable}`;
    }
    const blk=/ご利用いただけません|サービスをご利用いただけません|not available/i.test(r.data||"");
    if (STYLE==="icon") return lineIcon(I18N.huluJP, blk? I18N.hulu_blk : I18N.hulu_ok(ccFlag("JP")));
    return `${I18N.huluJP}: ${blk? I18N.hulu_blk : I18N.hulu_ok(ccFlag("JP"))}`;
  }

  // ---------- Max(HBO) ----------
  async function testHBO(){
    const r=await httpGet("https://www.max.com/",{},true);
    if (!r.ok){
      if (STYLE==="icon") return lineIcon(I18N.hbo, I18N.unreachable);
      return `${I18N.hbo}: ${I18N.unreachable}`;
    }
    const blk=/not\s+available\s+in\s+your\s+region|country\s+not\s+supported/i.test(r.data||"");
    let cc=""; try{ const m=String(r.data||"").match(/"countryCode"\s*:\s*"([A-Z]{2})"/i); if (m) cc=m[1].toUpperCase(); }catch(_){}
    const text = blk ? I18N.max_blk : I18N.max_ok(cc ? ccFlag(cc) : "");
    if (STYLE==="icon") return lineIcon(I18N.hbo, text);
    return `${I18N.hbo}: ${text}`;
  }

  // ---------- 主流程 ----------
  (async () => {
    const lines=[];
    const geo=await getGEO();
    const geoLine = I18N.geoLine(`${I18N.geo} ｜ ${geo.ok?geo.text:I18N.fail}`);
    lines.push(geoLine);

    const [yt, cgptW, cgptA, nf, d, hu, hj, hb] = await Promise.all([
      testYouTube(), testChatGPTWeb(), testChatGPTAppAPI(),
      testNetflix(geo.cc), testDisney(), testHuluUS(), testHuluJP(), testHBO()
    ]);
    lines.push(yt, cgptW, cgptA, nf, d, hu, hj, hb);

    $done({
      title: I18N.panel,
      content: lines.join("\n"),
      icon: ICON,
      iconColor: ICON_COLOR
    });
  })();
})();
