/**
 * 服务检测 / 服務檢測（含代理策略块）
 * 作者：ByteValley（参考 LucaLin233 / Rabbit-Spec）
 * 支持：Netflix / Disney+ / YouTube Premium / ChatGPT Web+App / Hulu(US/JP) / Max(HBO)
 * 新增：在“设备IP”下方追加 代理策略/入口/落地 信息（随 Lang=zh-Hans/zh-Hant 本地化）
 */

(() => {
  // ---------------- 参数 ----------------
  const args = ($argument || "").split("&").reduce((m, kv) => {
    const i = kv.indexOf("="); if (i === -1) return m;
    const k = decodeURIComponent(kv.slice(0, i));
    const v = decodeURIComponent(kv.slice(i + 1));
    m[k] = v; return m;
  }, {});
  const get = (k, def = null) => {
    const v = args[k];
    if (v == null || /^{{{[^}]+}}}$/.test(v) || /^(null|undefined)$/i.test(v)) return def;
    return String(v).trim();
  };

  const TIMEOUT      = parseInt(get("timeout", "5000"), 10);
  const ICON         = get("defaultIcon", "globe");
  const ICON_COLOR   = get("defaultIconColor", "#1E90FF");
  const LANG         = /^zh-hans$/i.test(get("lang", "zh-Hant")) ? "zh-Hans" : "zh-Hant";
  const STYLE        = /^(icon|simple|text|arrow|concise)$/i.test(get("style", "detail")) ? get("style","detail").toLowerCase() : "detail";
  const SHOW_LAT     = /^true$/i.test(get("showLatency", "true"));
  const SHOW_HTTP    = /^true$/i.test(get("showHttp", "true"));
  const TITLE_PARAM  = get("title", "");
  const IPAPI_LANG   = LANG === "zh-Hant" ? "zh-TW" : "zh-CN";

  // ---------------- i18n ----------------
  const I18N = {
    "zh-Hant": {
      panel: TITLE_PARAM || "服務檢測",
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
      regionLabel: "區域",
      nf_full:    (cc)=>`已完整解鎖， 區域: ${cc}`,
      nf_origs:   (cc)=>`僅解鎖自製劇， 區域: ${cc}`,
      nf_block:       "該節點不支持解鎖",
      d_ok:       (cc)=>`已解鎖， 區域: ${cc}`,
      d_soon:     (cc)=>`即將登陸， 區域: ${cc}`,
      hulu_ok:    (cc)=>`已解鎖， 區域: ${cc}`,
      hulu_blk:       "區域受限 🚫",
      max_ok:     (cc)=>`已解鎖， 區域: ${cc}`,
      max_blk:        "區域受限 🚫",
      cellular:       "蜂窩數據",
      devip:          "設備IP",
      ipv6:           "IPv6地址",
      nodeip:         "落地 IP",
      nodeisp:        "落地 ISP",
      nodeloc:        "落地位置",
      policy:         "代理策略",
      entrance:       "入口",
      entrance_loc:   "入口位置",
      entrance_isp:   "入口運營商"
    },
    "zh-Hans": {
      panel: TITLE_PARAM || "服务检测",
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
      nf_full:    (cc)=>`已完整解锁， 区域: ${cc}`,
      nf_origs:   (cc)=>`仅解锁自制剧， 区域: ${cc}`,
      nf_block:       "该节点不支持解锁",
      d_ok:       (cc)=>`已解锁， 区域: ${cc}`,
      d_soon:     (cc)=>`即将登陆， 区域: ${cc}`,
      hulu_ok:    (cc)=>`已解锁， 区域: ${cc}`,
      hulu_blk:       "区域受限 🚫",
      max_ok:     (cc)=>`已解锁， 区域: ${cc}`,
      max_blk:        "区域受限 🚫",
      cellular:       "蜂窝数据",
      devip:          "设备IP",
      ipv6:           "IPv6地址",
      nodeip:         "落地 IP",
      nodeisp:        "落地 ISP",
      nodeloc:        "落地位置",
      policy:         "代理策略",
      entrance:       "入口",
      entrance_loc:   "入口位置",
      entrance_isp:   "入口运营商"
    }
  }[LANG];

  // ---------------- 工具 ----------------
  const UA_STR = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
  const BASE_HEADERS = { "User-Agent": UA_STR, "Accept-Language": "en" };
  const now = () => Date.now(); const ms = (n) => `${n}ms`;
  const okIcon = "✅"; const noIcon = "❌";

  function httpGet(url, headers = {}, followRedirect = true) {
    return new Promise((resolve) => {
      const start = now();
      $httpClient.get({ url, headers: { ...BASE_HEADERS, ...headers }, timeout: TIMEOUT, followRedirect }, (err, resp, data) => {
        const cost = now() - start;
        if (err || !resp) return resolve({ ok: false, status: 0, cost, headers: {}, data: "" });
        resolve({ ok: true, status: resp.status || 0, cost, headers: resp.headers || {}, data: data || "" });
      });
    });
  }
  function httpPost(url, headers = {}, body = "") {
    return new Promise((resolve) => {
      const start = now();
      $httpClient.post({ url, headers: { ...BASE_HEADERS, ...headers }, body, timeout: TIMEOUT }, (err, resp, data) => {
        const cost = now() - start;
        if (err || !resp) return resolve({ ok: false, status: 0, cost, headers: {}, data: "" });
        resolve({ ok: true, status: resp.status || 0, cost, headers: resp.headers || {}, data: data || "" });
      });
    });
  }
  function httpAPI(path='/v1/requests/recent', method='GET', body=null) {
    return new Promise((resolve) => {
      if (typeof $httpAPI !== 'function') return resolve({});
      $httpAPI(method, path, body, (r)=>resolve(r||{}));
    });
  }
  const joinPretty = (parts, cost, status) => {
    const seg = [];
    if (parts.length) seg.push(parts.join(" ｜ "));
    if (SHOW_LAT && cost != null) seg.push(ms(cost));
    if (SHOW_HTTP && status > 0) seg.push(`HTTP ${status}`);
    return seg.join(" ｜ ");
  };
  const lineIcon = (name, tail) => `${name}: ${tail}`;

  // Flag + CC
  function ccFlag(cc) {
    cc = (cc || "").toUpperCase();
    if (!/^[A-Z]{2}$/.test(cc)) return cc || "—";
    const cps = [...cc].map(c => 0x1F1E6 + (c.charCodeAt(0) - 65));
    try { return String.fromCodePoint(...cps) + " " + cc; } catch { return cc; }
  }
  function getFlagEmoji(countryCode="") {
    const cc = (countryCode || "").toUpperCase();
    if (!/^[A-Z]{2}$/.test(cc)) return countryCode || "";
    const cps = [...cc].map(ch => 127397 + ch.charCodeAt());
    try { return String.fromCodePoint(...cps); } catch { return countryCode || ""; }
  }

  // ---------------- 服务检测 ----------------
  async function testYouTube() {
    const r = await httpGet("https://www.youtube.com/premium?hl=en", {}, true);
    if (!r.ok) {
      if (/^(simple|text|arrow)$/i.test(STYLE)) return lineIcon(I18N.youTube, I18N.unreachable);
      return joinPretty([`${noIcon} ${I18N.youTube}`], r.cost, r.status);
    }
    let cc = ""; try {
      let m = r.data.match(/"countryCode":"([A-Z]{2})"/);
      if (!m) m = r.data.match(/["']INNERTUBE_CONTEXT_GL["']\s*:\s*["']([A-Z]{2})["']/);
      if (m) cc = m[1]; else if (r.data.includes("www.google.cn")) cc = "CN"; else cc = "US";
    } catch (_) {}
    const region = ccFlag(cc || "");
    if (/^(simple|text|arrow)$/i.test(STYLE)) return lineIcon(I18N.youTube, `${I18N.unlocked}， ${I18N.regionLabel}: ${region || "—"}`);
    return joinPretty([`${okIcon} ${I18N.youTube}`, region], r.cost, r.status);
  }

  async function testChatGPTWeb() {
    const r = await httpGet("https://chatgpt.com/cdn-cgi/trace", {}, true);
    if (!r.ok) {
      if (/^(simple|text|arrow)$/i.test(STYLE)) return lineIcon(I18N.chatgpt, I18N.unreachable);
      return joinPretty([`${noIcon} ${I18N.chatgpt}`], r.cost, r.status);
    }
    let loc = ""; try { const m = r.data.match(/loc=([A-Z]{2})/); if (m) loc = m[1]; } catch (_) {}
    const region = ccFlag(loc || "");
    if (/^(simple|text|arrow)$/i.test(STYLE)) return lineIcon(I18N.chatgpt, `${I18N.unlocked}， ${I18N.regionLabel}: ${region || "—"}`);
    return joinPretty([`${okIcon} ${I18N.chatgpt}`, region], r.cost, r.status);
  }

  async function testChatGPTAppAPI() {
    const r = await httpGet("https://api.openai.com/v1/models", {}, true);
    if (!r.ok) {
      if (/^(simple|text|arrow)$/i.test(STYLE)) return lineIcon(I18N.chatgpt_app, I18N.unreachable);
      return joinPretty([`${noIcon} ${I18N.chatgpt_app}`], r.cost, r.status);
    }
    // 补充地区：取 cf-trace 或 ip-api
    let cc = ""; 
    try {
      const t = await httpGet("https://chatgpt.com/cdn-cgi/trace", {}, true);
      const m = (t.data||"").match(/loc=([A-Z]{2})/); if (m) cc = m[1];
    } catch(_){}
    const region = cc ? ccFlag(cc) : "";
    if (/^(simple|text|arrow)$/i.test(STYLE)) return lineIcon(I18N.chatgpt_app, `${I18N.unlocked}， ${I18N.regionLabel}: ${region||"—"}`);
    return joinPretty([`${okIcon} ${I18N.chatgpt_app}`, region], r.cost, r.status);
  }

  const NF_ORIGINAL = "80018499";
  const NF_NONORIG  = "81280792";

  function parseNFRegion(resp) {
    try {
      const x = resp.headers && (resp.headers["x-originating-url"] || resp.headers["X-Originating-URL"]);
      if (x) {
        const seg = String(x).split("/");
        if (seg.length >= 4) {
          const cc = seg[3].split('-')[0];
          if (cc && cc.length === 2) return cc.toUpperCase();
        }
      }
      const m = String(resp.data || "").match(/"countryCode"\s*:\s*"([A-Z]{2})"/i);
      if (m) return m[1].toUpperCase();
    } catch (_) {}
    return "";
  }

  async function nfCheck(id) { return await httpGet(`https://www.netflix.com/title/${id}`, {}, true); }

  async function testNetflix(fallback) {
    let txt = "", cc = "";
    try {
      const r1 = await nfCheck(NF_NONORIG);
      if (!r1.ok) txt = I18N.fail;
      else if (r1.status === 403) txt = I18N.nf_block;
      else if (r1.status === 404) {
        const r2 = await nfCheck(NF_ORIGINAL);
        if (!r2.ok) txt = I18N.fail;
        else if (r2.status === 404) txt = I18N.nf_block;
        else { cc = parseNFRegion(r2) || (fallback || ""); txt = I18N.nf_origs(ccFlag(cc || "—")); }
      } else if (r1.status === 200) {
        cc = parseNFRegion(r1) || (fallback || ""); txt = I18N.nf_full(ccFlag(cc || "—"));
      } else txt = `HTTP ${r1.status}`;
    } catch (_) { txt = I18N.fail; }
    if (/^(simple|text|arrow)$/i.test(STYLE)) return lineIcon(I18N.netflix, txt);
    return `${I18N.netflix}: ${txt}`;
  }

  async function testDisney() {
    async function home() {
      const r = await httpGet(`https://www.disneyplus.com/?hl=en`, { "Accept-Language": "en" }, true);
      if (!r.ok || r.status !== 200 || /Sorry,\s*Disney\+\s*is\s*not\s*available\s*in\s*your\s*region/i.test(r.data || "")) throw "NA";
      let cc = ""; try {
        const m = r.data.match(/"countryCode"\s*:\s*"([A-Z]{2})"/i) || r.data.match(/data-country=["']([A-Z]{2})["']/i);
        if (m) cc = m[1];
      } catch (_) {}
      return { cc, cost: r.cost, status: r.status };
    }
    async function bam() {
      const headers = {
        "Accept-Language": "en",
        "Authorization": "ZGlzbmV5JmJyb3dzZXImMS4wLjA.Cu56AgSfBTDag5NiRA81oLHkDZfu5L3CKadnefEAY84",
        "Content-Type": "application/json",
        "User-Agent": UA_STR
      };
      const body = JSON.stringify({
        query: 'mutation registerDevice($input: RegisterDeviceInput!) { registerDevice(registerDevice: $input) { grant { grantType assertion } } }',
        variables: { input: { applicationRuntime: 'chrome', attributes: { browserName: 'chrome', browserVersion: '120.0.0.0', manufacturer: 'apple', model: null, operatingSystem: 'macintosh', operatingSystemVersion: '10.15.7', osDeviceIds: [] }, deviceFamily: 'browser', deviceLanguage: 'en', deviceProfile: 'macosx' } }
      });
      const r = await httpPost("https://disney.api.edge.bamgrid.com/graph/v1/device/graphql", headers, body);
      if (!r.ok) throw "ERR";
      if (r.status !== 200) throw "NA";
      const d = JSON.parse(r.data || "{}");
      if (d?.errors) throw "NA";
      const inLoc = d?.extensions?.sdk?.session?.inSupportedLocation;
      const cc    = d?.extensions?.sdk?.session?.location?.countryCode;
      return { inLoc, cc, cost: r.cost, status: r.status };
    }
    function waitReject(ms, code) { return new Promise((_, rej) => setTimeout(() => rej(code), ms)); }
    try {
      const h = await Promise.race([home(), waitReject(7000, "TO")]);
      const b = await Promise.race([bam(),  waitReject(7000, "TO")]);
      const cc = (b.cc || h.cc || "");
      const region = ccFlag(cc || "—");
      const text = (b.inLoc === false || b.inLoc === 'false') ? I18N.d_soon(region) : I18N.d_ok(region);
      if (/^(simple|text|arrow)$/i.test(STYLE)) return lineIcon(I18N.disney, text);
      return `${I18N.disney}: ${text}`;
    } catch (e) {
      const text = e === "NA" ? (I18N.regionBlocked + " 🚫") : e === "TO" ? (I18N.timeout + " 🚦") : I18N.fail;
      if (/^(simple|text|arrow)$/i.test(STYLE)) return lineIcon(I18N.disney, text);
      return `${I18N.disney}: ${text}`;
    }
  }

  async function testHuluUS() {
    const r = await httpGet("https://www.hulu.com/", {}, true);
    if (!r.ok) {
      if (/^(simple|text|arrow)$/i.test(STYLE)) return lineIcon(I18N.huluUS, I18N.unreachable);
      return `${I18N.huluUS}: ${I18N.unreachable}`;
    }
    const blk = /not\s+available\s+in\s+your\s+region/i.test(r.data || "");
    const txt = blk ? I18N.hulu_blk : I18N.hulu_ok(ccFlag("US"));
    if (/^(simple|text|arrow)$/i.test(STYLE)) return lineIcon(I18N.huluUS, txt);
    return `${I18N.huluUS}: ${txt}`;
  }

  async function testHuluJP() {
    const r = await httpGet("https://www.hulu.jp/", { "Accept-Language": "ja" }, true);
    if (!r.ok) {
      if (/^(simple|text|arrow)$/i.test(STYLE)) return lineIcon(I18N.huluJP, I18N.unreachable);
      return `${I18N.huluJP}: ${I18N.unreachable}`;
    }
    const blk = /ご利用いただけません|サービスをご利用いただけません|not available/i.test(r.data || "");
    const txt = blk ? I18N.hulu_blk : I18N.hulu_ok(ccFlag("JP"));
    if (/^(simple|text|arrow)$/i.test(STYLE)) return lineIcon(I18N.huluJP, txt);
    return `${I18N.huluJP}: ${txt}`;
  }

  async function testHBO() {
    const r = await httpGet("https://www.max.com/", {}, true);
    if (!r.ok) {
      if (/^(simple|text|arrow)$/i.test(STYLE)) return lineIcon(I18N.hbo, I18N.unreachable);
      return `${I18N.hbo}: ${I18N.unreachable}`;
    }
    const blk = /not\s+available\s+in\s+your\s+region|country\s+not\s+supported/i.test(r.data || "");
    let cc = ""; try { const m = String(r.data || "").match(/"countryCode"\s*:\s*"([A-Z]{2})"/i); if (m) cc = m[1].toUpperCase(); } catch (_) {}
    const txt = blk ? I18N.max_blk : I18N.max_ok(cc ? ccFlag(cc) : "");
    if (/^(simple|text|arrow)$/i.test(STYLE)) return lineIcon(I18N.hbo, txt);
    return `${I18N.hbo}: ${txt}`;
  }

  // ---------------- 代理策略块（追加到“设备IP”下方） ----------------
  async function getPolicyFromRecent() {
    // 只在 Surge / Stash 可用，其他环境返回空
    let policy = "";
    let remote = ""; // 入口 IP（最近请求的远端）
    try {
      const rec = await httpAPI('/v1/requests/recent','GET');
      const list = Array.isArray(rec?.requests) ? rec.requests : [];
      // 挑最近的 geo 请求作为锚点
      const hit = list.find(i => /ip-api\.com|ipinfo\.io|ip-score\.com|api-ipv4\.ip\.sb|chatgpt\.com|youtube\.com/i.test(i.URL)) || list[0];
      if (hit) {
        policy = hit.policyName || "";
        if (/\(Proxy\)/.test(hit.remoteAddress||"")) {
          remote = String(hit.remoteAddress).replace(/\s*\(Proxy\)\s*/,'');
        }
      }
    } catch(_) {}
    return { policy, remote };
  }
  async function geoByIP(ip){
    if(!ip) return {};
    const r = await httpGet(`http://ip-api.com/json/${encodeURIComponent(ip)}?lang=${IPAPI_LANG}`, {}, true);
    if (!r.ok || r.status !== 200) return {};
    try{
      const j = JSON.parse(r.data||"{}");
      return {
        cc: (j.countryCode||"").toUpperCase(),
        country: j.country || "",
        region: j.regionName || "",
        city: j.city || "",
        isp: j.isp || ""
      };
    }catch{ return {}; }
  }

  // ---------------- 蜂窝 & 设备/节点信息（含代理策略） ----------------
  function getCellularLine() {
    const radioGeneration = {
      'GPRS':'2.5G','CDMA1x':'2.5G','EDGE':'2.75G','WCDMA':'3G','HSDPA':'3.5G',
      'CDMAEVDORev0':'3.5G','CDMAEVDORevA':'3.5G','CDMAEVDORevB':'3.75G','HSUPA':'3.75G',
      'eHRPD':'3.9G','LTE':'4G','NRNSA':'5G - NRNSA','NR':'5G'
    };
    try {
      const cell = $network['cellular-data'];
      if (!cell) return "";
      const radio = cell.radio || "";
      const gen = radioGeneration[radio] || radio || "";
      if (!radio) return "";
      return `${I18N.cellular} | ${gen}`;
    } catch(_) { return ""; }
  }

  async function getDeviceAndNodeLines() {
    const v4   = $network?.v4 || {};
    const v6   = $network?.v6 || {};
    const dev4 = v4.primaryAddress || "";
    const ipv6Assigned = !!v6.primaryAddress;

    // 落地：查自身（随语言本地化）
    const r = await httpGet(`http://ip-api.com/json?lang=${IPAPI_LANG}`, {}, true);
    let landIP = "", landISP = "", landCC = "", landCountry = "", landCity = "";
    if (r.ok && r.status === 200) {
      try {
        const j = JSON.parse(r.data || "{}");
        landIP  = j.query || "";
        landISP = j.isp || "";
        landCC  = (j.countryCode || "").toUpperCase();
        landCountry = j.country || "";
        landCity    = j.city || "";
      } catch(_) {}
    }

    // 最近请求 -> 策略名 + 入口 IP -> 再查入口地理
    const { policy, remote } = await getPolicyFromRecent();
    const entranceGeo = await geoByIP(remote);

    const out = [];
    if (dev4) out.push(`${I18N.devip}：${dev4}`);
    // 追加 代理策略 块
    if (policy || remote || landIP) {
      out.push(`${I18N.policy}：${policy || "-"}`);
      if (remote) {
        const loc = entranceGeo.cc ? `${getFlagEmoji(entranceGeo.cc)} | ${entranceGeo.cc} | ${entranceGeo.country}${entranceGeo.city?` - ${entranceGeo.city}`:""}` : "";
        out.push(`${I18N.entrance}：${remote}`);
        if (loc) out.push(`${I18N.entrance_loc}：${loc}`);
        if (entranceGeo.isp) out.push(`${I18N.entrance_isp}：${entranceGeo.isp}`);
      } else {
        out.push(`${I18N.entrance}：-`);
      }
    }

    out.push(`${I18N.ipv6}：${ipv6Assigned ? (LANG==='zh-Hant'?'已分配':'已分配') : (LANG==='zh-Hant'?'未分配':'未分配')}`);
    if (landIP) out.push(`${I18N.nodeip}：${landIP}`);
    if (landISP) out.push(`${I18N.nodeisp}：${landISP}`);
    const loc = landCC ? `${getFlagEmoji(landCC)} | ${landCC} | ${landCountry}${landCity?` - ${landCity}`:""}` : "";
    if (loc) out.push(`${I18N.nodeloc}：${loc}`);

    return out.join("\n");
  }

  // ---------------- 主流程 ----------------
  (async () => {
    const lines = [];

    const [yt, cgptW, cgptA, nf, d, hu, hj, hb] = await Promise.all([
      testYouTube(), testChatGPTWeb(), testChatGPTAppAPI(),
      testNetflix(""), testDisney(), testHuluUS(), testHuluJP(), testHBO()
    ]);
    lines.push(yt, cgptW, cgptA, nf, d, hu, hj, hb);

    const cellLine = getCellularLine();
    if (cellLine) lines.push("", cellLine);

    const netLines = await getDeviceAndNodeLines();
    if (netLines) lines.push(netLines);

    $done({ title: I18N.panel, content: lines.join("\n"), icon: ICON, iconColor: ICON_COLOR });
  })();
})();
