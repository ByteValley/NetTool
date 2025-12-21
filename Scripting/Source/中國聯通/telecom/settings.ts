// telecom/settings.ts
import type { Color } from "scripting"
import type { SmallCardStyle } from "./cards/small"

declare const Storage: any

// ==================== UI Settings（新结构，无兼容） ====================

export type MediumStyleKey = "FullRing" | "DialRing"
export type MediumCardLayout = "three" | "four"

export type UiSettings = {
  showRemainRatio: boolean

  /** 是否渲染透明样式 */
  useTransparentStyle: boolean

  /** 透明样式下是否启用彩色线条边框 */
  useTintBorderOnTransparent: boolean

  /** 中号样式：全圆环 / 仪表盘 */
  mediumStyle: MediumStyleKey

  /**
   * 中号布局开关（推荐用它做 UI 开关）
   * true  = 三卡（总/通用联动）
   * false = 四卡（默认）
   */
  mediumUseThreeLayout: boolean

  /**
   * 中号布局派生值（给旧渲染逻辑用）
   * - 由 mediumUseThreeLayout 计算得到
   */
  mediumCardLayout: MediumCardLayout

  /** 三卡时：总流量是否包含定向 */
  includeDirectionalInTotal: boolean

  /** 小号样式 */
  smallCardStyle: SmallCardStyle

  /**
   * 仅作用于小号的「紧凑清单 / 进度清单」：
   * true  = 总流量 + 语音（2 行）
   * false = 通用 + 定向 + 语音（3 行）
   */
  smallMiniBarUseTotalFlow: boolean
}

/**
 * 允许上层传入不完整的“开关源”，但不再兼容历史字段名
 * （你要的是“清理旧结构”）
 */
export type UiSwitchSource = Partial<UiSettings> & {
  // 小号样式允许脏数据进来，下面会 normalize
  smallCardStyle?: SmallCardStyle | string

  // 允许旧字段“mediumCardLayout”作为兜底输入（如果你还有存量数据）
  mediumCardLayout?: MediumCardLayout | string

  // ✅ 新字段：给配置页做开关用
  mediumUseThreeLayout?: boolean

  // ✅ 新字段：透明样式
  useTransparentStyle?: boolean
  useTintBorderOnTransparent?: boolean
}

// ==================== Operator Settings ====================

export type ChinaUnicomSettings = UiSwitchSource & {
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

export type ChinaMobileSettings = UiSwitchSource & {
  refreshInterval: number
}

export type ChinaTelecomSettings = UiSwitchSource & {
  mobile: string
  password: string
  refreshInterval?: number
  refreshTimeDayColor?: string
  refreshTimeNightColor?: string
}

export const UNICOM_SETTINGS_KEY = "chinaUnicomSettings"
export const MOBILE_SETTINGS_KEY = "chinaMobileSettings"
export const TELECOM_SETTINGS_KEY = "chinaTelecomSettings"

// ==================== Normalizers ====================

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

function normalizeMediumStyle(v: unknown): MediumStyleKey {
  return v === "DialRing" ? "DialRing" : "FullRing"
}

/** 旧字段兜底：不是 "three" 就当四卡 */
function normalizeMediumCardLayout(v: unknown): MediumCardLayout {
  return v === "three" ? "three" : "four"
}

/**
 * ✅ 新逻辑：优先用 mediumUseThreeLayout（开关）
 * - 有这个字段：true=>three / false=>four
 * - 没这个字段：回退到旧字段 mediumCardLayout
 * - 两者都没有：默认四卡
 */
function resolveMediumLayout(src: UiSwitchSource): {
  mediumUseThreeLayout: boolean
  mediumCardLayout: MediumCardLayout
} {
  if (typeof src.mediumUseThreeLayout === "boolean") {
    const useThree = src.mediumUseThreeLayout
    return {
      mediumUseThreeLayout: useThree,
      mediumCardLayout: useThree ? "three" : "four",
    }
  }

  const layout = normalizeMediumCardLayout((src as any).mediumCardLayout)
  return {
    mediumUseThreeLayout: layout === "three",
    mediumCardLayout: layout,
  }
}

export function pickUiSettings(
  raw: UiSwitchSource | null | undefined,
): UiSettings {
  const src = raw ?? {}

  const { mediumUseThreeLayout, mediumCardLayout } = resolveMediumLayout(src)

  return {
    showRemainRatio: !!src.showRemainRatio,

    useTransparentStyle: !!src.useTransparentStyle,
    useTintBorderOnTransparent: !!src.useTintBorderOnTransparent,

    mediumStyle: normalizeMediumStyle((src as any).mediumStyle),

    // ✅ 开关 + 派生值（默认四卡）
    mediumUseThreeLayout,
    mediumCardLayout,

    includeDirectionalInTotal:
      typeof src.includeDirectionalInTotal === "boolean"
        ? src.includeDirectionalInTotal
        : true,

    smallCardStyle: normalizeSmallCardStyle(src.smallCardStyle),

    smallMiniBarUseTotalFlow:
      typeof src.smallMiniBarUseTotalFlow === "boolean"
        ? src.smallMiniBarUseTotalFlow
        : false,
  }
}

export function loadUiSettings(settingsKey: string): UiSettings {
  const raw = (Storage?.get?.(settingsKey) ?? null) as UiSwitchSource | null
  return pickUiSettings(raw)
}

// 这三个保持不变：读取“运营商完整设置”
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