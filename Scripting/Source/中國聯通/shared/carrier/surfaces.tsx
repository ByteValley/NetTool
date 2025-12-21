// shared/carrier/surfaces.ts
// 统一外观：控制透明/描边样式

import { DynamicShapeStyle, VStack } from "scripting"
import { ringThemes } from "./theme"

export type WidgetSurfacePalette = {
  outer: DynamicShapeStyle | string
  content: DynamicShapeStyle | string
  panel: DynamicShapeStyle | string
  pill: DynamicShapeStyle | string
  chip: DynamicShapeStyle | string
  border?: DynamicShapeStyle | string
  transparentMode?: boolean
}

type SurfaceOptions = {
  transparentStyle?: boolean
  colorfulLineBorder?: boolean
}

const OPAQUE_SURFACES: WidgetSurfacePalette = {
  outer: { light: "rgba(255,255,255,0.90)", dark: "rgba(0,0,0,0.55)" } as DynamicShapeStyle,
  content: { light: "rgba(255,255,255,0.78)", dark: "rgba(255,255,255,0.10)" } as DynamicShapeStyle,
  panel: { light: "rgba(255,255,255,0.70)", dark: "rgba(255,255,255,0.08)" } as DynamicShapeStyle,
  pill: { light: "rgba(255,255,255,0.78)", dark: "rgba(255,255,255,0.12)" } as DynamicShapeStyle,
  chip: { light: "rgba(255,255,255,0.78)", dark: "rgba(255,255,255,0.14)" } as DynamicShapeStyle,
  transparentMode: false,
}

const TRANSPARENT_SURFACES: WidgetSurfacePalette = {
  // 完全透明：遵循 "Tinted Mode" 适配指南，交给系统做贴纸/染色处理
  outer: { light: "rgba(255,255,255,0)", dark: "rgba(0,0,0,0)" } as DynamicShapeStyle,
  content: { light: "rgba(255,255,255,0)", dark: "rgba(255,255,255,0)" } as DynamicShapeStyle,
  panel: { light: "rgba(255,255,255,0)", dark: "rgba(255,255,255,0)" } as DynamicShapeStyle,
  pill: { light: "rgba(255,255,255,0)", dark: "rgba(255,255,255,0)" } as DynamicShapeStyle,
  chip: { light: "rgba(255,255,255,0)", dark: "rgba(255,255,255,0)" } as DynamicShapeStyle,
  border: { light: "rgba(255,255,255,0.22)", dark: "rgba(255,255,255,0.30)" } as DynamicShapeStyle,
  transparentMode: true,
}

export const DEFAULT_WIDGET_SURFACES: WidgetSurfacePalette = { ...OPAQUE_SURFACES }

export function buildWidgetSurfaces(options: SurfaceOptions): WidgetSurfacePalette {
  const { transparentStyle, colorfulLineBorder } = options
  if (!transparentStyle) return { ...OPAQUE_SURFACES }

  const base = { ...OPAQUE_SURFACES, ...TRANSPARENT_SURFACES }
  const border = colorfulLineBorder ? ringThemes.flow.tint : base.border
  return { ...base, border }
}

export function wrapWithBorderLayer(options: {
  child: any
  surfaces?: WidgetSurfacePalette
  cornerRadius: number
  padding?: number
}) {
  const { child, surfaces, cornerRadius, padding = 2 } = options
  if (!surfaces?.border) return child

  return (
    <VStack
      padding={{ top: padding, leading: padding, bottom: padding, trailing: padding }}
      widgetBackground={{
        style: surfaces.border,
        shape: { type: "rect", cornerRadius: cornerRadius + padding, style: "continuous" },
      }}
    >
      {child}
    </VStack>
  )
}
