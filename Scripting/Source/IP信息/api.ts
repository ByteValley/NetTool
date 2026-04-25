import { fetch } from "scripting"
import type { SkkIpInfoSettings } from "./settings"

declare const Storage: any

export type IpSourceKind = "domestic" | "international" | "cloudflare" | "ipv6"

export type IpSourceResult = {
  id: string
  name: string
  kind: IpSourceKind
  ok: boolean
  ip?: string
  countryCode?: string
  location?: string
  isp?: string
  asn?: string
  latencyMs?: number
  error?: string
  extra?: string
}

export type ServiceRegion = "国内" | "国际" | "AI" | "流媒体"

export type ServiceResult = {
  id: string
  name: string
  region: ServiceRegion
  ok: boolean
  latencyMs?: number
  status?: number
  countryCode?: string
  statusText?: string
  detail?: string
  error?: string
}

export type RiskInfo = {
  score: number
  level: "低" | "中" | "高"
  title: string
  items: string[]
}

export type NetworkInfoData = {
  updatedAt: number
  sources: IpSourceResult[]
  services: ServiceResult[]
  connectivity: ServiceResult[]
  risk: RiskInfo
  primaryDomestic?: IpSourceResult
  primaryInternational?: IpSourceResult
  primaryIPv6?: IpSourceResult
}

export type CachedNetworkInfoResult = {
  data: NetworkInfoData
  fromCache: boolean
  staleFallback?: boolean
  error?: string
}

type SourceFetcher = (timeoutMs: number) => Promise<Partial<IpSourceResult>>

const CACHE_KEY = "skkIpInfo.cache.v1"

const BASIC_SERVICE_TARGETS: Array<{
  id: string
  name: string
  region: ServiceRegion
  url: string
}> = [
  { id: "bytedance", name: "字节跳动", region: "国内", url: "https://www.bytedance.com/favicon.ico" },
  { id: "bilibili", name: "Bilibili", region: "国内", url: "https://www.bilibili.com/favicon.ico" },
  { id: "wechat", name: "微信", region: "国内", url: "https://weixin.qq.com/favicon.ico" },
  { id: "taobao", name: "淘宝", region: "国内", url: "https://www.taobao.com/favicon.ico" },
  { id: "github", name: "GitHub", region: "国际", url: "https://github.githubassets.com/favicons/favicon.svg" },
  { id: "jsdelivr", name: "jsDelivr", region: "国际", url: "https://cdn.jsdelivr.net/npm/@sukka/uuid@latest/package.json" },
  { id: "cloudflare", name: "Cloudflare", region: "国际", url: "https://www.cloudflare.com/cdn-cgi/trace" },
]

