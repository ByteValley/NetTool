// shared/carrier/surfaces.ts
// 统一外观：控制透明/描边样式

import { DynamicShapeStyle } from "scripting"
import { outerCardBg, ringThemes } from "./theme"

export type WidgetSurfacePalette = {
  outer: DynamicShapeStyle | string
  content: DynamicShapeStyle | string
  panel: DynamicShapeStyle | string
  pill: DynamicShapeStyle | string
  chip: DynamicShapeStyle | string
  border?: DynamicShapeStyle | string
}

type SurfaceOptions = {
  transparentStyle?: boolean
  colorfulLineBorder?: boolean
}

const OPAQUE_SURFACES: WidgetSurfacePalette = {
  outer: outerCardBg,
  content: { light: "rgba(0,0,0,0.04)", dark: "rgba(255,255,255,0.06)" } as DynamicShapeStyle,
  panel: { light: "rgba(0,0,0,0.03)", dark: "rgba(255,255,255,0.07)" } as DynamicShapeStyle,
  pill: { light: "rgba(0,0,0,0.10)", dark: "rgba(255,255,255,0.10)" } as DynamicShapeStyle,
  chip: { light: "rgba(0,0,0,0.10)", dark: "rgba(255,255,255,0.12)" } as DynamicShapeStyle,
}

const TRANSPARENT_SURFACES: WidgetSurfacePalette = {
  outer: { light: "rgba(255,255,255,0.06)", dark: "rgba(0,0,0,0.18)" } as DynamicShapeStyle,
  content: { light: "rgba(255,255,255,0.08)", dark: "rgba(255,255,255,0.14)" } as DynamicShapeStyle,
  panel: { light: "rgba(255,255,255,0.06)", dark: "rgba(255,255,255,0.12)" } as DynamicShapeStyle,
  pill: { light: "rgba(255,255,255,0.16)", dark: "rgba(255,255,255,0.20)" } as DynamicShapeStyle,
  chip: { light: "rgba(255,255,255,0.16)", dark: "rgba(255,255,255,0.22)" } as DynamicShapeStyle,
  border: { light: "rgba(255,255,255,0.28)", dark: "rgba(255,255,255,0.34)" } as DynamicShapeStyle,
}

export const DEFAULT_WIDGET_SURFACES: WidgetSurfacePalette = { ...OPAQUE_SURFACES }

export function buildWidgetSurfaces(options: SurfaceOptions): WidgetSurfacePalette {
  const { transparentStyle, colorfulLineBorder } = options
  if (!transparentStyle) return { ...OPAQUE_SURFACES }

  const base = { ...OPAQUE_SURFACES, ...TRANSPARENT_SURFACES }
  const border = colorfulLineBorder ? ringThemes.flow.tint : base.border
  return { ...base, border }
}
