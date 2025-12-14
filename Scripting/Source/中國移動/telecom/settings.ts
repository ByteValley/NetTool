// telecom/settings.ts
import type { Color } from "scripting"
import type { SmallCardStyle, SmallStyleKey } from "./cards/small"

declare const Storage: any

export type TelecomUiSettings = {
  showRemainRatio: boolean
  mediumCardStyle: "three" | "four"
  includeDirectionalInTotal: boolean
  smallCardStyle: SmallCardStyle

  // ✅ 仅作用于小号组件的「紧凑清单 / 进度清单」：
  // true  = 总流量 + 语音（2 行）
  // false = 通用 + 定向 + 语音（3 行）
  smallMiniBarUseTotalFlow: boolean
}

export type TelecomUiSwitchSource = {
  showRemainRatio?: boolean
  mediumCardStyle?: "three" | "four"
  includeDirectionalInTotal?: boolean
  smallCardStyle?: SmallCardStyle | string // 这里允许脏数据进来，我们会做校验

  smallMiniBarUseTotalFlow?: boolean
}

export type ChinaUnicomSettings = TelecomUiSwitchSource & {
  cookie: string
  titleDayColor: Color
  titleNightColor: Color
  descDayColor: Color
  descNightColor: Color
  refreshTimeDayColor: Color
  refreshTimeNightColor: Color
  refreshInterval: number

  otherFlowMatchType?: "flowType" | "addupItemCode"
  otherFlowMatchValue?: string
  enableBoxJs?: boolean
  boxJsUrl?: string
}

export type ChinaMobileSettings = TelecomUiSwitchSource & {
  refreshInterval: number
}

export type ChinaTelecomSettings = TelecomUiSwitchSource & {
  mobile: string
  password: string
  refreshInterval?: number
  refreshTimeDayColor?: string
  refreshTimeNightColor?: string
}

export const UNICOM_SETTINGS_KEY = "chinaUnicomSettings"
export const MOBILE_SETTINGS_KEY = "chinaMobileSettings"
export const TELECOM_SETTINGS_KEY = "chinaTelecomSettings"

// ✅ 小号样式白名单：summary + 你的 SmallStyleKey
const VALID_SMALL_STYLE_SET = new Set<string>([
  "summary",
  "CompactList",
  "ProgressList",
  "TripleRows",
  "IconCells",
  "BalanceFocus",
  "DualList",
  "DualGauges",
  "TextList",
])

function normalizeSmallCardStyle(v: unknown): SmallCardStyle {
  const s = typeof v === "string" ? v : ""
  if (VALID_SMALL_STYLE_SET.has(s)) return s as SmallCardStyle
  return "summary"
}

export function pickTelecomUiSettings(
  raw: TelecomUiSwitchSource | null | undefined,
): TelecomUiSettings {
  const src = raw ?? {}

  return {
    showRemainRatio: !!src.showRemainRatio,
    mediumCardStyle: src.mediumCardStyle === "three" ? "three" : "four",
    includeDirectionalInTotal:
      typeof src.includeDirectionalInTotal === "boolean"
        ? src.includeDirectionalInTotal
        : true,

    smallCardStyle: normalizeSmallCardStyle(src.smallCardStyle),

    // ✅ 默认 false：保持你现在的行为（默认 3 行）
    smallMiniBarUseTotalFlow:
      typeof src.smallMiniBarUseTotalFlow === "boolean"
        ? src.smallMiniBarUseTotalFlow
        : false,
  }
}

export function loadTelecomUiSettings(settingsKey: string): TelecomUiSettings {
  const raw = (Storage?.get?.(settingsKey) ?? null) as TelecomUiSwitchSource | null
  return pickTelecomUiSettings(raw)
}

export function loadChinaUnicomSettings(): ChinaUnicomSettings | null {
  const raw = Storage?.get?.(UNICOM_SETTINGS_KEY) ?? null
  return (raw ?? null) as ChinaUnicomSettings | null
}

export function loadChinaMobileSettings(): ChinaMobileSettings | null {
  const raw = Storage?.get?.(MOBILE_SETTINGS_KEY) ?? null
  return (raw ?? null) as ChinaMobileSettings | null
}

export function loadChinaTelecomSettings(): ChinaTelecomSettings | null {
  const raw = Storage?.get?.(TELECOM_SETTINGS_KEY) ?? null
  return (raw ?? null) as ChinaTelecomSettings | null
}

export function resolveRefreshInterval(
  maybeInterval: unknown,
  defaultMinutes: number,
): number {
  let v: number

  if (typeof maybeInterval === "number") v = maybeInterval
  else if (typeof maybeInterval === "string") v = parseInt(maybeInterval, 10)
  else v = defaultMinutes

  if (!Number.isFinite(v)) v = defaultMinutes
  v = Math.round(v)

  if (v < 15) v = 15
  if (v > 1440) v = 1440
  return v
}