function errToString(error: any) {
  if (!error) return "unknown"
  if (typeof error === "string") return error
  if (error?.message) return String(error.message)
  return String(error)
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, label: string): Promise<T> {
  let timer: any
  const timeout = new Promise<T>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${label} timeout`)), timeoutMs)
  })
  return Promise.race([promise, timeout]).finally(() => {
    try {
      clearTimeout(timer)
    } catch {}
  })
}

async function fetchText(
  url: string,
  timeoutMs: number,
  options: any = {},
): Promise<{ text: string; status: number; headers: any }> {
  const response: any = await withTimeout(
    fetch(url, {
      headers: {
        Accept: "text/plain,application/json,*/*",
        "Accept-Language": "en",
        "User-Agent":
          "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15",
        ...(options.headers || {}),
      },
      method: options.method,
      body: options.body,
    } as any),
    timeoutMs,
    url,
  )
  const text = await withTimeout(response.text(), timeoutMs, `${url} body`)
  return { text, status: Number(response.status || 0), headers: response.headers || {} }
}

async function fetchJson(url: string, timeoutMs: number): Promise<any> {
  const { text } = await fetchText(url, timeoutMs)
  return JSON.parse(text)
}

function compact(parts: Array<string | null | undefined>) {
  const out: string[] = []
  for (const part of parts) {
    const s = String(part ?? "").trim()
    if (!s || s === "null" || s === "undefined") continue
    if (!out.includes(s)) out.push(s)
  }
  return out.join(" ")
}

function parseAsn(value: any) {
  const raw = String(value ?? "").trim()
  if (!raw) return ""
  const match = raw.match(/AS\s?(\d+)/i)
  return match ? `AS${match[1]}` : raw
}

function parseCloudflareTrace(text: string) {
  const data: Record<string, string> = {}
  text.split(/\n+/).forEach((line) => {
    const idx = line.indexOf("=")
    if (idx <= 0) return
    data[line.slice(0, idx)] = line.slice(idx + 1)
  })
  return data
}

async function source(
  id: string,
  name: string,
  kind: IpSourceKind,
  timeoutMs: number,
  loader: SourceFetcher,
): Promise<IpSourceResult> {
  const start = Date.now()
  try {
    const data = await loader(timeoutMs)
    const latencyMs = Date.now() - start
    return {
      id,
      name,
      kind,
      ok: Boolean(data.ip),
      latencyMs,
      ...data,
    }
  } catch (error) {
    return {
      id,
      name,
      kind,
      ok: false,
      latencyMs: Date.now() - start,
      error: errToString(error),
    }
  }
}

async function loadIpip(timeoutMs: number): Promise<Partial<IpSourceResult>> {
  const data = await fetchJson("https://myip.ipip.net/json", timeoutMs)
  const list = Array.isArray(data?.data?.location) ? data.data.location : []
  return {
    ip: data?.data?.ip,
    location: compact([list[0], list[1], list[2]]),
    isp: compact([list[4]]),
  }
}

async function loadBilibili(timeoutMs: number): Promise<Partial<IpSourceResult>> {
  const data = await fetchJson("https://api.bilibili.com/x/web-interface/zone", timeoutMs)
  const d = data?.data || {}
  return {
    ip: d.addr,
    countryCode: d.country_code ? String(d.country_code) : undefined,
    location: compact([d.country, d.province, d.city]),
    isp: d.isp,
  }
}

async function loadIpApi(timeoutMs: number): Promise<Partial<IpSourceResult>> {
  const data = await fetchJson("http://ip-api.com/json?lang=zh-CN", timeoutMs)
  if (data?.status && data.status !== "success") throw new Error("ip-api failed")
  return {
    ip: data?.query,
    countryCode: data?.countryCode,
    location: compact([data?.country, data?.regionName, data?.city]),
    isp: compact([data?.isp || data?.org]),
    asn: parseAsn(data?.as),
  }
}

async function loadIpSb(timeoutMs: number): Promise<Partial<IpSourceResult>> {
  const data = await fetchJson("https://api-ipv4.ip.sb/geoip", timeoutMs)
  return {
    ip: data?.ip,
    countryCode: data?.country_code,
    location: compact([data?.country, data?.region, data?.city]),
    isp: compact([data?.isp || data?.organization || data?.asn_organization]),
    asn: parseAsn(data?.asn),
  }
}

async function loadIpInfo(timeoutMs: number): Promise<Partial<IpSourceResult>> {
  const data = await fetchJson("https://ipinfo.io/json", timeoutMs)
  return {
    ip: data?.ip,
    countryCode: data?.country,
    location: compact([data?.country, data?.region, data?.city]),
    isp: data?.org,
    asn: parseAsn(data?.org),
  }
}

async function loadCloudflare(timeoutMs: number): Promise<Partial<IpSourceResult>> {
  const { text } = await fetchText("https://www.cloudflare.com/cdn-cgi/trace", timeoutMs)
  const data = parseCloudflareTrace(text)
  return {
    ip: data.ip,
    countryCode: data.loc,
    location: data.loc,
    isp: data.colo ? `Cloudflare ${data.colo}` : "Cloudflare",
    extra: compact([data.http, data.tls, data.warp === "on" ? "WARP" : ""]),
  }
}

async function loadIpv6IpSb(timeoutMs: number): Promise<Partial<IpSourceResult>> {
  const data = await fetchJson("https://api-ipv6.ip.sb/geoip", timeoutMs)
  return {
    ip: data?.ip,
    countryCode: data?.country_code,
    location: compact([data?.country, data?.region, data?.city]),
    isp: compact([data?.isp || data?.organization || data?.asn_organization]),
    asn: parseAsn(data?.asn),
  }
}

async function loadIpv6Plain(timeoutMs: number): Promise<Partial<IpSourceResult>> {
  const { text } = await fetchText("https://api6.ipify.org", timeoutMs)
  return { ip: text.trim() }
}

function getHeader(headers: any, name: string) {
  const lower = name.toLowerCase()
  try {
    if (headers?.get) return headers.get(name) || headers.get(lower) || ""
    for (const key of Object.keys(headers || {})) {
      if (key.toLowerCase() === lower) return String(headers[key] ?? "")
    }
  } catch {}
  return ""
}

function countryFromText(text: string) {
  const m =
    text.match(/loc=([A-Z]{2})/) ||
    text.match(/"countryCode"\s*:\s*"([A-Z]{2})"/i) ||
    text.match(/data-country=["']([A-Z]{2})["']/i)
  return m ? m[1].toUpperCase() : ""
}

function serviceState(ok: boolean, statusText = "") {
  if (!ok) return statusText || "不可达"
  return statusText || "可用"
}

async function service(
  id: string,
  name: string,
  region: ServiceRegion,
  timeoutMs: number,
  loader: (timeoutMs: number) => Promise<Partial<ServiceResult>>,
): Promise<ServiceResult> {
  const start = Date.now()
  try {
    const data = await loader(timeoutMs)
    return {
      id,
      name,
      region,
      ok: data.ok === true,
      latencyMs: Date.now() - start,
      statusText: serviceState(data.ok === true, data.statusText),
      ...data,
    }
  } catch (error) {
    return {
      id,
      name,
      region,
      ok: false,
      latencyMs: Date.now() - start,
      statusText: "不可达",
      error: errToString(error),
    }
  }
}

async function testBasicService(
  target: (typeof BASIC_SERVICE_TARGETS)[number],
  timeoutMs: number,
): Promise<ServiceResult> {
  return service(target.id, target.name, target.region, timeoutMs, async (ms) => {
    const r = await fetchText(target.url, ms)
    const ok = r.status === 0 || (r.status >= 200 && r.status < 500)
    return { ok, status: r.status, statusText: ok ? "可用" : `HTTP ${r.status}` }
  })
}

async function testYouTube(timeoutMs: number) {
  return service("youtube", "YouTube", "流媒体", timeoutMs, async (ms) => {
    const r = await fetchText("https://www.youtube.com/premium?hl=en", ms)
    const cc = countryFromText(r.text) || "US"
    return { ok: r.status >= 200 && r.status < 500, status: r.status, countryCode: cc, statusText: "可用" }
  })
}

async function testChatGPT(timeoutMs: number) {
  return service("chatgpt", "ChatGPT", "AI", timeoutMs, async (ms) => {
    const r = await fetchText("https://chatgpt.com/cdn-cgi/trace", ms)
    const cc = countryFromText(r.text)
    const ok = r.status >= 200 && r.status < 500 && Boolean(cc)
    return { ok, status: r.status, countryCode: cc, statusText: ok ? "可用" : "受限" }
  })
}

async function testOpenAIAPI(timeoutMs: number) {
  return service("openai_api", "OpenAI API", "AI", timeoutMs, async (ms) => {
    const r = await fetchText("https://api.openai.com/v1/models", ms)
    const cc = getHeader(r.headers, "cf-ipcountry").toUpperCase()
    const ok = r.status === 401 || r.status === 403 || (r.status >= 200 && r.status < 500)
    return { ok, status: r.status, countryCode: cc, statusText: ok ? "可达" : "不可达" }
  })
}

const NF_ORIGINAL = "80018499"
const NF_NON_ORIGINAL = "81280792"

function parseNetflixRegion(text: string, headers: any) {
  const origin = getHeader(headers, "x-originating-url") || getHeader(headers, "x-origining-url")
  const fromHeader = String(origin || "").match(/\/([A-Z]{2})(?:[-/]|$)/i)
  if (fromHeader) return fromHeader[1].toUpperCase()
  return countryFromText(text)
}

async function fetchNetflixTitle(id: string, timeoutMs: number) {
  return fetchText(`https://www.netflix.com/title/${id}`, timeoutMs)
}

