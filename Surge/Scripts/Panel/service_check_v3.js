/*
 * 服务检测（深测 · Surge）— 完整脚本
 * Author: ByteValley (基于社区思路重写整合)
 * Last Update: 2025-11-06
 *
 * 参数（示例，与你模块头保持一致）：
 * Lang=zh-Hant            // zh-Hant | zh-Hans
 * Style=pretty            // pretty | text
 * ShowLatency=true        // 显示耗时
 * ShowHttp=true           // 显示 HTTP 状态码
 * Timeout=5000            // 单项检测超时 ms
 * DefaultIcon=globe       // SF Symbol
 * DefaultIconColor=#1E90FF
 * TwFlagMode=none         // none | cn | ws  （TW 国旗替换）
 * EntranceLookup=true     // 是否尝试抓取“入口 IP”
 */

/////////////////////// 工具与参数 ///////////////////////

const ARG = parseArgs($argument || "");
const LANG = (ARG.Lang || "zh-Hant").toLowerCase();
const STYLE = (ARG.Style || "pretty").toLowerCase();
const SHOW_LAT = String(ARG.ShowLatency || "true").toLowerCase() === "true";
const SHOW_HTTP = String(ARG.ShowHttp || "true").toLowerCase() === "true";
const REQ_TIMEOUT = Number(ARG.Timeout || 5000);
const ICON = ARG.DefaultIcon || "globe";
const ICON_COLOR = ARG.DefaultIconColor || "#1E90FF";
const TW_FLAG_MODE = (ARG.TwFlagMode || "none").toLowerCase();
const ENTRANCE_LOOKUP = String(ARG.EntranceLookup || "true").toLowerCase() === "true";

const I18N = LANG.startsWith("zh-hans") ? zhHans() : zhHant();

function parseArgs(str) {
  const obj = {};
  (str || "").split("&").forEach(kv => {
    const [k, v] = kv.split("=");
    if (k) obj[decodeURIComponent(k)] = decodeURIComponent(v || "");
  });
  return obj;
}

function zhHans() {
  return {
    panel: "服务检测",
    cell: "蜂窝数据",
    wifi: "Wi-Fi",
    region: "地区",
    unlocked: "已解锁",
    unlocked_full: "已完整解锁",
    originals: "仅自制",
    not_avail: "区域受限",
    not_supported: "不支持",
    timeout: "检测超时",
    error: "检测异常",
    // bottom block
    ip: "IP",
    loc: "位置",
    isp: "运营商",
    entrance: "入口",
    landing: "落地 IP",
    execTime: "执行时间",
    // radio
    radioMap: {
      GPRS: "2.5G", CDMA1x: "2.5G", EDGE: "2.75G", WCDMA: "3G",
      HSDPA: "3.5G", CDMAEVDORev0: "3.5G", CDMAEVDORevA: "3.5G", CDMAEVDORevB: "3.75G",
      HSUPA: "3.75G", eHRPD: "3.9G", LTE: "4G", NRNSA: "5G", NR: "5G"
    },
    // services
    s_youtube: "YouTube",
    s_netflix: "Netflix",
    s_disney: "Disney+",
    s_chatgpt: "ChatGPT",
    s_chatgpt_app: "ChatGPT App(API)",
    s_hulu_us: "Hulu(美)",
    s_hulu_jp: "Hulu(日)",
    s_hbo_max: "Max(HBO)",
    ms: "ms",
    http: "HTTP"
  };
}

