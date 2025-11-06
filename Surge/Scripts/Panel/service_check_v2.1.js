/**
 * 服务检测 / 服務檢測
 * 作者：ByteValley（参考 LucaLin233 / Rabbit-Spec）
 * 支持：Netflix / Disney+ / YouTube Premium / ChatGPT Web+App / Hulu(US/JP) / Max(HBO)
 * Style=pretty（✅+延迟+HTTP+旗帜）/ Style=icon（简洁行+旗帜）
 * 本版要点：
 * - 去掉“出口信息”首行
 * - 末尾新增：蜂窝数据行 + 设备/节点信息（逐行，无额外标题、无留白）
 * - 所有检测项（含 Netflix/Disney/Hulu/Max、ChatGPT App）统一为 YouTube 的行样式
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
  const STYLE        = /^(icon)$/i.test(get("style", "pretty")) ? "icon" : "pretty";
  const SHOW_LAT     = /^true$/i.test(get("showLatency", "true"));
  const SHOW_HTTP    = /^true$/i.test(get("showHttp", "true"));
  const TITLE_PARAM  = get("title", "");

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
      regionLabel: "地區",
      cellular:       "蜂窩數據",
      devip:          "設備IP",
      ipv6:           "IPv6地址",
      nodeip:         "節點IP",
      nodeisp:        "節點ISP",
      nodeloc:        "節點位置"
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
      cellular:       "蜂窝数据",
      devip:          "设备IP",
      ipv6:           "IPv6地址",
      nodeip:         "节点IP",
      nodeisp:        "节点ISP",
      nodeloc:        "节点位置"
    }
  }[LANG];

  // ---------------- 工具 ----------------
  const UA_STR = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
  const BASE_HEADERS = { "User-Agent": UA_STR, "Accept-Language": "en" };
  const now = () => Date.now(); const ms = (n) => `${n}ms`;
  const okIcon = "✅"; const noIcon = "⛔";

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
  const joinPretty = (parts, cost, status) => {
    const seg = [];
    if (parts.length) seg.push(parts.join(" ｜ "));
    if (SHOW_LAT && cost != null) seg.push(ms(cost));
    if (SHOW_HTTP && status > 0) seg.push(`HTTP ${status}`);
    return seg.join(" ｜ ");
  };
  const lineIcon = (name, tail) => `${name}: ${tail}`;

  // 区码 -> 国旗（带字母）
  function ccFlag(cc) {
    cc = (cc || "").toUpperCase();
    if (!/^[A-Z]{2}$/.test(cc)) return cc || "—";
    const cps = [...cc].map(c => 0x1F1E6 + (c.charCodeAt(0) - 65));
    try { return String.fromCodePoint(...cps) + " " + cc; } catch { return cc; }
  }

  // ---------------- 统一的格式封装 ----------------
  function okLine(label, cc, cost, status) {
    return joinPretty([`${okIcon} ${label}`, cc ? ccFlag(cc) : ""].filter(Boolean), cost, status);
  }
  function blockLine(label, status, extraText = "") {
    const base = [`${noIcon} ${label}`];
    if (extraText) base.push(extraText);
    return joinPretty(base, null, status || 0);
  }

  // ---------------- 服务检测 ----------------
  async function testYouTube() {
    const r = await httpGet("https://www.youtube.com/premium?hl=en", {}, true);
    if (!r.ok) return blockLine(I18N.youTube, r.status, I18N.unreachable);
    let cc = ""; try {
      let m = r.data.match(/"countryCode":"([A-Z]{2})"/);
      if (!m) m = r.data.match(/["']INNERTUBE_CONTEXT_GL["']\s*:\s*["']([A-Z]{2})["']/);
      if (m) cc = m[1]; else if (r.data.includes("www.google.cn")) cc = "CN"; else cc = "US";
    } catch (_) {}
    return okLine(I18N.youTube, cc || "", r.cost, r.status);
  }

  async function testChatGPTWeb() {
    const r = await httpGet("https://chatgpt.com/cdn-cgi/trace", {}, true);
    if (!r.ok) return blockLine(I18N.chatgpt, r.status, I18N.unreachable);
    let loc = ""; try { const m = r.data.match(/loc=([A-Z]{2})/); if (m) loc = m[1]; } catch (_) {}
    return okLine(I18N.chatgpt, loc || "", r.cost, r.status);
  }

  async function testChatGPTAppAPI() {
    // 取状态/延迟
    const statusReq = await httpGet("https://api.openai.com/v1/models", {}, true);
    // 取地区
    const locReq = await httpGet("https://api.openai.com/cdn-cgi/trace", {}, true);
    let loc = "";
    if (locReq.ok) { const m = String(locReq.data||"").match(/loc=([A-Z]{2})/); if (m) loc = m[1]; }
    if (!statusReq.ok) return blockLine(I18N.chatgpt_app, statusReq.status, I18N.unreachable);
    return okLine(I18N.chatgpt_app, loc || "", statusReq.cost, statusReq.status);
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

  async function testNetflix() {
    try {
      const r1 = await nfCheck(NF_NONORIG);
      if (!r1.ok) return blockLine(I18N.netflix, r1.status, I18N.fail);
      if (r1.status === 403) return blockLine(I18N.netflix, r1.status, I18N.regionBlocked);
      if (r1.status === 404) {
        const r2 = await nfCheck(NF_ORIGINAL);
        if (!r2.ok) return blockLine(I18N.netflix, r2.status, I18N.fail);
        if (r2.status === 404) return blockLine(I18N.netflix, r2.status, I18N.regionBlocked);
        const cc = parseNFRegion(r2) || "";
        return okLine(I18N.netflix, cc, r2.cost, r2.status);
      }
      // 200
      const cc = parseNFRegion(r1) || "";
      return okLine(I18N.netflix, cc, r1.cost, r1.status);
    } catch (_) {
      return blockLine(I18N.netflix, 0, I18N.fail);
    }
  }

  async function testDisney() {
    async function home() {
      const r = await httpGet("https://www.disneyplus.com/", { "Accept-Language": "en" }, true);
      if (!r.ok || r.status !== 200 || /Sorry,\s*Disney\+\s*is\s*not\s*available\s*in\s*your\s*region/i.test(r.data || "")) throw {code:"NA", r};
      let cc = ""; try {
        const m = r.data.match(/"countryCode"\s*:\s*"([A-Z]{2})"/i) || r.data.match(/data-country=["']([A-Z]{2})["']/i);
        if (m) cc = m[1];
      } catch (_) {}
      return { cc, r };
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
      if (!r.ok || r.status !== 200) throw {code:"NA", r};
      const d = JSON.parse(r.data || "{}");
      const inLoc = d?.extensions?.sdk?.session?.inSupportedLocation;
      const cc    = d?.extensions?.sdk?.session?.location?.countryCode;
      return { inLoc, cc, r };
    }
    try {
      const { cc: ccH, r: rH } = await home();
      let cc = ccH;
      try {
        const b = await bam();
        if (b.inLoc === false || b.inLoc === 'false') {
          // 即将登陆也按已识别地区输出
          cc = b.cc || cc;
        } else {
          cc = b.cc || cc;
        }
      } catch(_) {}
      if (!cc) return blockLine(I18N.disney, rH?.status || 0, I18N.regionBlocked);
      return okLine(I18N.disney, cc, rH?.cost, rH?.status);
    } catch (e) {
      const st = e?.r?.status || 0;
      return blockLine(I18N.disney, st, I18N.regionBlocked);
    }
  }

  async function testHuluUS() {
    const r = await httpGet("https://www.hulu.com/", {}, true);
    if (!r.ok) return blockLine(I18N.huluUS, r.status, I18N.unreachable);
    const blk = /not\s+available\s+in\s+your\s+region/i.test(r.data || "");
    return blk ? blockLine(I18N.huluUS, r.status, I18N.regionBlocked) : okLine(I18N.huluUS, "US", r.cost, r.status);
  }

  async function testHuluJP() {
    const r = await httpGet("https://www.hulu.jp/", { "Accept-Language": "ja" }, true);
    if (!r.ok) return blockLine(I18N.huluJP, r.status, I18N.unreachable);
    const blk = /ご利用いただけません|サービスをご利用いただけません|not available/i.test(r.data || "");
    return blk ? blockLine(I18N.huluJP, r.status, I18N.regionBlocked) : okLine(I18N.huluJP, "JP", r.cost, r.status);
  }

  async function testHBO() {
    const r = await httpGet("https://www.max.com/", {}, true);
    if (!r.ok) return blockLine(I18N.hbo, r.status, I18N.unreachable);
    const blk = /not\s+available\s+in\s+your\s+region|country\s+not\s+supported/i.test(r.data || "");
    let cc = ""; try { const m = String(r.data || "").match(/"countryCode"\s*:\s*"([A-Z]{2})"/i); if (m) cc = m[1].toUpperCase(); } catch (_) {}
    return blk ? blockLine(I18N.hbo, r.status, I18N.regionBlocked) : okLine(I18N.hbo, cc || "", r.cost, r.status);
  }

  // ---------------- 蜂窝 & 设备/节点信息 ----------------
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

  function getFlagEmoji(countryCode="") {
    const cc = (countryCode || "").toUpperCase();
    if (!/^[A-Z]{2}$/.test(cc)) return countryCode || "";
    const cps = [...cc].map(ch => 127397 + ch.charCodeAt());
    try { return String.fromCodePoint(...cps); } catch { return countryCode || ""; }
  }

  async function getDeviceAndNodeLines() {
    const v4   = $network?.v4 || {};
    theV6   = $network?.v6 || {};
    const dev4 = v4.primaryAddress || "";
    const ipv6Assigned = !!theV6.primaryAddress;

    const r = await httpGet("http://ip-api.com/json", {}, true);
    let nodeIP = "", isp = "", cc = "", country = "", city = "";
    if (r.ok && r.status === 200) {
      try {
        const j = JSON.parse(r.data || "{}");
        nodeIP  = j.query || "";
        isp     = j.isp || "";
        cc      = (j.countryCode || "").toUpperCase();
        country = j.country || "";
        city    = j.city || "";
      } catch(_) {}
    }

    const loc = cc ? `${getFlagEmoji(cc)} | ${cc} | ${country}${city?` - ${city}`:""}` : "";
    const out = [];

    if (dev4) out.push(`${I18N.devip}：${dev4}`);
    out.push(`${I18N.ipv6}：${ipv6Assigned ? "已分配" : "未分配"}`);
    if (nodeIP) out.push(`${I18N.nodeip}：${nodeIP}`);
    if (isp)    out.push(`${I18N.nodeisp}：${isp}`);
    if (loc)    out.push(`${I18N.nodeloc}：${loc}`);

    return out.join("\n");
  }

  // ---------------- 主流程 ----------------
  (async () => {
    const lines = [];

    const [yt, cgptW, cgptA, nf, d, hu, hj, hb] = await Promise.all([
      testYouTube(), testChatGPTWeb(), testChatGPTAppAPI(),
      testNetflix(), testDisney(), testHuluUS(), testHuluJP(), testHBO()
    ]);
    lines.push(yt, cgptW, cgptA, nf, d, hu, hj, hb);

    const cellLine = getCellularLine();
    if (cellLine) lines.push("", cellLine);

    const netLines = await getDeviceAndNodeLines();
    if (netLines) lines.push(netLines);

    $done({ title: I18N.panel, content: lines.join("\n"), icon: ICON, iconColor: ICON_COLOR });
  })();
})();
