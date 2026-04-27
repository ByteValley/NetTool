// Variables used by Scriptable.
// These must be at the very top of the file. Do not edit.
// icon-color: teal; icon-glyph: globe-asia;

if (typeof require === "undefined") require = importModule;
let DmYYModule = null;
try {
  DmYYModule = require("./DmYY");
} catch (e) {
  DmYYModule = require("DmYY");
}
const { DmYY, Runing } = DmYYModule;

const DEFAULT_SETTINGS = {
  title: "IP 信息",
  refreshAfterDate: "30",
  timeoutMs: "3000",
  cacheEnabled: "true",
  cacheMinutes: "10",
  enableIPv6: "true",
  enableConnectivity: "true",
  maskIp: "false",
  maskLocation: "false",
  showSourceName: "true",
  lightColor: "#1F2933",
  darkColor: "#F2F5F8",
  lightBgColor: "#F5F8FA",
  darkBgColor: "#213446",
};

const BASIC_SERVICE_TARGETS = [
  { id: "bytedance", name: "字节跳动", region: "国内", url: "https://www.bytedance.com/favicon.ico" },
  { id: "bilibili", name: "Bilibili", region: "国内", url: "https://www.bilibili.com/favicon.ico" },
  { id: "wechat", name: "微信", region: "国内", url: "https://weixin.qq.com/favicon.ico" },
  { id: "taobao", name: "淘宝", region: "国内", url: "https://www.taobao.com/favicon.ico" },
  { id: "github", name: "GitHub", region: "国际", url: "https://github.githubassets.com/favicons/favicon.svg" },
  { id: "jsdelivr", name: "jsDelivr", region: "国际", url: "https://cdn.jsdelivr.net/npm/@sukka/uuid@latest/package.json" },
  { id: "cloudflare", name: "Cloudflare", region: "国际", url: "https://www.cloudflare.com/cdn-cgi/trace" },
];

const RISK_RULES = {
  dataCenterKeywords: [
    "datacenter",
    "data center",
    "hosting",
    "cloud",
    "cdn",
    "edge",
    "vps",
    "colo",
    "colocation",
    "proxy",
    "vpn",
    "tunnel",
    "relay",
    "compute",
    "server",
    "amazon",
    "aws",
    "google",
    "gcp",
    "microsoft",
    "azure",
    "digitalocean",
    "linode",
    "ovh",
    "hetzner",
    "vultr",
    "oracle",
    "alibaba cloud",
    "tencent cloud",
    "cloudflare",
    "fastly",
    "akamai",
    "leaseweb",
    "choopa",
    "dmit",
    "racknerd",
  ],
  homeBroadbandKeywords: [
    "china telecom",
    "chinanet",
    "ctcc",
    "as4134",
    "as4809",
    "china mobile",
    "cmcc",
    "cmnet",
    "cmi",
    "as9808",
    "china unicom",
    "unicom",
    "cucc",
    "as4837",
    "cernet",
    "china education",
    "comcast",
    "xfinity",
    "verizon",
    "at&t",
    "charter",
    "spectrum",
    "cox",
    "rogers",
    "bell canada",
    "telus",
    "bt",
    "virgin media",
    "deutsche telekom",
    "telefonica",
    "orange",
    "vodafone",
    "isp",
    "broadband",
    "fiber",
    "ftth",
    "residential",
    "cable",
    "docsis",
    "pppoe",
    "dsl",
    "adsl",
    "vdsl",
    "pon",
    "gpon",
    "epon",
    "cpe",
    "dynamic",
    "dyn",
    "pool",
    "subscriber",
    "cust",
    "customer",
    "telecom",
    "communication",
    "communications",
    "as3462",
    "data communication business group",
    "chunghwa telecom",
    "chunghwa",
    "cht",
    "hinet",
    "kbro",
    "formosabroadband",
    "formosa broadband",
    "seednet",
    "taiwan broadband",
    "tbc",
    "cable tv",
    "cablemodem",
  ],
  mobileKeywords: ["mobile", "lte", "4g", "5g", "cell", "cellular", "wireless", "epc", "ims", "gprs", "wimax"],
  highRiskCountries: ["俄罗斯", "russia", "印度", "india", "乌克兰", "ukraine"],
};

const ASN_HOME_STRONG = new Set([3462, 38841]);

function clampInt(value, fallback, min, max) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.floor(n)));
}

function toBool(value, fallback) {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value !== 0;
  const raw = String(value || "").trim().toLowerCase();
  if (!raw) return fallback;
  if (["true", "1", "yes", "y", "on"].includes(raw)) return true;
  if (["false", "0", "no", "n", "off"].includes(raw)) return false;
  return fallback;
}

function errToString(error) {
  if (!error) return "unknown";
  if (typeof error === "string") return error;
  if (error.message) return String(error.message);
  return String(error);
}

function compact(parts) {
  const out = [];
  for (const part of parts) {
    const s = String(part || "").trim();
    if (!s || s === "null" || s === "undefined") continue;
    if (!out.includes(s)) out.push(s);
  }
  return out.join(" ");
}

function parseAsn(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  const match = raw.match(/AS\s?(\d+)/i);
  return match ? `AS${match[1]}` : raw;
}

function parseCloudflareTrace(text) {
  const data = {};
  String(text || "")
    .split(/\n+/)
    .forEach((line) => {
      const idx = line.indexOf("=");
      if (idx <= 0) return;
      data[line.slice(0, idx)] = line.slice(idx + 1);
    });
  return data;
}

function getHeader(headers, name) {
  const lower = String(name).toLowerCase();
  try {
    for (const key of Object.keys(headers || {})) {
      if (String(key).toLowerCase() === lower) return String(headers[key] || "");
    }
  } catch (e) {}
  return "";
}

