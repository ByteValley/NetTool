// settings.ts（中国电信）
// - 仅负责：Storage key 命名、设置读写、默认值与归一化
// - UI 归一化逻辑在 shared/carrier/ui.ts（不落地、不带 key）
// - cache 归一化：TTL / maxStale 自动纠偏（对齐移动/联通/国网）

import type { CacheConfig, CacheMode } from "./shared/ui-kit/cacheSection"

import type { UiSwitchSource } from "./shared/carrier/ui"
import { pickUiSettings, resolveRefreshInterval as resolveRefreshIntervalBase } from "./shared/carrier/ui"

import { safeGetObject, safeSet } from "./shared/utils/storage"

// ==================== Storage Keys ====================

export const SETTINGS_KEY = "china_telecom"

export const FULLSCREEN_KEY = `${SETTINGS_KEY}:ui:fullscreenPref`
export const MODULE_COLLAPSE_KEY = `${SETTINGS_KEY}:ui:moduleSectionCollapsed`

// Logo
export const LOGO_URL =
  "https://raw.githubusercontent.com/Nanako718/Scripting/refs/heads/main/images/10000.png"
export const LOGO_CACHE_KEY = `${SETTINGS_KEY}:cache:logo`

// ✅ 数据缓存 meta（path/updatedAt/key）
export const DATA_CACHE_KEY = `${SETTINGS_KEY}:cache:data`

// ==================== Types ====================

export type ChinaTelecomSettings = UiSwitchSource & {
  // 账号
  mobile: string
  password: string

  refreshInterval: number

  // ✅ 固定为 string（避免业务侧到处判空）
  cacheScopeKey: string

  cache: CacheConfig
}

// ==================== Defaults ====================

export const defaultChinaTelecomSettings: ChinaTelecomSettings = {
  // ✅ UI 默认直接来自 pickUiSettings（确保字段齐全且一致）
  ...pickUiSettings({}),

  mobile: "",
  password: "",

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

    // ✅ 默认允许 key 不匹配时复用旧缓存（可在 CacheSection 里关掉）
    allowStaleOnKeyMismatch: true,
  },
}

// ==================== Cache normalize ====================

function normalizeCacheConfig(cfg: any, refreshIntervalMinutes: number): CacheConfig {
  const d = defaultChinaTelecomSettings.cache

  const enabled = typeof cfg?.enabled === "boolean" ? cfg.enabled : d.enabled
  const mode = (cfg?.mode ?? d.mode) as CacheConfig["mode"]

  const ttlPolicy: CacheConfig["ttlPolicy"] = cfg?.ttlPolicy === "fixed" ? "fixed" : "auto"
  const ttlFixed = Math.max(1, Number(cfg?.ttlMinutesFixed ?? d.ttlMinutesFixed) || d.ttlMinutesFixed)

  // ✅ ttlMinutes 用于纠偏 maxStale：至少 >= TTL
  const ttlMinutes = Math.max(
    240,
    ttlPolicy === "fixed" ? ttlFixed : (Number(refreshIntervalMinutes) || 0),
  )
  const ttlMinutesFixed = Math.max(240, ttlFixed)

  const allowStaleOnError =
    typeof cfg?.allowStaleOnError === "boolean" ? cfg.allowStaleOnError : d.allowStaleOnError

  const allowStaleOnKeyMismatch =
    typeof cfg?.allowStaleOnKeyMismatch === "boolean"
      ? cfg.allowStaleOnKeyMismatch
      : d.allowStaleOnKeyMismatch

  const maxStaleRaw = Math.max(
    1,
    Number(cfg?.maxStaleMinutes ?? d.maxStaleMinutes) || d.maxStaleMinutes,
  )
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

function mergeSettings(raw: Partial<ChinaTelecomSettings> | null | undefined): ChinaTelecomSettings {
  const base: ChinaTelecomSettings = {
    ...defaultChinaTelecomSettings,
    ...(raw || {}),
  }

  // refreshInterval：>=5（resolveRefreshInterval 内部会兜底/纠偏）
  const refreshInterval = resolveRefreshIntervalBase(
    (raw as any)?.refreshInterval,
    defaultChinaTelecomSettings.refreshInterval,
  )

  // UI：统一归一化（保证 showRemainRatio/mediumStyle/... 都是确定值）
  const ui = pickUiSettings(base)

  // cache：统一归一化（TTL/maxStale 纠偏）
  const cache = normalizeCacheConfig((base as any).cache, refreshInterval)

  return {
    ...base,
    ...ui,

    mobile: String((base as any).mobile ?? "").trim(),
    password: String((base as any).password ?? "").trim(),

    refreshInterval,

    cacheScopeKey: String((base as any).cacheScopeKey ?? "").trim(),
    cache,
  }
}

export function loadChinaTelecomSettings(): ChinaTelecomSettings {
  const raw = safeGetObject<Partial<ChinaTelecomSettings> | null>(SETTINGS_KEY, null)
  return mergeSettings(raw)
}

export function saveChinaTelecomSettings(next: ChinaTelecomSettings) {
  // ✅ 对齐移动：直接落地；下次 load 时会 merge + normalize
  safeSet(SETTINGS_KEY, next as any)
}

// 业务侧复用（widget.tsx / index.tsx）
export function resolveRefreshInterval(v: any, fallback: number): number {
  return resolveRefreshIntervalBase(v, fallback)
}