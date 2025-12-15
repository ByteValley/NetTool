// telecom/cards/medium/styles/FullRingCardStyle.tsx
import type { MediumCommonProps } from "../common"
import { MediumOuter } from "../common"
import { FeeCard } from "../../components/feeCard"
import { FullRingStatCard } from "../../components/fullRingStatCard"
import { ringThemes } from "../../../theme"

/**
 * FullRingCardStyle：四卡（话费 + 通用/总流量 + 定向 + 语音）
 * - Ring 卡统一使用 FullRingStatCard
 * - 三卡模式：外部通过 otherTitle/otherValueText/otherRatio 传 undefined 隐藏定向卡
 */
export function FullRingCardStyle(props: MediumCommonProps) {
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

  const showOther =
    (typeof otherTitle === "string" && otherTitle.trim().length > 0) ||
    (typeof otherValueText === "string" && otherValueText.trim().length > 0)

  return (
    <MediumOuter>
      <FeeCard
        title={feeTitle}
        valueText={feeText}
        theme={ringThemes.fee}
        logoPath={logoPath}
        updateTime={updateTime}
      />

      <FullRingStatCard
        title={flowTitle}
        valueText={flowValueText}
        theme={ringThemes.flow}
        ratio={flowRatio}
      />

      {showOther ? (
        <
          FullRingStatCard
          title={otherTitle ?? "定向流量"}
          valueText={otherValueText ?? "0MB"}
          theme={ringThemes.flowDir}
          ratio={otherRatio ?? 0}
        />
      ) : null}

      <FullRingStatCard
        title={voiceTitle}
        valueText={voiceValueText}
        theme={ringThemes.voice}
        ratio={voiceRatio}
      />
    </MediumOuter>
  )
}