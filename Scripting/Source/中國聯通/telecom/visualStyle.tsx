import { VStack } from "scripting"
import type { DynamicShapeStyle } from "scripting"

export type VisualStyleConfig = {
  /** 是否渲染透明样式 */
  useTransparentStyle: boolean
  /** 透明样式下是否启用彩色线条边框 */
  useTintBorderOnTransparent: boolean
}

export const defaultVisualStyle: VisualStyleConfig = {
  useTransparentStyle: false,
  useTintBorderOnTransparent: false,
}

const transparentSurface: DynamicShapeStyle = {
  light: "rgba(255,255,255,0.02)",
  dark: "rgba(0,0,0,0.10)",
}

const neutralBorder: DynamicShapeStyle = {
  light: "rgba(255,255,255,0.26)",
  dark: "rgba(255,255,255,0.35)",
}

export function buildCardBackground({
  visual,
  base,
  cornerRadius,
}: {
  visual: VisualStyleConfig
  base: DynamicShapeStyle | string
  cornerRadius: number
}) {
  if (!visual.useTransparentStyle) {
    return { style: base, shape: { type: "rect", cornerRadius, style: "continuous" } }
  }

  return {
    style: transparentSurface,
    shape: { type: "rect", cornerRadius, style: "continuous" },
  }
}

export function wrapWithOutline(
  children: any,
  {
    visual,
    tint,
    cornerRadius,
  }: { visual: VisualStyleConfig; tint?: DynamicShapeStyle; cornerRadius: number },
) {
  if (!visual.useTransparentStyle || !visual.useTintBorderOnTransparent) {
    return children
  }

  return (
    <VStack
      padding={{ top: 1, leading: 1, bottom: 1, trailing: 1 }}
      widgetBackground={{
        style: tint ?? neutralBorder,
        shape: { type: "rect", cornerRadius: cornerRadius + 2, style: "continuous" },
      }}
    >
      {children}
    </VStack>
  )
}
