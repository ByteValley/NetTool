// 中國聯通/settings.ts
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
export const SETTINGS_KEY = "china_unicom"

export const FULLSCREEN_KEY = `${SETTINGS_KEY}:ui:fullscreenPref`
export const MODULE_COLLAPSE_KEY = `${SETTINGS_KEY}:ui:moduleSectionCollapsed`

export const UNICOM_DATA_CACHE_KEY = `${SETTINGS_KEY}:cache:data`

// Logo
export const UNICOM_LOGO_URL =
  "https://raw.githubusercontent.com/Nanako718/Scripting/main/images/10010.png"
export const UNICOM_LOGO_CACHE_KEY = `${SETTINGS_KEY}:cache:logo`

// =======================
// Settings
// =======================
export type ChinaUnicomSettings = UiSwitchSource & {
  cookie: string

  refreshInterval: number

  otherFlowMatchType?: "flowType" | "addupItemCode"
  otherFlowMatchValue?: string

  enableBoxJs?: boolean
  boxJsUrl?: string

  // ✅ 缓存（Storage meta + fileCache data）
  cacheScopeKey: string
  cache: CacheConfig
  /** 下一次渲染强制走网络（用完自动关） */
  forceRefreshOnce?: boolean
}

export const defaultChinaUnicomSettings: ChinaUnicomSettings = {
  // UI switches（会被 pickUiSettings 归一化）
  ...pickUiSettings({}),

  cookie: "",

  refreshInterval: 180,

  otherFlowMatchType: "flowType",
  otherFlowMatchValue: "2",

  enableBoxJs: true,
  boxJsUrl: "https://boxjs.com",

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

function mergeSettings(raw: any, defaults: ChinaUnicomSettings): ChinaUnicomSettings {
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

  // ✅ 定向/专属匹配值：为空则回落默认
  if (!merged.otherFlowMatchValue || String(merged.otherFlowMatchValue).trim() === "") {
    merged.otherFlowMatchValue = defaults.otherFlowMatchValue
  }
  return merged as ChinaUnicomSettings
}

export function loadChinaUnicomSettings(): ChinaUnicomSettings {
  const raw = safeGetAny(SETTINGS_KEY)
  if (!raw) return { ...defaultChinaUnicomSettings }

  if (typeof raw === "string") {
    try {
      return mergeSettings(JSON.parse(raw), defaultChinaUnicomSettings)
    } catch {
      return { ...defaultChinaUnicomSettings }
    }
  }

  return mergeSettings(raw, defaultChinaUnicomSettings)
}

export function saveChinaUnicomSettings(settings: ChinaUnicomSettings) {
  safeSetAny(SETTINGS_KEY, settings)
}

export { resolveRefreshInterval } from "./shared/carrier/ui"