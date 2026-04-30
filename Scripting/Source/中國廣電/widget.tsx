/* =====================================================================
 * widget.tsx（中国广电 / CBN）
 *
 * 模块分类 · 背景
 * - 业务职责：拉 10099 数据 + 解析 + 组装统一 CarrierData
 * - UI：复用联通同款 WidgetRoot / 卡片组件
 * - 缓存：Storage meta + documents 单文件 data
 * ===================================================================== */

import { Widget, Text, WidgetReloadPolicy, fetch } from "scripting"

import { WidgetRoot, CarrierData } from "./shared/carrier/widgetRoot"
import { nowHHMM } from "./shared/carrier/utils/carrierUtils"
import { pickUiSettings } from "./shared/carrier/ui"

import {
  SETTINGS_KEY,
  BROADNET_DATA_CACHE_KEY,
  BROADNET_LOGO_URL,
  BROADNET_LOGO_CACHE_KEY,
  type ChinaBroadnetSettings,
  loadChinaBroadnetSettings,
  resolveRefreshInterval,
  defaultChinaBroadnetSettings,
} from "./settings"

import { safeGetObject, safeSetObject } from "./shared/utils/storage"
import { readJsonFromSingleFile, writeJsonToSingleFileAtomic, getCachedImagePath } from "./shared/utils/fileCache"
import { kv, errToString, srcLabel } from "./shared/utils/widgetKit"

const API_URL = "https://wx.10099.com.cn/contact-web/api/busi/qryUserInfo"

const COMMON_HEADERS = {
  "content-type": "application/json",
  "User-Agent":
    "Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 MicroMessenger/8.0.62(0x18003e39) NetType/WIFI Language/zh_CN",
  Referer: "https://servicewechat.com/wxfa72ff5488bbd1d9/120/page-frame.html",
  "Accept-Encoding": "gzip,compress,br,deflate",
}

type BroadnetBoxMeta = {
  updatedAt: number
  keyFp: string
  dataFileName: string
  baseDir: "documents" | "library" | "temporary"
}

const CBN_DATA_FILE = "broadnet_data.json"
const CBN_DATA_BAK = "broadnet_data.bak.json"

function fingerprint(raw: string): string {
  const s = String(raw ?? "")
  let hash = 5381
  for (let i = 0; i < s.length; i++) hash = ((hash << 5) + hash) ^ s.charCodeAt(i)
  return `djb2:${(hash >>> 0).toString(36)}`
}

function toMin(ms: number) {
  return Math.round(ms / 60000)
}

function isWithin(ms: number, now: number, ts: number): boolean {
  return now - ts <= ms
}

type NormalizedCache = {
  enabled: boolean
  mode: "auto" | "cache_only" | "network_only" | "cache_disabled"
  ttlPolicy: "auto" | "fixed"
  ttlMinutesFixed: number
  allowStaleOnError: boolean
  maxStaleMinutes: number
  allowStaleOnKeyMismatch: boolean
}

function normalizeCache(settings: ChinaBroadnetSettings): NormalizedCache {
  const base = (defaultChinaBroadnetSettings.cache ?? {}) as any
  const raw = (settings.cache ?? {}) as any

  const enabled = raw.enabled !== false
  const mode =
    raw.mode === "cache_only" || raw.mode === "network_only" || raw.mode === "cache_disabled" || raw.mode === "auto"
      ? raw.mode
      : (base.mode ?? "auto")

  const ttlPolicy = raw.ttlPolicy === "fixed" || raw.ttlPolicy === "auto" ? raw.ttlPolicy : (base.ttlPolicy ?? "auto")

  const ttlMinutesFixed =
    typeof raw.ttlMinutesFixed === "number" && Number.isFinite(raw.ttlMinutesFixed)
      ? raw.ttlMinutesFixed
      : (base.ttlMinutesFixed ?? 360)

  const allowStaleOnError = raw.allowStaleOnError !== false
  const maxStaleMinutes =
    typeof raw.maxStaleMinutes === "number" && Number.isFinite(raw.maxStaleMinutes)
      ? raw.maxStaleMinutes
      : (base.maxStaleMinutes ?? 1440)

  const allowStaleOnKeyMismatch = raw.allowStaleOnKeyMismatch !== false

  return {
    enabled,
    mode,
    ttlPolicy,
    ttlMinutesFixed,
    allowStaleOnError,
    maxStaleMinutes,
    allowStaleOnKeyMismatch,
  }
}

