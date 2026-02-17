// shared/carrier/cards/small/summaryCardStyle.tsx

import { VStack, Spacer } from "scripting"

import type { SmallCardCommonProps } from "./common"
import { FeeCard } from "../components/feeCard"
import { ringThemes } from "../../theme"
import { SmallCardSurface } from "./smallCardStyles"
import { DEFAULT_WIDGET_SURFACES } from "../../surfaces"

// summary 样式：直接用 FeeCard 缩小版，只展示话费卡（垂直居中）
export function TelecomSmallSummaryCard(props: SmallCardCommonProps) {
  const { feeTitle, feeText, logoPath, updateTime } = props
  const surfaces = props.surfaces ?? DEFAULT_WIDGET_SURFACES

  return (
    <SmallCardSurface surfaces={surfaces}>
      <VStack alignment="center" padding={{ top: 4, leading: 4, bottom: 4, trailing: 4 }}>
        <Spacer />
        <FeeCard
          title={feeTitle}
          valueText={feeText}
          theme={ringThemes.fee}
          logoPath={logoPath}
          updateTime={updateTime ?? ""}
        />
        <Spacer />
      </VStack>
    </SmallCardSurface>
  )
}