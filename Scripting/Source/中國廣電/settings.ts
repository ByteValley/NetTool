// 中國廣電/settings.ts
// - 仅负责：Storage key 命名、设置读写、默认值
// - UI 归一化逻辑在 shared/carrier/ui.ts（不落地、不带 key）

import type { CacheConfig, CacheMode } from "./shared/ui-kit/cacheSection"
import {
  pickUiSettings,
  resolveRefreshInterval,
  type UiSwitchSource,
  type UiSettings,
} from "./shared/carrier/ui"

declare const Storage: any

// =======================
// Storage Keys
// =======================
export const SETTINGS_KEY = "china_broadnet"

export const FULLSCREEN_KEY = `${SETTINGS_KEY}:ui:fullscreenPref`
export const MODULE_COLLAPSE_KEY = `${SETTINGS_KEY}:ui:moduleSectionCollapsed`

export const BROADNET_DATA_CACHE_KEY = `${SETTINGS_KEY}:cache:data`

// Logo
export const BROADNET_LOGO_URL = "https://m.10099.com.cn/gwecdq/qiuti20230807.png"
export const BROADNET_LOGO_CACHE_KEY = `${SETTINGS_KEY}:cache:logo`

// =======================
// Settings
// =======================
export type ChinaBroadnetSettings = UiSwitchSource & {
  session: string
  access: string
  bodyData: string

  refreshInterval: number

  // ✅ 缓存（Storage meta + fileCache data）
  cacheScopeKey: string
  cache: CacheConfig
  /** 下一次渲染强制走网络（用完自动关） */
  forceRefreshOnce?: boolean
}

export const defaultChinaBroadnetSettings: ChinaBroadnetSettings = {
  // UI switches（会被 pickUiSettings 归一化）
  ...pickUiSettings({}),

  session: "",
  access: "",
  bodyData: "",

  refreshInterval: 180,

  cacheScopeKey: "",
  cache: {
    enabled: true,
    mode: "auto" as CacheMode,

    // auto：ttl=max(4h, refreshInterval)
    ttlPolicy: "auto",
    ttlMinutesFixed: 360,

    allowStaleOnError: true,
    maxStaleMinutes: 1440,

    allowStaleOnKeyMismatch: true,
  },
  forceRefreshOnce: false,
}

// =======================
// Storage helpers（兼容 Storage 存 string / object）
// =======================
function safeGetAny(key: string): any {
  try {
    return Storage.get(key)
  } catch {
    return null
  }
}

function safeSetAny(key: string, value: any) {
  try {
    Storage.set(key, value)
  } catch { }
}

function mergeSettings(raw: any, defaults: ChinaBroadnetSettings): ChinaBroadnetSettings {
  const merged: any = { ...defaults, ...(raw || {}) }

  // UI 统一走 pickUiSettings
  const ui: UiSettings = pickUiSettings(merged as UiSwitchSource)
  Object.assign(merged, ui)

  // refreshInterval 兜底
  merged.refreshInterval = resolveRefreshInterval(
    merged.refreshInterval,
    defaults.refreshInterval,
  )

  // cache
  merged.cache = { ...defaults.cache, ...(merged.cache || {}) }
  merged.cacheScopeKey =
    typeof merged.cacheScopeKey === "string" ? merged.cacheScopeKey : defaults.cacheScopeKey
  merged.forceRefreshOnce = !!merged.forceRefreshOnce

  merged.session = typeof merged.session === "string" ? merged.session : defaults.session
  merged.access = typeof merged.access === "string" ? merged.access : defaults.access
  merged.bodyData = typeof merged.bodyData === "string" ? merged.bodyData : defaults.bodyData

  return merged as ChinaBroadnetSettings
}

export function loadChinaBroadnetSettings(): ChinaBroadnetSettings {
  const raw = safeGetAny(SETTINGS_KEY)
  if (!raw) return { ...defaultChinaBroadnetSettings }

  if (typeof raw === "string") {
    try {
      return mergeSettings(JSON.parse(raw), defaultChinaBroadnetSettings)
    } catch {
      return { ...defaultChinaBroadnetSettings }
    }
  }

  return mergeSettings(raw, defaultChinaBroadnetSettings)
}

export function saveChinaBroadnetSettings(settings: ChinaBroadnetSettings) {
  safeSetAny(SETTINGS_KEY, settings)
}

export { resolveRefreshInterval } from "./shared/carrier/ui"
