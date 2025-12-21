// shared/carrier/cards/medium/common.tsx
import { VStack, HStack } from "scripting"
import { outerCardBg } from "../../theme"
import { type WidgetSurfacePalette, DEFAULT_WIDGET_SURFACES } from "../../surfaces"

export type MediumStyleKey = "FullRing" | "DialRing"

export type MediumCommonProps = {
  feeTitle: string
  feeText: string
  logoPath: string
  updateTime: string

  flowTitle: string
  flowValueText: string
  flowRatio: number

  otherTitle?: string
  otherValueText?: string
  otherRatio?: number

  voiceTitle: string
  voiceValueText: string
  voiceRatio: number

  surfaces?: WidgetSurfacePalette
  transparent?: boolean
}

export function MediumOuter(props: { children: any; surfaces?: WidgetSurfacePalette }) {
  const surfaces = props.surfaces ?? DEFAULT_WIDGET_SURFACES
  const body = (
    <VStack
      alignment="center"
      padding={{ top: 10, leading: 10, bottom: 10, trailing: 10 }}
      widgetBackground={{
        style: surfaces.outer || outerCardBg,
        shape: { type: "rect", cornerRadius: 24, style: "continuous" },
      }}
    >
      <HStack alignment="center" spacing={10}>
        {props.children}
      </HStack>
    </VStack>
  )

  if (!surfaces.border) return body

  return (
    <VStack
      padding={{ top: 2, leading: 2, bottom: 2, trailing: 2 }}
      widgetBackground={{
        style: surfaces.border,
        shape: { type: "rect", cornerRadius: 26, style: "continuous" },
      }}
    >
      {body}
    </VStack>
  )
}