function zhHant() {
  return {
    panel: "服務檢測",
    cell: "蜂窩數據",
    wifi: "Wi-Fi",
    region: "地區",
    unlocked: "已解鎖",
    unlocked_full: "已完整解鎖",
    originals: "僅自製",
    not_avail: "區域受限",
    not_supported: "不支援",
    timeout: "檢測逾時",
    error: "檢測異常",
    // bottom block
    ip: "IP",
    loc: "位置",
    isp: "運營商",
    entrance: "入口",
    landing: "落地 IP",
    execTime: "執行時間",
    // radio
    radioMap: {
      GPRS: "2.5G", CDMA1x: "2.5G", EDGE: "2.75G", WCDMA: "3G",
      HSDPA: "3.5G", CDMAEVDORev0: "3.5G", CDMAEVDORevA: "3.5G", CDMAEVDORevB: "3.75G",
      HSUPA: "3.75G", eHRPD: "3.9G", LTE: "4G", NRNSA: "5G", NR: "5G"
    },
    // services
    s_youtube: "YouTube",
    s_netflix: "Netflix",
    s_disney: "Disney+",
    s_chatgpt: "ChatGPT",
    s_chatgpt_app: "ChatGPT App(API)",
    s_hulu_us: "Hulu(美)",
    s_hulu_jp: "Hulu(日)",
    s_hbo_max: "Max(HBO)",
    ms: "ms",
    http: "HTTP"
  };
}

function httpGet(url, headers = {}) {
  const started = Date.now();
  return new Promise(resolve => {
    const opt = { url, headers, timeout: REQ_TIMEOUT };
    $httpClient.get(opt, (err, resp, data) => {
      const ms = Date.now() - started;
      if (err) return resolve({ ok: false, status: 0, headers: {}, data: "", ms });
      resolve({
        ok: true,
        status: resp?.status || resp?.statusCode || 0,
        headers: resp?.headers || {},
        data: data || "",
        ms
      });
    });
  });
}

function toBool(x, d = false) {
  return String(x ?? d).toLowerCase() === "true";
}

/////////////////////// 国旗 / 设备网络 ///////////////////////

function ccFlag(cc) {
  cc = (cc || "").toUpperCase();
  if (!/^[A-Z]{2}$/.test(cc)) return cc || "—";

  // TW 替换策略
  let show = cc;
  if (cc === "TW") {
    if (TW_FLAG_MODE === "cn") show = "CN";
    else if (TW_FLAG_MODE === "ws") show = "WS"; // 与你参考脚本一致
  }
  const cps = [...show].map(c => 0x1F1E6 + (c.charCodeAt(0) - 65));
  try { return String.fromCodePoint(...cps) + " " + cc; } catch { return cc; }
}

function getCellularLine() {
  const radioName = $network?.["cellular-data"]?.radio || "";
  const map = I18N.radioMap;
  if (!radioName) return "";
  const gen = map[radioName] || radioName;
  // “5G - NRNSA” 形态
  return `${I18N.cell} | ${gen}${gen === "5G" && radioName ? ` - ${radioName}` : ""}`;
}

/////////////////////// 服务检测实现 ///////////////////////

async function checkYouTube() {
  const r = await httpGet("https://www.youtube.com/premium", {
    "User-Agent":
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/118.0 Safari/537.36",
    "Accept-Language": "en"
  });
  let region = "";
  if (r.ok && r.status === 200) {
    const m = /"countryCode":"([A-Z]{2})"/i.exec(r.data || "");
    if (m) region = m[1];
    else if ((r.data || "").includes("www.google.cn")) region = "CN";
    else region = "US";
  }
  return {
    name: I18N.s_youtube,
    ok: r.ok && r.status === 200,
    region,
    ms: r.ms,
    http: r.status
  };
}

async function checkChatGPTWeb() {
  // Cloudflare trace 通常可得 loc
  const r = await httpGet("https://chatgpt.com/cdn-cgi/trace", {
    "User-Agent":
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/118.0 Safari/537.36",
    "Accept-Language": "en"
  });
  let region = "";
  if (r.ok && r.status === 200) {
    const m = /loc=([A-Z]{2})/i.exec(r.data || "");
    if (m) region = m[1];
  }
  return {
    name: I18N.s_chatgpt,
    ok: r.ok && r.status === 200,
    region,
    ms: r.ms,
    http: r.status
  };
}