function computeTtlMs(cache: NormalizedCache, refreshIntervalMinutes: number): number {
  const refreshMs = Math.max(5, refreshIntervalMinutes || 180) * 60 * 1000
  if (cache.ttlPolicy === "fixed") return Math.max(1, cache.ttlMinutesFixed) * 60 * 1000
  return Math.max(4 * 60 * 60 * 1000, refreshMs)
}

function boundKeyFromSettings(settings: ChinaBroadnetSettings, credentials?: BroadnetCredentials): string {
  const k = String(settings.cacheScopeKey || "").trim()
  const access = String(credentials?.access ?? settings.access ?? "").trim()
  return k ? k : `${SETTINGS_KEY}:${access}`
}

function readBroadnetCache(
  boundKey: string,
  allowKeyMismatch: boolean,
): { meta: BroadnetBoxMeta; data: CarrierData; keyMatched: boolean } | null {
  const meta = safeGetObject<BroadnetBoxMeta | null>(BROADNET_DATA_CACHE_KEY, null)
  if (!meta) return null

  if (typeof meta.updatedAt !== "number" || !Number.isFinite(meta.updatedAt)) return null
  if (typeof meta.dataFileName !== "string" || !meta.dataFileName) return null
  if (meta.baseDir !== "documents" && meta.baseDir !== "library" && meta.baseDir !== "temporary") return null
  if (typeof meta.keyFp !== "string" || !meta.keyFp) return null

  const wantFp = fingerprint(boundKey)
  const keyMatched = meta.keyFp === wantFp
  if (!keyMatched && !allowKeyMismatch) return null

  const hit = readJsonFromSingleFile<CarrierData>({
    dataFileName: meta.dataFileName,
    baseDir: meta.baseDir,
    backupFileName: CBN_DATA_BAK,
  })

  if (!hit?.data) return null
  return { meta, data: hit.data, keyMatched }
}

function writeBroadnetCache(boundKey: string, data: CarrierData): number {
  const ok = writeJsonToSingleFileAtomic({
    dataFileName: CBN_DATA_FILE,
    backupFileName: CBN_DATA_BAK,
    baseDir: "documents",
    data,
  })
  if (!ok) throw new Error("writeJsonToSingleFileAtomic failed")

  const now = Date.now()
  const meta: BroadnetBoxMeta = {
    updatedAt: now,
    keyFp: fingerprint(boundKey),
    dataFileName: CBN_DATA_FILE,
    baseDir: "documents",
  }
  safeSetObject(BROADNET_DATA_CACHE_KEY, meta)
  return now
}

function presentMessage(message: string, reloadPolicy: WidgetReloadPolicy) {
  Widget.present(<Text>{message}</Text>, reloadPolicy)
}

type BroadnetCredentials = {
  access: string
  bodyData: string
}

async function fetchCredentialsFromBoxJs(boxJsUrl: string): Promise<BroadnetCredentials | null> {
  const boxKey = "ComponentService"

  try {
    const base = String(boxJsUrl || "").replace(/\/$/, "")
    const url = `${base}/query/data/${boxKey}`
    console.log("📡 凭证 | 读取 BoxJS：ComponentService.ChinaBroadnet.Settings")

    const response = await fetch(url, { headers: { Accept: "application/json" } })
    if (!response.ok) {
      console.warn(`⚠️ 凭证 | BoxJS HTTP 失败：status=${response.status}`)
      return null
    }

    const data = await response.json()
    const rawVal = data?.val
    if (!rawVal) {
      console.warn("⚠️ 凭证 | BoxJS 返回 val 为空")
      return null
    }

    let root: any
    try {
      root = typeof rawVal === "string" ? JSON.parse(rawVal) : rawVal
    } catch (e) {
      console.warn(`⚠️ 凭证 | BoxJS val JSON 解析失败：${errToString(e)}`)
      return null
    }

    const settings = root?.ChinaBroadnet?.Settings
    const access = String(settings?.Access || "").trim()
    const bodyData = String(settings?.BodyData || "").trim()

    if (access && bodyData) {
      console.log("✅ 凭证 | BoxJS 命中")
      return { access, bodyData }
    }

    console.warn("⚠️ 凭证 | BoxJS 未找到完整 ChinaBroadnet.Settings")
    return null
  } catch (e) {
    console.warn(`⚠️ 凭证 | BoxJS 异常：${errToString(e)}`)
    return null
  }
}

