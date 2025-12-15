// api.ts（网上国网 / WSGW | 缓存 + 日志 + meta）

import { fetch } from "scripting"
import { safeGetObject, safeSet } from "./shared/utils/storage"

import {
  type SGCCSettings,
  defaultSGCCSettings,
  loadSGCCSettings,
  saveSGCCSettings,
} from "./settings"

import type { CacheConfig, CacheMode } from "./shared/ui-kit/cacheSection"

// --- 类型导出 ---
export { type SGCCSettings }
export const DEFAULT_SETTINGS = defaultSGCCSettings

export interface BarData {
  value: number
  level: number
  label?: string
}

// =======================
// 设置读写
// =======================
export function getSettings(): SGCCSettings {
  return loadSGCCSettings()
}
export function saveSettings(settings: SGCCSettings) {
  saveSGCCSettings(settings)
}

// =======================
// 缓存（Storage）
// =======================
type SGCCCache = {
  updatedAt: number // ms
  data: any
}

const SGCC_CACHE_KEY = "wsgw_sgcc.cache.data.v1"
const MIN_CACHE_MS = 4 * 60 * 60 * 1000
const DEFAULT_MAX_STALE_MS = 24 * 60 * 60 * 1000

function toMin(ms: number) {
  return Math.round(ms / 60000)
}

function clampRefreshMinutes(v: any): number {
  const n = Number(v)
  if (!Number.isFinite(n) || n <= 0) return 180
  // 与你 widget.tsx 里一致：最小 60 分钟
  return Math.max(60, Math.floor(n))
}

function readCache(): SGCCCache | null {
  const c = safeGetObject<SGCCCache | null>(SGCC_CACHE_KEY, null)
  if (!c || typeof c !== "object") return null
  if (typeof (c as any).updatedAt !== "number") return null
  if (!("data" in (c as any))) return null
  return c as SGCCCache
}

function writeCache(data: any) {
  const updatedAt = Date.now()
  const payload: SGCCCache = { updatedAt, data }
  safeSet(SGCC_CACHE_KEY, payload)
  return updatedAt
}

function isFresh(updatedAt: number, ttlMs: number) {
  return Date.now() - updatedAt <= ttlMs
}

function isWithinStale(updatedAt: number, maxStaleMs: number) {
  return Date.now() - updatedAt <= maxStaleMs
}

// =======================
// 超时工具：避免 fetch “挂死”
// =======================
function withTimeout<T>(p: Promise<T>, ms: number, tag: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`${tag} timeout after ${ms}ms`))
    }, ms)
    p.then(
      (v) => {
        clearTimeout(timer)
        resolve(v)
      },
      (e) => {
        clearTimeout(timer)
        reject(e)
      },
    )
  })
}

// =======================
// 网络请求（fetch 必须双参）
// =======================
const API_URL_HTTP =
  "http://api.wsgw-rewrite.com/electricity/bill/all?monthElecQuantity=1&dayElecQuantity31=1&stepElecQuantity=1&eleBill=1"

async function fetchJson(url: string): Promise<any | null> {
  console.log(`🌐 WSGW 请求：GET ${url}`)
  const resp = await fetch(url, {
    method: "GET",
    headers: { Accept: "application/json" },
  })
  if (!resp) return null
  if (!resp.ok) {
    console.warn(`❌ WSGW 响应失败：status=${(resp as any).status}`)
    return null
  }
  const json = await resp.json()
  return json ?? null
}

async function fetchSGCCAllFromNetwork(): Promise<any | null> {
  const TIMEOUT_MS = 4500
  try {
    const data = await withTimeout(fetchJson(API_URL_HTTP), TIMEOUT_MS, "WSGW(http)")
    if (data) return data
  } catch (e) {
    console.warn("⚠️ WSGW http 请求失败/超时：", String(e))
  }
  return null
}

