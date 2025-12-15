// api.ts（交管 12123 API + 缓存 + 日志）

import { fetch } from "scripting"

// ✅ Storage 安全读写（与你现有 shared/utils/storage 保持一致）
import { safeGetObject, safeSet } from "./shared/utils/storage"

// ✅ 复用 settings 的缓存类型（避免重复定义）
import type { TrafficCacheSettings } from "./settings"

// API 配置
const API_PARAMS = {
  api1: "biz.vio.unhandledVioCount.query",
  infoURL: "https://miniappcsfw.122.gov.cn:8443/openapi/invokeApi/business/biz",
  productId: "p10000000000000000001",
  api2: "biz.user.integration.query",
}

// 数据类型定义（接口返回的数据结构）
export type TrafficData = {
  plateNumber: string
  drivingLicenseType: string
  renewalDate: string
  annualInspectionDate: string
  violationCount: number
  penaltyPoints: number
  recordInfo: string
  licenseStatus: string
  vehicleImageUrl?: string
}

// =======================
// 缓存（Storage）
// =======================
type TrafficCache = {
  updatedAt: number // ms
  data: TrafficData
}

// 你也可以改成更“语义化”的 key，比如 `${TRAFFIC_SETTINGS_KEY}:cache:data`
const TRAFFIC_CACHE_KEY = "traffic12123.cache.data.v1"

// 最低缓存 4 小时
const MIN_CACHE_MS = 4 * 60 * 60 * 1000

// 默认兜底：24 小时
const DEFAULT_MAX_STALE_MS = 24 * 60 * 60 * 1000

function readCache(): TrafficCache | null {
  const c = safeGetObject<TrafficCache | null>(TRAFFIC_CACHE_KEY, null)
  if (!c || typeof c !== "object") return null
  if (typeof (c as any).updatedAt !== "number") return null
  if (!(c as any).data) return null
  return c as TrafficCache
}

function writeCache(data: TrafficData) {
  const updatedAt = Date.now()
  const payload: TrafficCache = { updatedAt, data }
  safeSet(TRAFFIC_CACHE_KEY, payload)
  return updatedAt
}

function isFresh(updatedAt: number, ttlMs: number) {
  return Date.now() - updatedAt <= ttlMs
}

function isWithinStale(updatedAt: number, maxStaleMs: number) {
  return Date.now() - updatedAt <= maxStaleMs
}

function toMin(ms: number) {
  return Math.round(ms / 60000)
}

// =======================
// BoxJs：读 token
// =======================

// 从 BoxJs 读取 token（ComponentService -> 12123.Settings.token）
export async function fetchTokenFromBoxJs(boxJsUrl: string): Promise<string | null> {
  const boxKey = "ComponentService"

  try {
    const base = boxJsUrl.replace(/\/$/, "")
    const url = `${base}/query/data/${boxKey}`
    console.log("📡 从 BoxJs 读取交管 12123 token:", url)

    const response = await fetch(url, {
      headers: { Accept: "application/json" },
    })

    if (!response.ok) {
      console.error("❌ 从 BoxJs 读取 token 失败，状态码:", response.status)
      return null
    }

    const data = await response.json()
    const rawVal = data?.val
    if (!rawVal) {
      console.warn("⚠️ BoxJs 返回的 val 为空:", data)
      return null
    }

    let root: any
    try {
      root = typeof rawVal === "string" ? JSON.parse(rawVal) : rawVal
    } catch (e) {
      console.error("❌ 解析 BoxJs ComponentService JSON 失败:", e, "原始 val:", rawVal)
      return null
    }

    const token = root?.["12123"]?.Settings?.token
    if (token && typeof token === "string" && token.trim()) {
      console.log("✅ 从 BoxJs 成功读取交管 12123 token")
      return token.trim()
    } else {
      console.warn("⚠️ ComponentService.12123.Settings.token 不存在或格式不正确:", root)
      return null
    }
  } catch (error) {
    console.error("🚨 从 BoxJs 读取 token 异常:", error)
    return null
  }
}

function formatDate(dateStr: string): string {
  if (!dateStr) return "—"
  const parts = dateStr.split("-")
  if (parts.length >= 3) return `${parts[0]}-${parts[1]}-${parts[2]}`
  return dateStr
}

