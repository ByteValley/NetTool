// shared/carrier/cards/medium/styles/FullRingCardStyle.tsx
import type { MediumCommonProps } from "../common"
import { DEFAULT_WIDGET_SURFACES, MediumOuter } from "../common"
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
    transparent,
    surfaces,
  } = props

  const palette = surfaces ?? DEFAULT_WIDGET_SURFACES

  const showOther =
    (typeof otherTitle === "string" && otherTitle.trim().length > 0) ||
    (typeof otherValueText === "string" && otherValueText.trim().length > 0)

  return (
    <MediumOuter surfaces={palette}>
      <FeeCard
        title={feeTitle}
        valueText={feeText}
        theme={ringThemes.fee}
        logoPath={logoPath}
        updateTime={updateTime}
        transparent={transparent}
        surfaces={palette}
      />

      <FullRingStatCard
        title={flowTitle}
        valueText={flowValueText}
        theme={ringThemes.flow}
        ratio={flowRatio}
        transparent={transparent}
        surfaces={palette}
      />

      {showOther ? (
        <FullRingStatCard
          title={otherTitle ?? "定向流量"}
          valueText={otherValueText ?? "0MB"}
          theme={ringThemes.flowDir}
          ratio={otherRatio ?? 0}
          transparent={transparent}
          surfaces={palette}
        />
      ) : null}

      <FullRingStatCard
        title={voiceTitle}
        valueText={voiceValueText}
        theme={ringThemes.voice}
        ratio={voiceRatio}
        transparent={transparent}
        surfaces={palette}
      />
    </MediumOuter>
  )
}