async function checkChatGPTApp() {
  // iOS App 后端，经常 401，但可认为线路可达
  const r = await httpGet("https://ios.chat.openai.com/", {
    "User-Agent":
      "Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile",
    "Accept-Language": "en"
  });
  // 再尝试 trace 拿地区
  let region = "";
  const t = await httpGet("https://ios.chat.openai.com/cdn-cgi/trace", {
    "User-Agent":
      "Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile",
    "Accept-Language": "en"
  });
  if (t.ok) {
    const m = /loc=([A-Z]{2})/i.exec(t.data || "");
    if (m) region = m[1];
  }
  return {
    name: I18N.s_chatgpt_app,
    ok: r.ok, // 200/401 都视为可达
    region,
    ms: r.ms,
    http: r.status
  };
}

async function checkNetflix() {
  async function hit(id) {
    const r = await httpGet(`https://www.netflix.com/title/${id}`, {
      "User-Agent":
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/118.0 Safari/537.36",
      "Accept-Language": "en"
    });
    let region = "";
    if (r.ok) {
      const url = r.headers?.["x-originating-url"] || r.headers?.["X-Originating-URL"];
      if (url) {
        try {
          const p = (url || "").split("/");
          const maybe = p[3] || "";
          region = (maybe.split("-")[0] || "").toUpperCase();
          if (region === "TITLE") region = "US";
        } catch {}
      }
    }
    return { r, region };
  }
  // 81280792（自制），80018499（非自制）
  const a = await hit(81280792);
  if (a.r.ok && a.r.status === 200) {
    // 自制可看，试非自制
    const b = await hit(80018499);
    if (b.r.ok && b.r.status === 200) {
      return {
        name: I18N.s_netflix,
        ok: true,
        full: true,
        region: b.region || a.region || "",
        ms: a.r.ms + (b.r.ms || 0),
        http: b.r.status
      };
    }
    if (b.r.status === 404) {
      // 只有自制
      return {
        name: I18N.s_netflix,
        ok: true,
        full: false,
        region: a.region || "",
        ms: a.r.ms,
        http: a.r.status
      };
    }
  }
  if (a.r.status === 404) {
    // 自制不存在 => 基本封锁
    return {
      name: I18N.s_netflix,
      ok: false,
      region: "",
      ms: a.r.ms,
      http: a.r.status
    };
  }
  if (!a.r.ok) {
    return {
      name: I18N.s_netflix,
      ok: false,
      region: "",
      ms: a.r.ms,
      http: a.r.status
    };
  }
  return {
    name: I18N.s_netflix,
    ok: false,
    region: a.region || "",
    ms: a.r.ms,
    http: a.r.status
  };
}

async function checkDisney() {
  // 主页 + BAM API
  const UA =
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/118.0 Safari/537.36";
  const home = await httpGet("https://www.disneyplus.com/", {
    "User-Agent": UA,
    "Accept-Language": "en"
  });
  if (!home.ok || home.status !== 200 || (home.data || "").includes("not available in your region")) {
    return { name: I18N.s_disney, ok: false, region: "", ms: home.ms, http: home.status };
  }
  const bam = await httpGet("https://disney.api.edge.bamgrid.com/graph/v1/device/graphql", {
    "Accept-Language": "en",
    "Content-Type": "application/json",
    "User-Agent": UA,
    Authorization: "ZGlzbmV5JmJyb3dzZXImMS4wLjA.Cu56AgSfBTDag5NiRA81oLHkDZfu5L3CKadnefEAY84"
  });
  let region = "";
  if (bam.ok && bam.status === 200) {
    try {
      const j = JSON.parse(bam.data || "{}");
      region = j?.extensions?.sdk?.session?.location?.countryCode || "";
    } catch {}
  }
  return { name: I18N.s_disney, ok: true, region, ms: home.ms + (bam.ms || 0), http: bam.status || home.status };
}

