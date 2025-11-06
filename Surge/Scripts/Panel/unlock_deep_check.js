/**
 * 第三方服务解锁检测（深测 · Surge 版）
 * 作者：ByteValley（参考 LucaLin233/Rabbit-Spec 思路）
 * 参考脚本：
 * - https://raw.githubusercontent.com/LucaLin233/Luca_Conf/main/Surge/JS/stream-all.js
 *
 * 判定要点：
 * - Netflix：用 Originals + 非自制 两标题判断 Full/Originals/封锁；地区优先页面线索，否则回退出口 IP 国家
 * - Disney+：优先 BAM device GraphQL（registerDevice）判地区；403/异常 → 主页兜底
 * - YouTube Premium：premium 页面抽取 countryCode/GL
 * - ChatGPT Web：Cloudflare trace 取 loc
 * - ChatGPT App：OpenAI API（无 Token 预期 4xx）判断“可达”
 * - Hulu：分别检测 US（hulu.com）与 JP（hulu.jp）
 * - HBO/Max：max.com 可达与文案判定
 * - GEO：ipapi/ip.sb/ifconfig 多源兜底
 */

(() => {
  // ========= 参数 =========
  const args = ($argument || "").split("&").reduce((m, kv) => {
    const i = kv.indexOf("=");
    if (i === -1) return m;
    const k = decodeURIComponent(kv.slice(0, i));
    const v = decodeURIComponent(kv.slice(i + 1));
    m[k] = v;
    return m;
  }, {});
  const clean = (v) => {
    if (v == null) return null;
    const s = String(v).trim();
    if (!s || /^{{{[^}]+}}}$/.test(s) || /^null|undefined$/i.test(s)) return null;
    return s;
  };
  const getArg = (k1, k2) => clean(args[k1] ?? args[k2]);

  const TIMEOUT = parseInt(getArg("timeout", "Timeout") || "5000", 10);
  const ICON = getArg("defaultIcon","DefaultIcon") || "network";
  const ICON_COLOR = getArg("defaultIconColor","DefaultIconColor") || "#00E28F";

  // ========= 常量/工具 =========
  const UA_STR = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
  const UA = {"User-Agent": UA_STR, "Accept-Language":"en"};

  const now = () => Date.now();
  const ms = (n) => `${n}ms`;
  const pick = (...xs) => { for (const x of xs) if (x) return x; return ""; };
  const badge = (ok) => ok ? "✅" : "❌";
  const L = (ok, name, region, cost, extra) =>
    `${badge(ok)} ${name}${region?`｜${region}`:""}${cost!=null?`｜${ms(cost)}`:""}${extra?`｜${extra}`:""}`;

  function httpGet(url, headers={}, followRedirect=true) {
    return new Promise((resolve) => {
      const start = now();
      $httpClient.get({ url, headers: { ...UA, ...headers }, timeout: TIMEOUT, followRedirect }, (err, resp, data) => {
        const cost = now() - start;
        if (err || !resp) return resolve({ ok:false, status:0, cost, headers:{}, data:"", err: err || "NO_RESP" });
        resolve({ ok:true, status: resp.status || 0, cost, headers: resp.headers || {}, data: data || "" });
      });
    });
  }
  function httpPost(url, headers={}, body="") {
    return new Promise((resolve) => {
      const start = now();
      $httpClient.post({ url, headers: { ...UA, ...headers }, body, timeout: TIMEOUT }, (err, resp, data) => {
        const cost = now() - start;
        if (err || !resp) return resolve({ ok:false, status:0, cost, headers:{}, data:"", err: err || "NO_RESP" });
        resolve({ ok:true, status: resp.status || 0, cost, headers: resp.headers || {}, data: data || "" });
      });
    });
  }

  // ========= GEO =========
  async function getGEO() {
    const sources = [
      "https://ipapi.co/json",
      "https://api.ip.sb/geoip",
      "https://ifconfig.co/json"
    ];
    for (const u of sources) {
      const r = await httpGet(u);
      if (r.ok && r.status>=200 && r.status<500) {
        try {
          const j = JSON.parse(r.data);
          const ip  = pick(j.ip, j.query, j.ip_address);
          const cc  = pick(j.country, j.country_name, j.country_code);
          const isp = pick(j.org, j.isp, j.asn);
          return {
            ok: true,
            cost: r.cost,
            text: [ip, cc, isp].filter(Boolean).join(" / "),
            country: cc || ""
          };
        } catch {}
      }
    }
    return { ok:false, cost:null, text:"查询失败", country:"" };
  }

  // ========= YouTube Premium =========
  async function testYouTube() {
    const r = await httpGet("https://www.youtube.com/premium?hl=en", {}, true);
    if (!r.ok) return L(false, "YouTube", "", r.cost, "不可达");
    // 兼容旧法（countryCode）、也兼容常见 GL 提取
    let cc = "";
    try {
      let m = r.data.match(/"countryCode":"([A-Z]{2})"/);
      if (!m) m = r.data.match(/["']INNERTUBE_CONTEXT_GL["']\s*:\s*["']([A-Z]{2})["']/);
      if (m) cc = m[1];
      else if (r.data.includes("www.google.cn")) cc = "CN";
      else cc = "US";
    } catch {}
    return L(true, "YouTube", cc, r.cost, `HTTP ${r.status}`);
  }

  // ========= ChatGPT Web =========
  async function testChatGPTWeb() {
    const r = await httpGet("https://chatgpt.com/cdn-cgi/trace", {}, true);
    if (!r.ok) return L(false, "ChatGPT", "", r.cost, "不可达");
    let loc = "";
    try {
      const m = r.data.match(/loc=([A-Z]{2})/);
      if (m) loc = m[1];
    } catch {}
    return L(true, "ChatGPT", loc, r.cost, `HTTP ${r.status}`);
  }

  // ========= ChatGPT App (OpenAI API) =========
  async function testChatGPTAppAPI() {
    const r = await httpGet("https://api.openai.com/v1/models", {}, true);
    if (!r.ok) return L(false, "ChatGPT App(API)", "", r.cost, "不可达");
    // 2xx/3xx/4xx 代表“线路可达”，401 未授权是预期
    return L(r.status>0, "ChatGPT App(API)", "", r.cost, `HTTP ${r.status}`);
  }

  // ========= Netflix =========
  // 按 LucaLin/Rabbit-Spec 思路：先测一个片（81280792），404 再测自制片 80018499；也补一对 Originals + 非自制组合
  const NF_ORIGINAL = "80018499";   // 自制（示例）
  const NF_NONORIG  = "81280792";   // 非自制（示例）
  async function checkNetflixById(filmId) {
    const r = await httpGet(`https://www.netflix.com/title/${filmId}`, UA, true);
    if (!r.ok) return { state: "ERR", cost: r.cost, status: 0, data: r.data || "" };
    return { state: "OK", cost: r.cost, status: r.status, headers: r.headers, data: r.data || "" };
  }
  async function testNetflix(fallbackCountry) {
    // 先按 LucaLin 逻辑跑一遍（81280792 → 404 则 80018499）
    let nfText = "";
    try {
      const r1 = await checkNetflixById(NF_NONORIG);
      if (r1.state === "ERR") throw new Error("E1");
      if (r1.status === 403) {
        nfText = "该节点不支持解锁";
      } else if (r1.status === 404) {
        const r2 = await checkNetflixById(NF_ORIGINAL);
        if (r2.state === "ERR") throw new Error("E2");
        if (r2.status === 404) {
          nfText = "该节点不支持解锁";
        } else {
          const region = parseNetflixRegion(r2) || (fallbackCountry || "").toUpperCase();
          nfText = `仅解锁自制剧 ➟ ${region || "—"}`;
        }
      } else if (r1.status === 200) {
        const region = parseNetflixRegion(r1) || (fallbackCountry || "").toUpperCase();
        nfText = `已完整解锁 ➟ ${region || "—"}`;
      } else {
        nfText = `HTTP ${r1.status}`;
      }
    } catch (_) {
      nfText = "检测失败，请刷新面板";
    }
    return `Netflix: ${nfText}`;
  }
  function parseNetflixRegion(resp) {
    try {
      const xurl = resp.headers && (resp.headers["x-originating-url"] || resp.headers["X-Originating-URL"]);
      if (xurl) {
        // https://www.netflix.com/<cc>/title/ID
        const seg = String(xurl).split("/");
        if (seg.length >= 4) {
          const cc = seg[3].split("-")[0];
          if (cc && cc.length === 2) return cc.toUpperCase();
        }
      }
      const m = String(resp.data || "").match(/"countryCode"\s*:\s*"([A-Z]{2})"/i);
      if (m) return m[1].toUpperCase();
    } catch {}
    return "";
  }

  // ========= Disney+（BAM API 优先）=========
  async function testDisneyPlus() {
    // 主页
    async function testHomePage() {
      const r = await httpGet("https://www.disneyplus.com/", {"User-Agent": UA_STR}, true);
      if (!r.ok || r.status !== 200 || /Sorry,\s*Disney\+\s*is\s*not\s*available\s*in\s*your\s*region/i.test(r.data || "")) {
        throw "Not Available";
      }
      let region = "", cnbl = "";
      try {
        const m = r.data.match(/Region:\s*([A-Za-z]{2})[\s\S]*?CNBL:\s*([12])/);
        if (m) { region = m[1]; cnbl = m[2]; }
      } catch {}
      return { region, cnbl, cost: r.cost };
    }
    // BAM GraphQL（registerDevice）
    async function getLocationInfo() {
      const headers = {
        "Accept-Language":"en",
        "Authorization":"ZGlzbmV5JmJyb3dzZXImMS4wLjA.Cu56AgSfBTDag5NiRA81oLHkDZfu5L3CKadnefEAY84",
        "Content-Type":"application/json",
        "User-Agent": UA_STR
      };
      const body = JSON.stringify({
        query: 'mutation registerDevice($input: RegisterDeviceInput!) { registerDevice(registerDevice: $input) { grant { grantType assertion } } }',
        variables: {
          input: {
            applicationRuntime: 'chrome',
            attributes: {
              browserName: 'chrome',
              browserVersion: '120.0.0.0',
              manufacturer: 'apple',
              model: null,
              operatingSystem: 'macintosh',
              operatingSystemVersion: '10.15.7',
              osDeviceIds: []
            },
            deviceFamily: 'browser',
            deviceLanguage: 'en',
            deviceProfile: 'macosx'
          }
        }
      });
      const r = await httpPost("https://disney.api.edge.bamgrid.com/graph/v1/device/graphql", headers, body);
      if (!r.ok) throw "Error";
      if (r.status !== 200) throw "Not Available";
      const data = JSON.parse(r.data || "{}");
      if (data?.errors) throw "Not Available";
      const inSupportedLocation = data?.extensions?.sdk?.session?.inSupportedLocation;
      const countryCode = data?.extensions?.sdk?.session?.location?.countryCode;
      return { inSupportedLocation, countryCode, cost: r.cost };
    }

    try {
      const { region } = await Promise.race([testHomePage(), timeout(7000)]);
      const { inSupportedLocation, countryCode } = await Promise.race([getLocationInfo(), timeout(7000)]);
      const finalRegion = (countryCode || region || "").toUpperCase();
      if (inSupportedLocation === false || inSupportedLocation === 'false') {
        return `Disney+: 即将登陆~${finalRegion || "—"}`;
      } else {
        return `Disney+: 已解锁 ➟ ${finalRegion || "—"}`;
      }
    } catch (e) {
      if (e === "Not Available") return "Disney+: 未支持 🚫";
      if (e === "Timeout") return "Disney+: 检测超时 🚦";
      return "Disney+: 检测失败，请刷新面板";
    }
  }
  function timeout(ms) {
    return new Promise((_, rej) => setTimeout(() => rej("Timeout"), ms));
  }

  // ========= Hulu（US/JP）=========
  async function testHuluUS() {
    const r = await httpGet("https://www.hulu.com/", {}, true);
    if (!r.ok) return "Hulu(US): 不可达";
    const blocked = /not\s+available\s+in\s+your\s+region/i.test(r.data || "");
    return blocked ? "Hulu(US): 区域受限 🚫" : `Hulu(US): 已解锁 ➟ US`;
  }
  async function testHuluJP() {
    const r = await httpGet("https://www.hulu.jp/", {"Accept-Language":"ja"}, true);
    if (!r.ok) return "Hulu(JP): 不可达";
    const blocked = /ご利用いただけません|サービスをご利用いただけません|not available/i.test(r.data || "");
    return blocked ? "Hulu(JP): 区域受限 🚫" : `Hulu(JP): 已解锁 ➟ JP`;
  }

  // ========= HBO / Max =========
  async function testHBO() {
    const r = await httpGet("https://www.max.com/", {}, true);
    if (!r.ok) return "Max(HBO): 不可达";
    const blocked = /not\s+available\s+in\s+your\s+region|country\s+not\s+supported/i.test(r.data || "");
    let cc = "";
    try {
      const m = String(r.data || "").match(/"countryCode"\s*:\s*"([A-Z]{2})"/i);
      if (m) cc = m[1].toUpperCase();
    } catch {}
    if (blocked) return "Max(HBO): 区域受限 🚫";
    return `Max(HBO): 已解锁${cc?` ➟ ${cc}`:""}`;
  }

  // ========= 主流程 =========
  (async () => {
    const lines = [];
    const g = await getGEO();
    lines.push(`🌐 出口信息｜${g.ok ? g.text : "查询失败"}`);

    const [
      yt,
      cgptWeb,
      cgptApp,
      nf,
      dplus,
      huluUS,
      huluJP,
      hbo
    ] = await Promise.all([
      testYouTube(),
      testChatGPTWeb(),
      testChatGPTAppAPI(),
      testNetflix(g.country),
      testDisneyPlus(),
      testHuluUS(),
      testHuluJP(),
      testHBO()
    ]);

    lines.push(yt, cgptWeb, cgptApp, nf, dplus, huluUS, huluJP, hbo);

    $done({
      title: "第三方服务解锁检测",
      content: lines.join("\n"),
      icon: ICON,
      iconColor: ICON_COLOR
    });
  })();
})();