async function testNetflix(timeoutMs: number) {
  return service("netflix", "Netflix", "流媒体", timeoutMs, async (ms) => {
    const r1 = await fetchNetflixTitle(NF_NON_ORIGINAL, ms)
    if (r1.status === 403) return { ok: false, status: r1.status, statusText: "区域受限" }
    if (r1.status === 404) {
      const r2 = await fetchNetflixTitle(NF_ORIGINAL, ms)
      if (r2.status === 200) {
        return {
          ok: true,
          status: r2.status,
          countryCode: parseNetflixRegion(r2.text, r2.headers),
          statusText: "仅自制",
          detail: "Originals",
        }
      }
      return { ok: false, status: r2.status, statusText: "区域受限" }
    }
    const ok = r1.status === 200
    return {
      ok,
      status: r1.status,
      countryCode: parseNetflixRegion(r1.text, r1.headers),
      statusText: ok ? "完整解锁" : `HTTP ${r1.status}`,
    }
  })
}

async function testDisney(timeoutMs: number) {
  return service("disney", "Disney+", "流媒体", timeoutMs, async (ms) => {
    const r = await fetchText("https://www.disneyplus.com/", ms, {
      headers: { "Accept-Language": "en" },
    })
    const blocked = /not\s+available|Sorry,\s*Disney\+\s*is\s*not\s*available/i.test(r.text || "")
    const ok = r.status === 200 && !blocked
    return {
      ok,
      status: r.status,
      countryCode: ok ? countryFromText(r.text) : "",
      statusText: ok ? "可用" : "区域受限",
    }
  })
}