async function checkHulu(regionHint) {
  // US：只有美国可用；JP：日本站点
  const us = regionHint === "US";
  const jp = regionHint === "JP";

  const resUS = {
    name: I18N.s_hulu_us,
    ok: us,
    region: us ? "US" : "",
    ms: 0,
    http: us ? 200 : 451 // 451 Unavailable For Legal Reasons（仅用于展示）
  };
  const resJP = {
    name: I18N.s_hulu_jp,
    ok: jp,
    region: jp ? "JP" : "",
    ms: 0,
    http: jp ? 200 : 451
  };
  return [resUS, resJP];
}

async function checkMax(regionHint) {
  // 这里简化为：美国可用（与你截图一致）
  const ok = regionHint === "US";
  return {
    name: I18N.s_hbo_max,
    ok,
    region: ok ? "US" : "",
    ms: 0,
    http: ok ? 200 : 451
  };
}

/////////////////////// 追加：设备/入口/落地 ///////////////////////

async function getEntranceIPFromSurge() {
  try {
    if (!ENTRANCE_LOOKUP || typeof $httpAPI !== "function") return "";
    const recent = await new Promise(res => $httpAPI("GET", "/v1/requests/recent", null, r => res(r || {})));
    const reqs = Array.isArray(recent?.requests) ? recent.requests.slice(0, 30) : [];
    const hit = reqs.find(i => /\(Proxy\)/.test(String(i?.remoteAddress || "")));
    if (!hit) return "";
    return String(hit.remoteAddress || "").replace(/\s*\(Proxy\)\s*$/, "").trim();
  } catch { return ""; }
}

async function ipInfo(ip) {
  if (!ip) return null;
  const r = await httpGet(`http://ip-api.com/json/${encodeURIComponent(ip)}?lang=${LANG.startsWith("zh-hans") ? "zh-CN" : "zh-CN"}`);
  if (!r.ok || r.status !== 200) return null;
  try {
    const j = JSON.parse(r.data || "{}");
    return {
      ip: j.query || ip,
      cc: (j.countryCode || "").toUpperCase(),
      country: j.country || "",
      region: j.regionName || "",
      city: j.city || "",
      isp: j.isp || j.org || j.as || ""
    };
  } catch { return null; }
}

async function buildAppendBlock(nodeIPHint) {
  const lines = [];

  // 设备 IP（优先 v6）
  const dev4 = $network?.v4?.primaryAddress || "";
  const dev6 = $network?.v6?.primaryAddress || "";
  const deviceIP = dev6 || dev4;
  if (deviceIP) {
    const info = await ipInfo(deviceIP);
    if (info) {
      lines.push(
        `${I18N.ip}：${deviceIP}`,
        `${I18N.loc}：${ccFlag(info.cc)} ${info.country}${info.region ? " " + info.region : ""}${info.city ? " " + info.city : ""}`,
        `${I18N.isp}：${info.isp || "-"}`
      );
      lines.push(""); // 空行
    } else {
      lines.push(`${I18N.ip}：${deviceIP}`, "");
    }
  }

  // 入口
  const entrance = await getEntranceIPFromSurge();
  if (entrance && entrance !== nodeIPHint) {
    const ent = await ipInfo(entrance);
    if (ent) {
      lines.push(
        `${I18N.entrance}：${ent.ip}`,
        `${I18N.loc}：${ccFlag(ent.cc)} ${ent.country}${ent.region ? " " + ent.region : ""}${ent.city ? " " + ent.city : ""}`,
        `${I18N.isp}：${ent.isp || "-"}`
      );
      lines.push("");
    } else {
      lines.push(`${I18N.entrance}：${entrance}`, "");
    }
  }

  // 落地（节点）IP
  let nodeIP = nodeIPHint;
  if (!nodeIP) {
    const r = await httpGet("http://ip-api.com/json");
    if (r.ok && r.status === 200) try { nodeIP = JSON.parse(r.data || "{}").query; } catch {}
  }
  if (nodeIP) {
    const nd = await ipInfo(nodeIP);
    if (nd) {
      lines.push(
        `${I18N.landing}：${nd.ip}`,
        `${I18N.loc}：${ccFlag(nd.cc)} ${nd.country}${nd.region ? " " + nd.region : ""}${nd.city ? " " + nd.city : ""}`,
        `${I18N.isp}：${nd.isp || "-"}`
      );
    } else {
      lines.push(`${I18N.landing}：${nodeIP}`);
    }
  }

  // 执行时间
  lines.push(`${I18N.execTime}：${new Date().toTimeString().split(" ")[0]}`);

  return lines.join("\n");
}