type BroadnetApiResponse = {
  data?: {
    userData?: {
      packName?: string
      finBalance?: string
      fee?: string | number
      flowAll?: string | number
      flowUserd?: string | number
      flow?: string | number
      voiceAll?: string | number
      voiceUsed?: string | number
      voice?: string | number
      iconImg?: string
      rules?: {
        flowBalance?: string
      }
    }
  }
}

function fen2yuan(fen: unknown): string {
  if (fen == null) return "--"
  const v = Number(fen) / 100
  if (!Number.isFinite(v)) return "--"
  return v.toFixed(2)
}

function kbToMB(kb: number): number {
  if (!Number.isFinite(kb)) return 0
  return kb / 1024
}

function parseBroadnetData(json: BroadnetApiResponse): CarrierData | null {
  const ud = json?.data?.userData
  if (!ud) return null

  const feeBalance = ud.finBalance ?? (ud.fee != null ? fen2yuan(ud.fee) : "--")

  const flowAllKbRaw = Number(ud.flowAll ?? 0)
  const flowUsedKbRaw = Number(ud.flowUserd ?? 0)
  const flowLeftKbRaw = Number(ud.flow ?? Math.max(0, flowAllKbRaw - flowUsedKbRaw))
  const flowLeftMb = kbToMB(Number.isFinite(flowLeftKbRaw) ? flowLeftKbRaw : 0)

  let flowTotalMB = kbToMB(Number.isFinite(flowAllKbRaw) ? flowAllKbRaw : 0)
  let flowUsedMB = kbToMB(Number.isFinite(flowUsedKbRaw) ? flowUsedKbRaw : 0)

  if (flowTotalMB <= 0 && flowLeftMb > 0) {
    flowTotalMB = flowLeftMb
    flowUsedMB = 0
  } else if (flowTotalMB > 0) {
    flowUsedMB = Math.max(0, flowTotalMB - flowLeftMb)
  }

  const voiceAllRaw = Number(ud.voiceAll ?? 0)
  const voiceUsedRaw = Number(ud.voiceUsed ?? 0)
  const voiceLeftRaw = Number(ud.voice ?? Math.max(0, voiceAllRaw - voiceUsedRaw))

  let voiceTotal = Number.isFinite(voiceAllRaw) ? voiceAllRaw : 0
  let voiceUsed = Number.isFinite(voiceUsedRaw) ? voiceUsedRaw : 0
  const voiceLeft = Number.isFinite(voiceLeftRaw) ? voiceLeftRaw : 0

  if (voiceTotal <= 0 && voiceLeft > 0) {
    voiceTotal = voiceLeft
    voiceUsed = 0
  }

  return {
    fee: {
      title: "话费余额",
      balance: String(feeBalance),
      unit: "元",
    },
    voice: {
      title: "剩余语音",
      balance: String(voiceLeft),
      unit: "分钟",
      used: voiceUsed,
      total: voiceTotal,
    },
    flow: {
      title: ud.packName ? `${ud.packName}流量` : "通用流量",
      balance: String(flowLeftMb),
      unit: "MB",
      used: flowUsedMB,
      total: flowTotalMB,
    },
    updateTime: nowHHMM(),
  }
}

