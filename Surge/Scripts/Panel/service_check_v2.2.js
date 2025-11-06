/**
 * 服务检测 / 服務檢測
 * 作者：ByteValley（参考 LucaLin233 / Rabbit-Spec）
 * 支持：Netflix / Disney+ / YouTube Premium / ChatGPT Web + App(API) / Hulu(US/JP) / Max(HBO)
 * 样式：
 *   - detail：✅ + 旗帜 + 代码 + "| 中文名" + 延迟 + HTTP
 *   - simple：✅ + 旗帜 + 代码 + "| 中文名"
 * 其它：
 *   - 去掉“出口信息”首行
 *   - 末尾追加：蜂窝数据一行；下一行起显示 设备/节点 信息（无额外标题，与上段之间留一空行）
 */

(() => {
  // ------------ 参数 ------------
  const args = ($argument || "")
    .split("&")
    .filter(Boolean)
    .reduce((m, kv) => {
      const i = kv.indexOf("="); if (i === -1) return m;
      const k = decodeURIComponent(kv.slice(0, i));
      const v = decodeURIComponent(kv.slice(i + 1));
      m[k] = v; return m;
    }, {});
  const getArg = (k, d=null) => {
    const v = args[k];
    if (v == null || /^{{{[^}]+}}}$/.test(v) || /^(null|undefined)$/i.test(v)) return d;
    return String(v).trim();
  };

  const TIMEOUT      = parseInt(getArg("timeout", "5000"), 10);
  const ICON         = getArg("defaultIcon", "globe");
  const ICON_COLOR   = getArg("defaultIconColor", "#1E90FF");
  const LANG         = /^zh-hans$/i.test(getArg("lang", "zh-Hant")) ? "zh-Hans" : "zh-Hant";
  const STYLE        = /^simple$/i.test(getArg("style", "detail")) ? "simple" : "detail";
  const SHOW_LAT     = /^true$/i.test(getArg("showLatency", "true"));
  const SHOW_HTTP    = /^true$/i.test(getArg("showHttp", "true"));
  const TITLE_PARAM  = getArg("title", "");

  // ------------ i18n ------------
  const I18N = {
    "zh-Hant": {
      panel: TITLE_PARAM || "服務檢測",
      unreachable: "不可達",
      timeout: "逾時",
      fail: "檢測失敗",
      regionBlocked: "區域受限",
      unlocked: "已解鎖",
      full: "完整",
      originals: "自製",
      youTube: "YouTube",
      chatgpt: "ChatGPT",
      chatgpt_app: "ChatGPT App(API)",
      netflix: "Netflix",
      disney: "Disney+",
      huluUS: "Hulu(美)",
      huluJP: "Hulu(日)",
      hbo: "Max(HBO)",
      cellular: "蜂窩數據",
      devip: "設備IP",
      ipv6: "IPv6地址",
      nodeip: "節點IP",
      nodeisp: "節點ISP",
      nodeloc: "節點位置"
    },
    "zh-Hans": {
      panel: TITLE_PARAM || "服务检测",
      unreachable: "不可达",
      timeout: "超时",
      fail: "检测失败",
      regionBlocked: "区域受限",
      unlocked: "已解锁",
      full: "完整",
      originals: "自制",
      youTube: "YouTube",
      chatgpt: "ChatGPT",
      chatgpt_app: "ChatGPT App(API)",
      netflix: "Netflix",
      disney: "Disney+",
      huluUS: "Hulu(美)",
      huluJP: "Hulu(日)",
      hbo: "Max(HBO)",
      cellular: "蜂窝数据",
      devip: "设备IP",
      ipv6: "IPv6地址",
      nodeip: "节点IP",
      nodeisp: "节点ISP",
      nodeloc: "节点位置"
    }
  }[LANG];

  // 常见地区中文名
  const CC_NAME = {
    "zh-Hans": {
      CN:"中国", TW:"台湾", HK:"中国香港", MO:"中国澳门", JP:"日本", KR:"韩国", US:"美国",
      SG:"新加坡", MY:"马来西亚", TH:"泰国", VN:"越南", PH:"菲律宾", ID:"印度尼西亚",
      IN:"印度", AU:"澳大利亚", NZ:"新西兰", CA:"加拿大", GB:"英国", DE:"德国", FR:"法国",
      NL:"荷兰", ES:"西班牙", IT:"意大利", BR:"巴西", AR:"阿根廷", MX:"墨西哥", RU:"俄罗斯",
    },
    "zh-Hant": {
      CN:"中國", TW:"台灣", HK:"中國香港", MO:"中國澳門", JP:"日本", KR:"南韓", US:"美國",
      SG:"新加坡", MY:"馬來西亞", TH:"泰國", VN:"越南", PH:"菲律賓", ID:"印尼",
      IN:"印度", AU:"澳洲", NZ:"紐西蘭", CA:"加拿大", GB:"英國", DE:"德國", FR:"法國",
      NL:"荷蘭", ES:"西班牙", IT:"義大利", BR:"巴西", AR:"阿根廷", MX:"墨西哥", RU:"俄羅斯",
    }
  }[LANG];

  // ------------ 工具 ------------
  const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";
  const BASE_HEADERS = { "User-Agent": UA, "Accept-Language": "en" };
  const now = () => Date.now();

  function httpGet(url, headers={}, followRedirect=true) {
    return new Promise((resolve) => {
      const start = now();
      $httpClient.get(
        { url, headers: { ...BASE_HEADERS, ...headers }, timeout: TIMEOUT, followRedirect },
        (err, resp, data) => {
          const cost = now() - start;
          if (err || !resp) return resolve({ ok:false, status:0, cost, headers:{}, data:"" });
          resolve({ ok:true, status: resp.status || resp.statusCode || 0, cost,
                    headers: resp.headers || {}, data: data || "" });
        }
      );
    });
  }

  function httpPost(url, headers={}, body="") {
    return new Promise((resolve) => {
      const start = now();
      $httpClient.post(
        { url, headers: { ...BASE_HEADERS, ...headers }, timeout: TIMEOUT, body },
        (err, resp, data) => {
          const cost = now() - start;
          if (err || !resp) return resolve({ ok:false, status:0, cost, headers:{}, data:"" });
          resolve({ ok:true, status: resp.status || resp.statusCode || 0, cost,
                    headers: resp.headers || {}, data: data || "" });
        }
      );
    });
  }

  // 旗帜
  function flagFromCC(cc) {
    cc = (cc || "").toUpperCase();
    if (!/^[A-Z]{2}$/.test(cc)) return "";
    const cps = [...cc].map(c => 0x1F1E6 + (c.charCodeAt(0)-65));
    try { return String.fromCodePoint(...cps); } catch { return ""; }
  }
  // 旗帜 + 代码 + | 中文名
  function ccPretty(cc) {
    cc = (cc || "").toUpperCase();
    if (!cc) return "";
    const flag = flagFromCC(cc);
    const name = CC_NAME[cc];
    if (flag && name) return `${flag} ${cc} | ${name}`;
    if (flag) return `${flag} ${cc}`;
    return cc;
  }

  // 统一行拼装
  // tag: “自制/完整/区域受限”等补充标签
  function joinLine(name, ok, regionCC, cost, status, tag="") {
    const parts = [];
    parts.push(`${ok ? "✅" : "⛔️"} ${name}`);
    if (regionCC) parts.push(ccPretty(regionCC));
    if (tag) parts.push(tag);
    if (STYLE === "detail") {
      if (SHOW_LAT && cost != null) parts.push(`${cost}ms`);
      if (SHOW_HTTP && status > 0)  parts.push(`HTTP ${status}`);
    }
    return parts.join(" ｜ ");
  }

  // 解析 NF 区域
  function parseNFRegion(resp) {
    try {
      const x = resp.headers?.["x-originating-url"] || resp.headers?.["X-Originating-URL"];
      if (x) {
        const seg = String(x).split("/");
        if (seg.length >= 4) {
          const cc = seg[3].split("-")[0];
          if (/^[A-Z]{2}$/i.test(cc)) return cc.toUpperCase();
        }
      }
      const m = String(resp.data||"").match(/"countryCode"\s*:\s*"([A-Z]{2})"/i);
      if (m) return m[1].toUpperCase();
    } catch(_){}
    return "";
  }

  // 备用：通过 ip-api 查落地信息（给 App/API 用，同时也作为 Disney 等兜底）
  async function queryLandingCC() {
    const r = await httpGet("http://ip-api.com/json", {}, true);
    if (r.ok && r.status === 200) {
      try {
        const j = JSON.parse(r.data || "{}");
        return (j.countryCode || "").toUpperCase();
      } catch(_){ return ""; }
    }
    return "";
  }

  // ------------ 各服务检测 ------------
  async function testYouTube() {
    const r = await httpGet("https://www.youtube.com/premium?hl=en", {}, true);
    if (!r.ok) return `${I18N.youTube}: ${I18N.unreachable}`;
    let cc = "";
    try {
      let m = r.data.match(/"countryCode":"([A-Z]{2})"/);
      if (!m) m = r.data.match(/["']INNERTUBE_CONTEXT_GL["']\s*:\s*["']([A-Z]{2})["']/);
      if (m) cc = m[1]; else cc = "US";
    } catch(_){ cc = "US"; }
    return joinLine(I18N.youTube, true, cc, r.cost, r.status);
  }

  async function testChatGPTWeb() {
    const r = await httpGet("https://chatgpt.com/cdn-cgi/trace", {}, true);
    if (!r.ok) return `${I18N.chatgpt}: ${I18N.unreachable}`;
    let cc = ""; try { const m = r.data.match(/loc=([A-Z]{2})/); if (m) cc = m[1]; } catch(_){}
    return joinLine(I18N.chatgpt, true, cc, r.cost, r.status);
  }

  async function testChatGPTAppAPI() {
    // 访问 models 判断可达性；国家用落地 IP 查询补齐
    const models = await httpGet("https://api.openai.com/v1/models", {}, true);
    if (!models.ok) return `${I18N.chatgpt_app}: ${I18N.unreachable}`;
    let cc = await queryLandingCC();
    return joinLine(I18N.chatgpt_app, true, cc, models.cost, models.status);
  }

  const NF_ORIGINAL = "80018499";
  const NF_NONORIG  = "81280792";
  async function nfGet(id){ return await httpGet(`https://www.netflix.com/title/${id}`, {}, true); }

  async function testNetflix() {
    try {
      const r1 = await nfGet(NF_NONORIG); // 非自制
      if (!r1.ok) return `${I18N.netflix}: ${I18N.fail}`;
      if (r1.status === 403) return joinLine(I18N.netflix, false, "", r1.cost, r1.status, I18N.regionBlocked);
      if (r1.status === 404) {
        const r2 = await nfGet(NF_ORIGINAL);
        if (!r2.ok) return `${I18N.netflix}: ${I18N.fail}`;
        if (r2.status === 404) return joinLine(I18N.netflix, false, "", r2.cost, r2.status, I18N.regionBlocked);
        const cc = parseNFRegion(r2) || "";
        return joinLine(I18N.netflix, true, cc, r2.cost, r2.status, I18N.originals);
      }
      if (r1.status === 200) {
        const cc = parseNFRegion(r1) || "";
        return joinLine(I18N.netflix, true, cc, r1.cost, r1.status, I18N.full);
      }
      return `${I18N.netflix}: HTTP ${r1.status}`;
    } catch(_){
      return `${I18N.netflix}: ${I18N.fail}`;
    }
  }

  async function testDisney() {
    async function home() {
      const r = await httpGet("https://www.disneyplus.com/", { "Accept-Language":"en" }, true);
      if (!r.ok || r.status !== 200 || /Sorry,\s*Disney\+\s*is\s*not\s*available/i.test(r.data||"")) throw "NA";
      let cc=""; try {
        const m = r.data.match(/"countryCode"\s*:\s*"([A-Z]{2})"/i) || r.data.match(/data-country=["']([A-Z]{2})["']/i);
        if (m) cc = m[1];
      } catch(_){}
      return { cc, cost:r.cost, status:r.status };
    }
    async function bam() {
      const headers = {
        "Accept-Language":"en",
        "Authorization":"ZGlzbmV5JmJyb3dzZXImMS4wLjA.Cu56AgSfBTDag5NiRA81oLHkDZfu5L3CKadnefEAY84",
        "Content-Type":"application/json",
        "User-Agent": UA
      };
      const body = JSON.stringify({
        query:'mutation registerDevice($input: RegisterDeviceInput!) { registerDevice(registerDevice: $input) { grant { grantType assertion } } }',
        variables:{ input:{ applicationRuntime:'chrome', attributes:{ browserName:'chrome', browserVersion:'120.0.0.0', manufacturer:'apple', model:null, operatingSystem:'macintosh', operatingSystemVersion:'10.15.7', osDeviceIds:[] }, deviceFamily:'browser', deviceLanguage:'en', deviceProfile:'macosx' } }
      });
      const r = await httpPost("https://disney.api.edge.bamgrid.com/graph/v1/device/graphql", headers, body);
      if (!r.ok || r.status !== 200) throw "NA";
      const d = JSON.parse(r.data || "{}");
      if (d?.errors) throw "NA";
      const inLoc = d?.extensions?.sdk?.session?.inSupportedLocation;
      const cc    = d?.extensions?.sdk?.session?.location?.countryCode;
      return { inLoc, cc, cost:r.cost, status:r.status };
    }
    function timeout(ms, code){ return new Promise((_,rej)=>setTimeout(()=>rej(code),ms)); }

    try {
      const h = await Promise.race([home(), timeout(7000,"TO")]);
      const b = await Promise.race([bam(),  timeout(7000,"TO")]).catch(()=>({}));
      const cc = (b?.cc || h?.cc || (await queryLandingCC()) || "");
      const blocked = (b && b.inLoc === false);
      return joinLine(I18N.disney, !blocked, blocked ? "" : cc, (b?.cost||h?.cost||0), (b?.status||h?.status||0), blocked ? I18N.regionBlocked : "");
    } catch(e){
      if (e === "TO") return `${I18N.disney}: ${I18N.timeout}`;
      return `${I18N.disney}: ${I18N.fail}`;
    }
  }

  async function testHuluUS() {
    const r = await httpGet("https://www.hulu.com/", {}, true);
    if (!r.ok) return `${I18N.huluUS}: ${I18N.unreachable}`;
    const blocked = /not\s+available\s+in\s+your\s+region/i.test(r.data || "");
    return joinLine(I18N.huluUS, !blocked, blocked ? "" : "US", r.cost, r.status, blocked ? I18N.regionBlocked : "");
  }

  async function testHuluJP() {
    const r = await httpGet("https://www.hulu.jp/", { "Accept-Language":"ja" }, true);
    if (!r.ok) return `${I18N.huluJP}: ${I18N.unreachable}`;
    const blocked = /ご利用いただけません|サービスをご利用いただけません|not available/i.test(r.data || "");
    return joinLine(I18N.huluJP, !blocked, blocked ? "" : "JP", r.cost, r.status, blocked ? I18N.regionBlocked : "");
  }

  async function testHBO() {
    const r = await httpGet("https://www.max.com/", {}, true);
    if (!r.ok) return `${I18N.hbo}: ${I18N.unreachable}`;
    const blocked = /not\s+available\s+in\s+your\s+region|country\s+not\s+supported/i.test(r.data || "");
    let cc=""; try { const m = String(r.data||"").match(/"countryCode"\s*:\s*"([A-Z]{2})"/i); if (m) cc = m[1].toUpperCase(); } catch(_){}
    if (!cc) cc = await queryLandingCC();
    return joinLine(I18N.hbo, !blocked, blocked ? "" : cc, r.cost, r.status, blocked ? I18N.regionBlocked : "");
  }

  // ------------ 蜂窝/设备/节点 ------------
  function getCellularLine() {
    const radioGen = {
      GPRS:"2.5G", CDMA1x:"2.5G", EDGE:"2.75G", WCDMA:"3G",
      HSDPA:"3.5G", CDMAEVDORev0:"3.5G", CDMAEVDORevA:"3.5G", CDMAEVDORevB:"3.75G",
      HSUPA:"3.75G", eHRPD:"3.9G", LTE:"4G", NRNSA:"5G - NRNSA", NR:"5G"
    };
    try {
      const cell = $network["cellular-data"];
      if (!cell) return "";
      const radio = cell.radio || "";
      const gen = radioGen[radio] || radio || "";
      if (!radio) return "";
      return `${I18N.cellular} | ${gen}`;
    } catch(_){ return ""; }
  }

  async function getDeviceAndNodeLines() {
    const v4 = $network?.v4 || {};
    const v6 = $network?.v6 || {};
    const dev4 = v4.primaryAddress || "";
    const ipv6Assigned = !!v6.primaryAddress;

    const r = await httpGet("http://ip-api.com/json", {}, true);
    let nodeIP="", isp="", cc="", country="", city="";
    if (r.ok && r.status === 200) {
      try {
        const j = JSON.parse(r.data || "{}");
        nodeIP  = j.query || "";
        isp     = j.isp || j.org || "";
        cc      = (j.countryCode || "").toUpperCase();
        country = j.country || "";
        city    = j.city || "";
      } catch(_){}
    }
    const loc = cc ? `${flagFromCC(cc)} ${cc} | ${country}${city?` - ${city}`:""}` : "";

    const out = [];
    if (dev4) out.push(`${I18N.devip}：${dev4}`);
    out.push(`${I18N.ipv6}：${ipv6Assigned ? (LANG==="zh-Hans"?"已分配":"已分配") : (LANG==="zh-Hans"?"未分配":"未分配")}`);
    if (nodeIP) out.push(`${I18N.nodeip}：${nodeIP}`);
    if (isp)   out.push(`${I18N.nodeisp}：${isp}`);
    if (loc)   out.push(`${I18N.nodeloc}：${loc}`);
    return out.join("\n");
  }

  // ------------ 主流程 ------------
  (async () => {
    const lines = [];

    const [yt, cgptW, cgptA, nf, d, hu, hj, hb] = await Promise.all([
      testYouTube(),
      testChatGPTWeb(),
      testChatGPTAppAPI(),
      testNetflix(),
      testDisney(),
      testHuluUS(),
      testHuluJP(),
      testHBO()
    ]);

    lines.push(yt, cgptW, cgptA, nf, d, hu, hj, hb);

    const cell = getCellularLine();
    if (cell) lines.push("", cell);

    const net = await getDeviceAndNodeLines();
    if (net) lines.push(net);

    $done({
      title: I18N.panel,
      content: lines.join("\n"),
      icon: ICON,
      "icon-color": ICON_COLOR
    });
  })();
})();
