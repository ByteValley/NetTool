// settings.ts（交管 12123 通用设置）

import { safeGetObject, safeSet } from "./shared/utils/storage"

// =====================================================================
// Storage Key 统一管理
// =====================================================================
export const TRAFFIC_SETTINGS_KEY = "traffic12123Settings"
export const TRAFFIC_FULLSCREEN_KEY = "traffic12123SettingsFullscreen"

// =====================================================================
// Cache Settings
// =====================================================================
export type TrafficCacheMode = "auto" | "network_only" | "cache_only"

export type TrafficCacheSettings = {
  // 总开关
  enabled: boolean

  // 缓存模式
  // auto         : 优先命中新鲜缓存，过期则请求网络
  // network_only : 强制走网络（忽略缓存）
  // cache_only   : 只用缓存（不请求接口）
  mode: TrafficCacheMode

  // TTL 策略
  // auto  : ttl = max(4h, refreshIntervalMinutes)
  // fixed : ttl = max(4h, ttlMinutesFixed)
  ttlPolicy: "auto" | "fixed"
  ttlMinutesFixed: number

  // 接口失败兜底
  allowStaleOnError: boolean
  maxStaleMinutes: number
}

// =====================================================================
// 组件设置结构
// =====================================================================
export type Traffic12123Settings = {
  // 基础
  token: string
  enableBoxJs?: boolean
  boxJsUrl?: string

  // 刷新配置（单位：分钟）
  refreshIntervalMinutes?: number

  // 车辆图片
  vehicleImageUrl?: string
  vehicleImageWidth?: number
  vehicleImageHeight?: number
  vehicleImageOffsetY?: number

  // 文案相关
  headerTitle?: string                // 顶部标题（默认 12123）
  customPlateNumber?: string          // 自定义车牌号（优先于接口）
  customAnnualInspectionDate?: string // 自定义年检日期（优先于接口）

  // 隐私开关
  maskRecordInfo?: boolean            // 是否隐藏备案详情，只显示驾驶证状态

  // 缓存策略
  cache: TrafficCacheSettings
}

// =====================================================================
// 默认设置
// =====================================================================
export const defaultTraffic12123Settings: Traffic12123Settings = {
  token: "",
  enableBoxJs: false,
  boxJsUrl: "",
  refreshIntervalMinutes: 180, // 默认 3 小时

  vehicleImageUrl: "",
  vehicleImageWidth: 120,
  vehicleImageHeight: 60,
  vehicleImageOffsetY: 30,

  headerTitle: "12123",
  customPlateNumber: "",
  customAnnualInspectionDate: "",
  maskRecordInfo: false,

  cache: {
    enabled: true,
    mode: "auto",

    // 跟随刷新间隔（且至少 4h）
    ttlPolicy: "auto",
    // fixed 时用；这里给个“看得懂也好用”的值
    ttlMinutesFixed: 360, // 6h

    // 接口失败：允许回退使用旧缓存，避免组件空白
    allowStaleOnError: true,
    maxStaleMinutes: 1440, // 24h
  },
}

// =====================================================================
// Settings 读写（带兼容迁移）
// =====================================================================
function clampNumber(v: any, fallback: number, min = 0, max = Number.POSITIVE_INFINITY) {
  const n = typeof v === "number" && Number.isFinite(v) ? v : fallback
  return Math.min(max, Math.max(min, n))
}

function normalizeCacheMode(v: any): TrafficCacheMode {
  if (v === "auto" || v === "network_only" || v === "cache_only") return v
  return defaultTraffic12123Settings.cache.mode
}

function normalizeTtlPolicy(v: any): "auto" | "fixed" {
  if (v === "auto" || v === "fixed") return v
  return defaultTraffic12123Settings.cache.ttlPolicy
}

export function loadTraffic12123Settings(): Traffic12123Settings {
  const raw = safeGetObject<Traffic12123Settings | null>(TRAFFIC_SETTINGS_KEY, null)
  if (!raw || typeof raw !== "object") return defaultTraffic12123Settings

  // 兼容旧版：把缺失字段补齐；cache 做深合并
  const merged: Traffic12123Settings = {
    ...defaultTraffic12123Settings,
    ...raw,
    cache: {
      ...defaultTraffic12123Settings.cache,
      ...(raw as any).cache,
    },
  }

  // 纠偏（防止被写入奇怪值）
  merged.refreshIntervalMinutes = clampNumber(
    merged.refreshIntervalMinutes,
    defaultTraffic12123Settings.refreshIntervalMinutes!,
    0,
  )

  merged.vehicleImageWidth = clampNumber(
    merged.vehicleImageWidth,
    defaultTraffic12123Settings.vehicleImageWidth!,
    0,
  )
  merged.vehicleImageHeight = clampNumber(
    merged.vehicleImageHeight,
    defaultTraffic12123Settings.vehicleImageHeight!,
    0,
  )
  merged.vehicleImageOffsetY = clampNumber(
    merged.vehicleImageOffsetY,
    defaultTraffic12123Settings.vehicleImageOffsetY!,
    -9999,
    9999,
  )

  merged.cache.enabled = merged.cache.enabled !== false
  merged.cache.mode = normalizeCacheMode(merged.cache.mode)
  merged.cache.ttlPolicy = normalizeTtlPolicy(merged.cache.ttlPolicy)
  merged.cache.ttlMinutesFixed = clampNumber(
    merged.cache.ttlMinutesFixed,
    defaultTraffic12123Settings.cache.ttlMinutesFixed,
    0,
  )
  merged.cache.allowStaleOnError = merged.cache.allowStaleOnError !== false
  merged.cache.maxStaleMinutes = clampNumber(
    merged.cache.maxStaleMinutes,
    defaultTraffic12123Settings.cache.maxStaleMinutes,
    0,
  )

  return merged
}

export function saveTraffic12123Settings(settings: Traffic12123Settings) {
  safeSet(TRAFFIC_SETTINGS_KEY, settings)
}