// =======================
// 原始：直连请求（不含缓存）
// =======================
export async function fetchTrafficData(token: string): Promise<TrafficData | null> {
  try {
    let tokenStr = token
    if (tokenStr.startsWith("params=")) tokenStr = tokenStr.replace("params=", "")

    // BoxJs 可能返回数组格式
    let actualTokenStr = tokenStr
    try {
      const parsed = JSON.parse(tokenStr)
      if (Array.isArray(parsed) && parsed.length > 0 && parsed[0].val) {
        actualTokenStr = parsed[0].val
      }
    } catch {
      // ignore
    }

    const body = JSON.parse(decodeURIComponent(actualTokenStr))
    const params = { sign: body.sign, verifyToken: body.verifyToken }

    // ===== 第一步：未处理违法数量 =====
    const requestBody1 = {
      api: API_PARAMS.api1,
      productId: API_PARAMS.productId,
      ...params,
    }
    const bodyStr1 = `params=${JSON.stringify(requestBody1)}`

    const violationResponse = await fetch(API_PARAMS.infoURL, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "User-Agent":
          "Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15",
      },
      body: bodyStr1,
    })

    if (!violationResponse.ok) return null

    const violationData = await violationResponse.json()
    if (!violationData.success) return null

    const illegal = violationData.data?.list?.[0] || {}
    const violationCount = parseInt(String(illegal.count || 0), 10) || 0

    // ===== 第二步：用户详情 =====
    const requestBody2 = {
      api: API_PARAMS.api2,
      productId: API_PARAMS.productId,
      ...params,
    }
    const bodyStr2 = `params=${encodeURIComponent(JSON.stringify(requestBody2))}`

    const detailsResponse = await fetch(API_PARAMS.infoURL, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "User-Agent":
          "Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15",
      },
      body: bodyStr2,
    })

    if (!detailsResponse.ok) return null

    const detailsData = await detailsResponse.json()
    if (!detailsData.success) return null

    const { drivingLicense, vehicles } = detailsData.data || {}
    const vehicle = vehicles?.[0] || {}

    const penaltyPoints = parseInt(String(drivingLicense?.cumulativePoint || 0), 10) || 0
    const licenseStatus =
      drivingLicense?.status === "A" ? "正常" : drivingLicense?.status || "正常"

    const data: TrafficData = {
      plateNumber: vehicle.plateNumber || "—",
      drivingLicenseType: drivingLicense?.allowToDrive || "—",
      renewalDate: formatDate(drivingLicense?.validityEnd || ""),
      annualInspectionDate: formatDate(vehicle.validPeriodEnd || ""),
      violationCount,
      penaltyPoints,
      recordInfo:
        `备案信息：${drivingLicense?.name || ""}, ` +
        `驾驶证状态(${licenseStatus}), ` +
        `${drivingLicense?.issueOrganizationName || ""}`,
      licenseStatus,
      vehicleImageUrl: vehicle.vehicleImageUrl,
    }

    return data
  } catch (e) {
    console.error("🚨 fetchTrafficData 异常:", e)
    return null
  }
}

// =======================
// 带缓存：按 settings.cache 全量生效 + 日志
// =======================

function ttlFromSettings(cache: TrafficCacheSettings, refreshIntervalMinutes?: number): number {
  const refreshMs =
    typeof refreshIntervalMinutes === "number" && Number.isFinite(refreshIntervalMinutes)
      ? Math.max(0, refreshIntervalMinutes) * 60 * 1000
      : 0

  const fixedMs =
    typeof cache.ttlMinutesFixed === "number" && Number.isFinite(cache.ttlMinutesFixed)
      ? Math.max(0, cache.ttlMinutesFixed) * 60 * 1000
      : 0

  const base = cache.ttlPolicy === "fixed" ? fixedMs : refreshMs
  return Math.max(MIN_CACHE_MS, base)
}

export type FetchTrafficCachedOptions = {
  refreshIntervalMinutes?: number
  cache?: TrafficCacheSettings
}

export type FetchTrafficCachedResult = {
  data: TrafficData | null
  fromCache: boolean
  cacheUpdatedAt?: number // ms
  ttlMs: number
  mode:
  | "cache_fresh"
  | "network_fresh"
  | "cache_stale_fallback"
  | "none"
  | "cache_only_hit"
  | "cache_only_miss"
  | "network_only"
  | "cache_disabled"
  meta?: {
    cacheEnabled: boolean
    cacheMode: string
    ttlPolicy: string
    ttlMinutes: number
    allowStaleOnError: boolean
    maxStaleMinutes: number
    cacheAgeMinutes?: number
    decision: string
  }
}

