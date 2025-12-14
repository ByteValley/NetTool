// telecom/cards/medium/threeCardStyle.tsx
import type { TelecomMediumCommonProps } from "./common"
import { TelecomMediumOuter } from "./common"
import { TelecomFeeCard } from "../feeCard"
import { TelecomRingStatCard } from "../ringStatCard"
import { telecomRingThemes } from "../../theme"

/**
 * 三卡布局：
 *  - 话费
 *  - 总/通用流量（根据 includeDirectionalInTotal 已在外面算好）
 *  - 语音
 */
export function TelecomMediumThreeCard(props: TelecomMediumCommonProps) {
  const {
    feeTitle,
    feeText,
    logoPath,
    updateTime,
    flowTitle,
    flowValueText,
    flowRatio,
    voiceTitle,
    voiceValueText,
    voiceRatio,
  } = props

  return (
    <TelecomMediumOuter>
      <TelecomFeeCard
        title={feeTitle}
        valueText={feeText}
        theme={telecomRingThemes.fee}
        logoPath={logoPath}
        updateTime={updateTime}
      />

      <TelecomRingStatCard
        title={flowTitle}
        valueText={flowValueText}
        theme={telecomRingThemes.flow}
        ratio={flowRatio}
      />

      <TelecomRingStatCard
        title={voiceTitle}
        valueText={voiceValueText}
        theme={telecomRingThemes.voice}
        ratio={voiceRatio}
      />
    </TelecomMediumOuter>
  )
}