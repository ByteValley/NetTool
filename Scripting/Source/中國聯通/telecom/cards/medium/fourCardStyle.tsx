// telecom/cards/medium/fourCardStyle.tsx
import type { TelecomMediumCommonProps } from "./common"
import { TelecomMediumOuter } from "./common"
import { TelecomFeeCard } from "../feeCard"
import { TelecomRingStatCard } from "../ringStatCard"
import { telecomRingThemes } from "../../theme"

/**
 * 四卡布局：
 *  - 话费
 *  - 通用流量
 *  - 定向流量
 *  - 语音
 */
export function TelecomMediumFourCard(props: TelecomMediumCommonProps) {
  const {
    feeTitle,
    feeText,
    logoPath,
    updateTime,
    flowTitle,
    flowValueText,
    flowRatio,
    otherTitle,
    otherValueText,
    otherRatio,
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
        title={otherTitle ?? "定向流量"}
        valueText={otherValueText ?? "0MB"}
        theme={telecomRingThemes.flowDir}
        ratio={otherRatio ?? 0}
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