// =======================
// TTL 计算（统一接入 CacheConfig）
// =======================
function ttlFromCacheSettings(cache: CacheConfig, refreshIntervalMinutes?: number): number {
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

// =======================
// 数据获取（带缓存）
// =======================
export type FetchSGCCCachedOptions = {
  // 兼容你旧调用：强制刷新
  forceRefresh?: boolean

  // 允许传入 refresh，避免外面重复计算
  refreshIntervalMinutes?: number

  // ✅ 统一缓存配置（来自 settings.cache）
  cache?: CacheConfig
}

export type FetchSGCCCachedResult = {
  data: any
  updatedAt: number
  fromCache: boolean
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
    cacheMode: CacheMode
    ttlPolicy: "auto" | "fixed"
    ttlMinutes: number
    allowStaleOnError: boolean
    maxStaleMinutes: number
    cacheAgeMinutes?: number
    forceRefresh: boolean
    decision: string
  }
}

export async function getElectricityData(
  options: FetchSGCCCachedOptions = {},
): Promise<FetchSGCCCachedResult> {
  const settings = getSettings()

  const refreshMinutes =
    typeof options.refreshIntervalMinutes === "number" && Number.isFinite(options.refreshIntervalMinutes)
      ? Math.max(0, options.refreshIntervalMinutes)
      : clampRefreshMinutes((settings as any)?.refreshInterval)

  // 没传 cache 就用 settings.cache（再没有就兜底默认）
  const cacheSettings: CacheConfig =
    options.cache ??
    (settings as any).cache ??
    defaultSGCCSettings.cache

  const cacheEnabled = cacheSettings.enabled !== false
  const cacheMode: CacheMode = (cacheSettings.mode ?? "auto") as CacheMode
  const allowStaleOnError = cacheSettings.allowStaleOnError !== false

  const ttlMs = ttlFromCacheSettings(cacheSettings, refreshMinutes)

  const maxStaleMs =
    typeof cacheSettings.maxStaleMinutes === "number" && Number.isFinite(cacheSettings.maxStaleMinutes)
      ? Math.max(0, cacheSettings.maxStaleMinutes) * 60 * 1000
      : DEFAULT_MAX_STALE_MS

  const forceRefresh = options.forceRefresh === true

  console.log(
    `🧠 WSGW Cache 设置消费：enabled=${cacheEnabled ? "Y" : "N"} | mode=${cacheMode} | ttlPolicy=${cacheSettings.ttlPolicy} | ttl=${toMin(ttlMs)}min | allowStale=${allowStaleOnError ? "Y" : "N"} | maxStale=${toMin(maxStaleMs)}min | refresh=${refreshMinutes}min | force=${forceRefresh ? "Y" : "N"}`,
  )

  const cache = cacheEnabled ? readCache() : null
  const cacheAgeMs = cache ? Date.now() - cache.updatedAt : null
  const cacheAgeMin = cacheAgeMs != null ? toMin(cacheAgeMs) : undefined

  // ====== cache disabled：不读不写缓存，纯网络 ======
  if (!cacheEnabled) {
    console.log("🚫 WSGW Cache 已关闭：直接走网络，不读不写缓存")
    const fresh = await fetchSGCCAllFromNetwork()
    return {
      data: fresh ?? [],
      updatedAt: Date.now(),
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
        forceRefresh,
        decision: fresh ? "cache_disabled -> network_ok" : "cache_disabled -> network_fail",
      },
    }
  }

  // ====== cache_only：只用缓存，不请求网络 ======
  if (cacheMode === "cache_only") {
    if (cache) {
      console.log(`🗂️ WSGW cache_only：命中缓存 | age=${cacheAgeMin}min`)
      return {
        data: cache.data,
        updatedAt: cache.updatedAt,
        fromCache: true,
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
          forceRefresh,
          decision: "cache_only -> hit",
        },
      }
    }

    console.warn("🕳️ WSGW cache_only：没有缓存，且不允许走网络 -> none")
    return {
      data: [],
      updatedAt: Date.now(),
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
        forceRefresh,
        decision: "cache_only -> miss",
      },
    }
  }

  // ====== network_only：强制走网络（默认仍写缓存，方便切回 auto 直接命中） ======
  if (cacheMode === "network_only") {
    console.log("🌐 WSGW network_only：强制走网络（忽略读缓存），开始请求…")
    const fresh = await fetchSGCCAllFromNetwork()
    if (fresh) {
      const updatedAt = writeCache(fresh)
      console.log("✅ WSGW network_only：接口成功，已写入缓存（便于后续切回 auto）")
      return {
        data: fresh,
        updatedAt,
        fromCache: false,
        ttlMs,
        mode: "network_only",
        meta: {
          cacheEnabled: true,
          cacheMode,
          ttlPolicy: cacheSettings.ttlPolicy,
          ttlMinutes: toMin(ttlMs),
          allowStaleOnError,
          maxStaleMinutes: toMin(maxStaleMs),
          forceRefresh,
          decision: "network_only -> network_ok -> cache_written",
        },
      }
    }

    console.warn("❌ WSGW network_only：接口失败（忽略缓存读取）")
    return {
      data: [],
      updatedAt: Date.now(),
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
        forceRefresh,
        decision: "network_only -> network_fail",
      },
    }
  }

  // ====== auto：优先新鲜缓存；过期走网络；网络失败才兜底旧缓存 ======
  if (cache) {
    console.log(`🧠 WSGW Cache 存在：age=${cacheAgeMin}min | ttl=${toMin(ttlMs)}min`)
    if (!forceRefresh && isFresh(cache.updatedAt, ttlMs)) {
      console.log("🗂️ WSGW auto：命中新鲜缓存（跳过网络）")
      return {
        data: cache.data,
        updatedAt: cache.updatedAt,
        fromCache: true,
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
          forceRefresh,
          decision: "auto -> cache_fresh",
        },
      }
    }
  } else {
    console.log(`🧠 WSGW Cache 不存在：ttl=${toMin(ttlMs)}min`)
  }

  console.log("🌐 WSGW auto：缓存过期/不存在（或 force），开始请求接口刷新…")
  const fresh = await fetchSGCCAllFromNetwork()

  if (fresh) {
    const updatedAt = writeCache(fresh)
    console.log("✅ WSGW auto：接口成功，已更新缓存")
    return {
      data: fresh,
      updatedAt,
      fromCache: false,
      ttlMs,
      mode: "network_fresh",
      meta: {
        cacheEnabled: true,
        cacheMode,
        ttlPolicy: cacheSettings.ttlPolicy,
        ttlMinutes: toMin(ttlMs),
        allowStaleOnError,
        maxStaleMinutes: toMin(maxStaleMs),
        forceRefresh,
        decision: "auto -> network_ok -> cache_written",
      },
    }
  }

  console.warn("❌ WSGW auto：接口失败（或超时）")

  if (allowStaleOnError && cache && isWithinStale(cache.updatedAt, maxStaleMs)) {
    console.warn(`🧯 WSGW auto：回退旧缓存 | age=${cacheAgeMin}min`)
    return {
      data: cache.data,
      updatedAt: cache.updatedAt,
      fromCache: true,
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
        forceRefresh,
        decision: "auto -> network_fail -> stale_fallback",
      },
    }
  }

  console.error("⛔️ WSGW auto：无可用缓存（且接口失败/超时）")
  return {
    data: [],
    updatedAt: Date.now(),
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
      forceRefresh,
      decision: "auto -> network_fail -> no_cache",
    },
  }
}