export async function fetchTrafficDataCached(
  token: string,
  options: FetchTrafficCachedOptions = {},
): Promise<FetchTrafficCachedResult> {
  // 没传就给个兜底默认（避免 caller 忘传 cache）
  const cacheSettings: TrafficCacheSettings = options.cache ?? {
    enabled: true,
    mode: "auto",
    ttlPolicy: "auto",
    ttlMinutesFixed: 360,
    allowStaleOnError: true,
    maxStaleMinutes: 1440,
  }

  const cacheEnabled = cacheSettings.enabled !== false
  const cacheMode =
    cacheSettings.mode === "auto" || cacheSettings.mode === "network_only" || cacheSettings.mode === "cache_only"
      ? cacheSettings.mode
      : "auto"
  const allowStaleOnError = cacheSettings.allowStaleOnError !== false

  const ttlMs = ttlFromSettings(cacheSettings, options.refreshIntervalMinutes)

  const maxStaleMs =
    typeof cacheSettings.maxStaleMinutes === "number" && Number.isFinite(cacheSettings.maxStaleMinutes)
      ? Math.max(0, cacheSettings.maxStaleMinutes) * 60 * 1000
      : DEFAULT_MAX_STALE_MS

  console.log(
    `🧠 Cache 设置消费：enabled=${cacheEnabled ? "Y" : "N"} | mode=${cacheMode} | ttlPolicy=${cacheSettings.ttlPolicy} | ttl=${toMin(ttlMs)}min | allowStale=${allowStaleOnError ? "Y" : "N"} | maxStale=${toMin(maxStaleMs)}min | refresh=${options.refreshIntervalMinutes ?? "n/a"}min`,
  )

  const cache = cacheEnabled ? readCache() : null
  const cacheAgeMs = cache ? Date.now() - cache.updatedAt : null
  const cacheAgeMin = cacheAgeMs != null ? toMin(cacheAgeMs) : undefined

  // ====== cache disabled：不读不写缓存，纯网络 ======
  if (!cacheEnabled) {
    console.log("🚫 Cache 已关闭：直接走网络，不读不写缓存")
    const fresh = await fetchTrafficData(token)
    return {
      data: fresh,
      fromCache: false,
      ttlMs,
      mode: fresh ? "cache_disabled" : "none",
      meta: {
        cacheEnabled: false,
        cacheMode,
        ttlPolicy: cacheSettings.ttlPolicy,
        ttlMinutes: toMin(ttlMs),
        allowStaleOnError,
        maxStaleMinutes: toMin(maxStaleMs),
        decision: fresh ? "cache_disabled -> network_ok" : "cache_disabled -> network_fail",
      },
    }
  }

  // ====== cache_only：只用缓存，不请求网络 ======
  if (cacheMode === "cache_only") {
    if (cache) {
      console.log(`🗂️ cache_only：命中缓存 | age=${cacheAgeMin}min`)
      return {
        data: cache.data,
        fromCache: true,
        cacheUpdatedAt: cache.updatedAt,
        ttlMs,
        mode: "cache_only_hit",
        meta: {
          cacheEnabled: true,
          cacheMode,
          ttlPolicy: cacheSettings.ttlPolicy,
          ttlMinutes: toMin(ttlMs),
          allowStaleOnError,
          maxStaleMinutes: toMin(maxStaleMs),
          cacheAgeMinutes: cacheAgeMin,
          decision: "cache_only -> hit",
        },
      }
    }

    console.warn("🕳️ cache_only：没有缓存，且不允许走网络 -> none")
    return {
      data: null,
      fromCache: false,
      ttlMs,
      mode: "cache_only_miss",
      meta: {
        cacheEnabled: true,
        cacheMode,
        ttlPolicy: cacheSettings.ttlPolicy,
        ttlMinutes: toMin(ttlMs),
        allowStaleOnError,
        maxStaleMinutes: toMin(maxStaleMs),
        decision: "cache_only -> miss",
      },
    }
  }

  // ====== network_only：强制走网络，不读缓存；默认仍写缓存（方便切回 auto 立刻命中） ======
  if (cacheMode === "network_only") {
    console.log("🌐 network_only：强制走网络（忽略读缓存），开始请求…")
    const fresh = await fetchTrafficData(token)
    if (fresh) {
      const updatedAt = writeCache(fresh)
      console.log("✅ network_only：接口成功，已写入缓存（便于后续切回 auto 命中）")
      return {
        data: fresh,
        fromCache: false,
        cacheUpdatedAt: updatedAt,
        ttlMs,
        mode: "network_only",
        meta: {
          cacheEnabled: true,
          cacheMode,
          ttlPolicy: cacheSettings.ttlPolicy,
          ttlMinutes: toMin(ttlMs),
          allowStaleOnError,
          maxStaleMinutes: toMin(maxStaleMs),
          decision: "network_only -> network_ok -> cache_written",
        },
      }
    }

    console.warn("❌ network_only：接口失败（忽略缓存读取）")
    return {
      data: null,
      fromCache: false,
      ttlMs,
      mode: "none",
      meta: {
        cacheEnabled: true,
        cacheMode,
        ttlPolicy: cacheSettings.ttlPolicy,
        ttlMinutes: toMin(ttlMs),
        allowStaleOnError,
        maxStaleMinutes: toMin(maxStaleMs),
        decision: "network_only -> network_fail",
      },
    }
  }

  // ====== auto：优先新鲜缓存，过期走网络；网络失败才兜底旧缓存 ======
  if (cache) {
    console.log(`🧠 Cache 存在：age=${cacheAgeMin}min | ttl=${toMin(ttlMs)}min`)
    if (isFresh(cache.updatedAt, ttlMs)) {
      console.log("🗂️ auto：命中新鲜缓存（跳过网络）")
      return {
        data: cache.data,
        fromCache: true,
        cacheUpdatedAt: cache.updatedAt,
        ttlMs,
        mode: "cache_fresh",
        meta: {
          cacheEnabled: true,
          cacheMode,
          ttlPolicy: cacheSettings.ttlPolicy,
          ttlMinutes: toMin(ttlMs),
          allowStaleOnError,
          maxStaleMinutes: toMin(maxStaleMs),
          cacheAgeMinutes: cacheAgeMin,
          decision: "auto -> cache_fresh",
        },
      }
    }
  } else {
    console.log(`🧠 Cache 不存在：ttl=${toMin(ttlMs)}min`)
  }

  console.log("🌐 auto：缓存过期/不存在，开始请求接口刷新…")
  const fresh = await fetchTrafficData(token)

  if (fresh) {
    const updatedAt = writeCache(fresh)
    console.log("✅ auto：接口成功，已更新缓存")
    return {
      data: fresh,
      fromCache: false,
      cacheUpdatedAt: updatedAt,
      ttlMs,
      mode: "network_fresh",
      meta: {
        cacheEnabled: true,
        cacheMode,
        ttlPolicy: cacheSettings.ttlPolicy,
        ttlMinutes: toMin(ttlMs),
        allowStaleOnError,
        maxStaleMinutes: toMin(maxStaleMs),
        decision: "auto -> network_ok -> cache_written",
      },
    }
  }

  console.warn("❌ auto：接口失败（可能 Token 过期/网络异常）")

  if (allowStaleOnError && cache && isWithinStale(cache.updatedAt, maxStaleMs)) {
    console.warn(`🧯 auto：回退旧缓存 | age=${cacheAgeMin}min`)
    return {
      data: cache.data,
      fromCache: true,
      cacheUpdatedAt: cache.updatedAt,
      ttlMs,
      mode: "cache_stale_fallback",
      meta: {
        cacheEnabled: true,
        cacheMode,
        ttlPolicy: cacheSettings.ttlPolicy,
        ttlMinutes: toMin(ttlMs),
        allowStaleOnError,
        maxStaleMinutes: toMin(maxStaleMs),
        cacheAgeMinutes: cacheAgeMin,
        decision: "auto -> network_fail -> stale_fallback",
      },
    }
  }

  console.error("⛔️ auto：无可用缓存（且接口失败）")
  return {
    data: null,
    fromCache: false,
    ttlMs,
    mode: "none",
    meta: {
      cacheEnabled: true,
      cacheMode,
      ttlPolicy: cacheSettings.ttlPolicy,
      ttlMinutes: toMin(ttlMs),
      allowStaleOnError,
      maxStaleMinutes: toMin(maxStaleMs),
      cacheAgeMinutes: cacheAgeMin,
      decision: "auto -> network_fail -> no_cache",
    },
  }
}