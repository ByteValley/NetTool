// telecom/cards/medium/common.tsx
import { VStack, HStack } from "scripting"
import { outerCardBg } from "../../theme"
import { buildCardBackground, wrapWithOutline, defaultVisualStyle, VisualStyleConfig } from "../../visualStyle"

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

  visualStyle?: VisualStyleConfig
}

export function MediumOuter(props: { children: any; visualStyle?: VisualStyleConfig }) {
  const { children } = props
  const visualStyle = props.visualStyle ?? defaultVisualStyle
  return wrapWithOutline(
    <VStack
      alignment="center"
      padding={{ top: 10, leading: 10, bottom: 10, trailing: 10 }}
      widgetBackground={buildCardBackground({
        visual: visualStyle,
        base: outerCardBg,
        cornerRadius: 24,
      })}
    >
      <HStack alignment="center" spacing={10}>
        {children}
      </HStack>
    </VStack>,
    { visual: visualStyle, cornerRadius: 24 },
  )
}