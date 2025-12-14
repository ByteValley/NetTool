// telecom/cards/small/summaryCardStyle.tsx
import { VStack, Spacer } from "scripting"

import type { SmallCardCommonProps } from "./common"
import { TelecomFeeCard } from "../feeCard"
import { telecomRingThemes } from "../../theme"

// summary 样式：直接用 FeeCard 缩小版，只展示话费卡（垂直居中）
export function TelecomSmallSummaryCard(props: SmallCardCommonProps) {
  const { feeTitle, feeText, logoPath, updateTime } = props

  return (
    <VStack
      alignment="center"
      padding={{ top: 4, leading: 4, bottom: 4, trailing: 4 }}
    >
      <Spacer />
      <TelecomFeeCard
        title={feeTitle}
        valueText={feeText}
        theme={telecomRingThemes.fee}
        logoPath={logoPath}
        updateTime={updateTime ?? ""}
      />
      <Spacer />
    </VStack>
  )
}