async function testMax(timeoutMs: number) {
  return service("max", "Max", "流媒体", timeoutMs, async (ms) => {
    const r = await fetchText("https://www.max.com/", ms)
    const blocked = /not\s+available\s+in\s+your\s+region|country\s+not\s+supported/i.test(r.text || "")
    const ok = r.status >= 200 && r.status < 500 && !blocked
    return {
      ok,
      status: r.status,
      countryCode: ok ? countryFromText(r.text) : "",
      statusText: ok ? "可用" : "区域受限",
    }
  })
}

async function testSpotify(timeoutMs: number) {
  return service("spotify", "Spotify", "流媒体", timeoutMs, async (ms) => {
    const r = await fetchText("https://www.spotify.com/", ms)
    const ok = r.status >= 200 && r.status < 500
    return { ok, status: r.status, countryCode: countryFromText(r.text), statusText: ok ? "可用" : "不可达" }
  })
}

async function runServiceChecks(timeoutMs: number): Promise<ServiceResult[]> {
  const basic = BASIC_SERVICE_TARGETS.map((target) => testBasicService(target, timeoutMs))
  const unlock = [
    testYouTube(timeoutMs),
    testChatGPT(timeoutMs),
    testOpenAIAPI(timeoutMs),
    testNetflix(timeoutMs),
    testDisney(timeoutMs),
    testMax(timeoutMs),
    testSpotify(timeoutMs),
  ]
  return Promise.all([...basic, ...unlock])
}

function firstOk(sources: IpSourceResult[], kind: IpSourceKind) {
  return sources.find((item) => item.kind === kind && item.ok && item.ip)
}

function hasDatacenterSignal(source?: IpSourceResult) {
  const raw = `${source?.isp || ""} ${source?.asn || ""}`.toLowerCase()
  return /cloud|hosting|colo|datacenter|vps|server|amazon|aws|google|microsoft|azure|oracle|alibaba|tencent|digitalocean|vultr|hetzner|ovh|linode/.test(raw)
}

function countryOf(source?: IpSourceResult) {
  const cc = String(source?.countryCode || "").toUpperCase()
  return /^[A-Z]{2}$/.test(cc) ? cc : ""
}

function computeRisk(
  sources: IpSourceResult[],
  services: ServiceResult[],
  data: {
    primaryDomestic?: IpSourceResult
    primaryInternational?: IpSourceResult
    primaryIPv6?: IpSourceResult
  },
): RiskInfo {
  let score = 12
  const items: string[] = []

  const domestic = data.primaryDomestic
  const intl = data.primaryInternational
  const domesticIp = domestic?.ip || ""
  const intlIp = intl?.ip || ""

  if (domesticIp && intlIp && domesticIp !== intlIp) {
    score += 12
    items.push("国内/国际出口不一致")
  } else if (domesticIp && intlIp) {
    items.push("出口 IP 一致")
  }

  if (!data.primaryIPv6) {
    score += 6
    items.push("IPv6 不可用")
  }

  if (hasDatacenterSignal(intl)) {
    score += 18
    items.push("ASN 存在机房特征")
  }

  const intlCountry = countryOf(intl)
  const domesticCountry = countryOf(domestic)
  if (intlCountry && domesticCountry && intlCountry !== domesticCountry) {
    score += 8
    items.push("落地地区与国内探针不同")
  }

  const checked = services.filter((item) => item.region === "AI" || item.region === "流媒体")
  const failed = checked.filter((item) => !item.ok)
  if (checked.length && failed.length / checked.length >= 0.5) {
    score += 18
    items.push("主流服务受限较多")
  } else if (failed.length) {
    score += 8
    items.push("部分服务受限")
  }

  if (services.some((item) => item.id === "chatgpt" && !item.ok)) {
    score += 6
    items.push("ChatGPT 受限")
  }
  if (services.some((item) => item.id === "netflix" && !item.ok)) {
    score += 6
    items.push("Netflix 受限")
  }

  score = Math.max(0, Math.min(100, score))
  const level: RiskInfo["level"] = score >= 60 ? "高" : score >= 35 ? "中" : "低"
  return {
    score,
    level,
    title: level === "高" ? "风险偏高" : level === "中" ? "需要留意" : "状态良好",
    items: items.slice(0, 4),
  }
}

