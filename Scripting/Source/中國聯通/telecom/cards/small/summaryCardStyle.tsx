// telecom/cards/small/summaryCardStyle.tsx
import { VStack, Spacer } from "scripting"

import type { SmallCardCommonProps } from "./common"
import { FeeCard } from "../components/feeCard"
import { ringThemes } from "../../theme"
import { buildCardBackground, wrapWithOutline, defaultVisualStyle } from "../../visualStyle"

// summary 样式：直接用 FeeCard 缩小版，只展示话费卡（垂直居中）
export function TelecomSmallSummaryCard(props: SmallCardCommonProps) {
  const { feeTitle, feeText, logoPath, updateTime } = props
  const visualStyle = props.visualStyle ?? defaultVisualStyle

  const content = (
    <VStack
      alignment="center"
      padding={{ top: 4, leading: 4, bottom: 4, trailing: 4 }}
      widgetBackground={buildCardBackground({
        visual: visualStyle,
        base: "systemBackground",
        cornerRadius: 24,
      })}
    >
      <Spacer />
      <FeeCard
        title={feeTitle}
        valueText={feeText}
        theme={ringThemes.fee}
        logoPath={logoPath}
        updateTime={updateTime ?? ""}
        visualStyle={visualStyle}
      />
      <Spacer />
    </VStack>
  )

  return wrapWithOutline(content, { visual: visualStyle, cornerRadius: 24 })
}