// settings.ts（网上国网 / WSGW）

import type { SGCCWidgetStyleKey } from "./styles/registry"
import type { CacheConfig, CacheMode } from "./shared/ui-kit/cacheSection"

declare const Storage: any

// Storage Keys
export const SETTINGS_KEY = "sgccSettings"
export const FULLSCREEN_KEY = "sgccSettingsFullscreen"

// 刷新间隔选项（分钟）
export const SGCC_REFRESH_OPTIONS = [
  { label: "1 小时", value: 60 },
  { label: "3 小时（推荐）", value: 180 },
  { label: "6 小时", value: 360 },
  { label: "12 小时", value: 720 },
]

// 图表显示数量选项
export const SGCC_BARCOUNT_OPTIONS = [
  { label: "近 7 条", value: 7 },
  { label: "近 15 条", value: 15 },
  { label: "近 30 条", value: 30 },
]

export type SGCCDimension = "daily" | "monthly"

export type SGCCSettings = {
  accountIndex: number
  dimension: SGCCDimension
  barCount: number
  oneLevelPq: number
  twoLevelPq: number
  refreshInterval: number // minutes
  widgetStyle: SGCCWidgetStyleKey

  // ✅ 缓存策略（统一接入 CacheSection）
  cache: CacheConfig
}

export const defaultSGCCSettings: SGCCSettings = {
  accountIndex: 0,
  dimension: "daily",
  barCount: 7,
  oneLevelPq: 2160,
  twoLevelPq: 4800,
  refreshInterval: 180,
  widgetStyle: "classic",

  cache: {
    enabled: true,
    mode: "auto" as CacheMode,

    // auto：ttl=max(4h, refreshInterval)
    ttlPolicy: "auto",
    // fixed 时用
    ttlMinutesFixed: 360, // 6h

    // 接口失败允许兜底旧缓存
    allowStaleOnError: true,
    maxStaleMinutes: 1440, // 24h
  },
}

export { SGCC_WIDGET_STYLE_OPTIONS } from "./styles/registry"

// ========== Storage helpers（兼容 Storage 存 string / object 两种） ==========

function safeGetAny(key: string): any {
  try {
    return Storage.get(key)
  } catch {
    return null
  }
}

function clampNumber(v: any, fallback: number, min = 0, max = Number.POSITIVE_INFINITY) {
  const n = typeof v === "number" && Number.isFinite(v) ? v : Number(v)
  const nn = Number.isFinite(n) ? n : fallback
  return Math.min(max, Math.max(min, nn))
}

function normalizeMode(v: any): CacheMode {
  if (v === "auto" || v === "network_only" || v === "cache_only") return v
  return defaultSGCCSettings.cache.mode
}

function normalizeTtlPolicy(v: any): "auto" | "fixed" {
  if (v === "auto" || v === "fixed") return v
  return defaultSGCCSettings.cache.ttlPolicy
}

function normalizeCache(raw: any): CacheConfig {
  const merged: CacheConfig = {
    ...defaultSGCCSettings.cache,
    ...(raw && typeof raw === "object" ? raw : {}),
  }

  merged.enabled = merged.enabled !== false
  merged.mode = normalizeMode((merged as any).mode)
  merged.ttlPolicy = normalizeTtlPolicy((merged as any).ttlPolicy)
  merged.ttlMinutesFixed = clampNumber(
    (merged as any).ttlMinutesFixed,
    defaultSGCCSettings.cache.ttlMinutesFixed,
    0,
  )
  merged.allowStaleOnError = merged.allowStaleOnError !== false
  merged.maxStaleMinutes = clampNumber(
    (merged as any).maxStaleMinutes,
    defaultSGCCSettings.cache.maxStaleMinutes,
    0,
  )

  return merged
}

export function loadSGCCSettings(): SGCCSettings {
  const raw = safeGetAny(SETTINGS_KEY)
  if (!raw) return { ...defaultSGCCSettings }

  let obj: any = null

  // 1) 若已是对象
  if (typeof raw === "object") {
    obj = raw
  }

  // 2) 若是字符串（旧版 JSON.stringify）
  if (!obj && typeof raw === "string") {
    try {
      const parsed = JSON.parse(raw)
      if (parsed && typeof parsed === "object") obj = parsed
    } catch {}
  }

  if (!obj || typeof obj !== "object") return { ...defaultSGCCSettings }

  // 深合并：cache 单独合并
  const merged: SGCCSettings = {
    ...defaultSGCCSettings,
    ...obj,
    cache: normalizeCache((obj as any).cache),
  }

  // 纠偏：避免写入奇怪值
  merged.accountIndex = clampNumber(merged.accountIndex, defaultSGCCSettings.accountIndex, 0)
  merged.barCount = clampNumber(merged.barCount, defaultSGCCSettings.barCount, 1)
  merged.oneLevelPq = clampNumber(merged.oneLevelPq, defaultSGCCSettings.oneLevelPq, 0)
  merged.twoLevelPq = clampNumber(merged.twoLevelPq, defaultSGCCSettings.twoLevelPq, 0)
  merged.refreshInterval = clampNumber(merged.refreshInterval, defaultSGCCSettings.refreshInterval, 0)

  merged.dimension = merged.dimension === "monthly" ? "monthly" : "daily"
  merged.widgetStyle = (merged.widgetStyle || defaultSGCCSettings.widgetStyle) as SGCCWidgetStyleKey

  return merged
}

export function saveSGCCSettings(settings: SGCCSettings) {
  try {
    Storage.set(SETTINGS_KEY, settings)
  } catch {
    // ignore
  }
}

export function readFullscreenPrefForRun(): boolean {
  try {
    const v = Storage.get(FULLSCREEN_KEY)
    if (typeof v === "boolean") return v
  } catch {}
  return true
}

export function writeSGCCFullscreenPref(v: boolean) {
  try {
    Storage.set(FULLSCREEN_KEY, v)
  } catch {}
}