function countryFromText(text) {
  const content = String(text || "");
  const m =
    content.match(/loc=([A-Z]{2})/) ||
    content.match(/"countryCode"\s*:\s*"([A-Z]{2})"/i) ||
    content.match(/data-country=["']([A-Z]{2})["']/i);
  return m ? m[1].toUpperCase() : "";
}

function parseASNNumber(s) {
  const str = String(s || "");
  const m = str.match(/\bAS(\d{1,10})\b/i);
  if (m) return Number(m[1]) || 0;
  const m2 = str.match(/\b(\d{1,10})\b/);
  return m2 ? Number(m2[1]) || 0 : 0;
}

function normStr(value) {
  return String(value || "")
    .replace(/\s+/g, " ")
    .replace(/[（(].*?[）)]/g, " ")
    .trim()
    .toLowerCase();
}

function hasAny(hay, list) {
  const raw = normStr(hay);
  if (!raw) return false;
  return list.some((kw) => {
    const needle = normStr(kw);
    return Boolean(needle && raw.includes(needle));
  });
}

function calculateLineRisk(source) {
  const hay = compact([source?.isp, source?.org, source?.asn]);
  const country = normStr(source?.location || source?.countryCode);
  const asn = parseASNNumber(source?.asn);
  const reasons = [];
  let score = 0;

  const dcHit = hasAny(hay, RISK_RULES.dataCenterKeywords);
  const hbHit = hasAny(hay, RISK_RULES.homeBroadbandKeywords);
  const mobileHit = hasAny(hay, RISK_RULES.mobileKeywords);

  if (dcHit) {
    score += 55;
    reasons.push("命中机房/云/托管关键词");
  }
  if (hbHit) {
    const delta = dcHit ? -10 : -22;
    score += delta;
    reasons.push("命中家宽/接入网关键词");
  }
  if (mobileHit) {
    const delta = dcHit ? 0 : -10;
    score += delta;
    reasons.push("命中移动网络关键词");
  }
  if (RISK_RULES.highRiskCountries.some((item) => country.includes(normStr(item)))) {
    score += 18;
    reasons.push("地区存在额外风险");
  }
  if (!hay || hay.length <= 3) {
    score += 10;
    reasons.push("落地信息不足");
  }

  score = Math.max(0, Math.min(100, Math.round(score)));

  const hbEvidence = (hbHit ? 1 : 0) + (ASN_HOME_STRONG.has(asn) ? 1 : 0);
  const dcEvidence = dcHit ? 1 : 0;
  const tunnelLike = dcEvidence >= 1 || score >= 70;
  const isHomeBroadband =
    hbEvidence >= 2 && !tunnelLike && score <= 50
      ? true
      : hbEvidence >= 1 && dcEvidence === 0 && !tunnelLike && score <= 38;

  const lineType = isHomeBroadband ? "家宽" : "非家宽";
  const subtype = mobileHit
    ? "移动网络"
    : tunnelLike
      ? "机房/专线特征"
      : isHomeBroadband
        ? "住宅/接入特征"
        : hbEvidence >= 1
          ? "运营商/接入"
          : "普通 ISP";
  const nativeHint = !tunnelLike && score < 55 ? "更像原生" : "可能非原生";
  const tunnelHint = tunnelLike ? "机房/代理特征偏强" : "机房/代理特征偏弱";
  const level = score >= 70 ? "高" : score >= 40 ? "中" : "低";
  const title = level === "高" ? "机房/代理特征" : `${lineType} · ${nativeHint}`;

  return {
    score,
    level,
    title,
    lineType,
    subtype,
    nativeHint,
    tunnelHint,
    items: [lineType, nativeHint, tunnelHint, subtype, ...reasons].slice(0, 5),
  };
}

function formatTime(ts) {
  const d = new Date(ts || Date.now());
  const two = (v) => String(v).padStart(2, "0");
  return `${two(d.getHours())}:${two(d.getMinutes())}`;
}

function maskIp(ip) {
  const raw = String(ip || "");
  if (!raw) return "—";
  if (raw.includes(":")) {
    const parts = raw.split(":").filter(Boolean);
    if (parts.length <= 2) return raw;
    return `${parts.slice(0, 2).join(":")}:...:${parts.slice(-1)[0]}`;
  }
  const parts = raw.split(".");
  if (parts.length !== 4) return raw;
  return `${parts[0]}.${parts[1]}.*.*`;
}

function servicePriority(item) {
  const order = [
    "youtube",
    "chatgpt",
    "spotify",
    "netflix",
    "disney",
    "max",
    "openai_api",
    "cloudflare",
    "github",
    "bilibili",
    "bytedance",
    "jsdelivr",
    "wechat",
    "taobao",
  ];
  const index = order.indexOf(item.id);
  return index >= 0 ? index : 99;
}

class Widget extends DmYY {
  constructor(arg) {
    super(arg, DEFAULT_SETTINGS);
    this.name = "IP 信息";
    this.en = "IPInfo";
    this.logo = "https://raw.githubusercontent.com/58xinian/icon/main/globe.png";
    this.cacheKey = `${this.SETTING_KEY}.ipCache.v1`;
    this.hasBgImage = false;
    this.appearanceMode = Device.isUsingDarkAppearance() ? "dark" : "light";
    this.registerMenus();
  }

  registerMenus() {
    if (!config.runsInApp) return;

    this.registerAction({
      title: "IP 信息设置",
      menu: [
        {
          icon: { name: "character.cursor.ibeam", color: "#1677ff" },
          type: "input",
          title: "顶部标题",
          placeholder: "IP 信息",
          val: "title",
        },
        {
          icon: { name: "clock.arrow.2.circlepath", color: "#0958d9" },
          type: "select",
          title: "刷新间隔（分钟）",
          options: ["5", "10", "30", "60", "120", "360", "720"],
          val: "refreshAfterDate",
        },
        {
          icon: { name: "timer", color: "#13a8a8" },
          type: "input",
          title: "超时（毫秒）",
          placeholder: "3000",
          val: "timeoutMs",
        },
        {
          icon: { name: "archivebox", color: "#52c41a" },
          type: "switch",
          title: "启用缓存",
          val: "cacheEnabled",
        },
        {
          icon: { name: "clock.badge.checkmark", color: "#73d13d" },
          type: "input",
          title: "缓存分钟数",
          placeholder: "10",
          val: "cacheMinutes",
        },
      ],
    });

    this.registerAction({
      title: "探针与显示",
      menu: [
        {
          icon: { name: "ipv6", color: "#2f54eb" },
          type: "switch",
          title: "启用 IPv6 探针",
          val: "enableIPv6",
        },
        {
          icon: { name: "network", color: "#722ed1" },
          type: "switch",
          title: "启用服务检测",
          val: "enableConnectivity",
        },
        {
          icon: { name: "eye.slash", color: "#d4380d" },
          type: "switch",
          title: "隐藏 IP",
          val: "maskIp",
        },
        {
          icon: { name: "mappin.slash", color: "#d46b08" },
          type: "switch",
          title: "隐藏位置",
          val: "maskLocation",
        },
        {
          icon: { name: "text.badge.star", color: "#faad14" },
          type: "switch",
          title: "显示探针名称",
          val: "showSourceName",
        },
      ],
    });

    this.registerAction({
      title: "操作",
      menu: [
        {
          icon: { name: "paintbrush", color: "#531dab" },
          type: "input",
          title: "基础样式设置",
          name: "baseStyle",
          onClick: () => this.setWidgetConfig(),
        },
        {
          icon: { name: "trash", color: "#cf1322" },
          type: "input",
          title: "清空数据缓存",
          name: "clearCache",
          onClick: async () => {
            const options = ["取消", "确认清空"];
            const index = await this.generateAlert("将清空 IP 信息缓存。", options);
            if (index !== 1) return;
            this.clearCache();
            await this.notify(this.name, "缓存已清空");
          },
        },
      ],
    });
  }

  getSettingsValue() {
    const title = String(this.settings.title || DEFAULT_SETTINGS.title).trim() || DEFAULT_SETTINGS.title;
    const refresh = clampInt(this.settings.refreshAfterDate, 30, 5, 1440);
    const timeoutMs = clampInt(this.settings.timeoutMs, 3000, 1500, 15000);
    const cacheEnabled = toBool(this.settings.cacheEnabled, true);
    const cacheMinutes = clampInt(this.settings.cacheMinutes, 10, 1, 1440);
    const enableIPv6 = toBool(this.settings.enableIPv6, true);
    const enableConnectivity = toBool(this.settings.enableConnectivity, true);
    const maskIp = toBool(this.settings.maskIp, false);
    const maskLocation = toBool(this.settings.maskLocation, false);
    const showSourceName = toBool(this.settings.showSourceName, true);
    this.settings.refreshAfterDate = String(refresh);
    return {
      title,
      refreshIntervalMinutes: refresh,
      timeoutMs,
      cacheEnabled,
      cacheMinutes,
      enableIPv6,
      enableConnectivity,
      maskIp,
      maskLocation,
      showSourceName,
    };
  }

  readCache() {
    try {
      if (!Keychain.contains(this.cacheKey)) return null;
      const raw = Keychain.get(this.cacheKey);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed.updatedAt !== "number" || !parsed.data) return null;
      return parsed;
    } catch (e) {
      return null;
    }
  }

  writeCache(data, signature) {
    try {
      Keychain.set(
        this.cacheKey,
        JSON.stringify({
          updatedAt: Date.now(),
          signature,
          data,
        })
      );
    } catch (e) {}
  }

  clearCache() {
    try {
      if (Keychain.contains(this.cacheKey)) Keychain.remove(this.cacheKey);
    } catch (e) {}
  }

  cacheSignature(settings) {
    return JSON.stringify({
      v: 1,
      enableIPv6: settings.enableIPv6 !== false,
      enableConnectivity: settings.enableConnectivity !== false,
      timeoutMs: settings.timeoutMs,
    });
  }

  async fetchText(url, timeoutMs, options = {}) {
    const req = new Request(url);
    req.method = options.method || "GET";
    req.timeoutInterval = Math.max(2, Math.ceil(timeoutMs / 1000));
    req.headers = {
      Accept: "text/plain,application/json,*/*",
      "Accept-Language": "en",
      "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15",
      ...(options.headers || {}),
    };
    if (options.body) req.body = options.body;
    const text = await req.loadString();
    const response = req.response || {};
    return {
      text: String(text || ""),
      status: Number(response.statusCode || 0),
      headers: response.headers || {},
    };
  }

  async fetchJson(url, timeoutMs) {
    const { text } = await this.fetchText(url, timeoutMs);
    return JSON.parse(text);
  }

  async source(id, name, kind, timeoutMs, loader) {
    const start = Date.now();
    try {
      const data = await loader.call(this, timeoutMs);
      return {
        id,
        name,
        kind,
        ok: Boolean(data && data.ip),
        latencyMs: Date.now() - start,
        ...data,
      };
    } catch (error) {
      return {
        id,
        name,
        kind,
        ok: false,
        latencyMs: Date.now() - start,
        error: errToString(error),
      };
    }
  }

  async loadIpip(timeoutMs) {
    const data = await this.fetchJson("https://myip.ipip.net/json", timeoutMs);
    const list = Array.isArray(data?.data?.location) ? data.data.location : [];
    return {
      ip: data?.data?.ip,
      location: compact([list[0], list[1], list[2]]),
      isp: compact([list[4]]),
    };
  }

  async loadBilibili(timeoutMs) {
    const data = await this.fetchJson("https://api.bilibili.com/x/web-interface/zone", timeoutMs);
    const d = data?.data || {};
    return {
      ip: d.addr,
      countryCode: d.country_code ? String(d.country_code) : "",
      location: compact([d.country, d.province, d.city]),
      isp: d.isp,
    };
  }

  async loadIpApi(timeoutMs) {
    const data = await this.fetchJson("http://ip-api.com/json?lang=zh-CN", timeoutMs);
    if (data?.status && data.status !== "success") throw new Error("ip-api failed");
    return {
      ip: data?.query,
      countryCode: data?.countryCode,
      location: compact([data?.country, data?.regionName, data?.city]),
      isp: compact([data?.isp || data?.org]),
      org: data?.org,
      asn: String(data?.as || "").trim() || parseAsn(data?.as),
    };
  }

  async loadIpSb(timeoutMs) {
    const data = await this.fetchJson("https://api-ipv4.ip.sb/geoip", timeoutMs);
    return {
      ip: data?.ip,
      countryCode: data?.country_code,
      location: compact([data?.country, data?.region, data?.city]),
      isp: compact([data?.isp || data?.organization || data?.asn_organization]),
      org: compact([data?.organization || data?.asn_organization]),
      asn: data?.asn
        ? compact([`AS${data.asn}`, data?.asn_organization || data?.organization])
        : parseAsn(data?.asn),
    };
  }

  async loadIpInfo(timeoutMs) {
    const data = await this.fetchJson("https://ipinfo.io/json", timeoutMs);
    return {
      ip: data?.ip,
      countryCode: data?.country,
      location: compact([data?.country, data?.region, data?.city]),
      isp: data?.org,
      org: data?.org,
      asn: data?.org,
    };
  }

  async loadCloudflare(timeoutMs) {
    const { text } = await this.fetchText("https://www.cloudflare.com/cdn-cgi/trace", timeoutMs);
    const data = parseCloudflareTrace(text);
    return {
      ip: data.ip,
      countryCode: data.loc,
      location: data.loc,
      isp: data.colo ? `Cloudflare ${data.colo}` : "Cloudflare",
      extra: compact([data.http, data.tls, data.warp === "on" ? "WARP" : ""]),
    };
  }

  async loadIpv6IpSb(timeoutMs) {
    const data = await this.fetchJson("https://api-ipv6.ip.sb/geoip", timeoutMs);
    return {
      ip: data?.ip,
      countryCode: data?.country_code,
      location: compact([data?.country, data?.region, data?.city]),
      isp: compact([data?.isp || data?.organization || data?.asn_organization]),
      org: compact([data?.organization || data?.asn_organization]),
      asn: data?.asn
        ? compact([`AS${data.asn}`, data?.asn_organization || data?.organization])
        : parseAsn(data?.asn),
    };
  }

  async loadIpv6Plain(timeoutMs) {
    const { text } = await this.fetchText("https://api6.ipify.org", timeoutMs);
    return { ip: String(text || "").trim() };
  }

  serviceState(ok, statusText = "") {
    if (!ok) return statusText || "不可达";
    return statusText || "可用";
  }

  async service(id, name, region, timeoutMs, loader) {
    const start = Date.now();
    try {
      const data = await loader.call(this, timeoutMs);
      return {
        id,
        name,
        region,
        ok: data.ok === true,
        latencyMs: Date.now() - start,
        statusText: this.serviceState(data.ok === true, data.statusText),
        ...data,
      };
    } catch (error) {
      return {
        id,
        name,
        region,
        ok: false,
        latencyMs: Date.now() - start,
        statusText: "不可达",
        error: errToString(error),
      };
    }
  }

  async testBasicService(target, timeoutMs) {
    return this.service(target.id, target.name, target.region, timeoutMs, async (ms) => {
      const r = await this.fetchText(target.url, ms);
      const ok = r.status === 0 || (r.status >= 200 && r.status < 500);
      return { ok, status: r.status, statusText: ok ? "可用" : `HTTP ${r.status}` };
    });
  }

  async testYouTube(timeoutMs) {
    return this.service("youtube", "YouTube", "流媒体", timeoutMs, async (ms) => {
      const r = await this.fetchText("https://www.youtube.com/premium?hl=en", ms);
      const cc = countryFromText(r.text) || "US";
      return { ok: r.status >= 200 && r.status < 500, status: r.status, countryCode: cc, statusText: "可用" };
    });
  }

  async testChatGPT(timeoutMs) {
    return this.service("chatgpt", "ChatGPT", "AI", timeoutMs, async (ms) => {
      const r = await this.fetchText("https://chatgpt.com/cdn-cgi/trace", ms);
      const cc = countryFromText(r.text);
      const ok = r.status >= 200 && r.status < 500 && Boolean(cc);
      return { ok, status: r.status, countryCode: cc, statusText: ok ? "可用" : "受限" };
    });
  }

  async testOpenAIAPI(timeoutMs) {
    return this.service("openai_api", "OpenAI API", "AI", timeoutMs, async (ms) => {
      const r = await this.fetchText("https://api.openai.com/v1/models", ms);
      const cc = getHeader(r.headers, "cf-ipcountry").toUpperCase();
      const ok = r.status === 401 || r.status === 403 || (r.status >= 200 && r.status < 500);
      return { ok, status: r.status, countryCode: cc, statusText: ok ? "可达" : "不可达" };
    });
  }

  parseNetflixRegion(text, headers) {
    const origin = getHeader(headers, "x-originating-url") || getHeader(headers, "x-origining-url");
    const fromHeader = String(origin || "").match(/\/([A-Z]{2})(?:[-/]|$)/i);
    if (fromHeader) return fromHeader[1].toUpperCase();
    return countryFromText(text);
  }

  async testNetflix(timeoutMs) {
    const NF_ORIGINAL = "80018499";
    const NF_NON_ORIGINAL = "81280792";
    return this.service("netflix", "Netflix", "流媒体", timeoutMs, async (ms) => {
      const r1 = await this.fetchText(`https://www.netflix.com/title/${NF_NON_ORIGINAL}`, ms);
      if (r1.status === 403) return { ok: false, status: r1.status, statusText: "区域受限" };
      if (r1.status === 404) {
        const r2 = await this.fetchText(`https://www.netflix.com/title/${NF_ORIGINAL}`, ms);
        if (r2.status === 200) {
          return {
            ok: true,
            status: r2.status,
            countryCode: this.parseNetflixRegion(r2.text, r2.headers),
            statusText: "仅自制",
            detail: "Originals",
          };
        }
        return { ok: false, status: r2.status, statusText: "区域受限" };
      }
      const ok = r1.status === 200;
      return {
        ok,
        status: r1.status,
        countryCode: this.parseNetflixRegion(r1.text, r1.headers),
        statusText: ok ? "完整解锁" : `HTTP ${r1.status}`,
      };
    });
  }

  async testDisney(timeoutMs) {
    return this.service("disney", "Disney+", "流媒体", timeoutMs, async (ms) => {
      const r = await this.fetchText("https://www.disneyplus.com/", ms, {
        headers: { "Accept-Language": "en" },
      });
      const blocked = /not\s+available|Sorry,\s*Disney\+\s*is\s*not\s*available/i.test(r.text || "");
      const ok = r.status === 200 && !blocked;
      return {
        ok,
        status: r.status,
        countryCode: ok ? countryFromText(r.text) : "",
        statusText: ok ? "可用" : "区域受限",
      };
    });
  }

  async testMax(timeoutMs) {
    return this.service("max", "Max", "流媒体", timeoutMs, async (ms) => {
      const r = await this.fetchText("https://www.max.com/", ms);
      const blocked = /not\s+available\s+in\s+your\s+region|country\s+not\s+supported/i.test(r.text || "");
      const ok = r.status >= 200 && r.status < 500 && !blocked;
      return {
        ok,
        status: r.status,
        countryCode: ok ? countryFromText(r.text) : "",
        statusText: ok ? "可用" : "区域受限",
      };
    });
  }

  async testSpotify(timeoutMs) {
    return this.service("spotify", "Spotify", "流媒体", timeoutMs, async (ms) => {
      const r = await this.fetchText("https://www.spotify.com/", ms);
      const ok = r.status >= 200 && r.status < 500;
      return { ok, status: r.status, countryCode: countryFromText(r.text), statusText: ok ? "可用" : "不可达" };
    });
  }

  async runServiceChecks(timeoutMs) {
    const ms = Math.max(1200, Math.min(3000, timeoutMs));
    const checks = [
      this.testYouTube(ms),
      this.testChatGPT(ms),
      this.testSpotify(ms),
      this.testNetflix(ms),
      this.testDisney(ms),
      this.testMax(ms),
      this.testOpenAIAPI(ms),
      ...BASIC_SERVICE_TARGETS.slice(0, 3).map((item) => this.testBasicService(item, ms)),
    ];
    return Promise.all(checks);
  }

  firstOk(sources, kind) {
    return sources.find((item) => item.kind === kind && item.ok && item.ip);
  }

  firstOkById(sources, ids) {
    for (const id of ids) {
      const found = sources.find((item) => item.id === id && item.ok && item.ip);
      if (found) return found;
    }
    return undefined;
  }

  enrichSources(sources) {
    const richIds = ["ipapi", "ipsb", "ipinfo"];
    return sources.map((item) => {
      if (item.id !== "cloudflare" || !item.ip) return item;
      const rich = richIds
        .map((id) => sources.find((source) => source.id === id && source.ok && source.ip === item.ip))
        .find((source) => source?.isp || source?.asn || source?.location);
      if (!rich) return item;
      return {
        ...item,
        countryCode: rich.countryCode || item.countryCode,
        location: rich.location || item.location,
        isp: rich.isp || item.isp,
        org: rich.org || item.org,
        asn: rich.asn || item.asn,
      };
    });
  }

  async fetchNetworkInfo(settings) {
    const timeoutMs = Math.max(1500, Math.min(15000, settings.timeoutMs || 3000));
    const sourceTasks = [
      this.source("ipip", "iP138.com", "domestic", timeoutMs, this.loadIpip),
      this.source("bilibili", "IP.cn 查询网", "domestic", timeoutMs, this.loadBilibili),
      this.source("ipapi", "IP-API", "international", timeoutMs, this.loadIpApi),
      this.source("ipsb", "IP.SB", "international", timeoutMs, this.loadIpSb),
      this.source("cloudflare", "Cloudflare", "cloudflare", timeoutMs, this.loadCloudflare),
      this.source("ipinfo", "IPinfo.io", "international", timeoutMs, this.loadIpInfo),
    ];

    if (settings.enableIPv6) {
      sourceTasks.push(this.source("ipv6_ipsb", "IPv6 IP.SB", "ipv6", timeoutMs, this.loadIpv6IpSb));
      sourceTasks.push(this.source("ipv6_ipify", "IPv6 IPify", "ipv6", timeoutMs, this.loadIpv6Plain));
    }

    const servicesPromise = settings.enableConnectivity ? this.runServiceChecks(timeoutMs) : Promise.resolve([]);
    const [rawSources, services] = await Promise.all([Promise.all(sourceTasks), servicesPromise]);
    const sources = this.enrichSources(rawSources);

    const primaryDomestic = this.firstOk(sources, "domestic");
    const primaryInternational =
      this.firstOkById(sources, ["ipinfo", "ipsb", "ipapi", "cloudflare"]) ||
      this.firstOk(sources, "international") ||
      this.firstOk(sources, "cloudflare");
    const primaryIPv6 = this.firstOk(sources, "ipv6");
    const risk = calculateLineRisk(primaryInternational || primaryDomestic);

    if (!sources.some((item) => item.ok)) throw new Error("所有 IP 探针均请求失败");

    return {
      updatedAt: Date.now(),
      sources,
      services,
      connectivity: services,
      risk,
      primaryDomestic,
      primaryInternational,
      primaryIPv6,
    };
  }

  async fetchNetworkInfoCached(settings) {
    const signature = this.cacheSignature(settings);
    const cache = this.readCache();
    const cacheMs = Math.max(1, settings.cacheMinutes || 10) * 60 * 1000;
    const cacheUsable = cache && cache.signature === signature;
    const cacheFresh = cacheUsable && Date.now() - cache.updatedAt <= cacheMs;

    if (settings.cacheEnabled && cacheFresh) {
      return { data: cache.data, fromCache: true, staleFallback: false };
    }

    try {
      const data = await this.fetchNetworkInfo(settings);
      if (settings.cacheEnabled) this.writeCache(data, signature);
      return { data, fromCache: false, staleFallback: false };
    } catch (error) {
      if (settings.cacheEnabled && cacheUsable && cache?.data) {
        return {
          data: cache.data,
          fromCache: true,
          staleFallback: true,
          error: errToString(error),
        };
      }
      throw error;
    }
  }

  getColors() {
    const mode = this.appearanceMode || (Device.isUsingDarkAppearance() ? "dark" : "light");
    if (mode === "transparent") {
      const dark = Device.isUsingDarkAppearance();
      return {
        plainBadge: true,
        root: dark ? new Color("#1F2A36", 0.28) : new Color("#F3F6FA", 0.25),
        card: dark ? new Color("#0F1A25", 0.42) : new Color("#FFFFFF", 0.56),
        cardAlt: dark ? new Color("#172331", 0.35) : new Color("#F4F5F8", 0.44),
        chip: dark ? new Color("#2D3B4E", 0.65) : new Color("#E9EBF0", 0.7),
        tile: dark ? new Color("#142131", 0.48) : new Color("#FFFFFF", 0.5),
        text: dark ? new Color("#F4F8FC") : new Color("#111111"),
        title: dark ? new Color("#F8FBFF") : new Color("#1D1D1D"),
        secondary: dark ? new Color("#D6DFE8") : new Color("#636A72"),
        weak: dark ? new Color("#BAC7D5") : new Color("#8C919A"),
        separator: dark ? new Color("#8EA2B8", 0.3) : new Color("#A4A9B3", 0.35),
        success: new Color("#35D06B"),
        warning: new Color("#F7A531"),
        danger: new Color("#FF4D4F"),
        dotMuted: dark ? new Color("#6E7D8E") : new Color("#CED4DC"),
        badgeDomestic: new Color("#2F8DFF"),
        badgeInternational: new Color("#34C759"),
        badgeAI: new Color("#00B978"),
        badgeRisk: new Color("#F0C419"),
        badgeDomesticText: Color.white(),
        badgeInternationalText: Color.white(),
        badgeAIText: Color.white(),
        badgeRiskText: new Color("#3E2A00"),
        badgeDomesticBorder: dark ? new Color("#9BC1FF", 0.9) : new Color("#1E78FF", 0.95),
        badgeInternationalBorder: dark ? new Color("#9CE2B8", 0.9) : new Color("#27B85E", 0.95),
        badgeAIBorder: dark ? new Color("#8FE7CB", 0.9) : new Color("#00A86A", 0.95),
        badgeRiskBorder: dark ? new Color("#FFE39E", 0.9) : new Color("#D8A800", 0.95),
        outlineBlue: new Color("#78D6FF", 0.98),
        outlineGreen: new Color("#7DFFC1", 0.98),
        outlineAmber: new Color("#FFD166", 0.98),
        outlineRose: new Color("#FF9DBB", 0.98),
        outlineCyan: new Color("#84F0FF", 0.98),
      };
    }
    if (mode === "dark") {
      return {
        root: new Color("#1F2A36", 0.92),
        card: new Color("#2D3B4D", 0.9),
        cardAlt: new Color("#36475A", 0.88),
        chip: new Color("#45586E", 0.9),
        tile: new Color("#34475C", 0.88),
        text: new Color("#F2F6FB"),
        title: new Color("#F7FAFD"),
        secondary: new Color("#BBC6D2"),
        weak: new Color("#96A5B6"),
        separator: new Color("#5E7287", 0.85),
        success: new Color("#35D06B"),
        warning: new Color("#F7A531"),
        danger: new Color("#FF4D4F"),
        dotMuted: new Color("#6E7D8E"),
        badgeDomestic: new Color("#2F8DFF"),
        badgeInternational: new Color("#34C759"),
        badgeAI: new Color("#00B978"),
        badgeRisk: new Color("#F0C419"),
        badgeDomesticText: Color.white(),
        badgeInternationalText: Color.white(),
        badgeAIText: Color.white(),
        badgeRiskText: new Color("#3E2A00"),
        badgeDomesticBorder: new Color("#9BC1FF", 0.9),
        badgeInternationalBorder: new Color("#9CE2B8", 0.9),
        badgeAIBorder: new Color("#8FE7CB", 0.9),
        badgeRiskBorder: new Color("#FFE39E", 0.9),
        outlineBlue: new Color("#5F84C3", 0.95),
        outlineGreen: new Color("#4E9A75", 0.95),
        outlineAmber: new Color("#B29248", 0.95),
        outlineRose: new Color("#A46B7E", 0.95),
        outlineCyan: new Color("#4E8FA6", 0.95),
      };
    }
    return {
      root: new Color("#EDEEF2"),
      card: new Color("#F7F7F8"),
      cardAlt: new Color("#F1F1F3"),
      chip: new Color("#ECECEE"),
      tile: new Color("#F5F5F7"),
      text: new Color("#111111"),
      title: new Color("#202020"),
      secondary: new Color("#7A7E86"),
      weak: new Color("#9BA0A8"),
      separator: new Color("#E2E3E7"),
      success: new Color("#34C759"),
      warning: new Color("#F59E0B"),
      danger: new Color("#FF3B30"),
      dotMuted: new Color("#D0D4DB"),
      badgeDomestic: new Color("#2F8DFF"),
      badgeInternational: new Color("#34C759"),
      badgeAI: new Color("#00B978"),
      badgeRisk: new Color("#FFE9A6"),
      badgeDomesticText: Color.white(),
      badgeInternationalText: Color.white(),
      badgeAIText: Color.white(),
      badgeRiskText: new Color("#6A4C00"),
      badgeDomesticBorder: new Color("#1E78FF", 0.95),
      badgeInternationalBorder: new Color("#27B85E", 0.95),
      badgeAIBorder: new Color("#00A86A", 0.95),
      badgeRiskBorder: new Color("#D8A800", 0.95),
      outlineBlue: new Color("#6E9EFF", 0.98),
      outlineGreen: new Color("#69C68D", 0.98),
      outlineAmber: new Color("#E0BD6F", 0.98),
      outlineRose: new Color("#D695AA", 0.98),
      outlineCyan: new Color("#72C0D2", 0.98),
    };
  }

  createRoot(widget, compact = false) {
    const colors = this.getColors();
    const root = widget.addStack();
    root.layoutVertically();
    root.setPadding(compact ? 8 : 6, compact ? 8 : 6, compact ? 8 : 6, compact ? 8 : 6);
    root.backgroundColor = colors.root;
    root.cornerRadius = 22;
    return root;
  }

  createCard(parent, options = {}) {
    const colors = this.getColors();
    const {
      padding = [8, 8, 8, 8],
      radius = 10,
      bg = "card",
      vertical = true,
      borderColor = null,
      borderWidth = 1,
    } = options;
    const stack = parent.addStack();
    if (vertical) {
      stack.layoutVertically();
    } else {
      stack.layoutHorizontally();
      stack.centerAlignContent();
    }
    const [top, left, bottom, right] = Array.isArray(padding)
      ? padding
      : [padding, padding, padding, padding];
    stack.setPadding(top, left, bottom, right);
    stack.backgroundColor = colors[bg] || colors.card;
    stack.cornerRadius = radius;
    if (borderColor) {
      stack.borderColor = borderColor;
      stack.borderWidth = borderWidth;
    }
    return stack;
  }

  addSectionLine(parent, color, width, height = 2) {
    const row = parent.addStack();
    row.layoutHorizontally();
    row.centerAlignContent();
    row.addSpacer();
    const line = row.addStack();
    line.size = new Size(width, height);
    line.cornerRadius = height / 2;
    line.backgroundColor = color || Color.white();
    row.addSpacer();
    return line;
  }

  createSectionCard(parent, options = {}) {
    const colors = this.getColors();
    const {
      padding = [8, 8, 8, 8],
      radius = 10,
      bg = "card",
      vertical = true,
      borderColor = null,
      borderWidth = 1,
    } = options;
    if (!borderColor) {
      return { card: this.createCard(parent, options), frame: null, panelImage: null };
    }
    const frame = parent.addStack();
    frame.layoutVertically();
    const inset = Math.max(2, Math.round(borderWidth || 1));
    frame.setPadding(inset, inset, inset, inset);
    frame.backgroundColor = borderColor;
    frame.cornerRadius = radius;

    const card = frame.addStack();
    if (vertical) {
      card.layoutVertically();
    } else {
      card.layoutHorizontally();
      card.centerAlignContent();
    }
    const [top, left, bottom, right] = Array.isArray(padding)
      ? padding
      : [padding, padding, padding, padding];
    card.setPadding(top, left, bottom, right);
    card.backgroundColor = colors[bg] || colors.card;
    card.cornerRadius = Math.max(0, radius - inset);
    return {
      card,
      frame,
      borderInset: inset,
      panelImage: null,
    };
  }

  drawRoundedPanel(width, height, fillColor, strokeColor, radius = 10, lineWidth = 1.5) {
    const ctx = new DrawContext();
    ctx.opaque = false;
    ctx.respectScreenScale = true;
    ctx.size = new Size(width, height);
    const inset = Math.max(1, lineWidth / 2 + 0.5);
    const rect = new Rect(inset, inset, Math.max(1, width - inset * 2), Math.max(1, height - inset * 2));
    const path = new Path();
    path.addRoundedRect(rect, radius, radius);
    ctx.addPath(path);
    ctx.setFillColor(fillColor || new Color("#000000", 0));
    ctx.fillPath();
    ctx.addPath(path);
    ctx.setStrokeColor(strokeColor || Color.white());
    ctx.setLineWidth(lineWidth);
    ctx.strokePath();
    return ctx.getImage();
  }

  setSectionSize(section, width, height) {
    const size = new Size(width, height);
    const target = section.frame || section.card;
    target.size = size;
    if (section.frame && section.card) {
      const inset = section.borderInset || 0;
      section.card.size = new Size(Math.max(1, width - inset * 2), Math.max(1, height - inset * 2));
    }
    if (section.panelImage) {
      section.card.backgroundImage = this.drawRoundedPanel(
        width,
        height,
        section.panelImage.fill,
        section.panelImage.stroke,
        section.panelImage.radius,
        section.panelImage.width
      );
    }
  }

  isTransparentMode() {
    const mode = String(this.appearanceMode || "").toLowerCase();
    const settings = this.settings || {};
    const candidates = [
      mode,
      settings.mode,
      settings.theme,
      settings.bgMode,
      settings.backgroundMode,
      settings.backgroundType,
      settings.widgetBg,
    ]
      .map((item) => String(item || "").toLowerCase())
      .join(" ");
    return (
      this.hasBgImage === true ||
      this.transparentMode === true ||
      mode === "transparent" ||
      candidates.includes("transparent") ||
      candidates.includes("透明")
    );
  }

  createBadge(parent, text, tone = "international", compact = false) {
    const colors = this.getColors();
    const mode = this.appearanceMode || (Device.isUsingDarkAppearance() ? "dark" : "light");
    const dark = mode === "dark" || Device.isUsingDarkAppearance();
    const plain = colors.plainBadge || this.isTransparentMode() || dark;
    let labelColor = plain ? Color.white() : new Color("#16813F");
    if (tone === "domestic") {
      labelColor = plain ? Color.white() : new Color("#0B74E8");
    } else if (tone === "ai") {
      labelColor = plain ? Color.white() : new Color("#008F63");
    } else if (tone === "risk") {
      labelColor = plain ? Color.white() : new Color("#7A5200");
    }
    const label = parent.addText(String(text || "—"));
    label.font = Font.boldSystemFont(compact ? 7.8 : 9);
    label.textColor = labelColor;
    label.lineLimit = 1;
    return label;
  }

  createPill(parent, text) {
    const colors = this.getColors();
    const pill = parent.addStack();
    pill.layoutHorizontally();
    pill.centerAlignContent();
    pill.setPadding(2, 7, 2, 7);
    pill.cornerRadius = 8;
    pill.backgroundColor = colors.chip;
    const label = pill.addText(String(text || "—"));
    label.font = Font.systemFont(8);
    label.textColor = colors.secondary;
    label.lineLimit = 1;
    return pill;
  }

  addCard(widget, padding = 8) {
    const stack = this.createCard(widget, { padding, radius: 10, bg: "card" });
    stack.layoutVertically();
    return stack;
  }

  text(value, fallback = "—") {
    const s = String(value || "").trim();
    return s || fallback;
  }

  ellipsis(value, limit = 30) {
    const raw = this.text(value, "");
    if (!raw) return "—";
    return raw.length > limit ? `${raw.slice(0, limit - 1)}…` : raw;
  }

  addInfoBlock(parent, label, value, strong = false) {
    const colors = this.getColors();
    const box = parent.addStack();
    box.layoutVertically();
    const lt = box.addText(label);
    lt.font = Font.systemFont(8);
    lt.textColor = colors.secondary;
    lt.lineLimit = 1;
    box.addSpacer(1);
    const vt = box.addText(value);
    vt.font = strong ? Font.semiboldSystemFont(9.8) : Font.systemFont(9.2);
    vt.textColor = colors.text;
    vt.lineLimit = 1;
    return box;
  }

  displayLocationCompact(item, settings) {
    const raw = this.displayLocation(item, settings);
    if (raw === "—" || raw === "已隐藏") return raw;
    const cc = String(item?.countryCode || "").trim().toUpperCase();
    let value = raw;
    if (cc && value.toUpperCase().startsWith(`${cc} `)) {
      value = value.slice(cc.length).trim();
    }
    return value
      .replace(/\s+/g, " ")
      .replace(/Taiwan\s+([A-Za-z-]+)/i, "Taiwan · $1")
      .replace(/China\s+([\u4e00-\u9fa5A-Za-z-]+)/i, "China · $1");
  }

  pickSources(data) {
    const preferred = [data.primaryDomestic, data.primaryInternational, data.primaryIPv6].filter(Boolean);
    const seen = new Set(preferred.map((item) => item.id));
    (data.sources || []).forEach((item) => {
      if (item.ok && !seen.has(item.id)) {
        preferred.push(item);
        seen.add(item.id);
      }
    });
    return preferred;
  }

  pickReferenceSources(data) {
    const ids = ["ipip", "bilibili", "cloudflare", "ipinfo"];
    const picked = [];
    ids.forEach((id) => {
      const found = (data.sources || []).find((item) => item.id === id && item.ok && item.ip);
      if (found) picked.push(found);
    });
    const seen = new Set(picked.map((item) => item.id));
    this.pickSources(data).forEach((item) => {
      if (!seen.has(item.id)) {
        picked.push(item);
        seen.add(item.id);
      }
    });
    return picked;
  }

  countryLabel(item) {
    const cc = String(item?.countryCode || "").trim().toUpperCase();
    if (/^[A-Z]{2}$/.test(cc)) return cc;
    return item?.kind === "domestic" ? "国内" : "国际";
  }

  sourceTone(item) {
    return item?.kind === "domestic" ? "domestic" : "international";
  }

  cleanIsp(value) {
    const raw = this.text(value, "");
    if (!raw) return "—";
    return raw
      .replace(/\s*(Co\.|Company|Ltd\.|Limited|Inc\.|Corporation|Corp\.)\s*$/i, "")
      .trim();
  }

  latencyText(value) {
    if (typeof value !== "number" || !Number.isFinite(value)) return "—";
    return `${Math.round(value)}ms`;
  }

  serviceLabel(item) {
    if (item.region === "流媒体") return "流媒";
    return item.region;
  }

  statusColor(item) {
    const colors = this.getColors();
    if (item?.ok && /仅自制|部分/i.test(String(item?.statusText || ""))) return colors.warning;
    return item?.ok ? colors.success : colors.danger;
  }

  dotColor(item, index) {
    const colors = this.getColors();
    void index;
    if (!item?.ok) return colors.danger;
    const latency = item.latencyMs || 0;
    if (/仅自制|部分/i.test(String(item.statusText || ""))) return colors.warning;
    if (latency <= 120) return colors.success;
    if (latency <= 350) return new Color("#F59E0B");
    return new Color("#F97316");
  }

  addHeader(widget, settings, data, fromCache, staleFallback) {
    const colors = this.getColors();
    const row = widget.addStack();
    row.centerAlignContent();
    const title = row.addText(settings.title);
    title.font = Font.boldSystemFont(13);
    title.textColor = colors.title;
    title.lineLimit = 1;
    row.addSpacer();
    const tag = row.addText(`${formatTime(data.updatedAt)}${fromCache ? " 缓存" : ""}${staleFallback ? " 兜底" : ""}`);
    tag.font = Font.mediumSystemFont(9);
    tag.textColor = colors.secondary;
    tag.lineLimit = 1;
    widget.addSpacer(6);
  }

  displayIp(item, settings) {
    if (!item?.ip) return "—";
    return settings.maskIp ? maskIp(item.ip) : item.ip;
  }

  displayLocation(item, settings) {
    if (!item) return "—";
    if (settings.maskLocation) return "已隐藏";
    return String(item.location || item.countryCode || "—");
  }

  sourceLabel(item, settings) {
    if (!item) return "探针";
    if (settings.showSourceName) return item.name;
    if (item.kind === "domestic") return "国内探针";
    if (item.kind === "ipv6") return "IPv6探针";
    return "国际探针";
  }

  riskColor(risk) {
    const colors = this.getColors();
    if (risk?.level === "高") return colors.danger;
    if (risk?.level === "中") return colors.warning;
    return colors.success;
  }

  serviceStatusText(item) {
    if (!item) return "—";
    const mark = item.ok ? "✓" : "×";
    const suffix = item.countryCode ? ` ${item.countryCode}` : "";
    const state = item.statusText ? ` ${item.statusText}` : "";
    return `${mark} ${item.name}${suffix}${state}`;
  }

  pickServices(data, limit) {
    return [...(data.services || data.connectivity || [])]
      .sort((a, b) => servicePriority(a) - servicePriority(b))
      .slice(0, limit);
  }

  async renderSmall(widget, data, settings, fromCache, staleFallback) {
    const colors = this.getColors();
    const primary = data.primaryInternational || data.primaryDomestic || data.primaryIPv6;
    const root = this.createRoot(widget, true);
    this.addHeader(root, settings, data, fromCache, staleFallback);

    const main = this.createCard(root, { padding: [9, 9, 9, 9], radius: 12, bg: "card" });
    const ip = main.addText(this.displayIp(primary, settings));
    ip.font = Font.boldSystemFont(16);
    ip.textColor = colors.text;
    ip.lineLimit = 1;

    main.addSpacer(3);
    const loc = main.addText(this.displayLocation(primary, settings));
    loc.font = Font.systemFont(10);
    loc.textColor = colors.secondary;
    loc.lineLimit = 2;

    main.addSpacer(5);
    const risk = main.addText(`风险值 ${data.risk.score} · ${data.risk.title}`);
    risk.font = Font.mediumSystemFont(10);
    risk.textColor = this.riskColor(data.risk);
    risk.lineLimit = 1;

    if (settings.enableConnectivity) {
      const services = this.pickServices(data, 1);
      if (services.length) {
        main.addSpacer(4);
        const s = main.addText(this.serviceStatusText(services[0]));
        s.font = Font.systemFont(9);
        s.textColor = colors.secondary;
        s.lineLimit = 1;
      }
    }
  }

  async renderMedium(widget, data, settings, fromCache, staleFallback) {
    const colors = this.getColors();
    const primary = data.primaryInternational || data.primaryDomestic || data.primaryIPv6;
    const root = this.createRoot(widget, true);
    this.addHeader(root, settings, data, fromCache, staleFallback);

    const top = this.createCard(root, { padding: [9, 9, 9, 9], radius: 12, bg: "card" });
    const row = top.addStack();
    row.layoutHorizontally();
    row.centerAlignContent();

    const left = row.addStack();
    left.layoutVertically();
    const ip = left.addText(this.displayIp(primary, settings));
    ip.font = Font.boldSystemFont(15);
    ip.textColor = colors.text;
    ip.lineLimit = 1;
    left.addSpacer(2);
    const loc = left.addText(this.displayLocation(primary, settings));
    loc.font = Font.systemFont(10);
    loc.textColor = colors.secondary;
    loc.lineLimit = 1;

    row.addSpacer();

    const right = row.addStack();
    right.layoutVertically();
    right.centerAlignContent();
    const score = right.addText(String(data.risk.score));
    score.font = Font.boldSystemFont(20);
    score.textColor = this.riskColor(data.risk);
    score.lineLimit = 1;
    const tag = right.addText(`风险 ${data.risk.level}`);
    tag.font = Font.mediumSystemFont(10);
    tag.textColor = colors.secondary;
    tag.lineLimit = 1;

    if (settings.enableIPv6) {
      top.addSpacer(6);
      const ipv6 = top.addText(`IPv6 ${this.displayIp(data.primaryIPv6, settings)}`);
      ipv6.font = Font.mediumSystemFont(10);
      ipv6.textColor = colors.secondary;
      ipv6.lineLimit = 1;
    }

    if (settings.enableConnectivity) {
      root.addSpacer(6);
      const svcCard = this.createCard(root, { padding: [8, 8, 8, 8], radius: 12, bg: "card" });
      const services = this.pickServices(data, 3);
      services.forEach((item, idx) => {
        const s = svcCard.addText(this.serviceStatusText(item));
        s.font = Font.systemFont(9);
        s.textColor = item.ok ? colors.text : colors.secondary;
        s.lineLimit = 1;
        if (idx !== services.length - 1) svcCard.addSpacer(2);
      });
    }
  }

  async renderLarge(widget, data, settings, fromCache, staleFallback) {
    const colors = this.getColors();
    const root = this.createRoot(widget, false);
    const primary = data.primaryInternational || data.primaryDomestic || data.primaryIPv6;

    const topRow = root.addStack();
    topRow.layoutHorizontally();
    topRow.topAlignContent();

    const leftSection = this.createSectionCard(topRow, {
      padding: [7, 8, 7, 8],
      radius: 12,
      bg: "card",
      borderColor: colors.outlineBlue,
      borderWidth: colors.plainBadge ? 1.9 : 1.1,
    });
    const leftCard = leftSection.card;
    this.setSectionSize(leftSection, 166, 190);

    const head = leftCard.addStack();
    head.layoutHorizontally();
    head.centerAlignContent();
    const ipTitle = head.addText("IPv4");
    ipTitle.font = Font.mediumSystemFont(8.8);
    ipTitle.textColor = colors.secondary;
    ipTitle.lineLimit = 1;
    head.addSpacer();
    this.createBadge(head, this.countryLabel(primary), this.sourceTone(primary));

    leftCard.addSpacer(4);
    const ipv4Text = leftCard.addText(this.displayIp(primary, settings));
    ipv4Text.font = Font.boldSystemFont(22.5);
    ipv4Text.textColor = colors.text;
    ipv4Text.lineLimit = 1;

    leftCard.addSpacer(5);
    this.addInfoBlock(leftCard, "Location", this.displayLocationCompact(primary, settings), true);
    leftCard.addSpacer(3);
    this.addInfoBlock(leftCard, "ISP", this.ellipsis(primary?.isp, 28), false);
    leftCard.addSpacer(3);
    this.addInfoBlock(leftCard, "ASN", this.ellipsis(primary?.asn || primary?.isp, 28), false);

    leftCard.addSpacer();
    const ipv6HintRow = leftCard.addStack();
    ipv6HintRow.addSpacer();
    const ipv6Hint = ipv6HintRow.addText(
      data.primaryIPv6 ? `IPv6 ${this.displayIp(data.primaryIPv6, settings)}` : "你的网络可能不支持 IPv6"
    );
    ipv6Hint.font = Font.semiboldSystemFont(7.6);
    ipv6Hint.textColor = colors.secondary;
    ipv6Hint.lineLimit = 1;
    ipv6HintRow.addSpacer();

    topRow.addSpacer(3);

    const rightCol = topRow.addStack();
    rightCol.layoutVertically();

    const sourceSection = this.createSectionCard(rightCol, {
      padding: [4, 7, 4, 7],
      radius: 12,
      bg: "card",
      borderColor: colors.outlineGreen,
      borderWidth: colors.plainBadge ? 1.9 : 1.25,
    });
    const sourceCard = sourceSection.card;
    this.setSectionSize(sourceSection, 163, 127);

    const refs = this.pickReferenceSources(data).slice(0, 4);
    if (!refs.length) {
      const empty = sourceCard.addText("暂无可用探针");
      empty.font = Font.systemFont(10);
      empty.textColor = colors.secondary;
    } else {
      refs.forEach((item, idx) => {
        const tone = this.sourceTone(item);
        const accent = tone === "domestic" ? colors.badgeDomestic : colors.badgeInternational;
        const row = sourceCard.addStack();
        row.layoutHorizontally();
        row.centerAlignContent();

        const rail = row.addStack();
        rail.size = new Size(3, 11);
        rail.cornerRadius = 1.5;
        rail.backgroundColor = accent;
        row.addSpacer(4);

        const sourceName = this.text(item.name, this.sourceLabel(item, settings));
        const name = row.addText(sourceName);
        name.font = Font.boldSystemFont(8.15);
        name.textColor = colors.text;
        name.lineLimit = 1;
        row.addSpacer();
        this.createBadge(row, item.kind === "domestic" ? "国内" : "国际", tone, true);

        const ipRow = sourceCard.addStack();
        ipRow.layoutHorizontally();
        ipRow.centerAlignContent();
        ipRow.addSpacer();
        const ipLine = ipRow.addText(`IP: ${this.displayIp(item, settings)}`);
        ipLine.font = Font.systemFont(6.95);
        ipLine.textColor = colors.secondary;
        ipLine.lineLimit = 1;
        ipRow.addSpacer();

        const locRow = sourceCard.addStack();
        locRow.layoutHorizontally();
        locRow.centerAlignContent();
        locRow.addSpacer();
        const locLine = locRow.addText(
          this.ellipsis(`${this.displayLocation(item, settings)} ${this.text(item.isp || item.asn, "")}`, 32)
        );
        locLine.font = Font.systemFont(6.45);
        locLine.textColor = colors.text;
        locLine.lineLimit = 1;
        locRow.addSpacer();

        if (idx < refs.length - 1) {
          sourceCard.addSpacer(1);
          const sep = sourceCard.addStack();
          sep.size = new Size(140, 1);
          sep.backgroundColor = idx % 2 === 0 ? colors.outlineBlue : colors.outlineGreen;
          sourceCard.addSpacer(0.5);
        }
      });
    }

    rightCol.addSpacer(2);

    const summarySection = this.createSectionCard(rightCol, {
      padding: [5, 8, 5, 8],
      radius: 12,
      bg: "card",
      borderColor: colors.outlineAmber,
      borderWidth: colors.plainBadge ? 1.75 : 1.25,
    });
    const summaryCard = summarySection.card;
    this.setSectionSize(summarySection, 163, 61);
    const summaryTitle = summaryCard.addText("网络摘要");
    summaryTitle.font = Font.semiboldSystemFont(8.6);
    summaryTitle.textColor = colors.secondary;
    summaryTitle.lineLimit = 1;
    summaryCard.addSpacer(1.5);

    const primaryExit = `${this.countryLabel(primary)} / ${primary?.kind === "domestic" ? "国内" : "国际"}`;
    const isp = this.cleanIsp(primary?.isp || primary?.asn);
    const ipv6State = data.primaryIPv6 ? "可用" : "不可用";
    const riskText = `${data.risk.level} · ${data.risk.title}`;
    const makeSummaryItem = (parent, label, value) => {
      const item = this.createCard(parent, {
        padding: [2, 5, 2, 5],
        radius: 8,
        bg: "cardAlt",
        borderColor: colors.outlineAmber,
        borderWidth: 0.9,
      });
      item.size = new Size(68, 20);
      const l = item.addText(label);
      l.font = Font.systemFont(6.2);
      l.textColor = colors.secondary;
      l.lineLimit = 1;
      const v = item.addText(this.ellipsis(value, 18));
      v.font = Font.semiboldSystemFont(7);
      v.textColor = colors.text;
      v.lineLimit = 1;
    };

    const row1 = summaryCard.addStack();
    row1.layoutHorizontally();
    makeSummaryItem(row1, "出口", primaryExit);
    row1.addSpacer(4);
    makeSummaryItem(row1, "IPv6", ipv6State);
    summaryCard.addSpacer(2);
    const row2 = summaryCard.addStack();
    row2.layoutHorizontally();
    makeSummaryItem(row2, "ISP", isp);
    row2.addSpacer(4);
    makeSummaryItem(row2, "风险", riskText);

    root.addSpacer(2);

    const riskSection = this.createSectionCard(root, {
      padding: [3, 6, 3, 6],
      radius: 10,
      bg: "card",
      borderColor: colors.outlineRose,
      borderWidth: colors.plainBadge ? 1.65 : 1.2,
    });
    const riskCard = riskSection.card;
    this.setSectionSize(riskSection, 332, 25);
    const riskRow = riskCard.addStack();
    riskRow.layoutHorizontally();
    riskRow.centerAlignContent();

    const riskSymbol = SFSymbol.named("info.circle.fill");
    if (riskSymbol?.image) {
      const icon = riskRow.addImage(riskSymbol.image);
      icon.imageSize = new Size(13, 13);
      icon.tintColor = this.riskColor(data.risk);
    } else {
      const iconText = riskRow.addText("●");
      iconText.font = Font.boldSystemFont(11);
      iconText.textColor = this.riskColor(data.risk);
      iconText.lineLimit = 1;
    }

    riskRow.addSpacer(5);
    const riskLabel = riskRow.addText("风险值");
    riskLabel.font = Font.systemFont(8);
    riskLabel.textColor = colors.secondary;
    riskLabel.lineLimit = 1;
    riskRow.addSpacer(2);
    const riskScore = riskRow.addText(String(data.risk.score));
    riskScore.font = Font.boldSystemFont(12);
    riskScore.textColor = this.riskColor(data.risk);
    riskScore.lineLimit = 1;
    riskRow.addSpacer(1.5);
    const riskDesc = riskRow.addText(`/ 100 · ${data.risk.title}`);
    riskDesc.font = Font.systemFont(7.8);
    riskDesc.textColor = colors.secondary;
    riskDesc.lineLimit = 1;

    riskRow.addSpacer();
    this.createPill(riskRow, data.risk.lineType);
    riskRow.addSpacer(2);
    this.createPill(riskRow, data.risk.nativeHint);
    riskRow.addSpacer(2);
    this.createPill(riskRow, data.risk.subtype);
    riskRow.addSpacer(4);
    const time = riskRow.addText(`${formatTime(data.updatedAt)}${fromCache ? " 缓存" : ""}${staleFallback ? " 兜底" : ""}`);
    time.font = Font.systemFont(7.8);
    time.textColor = colors.secondary;
    time.lineLimit = 1;

    root.addSpacer(2);

    const serviceSection = this.createSectionCard(root, {
      padding: [5, 7, 5, 7],
      radius: 12,
      bg: "card",
      borderColor: colors.outlineCyan,
      borderWidth: colors.plainBadge ? 1.85 : 1.25,
    });
    const servicePanel = serviceSection.card;
    this.setSectionSize(serviceSection, 332, 105);
    const serviceTitle = servicePanel.addText("服务检测");
    serviceTitle.font = Font.semiboldSystemFont(8.4);
    serviceTitle.textColor = colors.secondary;
    serviceTitle.lineLimit = 1;
    servicePanel.addSpacer(1.5);

    if (settings.enableConnectivity) {
      const services = this.pickServices(data, 6);
      if (!services.length) {
        const empty = servicePanel.addText("服务检测未开启");
        empty.font = Font.systemFont(9);
        empty.textColor = colors.secondary;
        empty.lineLimit = 1;
      } else {
        const tileWidth = 100;
        const renderTile = (parent, item) => {
          const tile = this.createCard(parent, {
            padding: [2, 4, 2, 4],
            radius: 8,
            bg: "tile",
            borderColor: this.statusColor(item),
            borderWidth: 0.95,
          });
          tile.size = new Size(tileWidth, 39);

          const top = tile.addStack();
          top.layoutHorizontally();
          top.centerAlignContent();
          const symbol = SFSymbol.named("circle.fill");
          if (symbol?.image) {
            const dotIcon = top.addImage(symbol.image);
            dotIcon.imageSize = new Size(7, 7);
            dotIcon.tintColor = this.statusColor(item);
          } else {
            const fallbackDot = top.addText("●");
            fallbackDot.font = Font.boldSystemFont(7);
            fallbackDot.textColor = this.statusColor(item);
          }
          top.addSpacer(3);
          const name = top.addText(item.name);
          name.font = Font.boldSystemFont(7);
          name.textColor = colors.text;
          name.lineLimit = 1;
          top.addSpacer();
          const badgeTone =
            item.region === "国内" ? "domestic" : item.region === "AI" ? "ai" : "international";
          this.createBadge(top, this.serviceLabel(item), badgeTone, true);

          tile.addSpacer(1);
          const row = tile.addStack();
          row.layoutHorizontally();
          row.centerAlignContent();
          const latency = row.addText(item.ok ? this.latencyText(item.latencyMs) : "失败");
          latency.font = Font.boldSystemFont(7);
          latency.textColor = this.statusColor(item);
          latency.lineLimit = 1;
          row.addSpacer();
          const tail = row.addText(item.countryCode || item.statusText || "");
          tail.font = Font.systemFont(6.8);
          tail.textColor = colors.secondary;
          tail.lineLimit = 1;

          tile.addSpacer(1);
          const dots = tile.addStack();
          dots.layoutHorizontally();
          for (let i = 0; i < 5; i++) {
            const d = dots.addStack();
            d.size = new Size(5, 5);
            d.cornerRadius = 2.5;
            d.backgroundColor = this.dotColor(item, i);
            if (i < 4) dots.addSpacer(2);
          }
        };

        for (let r = 0; r < 2; r++) {
          const row = servicePanel.addStack();
          row.layoutHorizontally();
          const rowItems = services.slice(r * 3, r * 3 + 3);
          rowItems.forEach((item, idx) => {
            renderTile(row, item);
            if (idx < 2) row.addSpacer(5);
          });
          if (r === 0) servicePanel.addSpacer(1.5);
        }
      }
    } else {
      const empty = servicePanel.addText("服务检测未开启");
      empty.font = Font.systemFont(9);
      empty.textColor = colors.secondary;
      empty.lineLimit = 1;
    }
  }

  async renderError(widget, settings, error) {
    const colors = this.getColors();
    const root = this.createRoot(widget, true);
    const title = root.addText(settings.title);
    title.font = Font.boldSystemFont(13);
    title.textColor = colors.text;
    title.lineLimit = 1;
    root.addSpacer(8);
    const card = this.createCard(root, { padding: [10, 10, 10, 10], radius: 12, bg: "card" });
    const t = card.addText("加载失败");
    t.font = Font.boldSystemFont(13);
    t.textColor = colors.danger;
    t.lineLimit = 1;
    card.addSpacer(4);
    const m = card.addText(errToString(error));
    m.font = Font.systemFont(10);
    m.textColor = colors.secondary;
    m.lineLimit = 4;
  }

  async render() {
    const settings = this.getSettingsValue();
    const widget = new ListWidget();
    widget.setPadding(10, 10, 10, 10);
    this.hasBgImage = await this.getWidgetBackgroundImage(widget);
    this.transparentMode = this.hasBgImage === true || Boolean(widget.backgroundImage);
    this.appearanceMode = this.transparentMode
      ? "transparent"
      : Device.isUsingDarkAppearance()
        ? "dark"
        : "light";

    try {
      const result = await this.fetchNetworkInfoCached(settings);
      const data = result.data;
      const family = this.widgetFamily || config.widgetFamily || "medium";
      if (family === "small") {
        await this.renderSmall(widget, data, settings, result.fromCache, result.staleFallback);
      } else if (family === "large") {
        await this.renderLarge(widget, data, settings, result.fromCache, result.staleFallback);
      } else {
        await this.renderMedium(widget, data, settings, result.fromCache, result.staleFallback);
      }
    } catch (error) {
      await this.renderError(widget, settings, error);
    }

    return widget;
  }
}

await Runing(Widget, args.widgetParameter, false);