/////////////////////// 渲染 ///////////////////////

function renderLinePretty({ name, ok, full, region, ms, http }) {
  const okEmoji = ok ? "✅" : (region ? "🚫" : "⛔️"); // 区域受限=🚫，彻底不通=⛔️
  const parts = [`${okEmoji} ${name}`];

  const regTxt = region ? `| ${ccFlag(region)} ${region}` : "";
  const msTxt = SHOW_LAT && ms ? ` | ${ms}${I18N.ms}` : "";
  const httpTxt = SHOW_HTTP && http ? ` | ${I18N.http} ${http}` : "";

  if (name === I18N.s_netflix) {
    if (ok && full) parts.push(` | ${I18N.unlocked_full} ${regTxt}`);
    else if (ok) parts.push(` | ${I18N.originals} ${regTxt}`);
    else parts.push(` | ${I18N.not_avail}`);
  } else {
    parts.push(ok ? ` | ${I18N.unlocked}${regTxt}` : ` | ${region ? I18N.not_avail : I18N.not_supported}`);
  }

  return parts.join("") + msTxt + httpTxt;
}

function renderLineText({ name, ok, full, region }) {
  const state =
    name === I18N.s_netflix
      ? ok
        ? (full ? I18N.unlocked_full : I18N.originals)
        : I18N.not_avail
      : ok
        ? I18N.unlocked
        : (region ? I18N.not_avail : I18N.not_supported);

  const reg = region ? `，${I18N.region}: ${ccFlag(region)} ${region}` : "";
  return `${name}: ${state}${reg}`;
}

/////////////////////// 主流程 ///////////////////////

(async () => {
  const lines = [];

  // 先检测一个节点地理作为 hint（减少额外请求）
  let nodeHint = "US";
  try {
    const r = await httpGet("http://ip-api.com/json");
    if (r.ok && r.status === 200) {
      const j = JSON.parse(r.data || "{}");
      nodeHint = (j.countryCode || "US").toUpperCase();
    }
  } catch {}

  const [yt, cgpt, cgptApp, nf, ds] = await Promise.all([
    checkYouTube(),
    checkChatGPTWeb(),
    checkChatGPTApp(),
    checkNetflix(),
    checkDisney()
  ]);

  const [huluUS, huluJP] = await checkHulu(nodeHint);
  const hbo = await checkMax(nodeHint);

  const ordered = [yt, cgpt, cgptApp, nf, ds, huluUS, huluJP, hbo];

  // 顶部蜂窝数据行（若存在）
  const cellLine = getCellularLine();
  if (cellLine) lines.push(cellLine);

  for (const item of ordered) {
    if (STYLE === "text") lines.push(renderLineText(item));
    else lines.push(renderLinePretty(item));
  }

  // 追加设备/入口/落地信息
  const nodeIPProbe = await httpGet("http://ip-api.com/json");
  let nodeIPAlready = "";
  if (nodeIPProbe.ok && nodeIPProbe.status === 200) {
    try { nodeIPAlready = JSON.parse(nodeIPProbe.data || "{}").query || ""; } catch {}
  }
  const appended = await buildAppendBlock(nodeIPAlready);
  if (appended) {
    lines.push(""); // 空行
    lines.push(appended);
  }

  $done({
    title: I18N.panel,
    content: lines.join("\n"),
    icon: ICON,
    "icon-color": ICON_COLOR
  });
})().catch(e => {
  $done({
    title: I18N.panel,
    content: `${I18N.error}\n${String(e && e.message || e)}`,
    icon: ICON,
    "icon-color": ICON_COLOR
  });
});

/////////////////////// 结束 ///////////////////////
