// settings.ts（中国移动）
// - 仅负责：Storage key 命名、设置读写、默认值与归一化
// - UI 归一化逻辑在 shared/carrier/ui.ts（不落地、不带 key）
// - 不做旧字段兼容

import type { CacheConfig, CacheMode } from "./shared/ui-kit/cacheSection"

import type { UiSwitchSource } from "./shared/carrier/ui"
import { pickUiSettings, resolveRefreshInterval as resolveRefreshIntervalBase } from "./shared/carrier/ui"

import { safeGetObject, safeSet } from "./shared/utils/storage"

// ==================== Storage Keys ====================

export const SETTINGS_KEY = "china_mobile"

export const FULLSCREEN_KEY = `${SETTINGS_KEY}:ui:fullscreenPref`
export const MODULE_COLLAPSE_KEY = `${SETTINGS_KEY}:ui:moduleSectionCollapsed`

// Logo
export const LOGO_URL =
  "https://raw.githubusercontent.com/anker1209/icon/main/zgyd.png"
export const LOGO_CACHE_KEY = `${SETTINGS_KEY}:cache:logo`

// ✅ 数据缓存 meta（path/updatedAt/key）
export const DATA_CACHE_KEY = `${SETTINGS_KEY}:cache:data`

// ==================== Types ====================

export type ChinaMobileSettings = UiSwitchSource & {
  refreshInterval: number

  // ✅ 对齐联通：固定为 string（避免业务侧到处判空）
  cacheScopeKey: string

  cache: CacheConfig
}

// ==================== Defaults ====================

export const defaultChinaMobileSettings: ChinaMobileSettings = {
  // ✅ 对齐联通：UI 默认直接来自 pickUiSettings（确保字段齐全且一致）
  ...pickUiSettings({}),

  refreshInterval: 180,

  cacheScopeKey: "",
  cache: {
    enabled: true,

    // ✅ 对齐联通/国网：用你们 CacheSection 支持的“默认策略”
    // 如果你们 cacheSection 的 mode 不是 "auto"，改成它支持的默认值即可
    mode: "auto" as CacheMode,

    // auto：ttl=max(4h, refreshInterval)
    ttlPolicy: "auto",
    ttlMinutesFixed: 360,

    allowStaleOnError: true,
    maxStaleMinutes: 1440,

    // ✅ 对齐联通：允许 key 不同也可兜底（由业务侧再决定 keyOk / allowStaleOnKeyMismatch）
    allowStaleOnKeyMismatch: true,
  },
}

// ==================== Cache normalize ====================

function normalizeCacheConfig(cfg: any, refreshIntervalMinutes: number): CacheConfig {
  const d = defaultChinaMobileSettings.cache

  const enabled = typeof cfg?.enabled === "boolean" ? cfg.enabled : d.enabled

  // ✅ 不做白名单：交给 CacheSection 的枚举保证合法
  const mode = (cfg?.mode ?? d.mode) as CacheConfig["mode"]

  const ttlPolicy: CacheConfig["ttlPolicy"] = cfg?.ttlPolicy === "fixed" ? "fixed" : "auto"
  const ttlFixed = Math.max(1, Number(cfg?.ttlMinutesFixed ?? d.ttlMinutesFixed) || d.ttlMinutesFixed)

  const ttlMinutes = Math.max(240, ttlPolicy === "fixed" ? ttlFixed : (Number(refreshIntervalMinutes) || 0))
  const ttlMinutesFixed = Math.max(240, ttlFixed)

  const allowStaleOnError =
    typeof cfg?.allowStaleOnError === "boolean" ? cfg.allowStaleOnError : d.allowStaleOnError

  const allowStaleOnKeyMismatch =
    typeof cfg?.allowStaleOnKeyMismatch === "boolean" ? cfg.allowStaleOnKeyMismatch : d.allowStaleOnKeyMismatch

  const maxStaleRaw = Math.max(1, Number(cfg?.maxStaleMinutes ?? d.maxStaleMinutes) || d.maxStaleMinutes)
  const maxStaleMinutes = Math.max(ttlMinutes, maxStaleRaw)

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

// ==================== Load / Save ====================

function mergeSettings(raw: Partial<ChinaMobileSettings> | null | undefined): ChinaMobileSettings {
  const base: ChinaMobileSettings = {
    ...defaultChinaMobileSettings,
    ...(raw || {}),
  }

  // refreshInterval：>=5
  const refreshInterval = resolveRefreshIntervalBase(
    (raw as any)?.refreshInterval,
    defaultChinaMobileSettings.refreshInterval,
  )

  // UI：统一归一化
  const ui = pickUiSettings(base)

  // cache：统一归一化（TTL/maxStale 纠偏）
  const cache = normalizeCacheConfig((base as any).cache, refreshInterval)

  return {
    ...base,
    ...ui,
    refreshInterval,
    cacheScopeKey: String((base as any).cacheScopeKey ?? "").trim(),
    cache,
  }
}

export function loadChinaMobileSettings(): ChinaMobileSettings {
  const raw = safeGetObject<Partial<ChinaMobileSettings> | null>(SETTINGS_KEY, null)
  return mergeSettings(raw)
}

export function saveChinaMobileSettings(next: ChinaMobileSettings) {
  safeSet(SETTINGS_KEY, next)
}

// 业务侧复用（widget.tsx）
export function resolveRefreshInterval(v: any, fallback: number): number {
  return resolveRefreshIntervalBase(v, fallback)
}