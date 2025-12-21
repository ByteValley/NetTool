/* =====================================================================
 * shared/carrier/ui.ts
 *
 * 模块分类 · 背景
 * - UI Settings（无 Storage / 无 key）
 * - 只负责：类型定义 + 归一化（normalize）
 * - “存哪里 / key 叫什么 / 默认值怎么合并”由各业务 settings.ts 决定
 *
 * 模块分类 · 目标
 * - pickUiSettings(src)：把业务层透传的脏数据归一化为 UiSettings
 * - resolveRefreshInterval(v,fallback)：刷新间隔兜底（>=5min）
 *
 * 模块分类 · 使用方式
 * - const ui = pickUiSettings(settings)
 *
 * 模块分类 · 日志与边界
 * - 不打日志；纯计算函数
 * ===================================================================== */

import { type SmallCardStyle, SMALL_STYLE_OPTIONS } from "./cards/small"

export type MediumStyleKey = "FullRing" | "DialRing"

export type UiSettings = {
  showRemainRatio: boolean
  mediumStyle: MediumStyleKey
  mediumUseThreeCard: boolean
  smallCardStyle: SmallCardStyle
  smallMiniBarUseTotalFlow: boolean
  includeDirectionalInTotal: boolean
}

/**
 * 业务 settings.ts 透传进来的字段（允许脏数据：smallCardStyle 可能是 string）
 * 注意：不做任何旧字段兼容（兼容应在 settings.ts merge/normalize 完成）
 */
export type UiSwitchSource = Partial<UiSettings> & {
  smallCardStyle?: SmallCardStyle | string
}

const DEFAULT_UI: UiSettings = {
  showRemainRatio: true,
  mediumStyle: "FullRing",
  mediumUseThreeCard: false,
  smallCardStyle: "CompactList",
  smallMiniBarUseTotalFlow: false,
  includeDirectionalInTotal: true,
}

const VALID_SMALL_STYLE_SET = new Set<string>([
  "summary",
  ...SMALL_STYLE_OPTIONS.map((opt) => String(opt.key)),
])

function normalizeSmallStyle(v: unknown): SmallCardStyle {
  const s = typeof v === "string" ? v : ""
  if (VALID_SMALL_STYLE_SET.has(s)) return s as SmallCardStyle
  return DEFAULT_UI.smallCardStyle
}

export function pickUiSettings(src?: UiSwitchSource): UiSettings {
  const s = src || {}
  return {
    showRemainRatio: typeof s.showRemainRatio === "boolean" ? s.showRemainRatio : DEFAULT_UI.showRemainRatio,
    mediumStyle: s.mediumStyle === "DialRing" ? "DialRing" : "FullRing",
    mediumUseThreeCard: typeof s.mediumUseThreeCard === "boolean" ? s.mediumUseThreeCard : DEFAULT_UI.mediumUseThreeCard,
    smallCardStyle: normalizeSmallStyle(s.smallCardStyle),
    smallMiniBarUseTotalFlow:
      typeof s.smallMiniBarUseTotalFlow === "boolean" ? s.smallMiniBarUseTotalFlow : DEFAULT_UI.smallMiniBarUseTotalFlow,
    includeDirectionalInTotal:
      typeof s.includeDirectionalInTotal === "boolean" ? s.includeDirectionalInTotal : DEFAULT_UI.includeDirectionalInTotal,
  }
}

export function resolveRefreshInterval(v: any, fallback: number): number {
  const n = Number(v)
  if (!Number.isFinite(n) || n <= 0) return fallback
  return Math.max(5, Math.floor(n))
}