function cacheSignature(settings: SkkIpInfoSettings) {
  return JSON.stringify({
    v: 2,
    enableIPv6: settings.enableIPv6 !== false,
    enableConnectivity: settings.enableConnectivity !== false,
    timeoutMs: Math.max(1500, Math.min(15000, settings.timeoutMs || 6000)),
  })
}

function readCache(): { updatedAt: number; signature?: string; data: NetworkInfoData } | null {
  try {
    const raw = Storage?.get?.(CACHE_KEY)
    if (!raw) return null
    const parsed = typeof raw === "string" ? JSON.parse(raw) : raw
    if (!parsed || typeof parsed.updatedAt !== "number" || !parsed.data) return null
    return parsed
  } catch {
    return null
  }
}

function writeCache(data: NetworkInfoData, signature: string) {
  try {
    Storage?.set?.(CACHE_KEY, { updatedAt: Date.now(), signature, data })
  } catch {}
}

export async function fetchNetworkInfo(settings: SkkIpInfoSettings): Promise<NetworkInfoData> {
  const timeoutMs = Math.max(1500, Math.min(15000, settings.timeoutMs || 6000))
  const sourceTasks: Array<Promise<IpSourceResult>> = [
    source("ipip", "IPIP 国内", "domestic", timeoutMs, loadIpip),
    source("bilibili", "Bilibili 国内", "domestic", timeoutMs, loadBilibili),
    source("ipapi", "IP-API", "international", timeoutMs, loadIpApi),
    source("ipsb", "IP.SB", "international", timeoutMs, loadIpSb),
    source("cloudflare", "Cloudflare", "cloudflare", timeoutMs, loadCloudflare),
    source("ipinfo", "IPinfo.io", "international", timeoutMs, loadIpInfo),
  ]

  if (settings.enableIPv6) {
    sourceTasks.push(source("ipv6_ipsb", "IPv6 IP.SB", "ipv6", timeoutMs, loadIpv6IpSb))
    sourceTasks.push(source("ipv6_ipify", "IPv6 IPify", "ipv6", timeoutMs, loadIpv6Plain))
  }

  const sources = await Promise.all(sourceTasks)
  const services = settings.enableConnectivity ? await runServiceChecks(timeoutMs) : []
  const primaryDomestic = firstOk(sources, "domestic")
  const primaryInternational =
    firstOk(sources, "cloudflare") || firstOk(sources, "international")
  const primaryIPv6 = firstOk(sources, "ipv6")

  const data: NetworkInfoData = {
    updatedAt: Date.now(),
    sources,
    services,
    connectivity: services,
    primaryDomestic,
    primaryInternational,
    primaryIPv6,
    risk: computeRisk(sources, services, {
      primaryDomestic,
      primaryInternational,
      primaryIPv6,
    }),
  }

  if (!sources.some((item) => item.ok)) {
    throw new Error("所有 IP 探针均请求失败")
  }

  return data
}

export async function fetchNetworkInfoCached(
  settings: SkkIpInfoSettings,
): Promise<CachedNetworkInfoResult> {
  const cache = readCache()
  const signature = cacheSignature(settings)
  const cacheMs = Math.max(1, settings.cacheMinutes || 10) * 60 * 1000
  const cacheUsable = cache && cache.signature === signature
  const cacheFresh = cacheUsable && Date.now() - cache.updatedAt <= cacheMs

  if (settings.cacheEnabled && cacheFresh) {
    return { data: cache.data, fromCache: true }
  }

  try {
    const data = await fetchNetworkInfo(settings)
    if (settings.cacheEnabled) writeCache(data, signature)
    return { data, fromCache: false }
  } catch (error) {
    if (settings.cacheEnabled && cacheUsable && cache?.data) {
      return {
        data: cache.data,
        fromCache: true,
        staleFallback: true,
        error: errToString(error),
      }
    }
    throw error
  }
}
