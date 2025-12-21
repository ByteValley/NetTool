// telecom/widgetRoot.tsx

import { Widget, VStack, HStack } from "scripting"
import { outerCardBg, ringThemes } from "./theme"
import { buildUsageStat, formatFlowValue } from "./utils/telecomUtils"
import type { UiSettings } from "./settings"
import { loadUiSettings } from "./settings"
import { buildCardBackground, VisualStyleConfig, wrapWithOutline } from "./visualStyle"

import { MediumLayout } from "./cards/medium"
import { FeeCard } from "./cards/components/feeCard"
import { FullRingStatCard } from "./cards/components/fullRingStatCard"
import { TelecomSmallCard } from "./cards/small"
import type { SmallCardStyle } from "./cards/small"

// 公共数据结构：电信 / 联通 / 移动都可以共用
export type TelecomData = {
  fee: { title: string; balance: string; unit: string }
  voice: { title: string; balance: string; unit: string; used?: number; total?: number }
  flow: { title: string; balance: string; unit: string; used?: number; total?: number }
  otherFlow?: { title: string; balance: string; unit: string; used?: number; total?: number }
  updateTime: string
}

// 根 UI：小号 / 中号 / 大号，已用/剩余、是否合并定向流量，全在这里消费
export function WidgetRoot(props: {
  data: TelecomData
  settingsKey: string
  logoPath: string
}) {
  const { data, settingsKey, logoPath } = props
  const ui: UiSettings = loadUiSettings(settingsKey)

  const {
    showRemainRatio,

    // ✅ 新结构：中号样式 + 三卡/四卡
    mediumStyle,       // "FullRing" | "DialRing"
    mediumUseThreeLayout,

    includeDirectionalInTotal,

    smallCardStyle,
    smallMiniBarUseTotalFlow,

    useTransparentStyle,
    useTintBorderOnTransparent,
  } = ui

  const visualStyle: VisualStyleConfig = {
    useTransparentStyle,
    useTintBorderOnTransparent,
  }

  // ✅ 新结构：用布局决定“是否走总流量三卡”
  const useTotalFlow = mediumUseThreeLayout

  // ===== 语音 =====
  const voiceStat = buildUsageStat(
    data.voice.total ?? 0,
    data.voice.used ?? 0,
    showRemainRatio,
  )
  const voiceTitle = showRemainRatio ? "剩余语音" : "已用语音"
  const voiceValueText = `${voiceStat.display.toFixed(0)}${data.voice.unit}`

  // ===== 通用流量（MB 视角）=====
  const flowStat = buildUsageStat(
    data.flow.total ?? 0,
    data.flow.used ?? 0,
    showRemainRatio,
  )
  const flowDisplayFormatted = formatFlowValue(flowStat.display, "MB")
  const flowTitle = showRemainRatio ? "通用流量" : "已用通用流量"
  const flowValueText = `${flowDisplayFormatted.balance}${flowDisplayFormatted.unit}`

  // ===== 定向流量（可空）=====
  const otherRaw =
    data.otherFlow ?? {
      title: "定向流量",
      balance: "0",
      unit: "MB",
      used: 0,
      total: 0,
    }

  const otherStat = buildUsageStat(
    otherRaw.total ?? 0,
    otherRaw.used ?? 0,
    showRemainRatio,
  )
  const otherDisplayFormatted = formatFlowValue(otherStat.display, "MB")
  const otherTitle = showRemainRatio ? "定向流量" : "已用定向流量"
  const otherValueText = `${otherDisplayFormatted.balance}${otherDisplayFormatted.unit}`

  // ===== 三卡模式下的总流量（通用 + 可选定向）=====
  const totalUsed =
    flowStat.used + (includeDirectionalInTotal ? otherStat.used : 0)
  const totalTotal =
    flowStat.total + (includeDirectionalInTotal ? otherStat.total : 0)

  const totalStat = buildUsageStat(totalTotal, totalUsed, showRemainRatio)
  const totalDisplayFormatted = formatFlowValue(totalStat.display, "MB")

  const totalFlowTitle = includeDirectionalInTotal
    ? (showRemainRatio ? "总流量" : "已用总流量")
    : (showRemainRatio ? "通用流量" : "已用通用流量")

  const totalFlowValueText = `${totalDisplayFormatted.balance}${totalDisplayFormatted.unit}`

  // ===== 小号：summary / CompactList / ProgressList / 其它样式 =====
  if (Widget.family === "systemSmall") {
    const style: SmallCardStyle = (smallCardStyle as SmallCardStyle) || "summary"

    const rawVoiceUnit = data.voice.unit || "分钟"
    const voiceUnitLabel =
      rawVoiceUnit.includes("分") || rawVoiceUnit.toLowerCase?.().includes("min")
        ? "分钟"
        : rawVoiceUnit

    // summary 用（总流量可能包含定向）
    const summaryTotalFlowLabel = includeDirectionalInTotal ? "总流量" : "通用流量"
    const summaryTotalFlowUnit = includeDirectionalInTotal
      ? totalDisplayFormatted.unit
      : flowDisplayFormatted.unit
    const summaryTotalFlowValue = includeDirectionalInTotal
      ? totalDisplayFormatted.balance
      : flowDisplayFormatted.balance
    const summaryTotalFlowRatio = includeDirectionalInTotal
      ? totalStat.ratio
      : flowStat.ratio

    // 通用 / 定向：永远都准备好，具体显示由样式决定
    const commonFlowLabel = "通用流量"
    const commonFlowUnit = flowDisplayFormatted.unit
    const commonFlowValue = flowDisplayFormatted.balance

    const dirFlowLabel = "定向流量"
    const dirFlowUnit = otherDisplayFormatted.unit
    const dirFlowValue = otherDisplayFormatted.balance

    return (
      <TelecomSmallCard
        style={style}
        feeTitle={data.fee.title}
        feeText={`${data.fee.balance}${data.fee.unit}`}
        logoPath={logoPath}
        updateTime={data.updateTime}
        visualStyle={visualStyle}

        // summary 用
        totalFlowLabel={summaryTotalFlowLabel}
        totalFlowValue={summaryTotalFlowValue}
        totalFlowUnit={summaryTotalFlowUnit}
        totalFlowRatio={summaryTotalFlowRatio}

        // 通用流量
        flowLabel={commonFlowLabel}
        flowValue={commonFlowValue}
        flowUnit={commonFlowUnit}
        flowRatio={flowStat.ratio}

        // 定向流量
        otherFlowLabel={dirFlowLabel}
        otherFlowValue={dirFlowValue}
        otherFlowUnit={dirFlowUnit}
        otherFlowRatio={otherStat.ratio}

        // 语音
        voiceLabel={showRemainRatio ? "剩余语音" : "已用语音"}
        voiceValue={voiceStat.display.toFixed(0)}
        voiceUnit={voiceUnitLabel}
        voiceRatio={voiceStat.ratio}

        // ✅ CompactList / ProgressList 联动开关
        smallMiniBarUseTotalFlow={!!smallMiniBarUseTotalFlow}
      />
    )
  }

  // ===== 中号：三卡 / 四卡（新结构）=====
  if (Widget.family === "systemMedium") {
    return (
      <MediumLayout
        layout={mediumStyle}
        feeTitle={data.fee.title}
        feeText={`${data.fee.balance}${data.fee.unit}`}
        logoPath={logoPath}
        updateTime={data.updateTime}
        visualStyle={visualStyle}

        // 三卡：这里切总流量；四卡：这里切通用
        flowTitle={useTotalFlow ? totalFlowTitle : flowTitle}
        flowValueText={useTotalFlow ? totalFlowValueText : flowValueText}
        flowRatio={useTotalFlow ? totalStat.ratio : flowStat.ratio}

        // ✅ 三卡：隐藏定向卡（通过传 undefined）
        otherTitle={useTotalFlow ? undefined : otherTitle}
        otherValueText={useTotalFlow ? undefined : otherValueText}
        otherRatio={useTotalFlow ? undefined : otherStat.ratio}

        voiceTitle={voiceTitle}
        voiceValueText={voiceValueText}
        voiceRatio={voiceStat.ratio}
      />
    )
  }

  // ===== 大号：四格 RingCard =====
  return (
    {wrapWithOutline(
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
        <FeeCard
          title={data.fee.title}
          valueText={`${data.fee.balance}${data.fee.unit}`}
          theme={ringThemes.fee}
          logoPath={logoPath}
          updateTime={data.updateTime}
        />

        <FullRingStatCard
          title={flowTitle}
          valueText={flowValueText}
          theme={ringThemes.flow}
          ratio={flowStat.ratio}
        />

        <FullRingStatCard
          title={otherTitle}
          valueText={otherValueText}
          theme={ringThemes.flowDir}
          ratio={otherStat.ratio}
        />

        <FullRingStatCard
          title={voiceTitle}
          valueText={voiceValueText}
          theme={ringThemes.voice}
          ratio={voiceStat.ratio}
        />
      </HStack>
      </VStack>,
      { visual: visualStyle, cornerRadius: 24 },
    )}
  )
}