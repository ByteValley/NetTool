// telecom/theme.ts
// 统一主题 & 颜色

import { DynamicShapeStyle } from "scripting"

// 外层大卡底
export const outerCardBg: DynamicShapeStyle = {
  light: "rgba(255,255,255,0.98)",
  dark: "rgba(0, 0, 0, 0.90)",
}

// 每格浅色背景 + 主题色（三网共用）
export const telecomRingThemes = {
  fee: {
    tint: { light: "#0080CB", dark: "#66adff" } as DynamicShapeStyle,
    icon: "bolt.horizontal.circle.fill",
    bg: {
      light: "rgba(0,128,203,0.06)",
      dark: "rgba(5, 16, 32, 0.96)",
    } as DynamicShapeStyle,
  },
  flow: {
    tint: { light: "#32CD32", dark: "#63e08f" } as DynamicShapeStyle,
    icon: "antenna.radiowaves.left.and.right",
    bg: {
      light: "rgba(50,205,50,0.08)",
      dark: "rgba(3, 9, 28, 1.0)",
    } as DynamicShapeStyle,
  },
  flowDir: {
    tint: { light: "#8A6EFF", dark: "#c59bff" } as DynamicShapeStyle,
    icon: "wifi",
    bg: {
      light: "rgba(138,110,255,0.10)",
      dark: "rgba(8, 6, 24, 0.96)",
    } as DynamicShapeStyle,
  },
  voice: {
    tint: { light: "#F86527", dark: "#ffb07a" } as DynamicShapeStyle,
    icon: "phone.badge.waveform.fill",
    bg: {
      light: "rgba(248,101,39,0.10)",
      dark: "rgba(13, 10, 34, 1.0)",
    } as DynamicShapeStyle,
  },
} as const

export type RingCardTheme =
  (typeof telecomRingThemes)[keyof typeof telecomRingThemes]

// 更新时间颜色
export const timeStyle: DynamicShapeStyle = {
  light: "rgba(0, 0, 0, 0.55)",
  dark: "rgba(255,255,255,0.65)",
}