export async function getAccountData(forceRefresh = false): Promise<any> {
  const settings = getSettings()

  // ✅ 这里你原来写的是 refreshInterval，但 clamp 用的是 refreshInterval
  // 你上面 clampRefreshMinutes 里注释说与 widget.tsx 一致
  // 这里保持你的字段：refreshInterval
  const refreshMinutes = clampRefreshMinutes((settings as any).refreshInterval)

  const result = await getElectricityData({
    forceRefresh,
    refreshIntervalMinutes: refreshMinutes,
    cache: (settings as any).cache,
  })

  const allData = result.data
  const updatedAt = result.updatedAt

  // ✅ 关键：统一整理 meta，明确 fromCache/mode/updatedAt
  const cacheMeta = {
    ...(result.meta || {}),
    fromCache: result.fromCache === true,
    mode: result.mode,
    updatedAt: result.updatedAt,
  }

  if (Array.isArray(allData) && allData.length > 0) {
    const index = Math.min(
      Math.max(0, Number((settings as any).accountIndex) || 0),
      allData.length - 1,
    )

    return {
      ...allData[index],
      lastUpdateTime: updatedAt,
      __cacheMeta: cacheMeta,
    }
  }

  return {
    eleBill: { sumMoney: "0.00" },
    arrearsOfFees: false,
    stepElecQuantity: [],
    monthElecQuantity: { dataInfo: {}, mothEleList: [] },
    dayElecQuantity31: { sevenEleList: [] },
    lastUpdateTime: updatedAt,
    __cacheMeta: cacheMeta,
  }
}

