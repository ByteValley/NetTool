declare const Storage: any

export const IP_INFO_SETTINGS_KEY = "skkIpInfoSettings"
export const IP_INFO_FULLSCREEN_KEY = "skkIpInfoSettingsFullscreen"

export type SkkIpInfoSettings = {
  title: string
  refreshIntervalMinutes: number
  timeoutMs: number
  enableIPv6: boolean
  enableConnectivity: boolean
  maskIp: boolean
  maskLocation: boolean
  showSourceName: boolean
}

export const defaultSkkIpInfoSettings: SkkIpInfoSettings = {
  title: "IP 信息",
  refreshIntervalMinutes: 30,
  timeoutMs: 3000,
  enableIPv6: true,
  enableConnectivity: true,
  maskIp: false,
  maskLocation: false,
  showSourceName: true,
}

function safeGetObject<T>(key: string, fallback: T): T {
  try {
    const raw = Storage?.get?.(key)
    if (!raw) return fallback
    if (typeof raw === "object") return raw as T
    if (typeof raw === "string") {
      try {
        const parsed = JSON.parse(raw)
        if (parsed && typeof parsed === "object") return parsed as T
      } catch {}
    }
  } catch {}
  return fallback
}

function safeSet(key: string, value: unknown) {
  try {
    Storage?.set?.(key, value)
  } catch {}
}

function clampNumber(value: any, fallback: number, min: number, max: number) {
  const n = typeof value === "number" && Number.isFinite(value) ? value : Number(value)
  if (!Number.isFinite(n)) return fallback
  return Math.min(max, Math.max(min, Math.floor(n)))
}

function readBool(value: any, fallback: boolean) {
  return typeof value === "boolean" ? value : fallback
}

export function loadSkkIpInfoSettings(): SkkIpInfoSettings {
  const raw = safeGetObject<Partial<SkkIpInfoSettings> | null>(IP_INFO_SETTINGS_KEY, null)
  if (!raw || typeof raw !== "object") return defaultSkkIpInfoSettings

  const merged: SkkIpInfoSettings = {
    ...defaultSkkIpInfoSettings,
    ...raw,
  }

  merged.title =
    typeof merged.title === "string" && merged.title.trim()
      ? merged.title.trim()
      : defaultSkkIpInfoSettings.title
  merged.refreshIntervalMinutes = clampNumber(
    merged.refreshIntervalMinutes,
    defaultSkkIpInfoSettings.refreshIntervalMinutes,
    5,
    1440,
  )
  merged.timeoutMs = clampNumber(
    merged.timeoutMs,
    defaultSkkIpInfoSettings.timeoutMs,
    1500,
    15000,
  )
  merged.enableIPv6 = readBool(merged.enableIPv6, defaultSkkIpInfoSettings.enableIPv6)
  merged.enableConnectivity = readBool(
    merged.enableConnectivity,
    defaultSkkIpInfoSettings.enableConnectivity,
  )
  merged.maskIp = readBool(merged.maskIp, defaultSkkIpInfoSettings.maskIp)
  merged.maskLocation = readBool(merged.maskLocation, defaultSkkIpInfoSettings.maskLocation)
  merged.showSourceName = readBool(merged.showSourceName, defaultSkkIpInfoSettings.showSourceName)

  return merged
}

export function saveSkkIpInfoSettings(settings: SkkIpInfoSettings) {
  safeSet(IP_INFO_SETTINGS_KEY, settings)
}

export function readFullscreenPreference(): boolean {
  try {
    const value = Storage?.get?.(IP_INFO_FULLSCREEN_KEY)
    return typeof value === "boolean" ? value : true
  } catch {
    return true
  }
}

export function saveFullscreenPreference(value: boolean) {
  safeSet(IP_INFO_FULLSCREEN_KEY, value)
}