async function fetchBroadnetData(credentials: BroadnetCredentials): Promise<CarrierData | null> {
  const access = String(credentials.access || "").trim()
  const bodyData = String(credentials.bodyData || "").trim()

  if (!access || !bodyData) return null

  try {
    console.log(`🌐 请求 | 广电：POST ${API_URL}`)
    const response = await fetch(API_URL, {
      method: "POST",
      headers: { ...COMMON_HEADERS, access },
      body: JSON.stringify({ data: bodyData }),
    })

    if (!response.ok) {
      console.warn(`⚠️ 请求 | 广电 HTTP 失败：status=${response.status}`)
      return null
    }

    const json = (await response.json()) as BroadnetApiResponse
    const data = parseBroadnetData(json)
    if (!data) {
      console.warn("⚠️ 解析 | 广电 userData 为空")
      return null
    }

    console.log(
      `📦 广电 | fee=${data.fee.balance}${data.fee.unit}` +
        ` | flow=${data.flow.balance}${data.flow.unit}` +
        ` | voice=${data.voice.balance}${data.voice.unit}`,
    )
    return data
  } catch (e) {
    console.warn(`⚠️ 请求 | 广电异常：${errToString(e)}`)
    return null
  }
}

async function render() {
  const t0 = Date.now()

  const settings = loadChinaBroadnetSettings()
  const cache = normalizeCache(settings)
  const ui = pickUiSettings(settings)

  const refreshInterval = resolveRefreshInterval(settings.refreshInterval, 180)
  const nextUpdate = new Date(Date.now() + refreshInterval * 60 * 1000)
  const reloadPolicy: WidgetReloadPolicy = { policy: "after", date: nextUpdate }

  const enableBoxJs = !!settings.enableBoxJs
  const boxJsUrl = String(settings.boxJsUrl ?? "").trim()
  let credentials: BroadnetCredentials = {
    access: String(settings.access || "").trim(),
    bodyData: String(settings.bodyData || "").trim(),
  }

  if (enableBoxJs && boxJsUrl) {
    const box = await fetchCredentialsFromBoxJs(boxJsUrl)
    if (box) {
      credentials = box
      console.log("✅ 凭证 | source=BoxJS")
    } else {
      console.warn("⚠️ 凭证 | BoxJS 失败，回退手动设置")
      console.log(`✅ 凭证 | source=${credentials.access && credentials.bodyData ? "Settings" : "None"}`)
    }
  } else {
    console.log(`✅ 凭证 | source=${credentials.access && credentials.bodyData ? "Settings" : "None"}`)
  }

  const hasCredentials = !!(credentials.access && credentials.bodyData)

  console.log(`🚀 组件启动 | carrier=CBN | refresh=${refreshInterval}m`)
  console.log(
    `⚙️ 配置读取 | ${kv({
      hasCredentials: hasCredentials ? "Y" : "N",
      enableBoxJs: enableBoxJs ? "Y" : "N",
      boxJsUrl: boxJsUrl ? "Y" : "N",
      cacheEnabled: cache.enabled ? "Y" : "N",
      cacheMode: cache.mode,
      ttlPolicy: cache.ttlPolicy,
      ttlFixed: cache.ttlMinutesFixed,
      allowStale: cache.allowStaleOnError ? "Y" : "N",
      maxStale: cache.maxStaleMinutes,
      allowKeyMismatch: cache.allowStaleOnKeyMismatch ? "Y" : "N",
    })}`,
  )

  const ttlMs = computeTtlMs(cache, refreshInterval)
  const boundKey = boundKeyFromSettings(settings, credentials)
  const boundKeyShort = fingerprint(boundKey).slice(0, 12)

  const hit = cache.enabled && cache.mode !== "cache_disabled" ? readBroadnetCache(boundKey, cache.allowStaleOnKeyMismatch) : null
  const meta = hit?.meta ?? null
  const cached = hit?.data ?? null

  const cacheAgeMin = meta?.updatedAt ? toMin(Date.now() - meta.updatedAt) : undefined
  const keyMatched = hit ? hit.keyMatched : undefined
  const fresh = !!meta?.updatedAt && isWithin(ttlMs, Date.now(), meta.updatedAt)

  console.log(
    `🧠 缓存策略：` +
      `启用=${cache.enabled ? "Y" : "N"}` +
      `｜模式=${cache.mode}` +
      `｜TTL=${toMin(ttlMs)}分钟` +
      `｜当前缓存=${cacheAgeMin == null ? "-" : `${cacheAgeMin}分钟`}` +
      `｜keyMatched=${keyMatched === undefined ? "-" : keyMatched ? "Y" : "N"}` +
      `｜boundKey=${boundKeyShort}`,
  )

  let cachedData: CarrierData | null = null
  let decision = "none"

  if (!cache.enabled || cache.mode === "cache_disabled") {
    decision = "cache_disabled(read_off)"
  } else if (cache.mode === "cache_only") {
    if (cached) {
      cachedData = cached
      decision = keyMatched ? "cache_only -> hit" : "cache_only -> hit(key_mismatch_reuse)"
    } else {
      decision = "cache_only -> miss"
    }
  } else if (cache.mode !== "network_only") {
    if (cached && fresh) {
      cachedData = cached
      decision = keyMatched ? "auto -> cache_fresh" : "auto -> cache_fresh(key_mismatch_reuse)"
    } else {
      decision = "auto -> need_network"
    }
  } else {
    decision = "network_only -> need_network"
  }

  const logoPath = await getCachedImagePath({
    url: BROADNET_LOGO_URL,
    cacheKey: BROADNET_LOGO_CACHE_KEY,
    filePrefix: "broadnet_logo",
    fileExt: "png",
    baseDir: "documents",
  })

  if (cachedData) {
    console.log(`🧠 缓存决策：${decision} | age=${cacheAgeMin ?? "-"}min`)

    const tag = fresh ? "缓存" : "缓存(旧)"
    const dataForRender: CarrierData = { ...cachedData, updateTime: `${nowHHMM()}·${tag}` }

    console.log(
      `✅ 渲染完成 | run=${nowHHMM()} | src=${srcLabel("local", true)} | cost=${Date.now() - t0}ms | decision=${decision}`,
    )
    Widget.present(<WidgetRoot data={dataForRender} ui={ui} logoPath={logoPath} />, reloadPolicy)
    return
  }

  if (cache.enabled && cache.mode === "cache_only") {
    console.warn("⚠️ 缓存决策：cache_only -> miss（无可用缓存）")
    presentMessage("⚠️ 无可用缓存（cache_only）", reloadPolicy)
    return
  }

  if (!hasCredentials) {
    presentMessage("请先在主应用中设置广电 Access 和 data。", reloadPolicy)
    return
  }

  const networkData = await fetchBroadnetData(credentials)

  if (!networkData) {
    console.warn("⚠️ 网络失败 | broadnet=N")

    if (cache.enabled && cache.allowStaleOnError && cached && meta?.updatedAt) {
      const maxStaleMs = Math.max(1, cache.maxStaleMinutes) * 60 * 1000
      const within = isWithin(maxStaleMs, Date.now(), meta.updatedAt)

      console.warn(
        `🧠 缓存决策：网络失败 → ${within ? "启用兜底缓存" : "兜底失败(过期)"} | ` +
          `age=${cacheAgeMin ?? "-"}min | maxStale=${toMin(maxStaleMs)}min`,
      )

      if (within) {
        const dataForRender: CarrierData = { ...cached, updateTime: `${nowHHMM()}·兜底缓存` }

        console.log(
          `✅ 渲染完成 | run=${nowHHMM()} | src=${srcLabel("local", true)} | cost=${Date.now() - t0}ms | decision=stale_fallback`,
        )
        Widget.present(<WidgetRoot data={dataForRender} ui={ui} logoPath={logoPath} />, reloadPolicy)
        return
      }
    }

    presentMessage("获取广电数据失败，请检查网络或凭证。", reloadPolicy)
    return
  }

  try {
    const cacheUpdatedAt = writeBroadnetCache(boundKey, networkData)
    console.log(`💾 写缓存成功 | updatedAt=${cacheUpdatedAt} | boundKey=${fingerprint(boundKey).slice(0, 12)}`)
  } catch (e) {
    console.warn(`⚠️ 写缓存异常 | ${errToString(e)}`)
  }

  console.log(
    `✅ 渲染完成 | run=${nowHHMM()} | src=${srcLabel("network", false)} | cost=${Date.now() - t0}ms | decision=network_ok`,
  )
  Widget.present(<WidgetRoot data={networkData} ui={ui} logoPath={logoPath} />, reloadPolicy)
}

render()