// =======================
// 业务逻辑处理（保持原样）
// =======================
export function processBarChartData(data: any, settings: SGCCSettings): BarData[] {
  const { oneLevelPq, twoLevelPq, barCount, dimension } = settings

  const monthlyData: { yearTotal: number; monthElec: number; level: number }[] = []
  let yearTotal = 0

  const mothEleList = data.monthElecQuantity?.mothEleList || []

  for (const { monthEleNum } of mothEleList) {
    const n = Number(monthEleNum || 0)
    yearTotal += n
    const level = yearTotal > twoLevelPq ? 3 : yearTotal > oneLevelPq ? 2 : 1
    monthlyData.push({ yearTotal, monthElec: n, level })
  }

  let barData: BarData[] = []

  if (dimension === "monthly") {
    barData = monthlyData.map(({ monthElec, level }) => ({ value: monthElec, level }))
  } else {
    const sevenEleList = data.dayElecQuantity31?.sevenEleList || []
    const currentYear = new Date().getFullYear()

    for (const { day, dayElePq } of sevenEleList) {
      if (dayElePq && !isNaN(Number(dayElePq))) {
        const match = String(day).match(/^(\d{4})\D?(\d{2})/)
        if (match) {
          const year = Number(match[1])
          const month = Number(match[2])
          let level = 1

          if (currentYear === year) {
            const safeIndex = Math.max(0, Math.min(monthlyData.length - 1, month - 1))
            level = monthlyData[safeIndex]?.level || 1
          }

          barData.unshift({ value: Number(dayElePq), level, label: day })
        }
      }
    }
  }

  return barData.slice(-Number(barCount) || 7)
}

export function extractDisplayData(data: any) {
  const balance = data.eleBill?.sumMoney || "0.00"
  const hasArrear = !!data.arrearsOfFees

  let lastBill = "0.00"
  let lastUsage = "0"

  if (data.monthElecQuantity?.mothEleList?.length > 0) {
    const list = data.monthElecQuantity.mothEleList
    const last = list[list.length - 1]
    if (last) {
      lastBill = last.monthEleCost || last.cost || last.eleCost || "0.00"
      lastUsage = last.monthEleNum || last.eleNum || last.usage || "0"
    }
  } else if (data.stepElecQuantity?.[0]?.electricParticulars) {
    const p = data.stepElecQuantity[0].electricParticulars
    lastBill = p.totalAmount || "0.00"
    lastUsage = p.totalPq || "0"
  }

  const yearBill = data.monthElecQuantity?.dataInfo?.totalEleCost || "0"
  const yearUsage = data.monthElecQuantity?.dataInfo?.totalEleNum || "0"

  let totalYearPq = 0
  if (data.stepElecQuantity?.[0]?.electricParticulars) {
    totalYearPq = Number(data.stepElecQuantity[0].electricParticulars.totalYearPq || 0)
  }

  return {
    balance,
    hasArrear,
    lastBill,
    lastUsage,
    yearBill,
    yearUsage,
    totalYearPq,
    lastUpdateTime: data.lastUpdateTime,
  }
}