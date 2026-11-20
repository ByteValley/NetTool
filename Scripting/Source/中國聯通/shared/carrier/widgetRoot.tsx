/* =====================================================================
 * shared/carrier/widgetRoot.tsx
 *
 * 模块分类 · 背景
 * - 根 UI：小号 / 中号 / 大号统一入口
 * - 负责消费 UiSettings + CarrierData，组装卡片并渲染
 *
 * 模块分类 · 目标
 * - 避免类型冲突：只 import type，不在本地重复声明 UiSettings/SmallCardStyle
 * - small 卡入口统一走 SmallLayout（cards/small 对外导出的组件名）
 * - 三卡模式：用“总流量”替换“通用流量”卡，并隐藏定向卡
 *
 * 模块分类 · 使用方式
 * - Widget.present(<WidgetRoot data={...} ui={...} logoPath={...} />)
 *
 * 模块分类 · 日志与边界
 * - 本文件不打日志；日志应在业务层 widget.tsx 输出
 * ===================================================================== */

import { Widget, VStack, HStack } from "scripting"

import { outerCardBg, ringThemes } from "./theme"
import { buildUsageStat, formatFlowValue } from "./utils/carrierUtils"
import type { UiSettings } from "./ui"
import { buildWidgetSurfaces } from "./surfaces"

import { MediumLayout } from "./cards/medium"
import { FeeCard } from "./cards/components/feeCard"
import { FullRingStatCard } from "./cards/components/fullRingStatCard"

// ✅ 小号卡入口：cards/small/index.tsx 对外导出的是 SmallLayout
import { SmallLayout, type SmallCardStyle } from "./cards/small"

/* =====================================================================
 * 模块分类 · 公共数据结构
 *
 * 模块分类 · 背景
 * - 电信 / 联通 / 移动统一复用
 *
 * 模块分类 · 目标
 * - 与业务层 widget.tsx 对齐
 *
 * 模块分类 · 日志与边界
 * - 类型区无日志
 * ===================================================================== */

export type CarrierData = {
  fee: { title: string; balance: string; unit: string }
  voice: { title: string; balance: string; unit: string; used?: number; total?: number }
  flow: { title: string; balance: string; unit: string; used?: number; total?: number }
  otherFlow?: { title: string; balance: string; unit: string; used?: number; total?: number }
  updateTime: string
}

/* =====================================================================
 * 模块分类 · WidgetRoot
 *
 * 模块分类 · 背景
 * - 小号：SmallLayout（summary / CompactList / ProgressList / ...）
 * - 中号：MediumLayout（三卡/四卡由 ui.mediumUseThreeCard 决定）
 * - 大号：RingCard 四格（Fee + Flow + OtherFlow + Voice）
 *
 * 模块分类 · 目标
 * - showRemainRatio：决定“显示剩余 / 显示已用”
 * - includeDirectionalInTotal：决定“总流量是否计入定向”
 * - mediumUseThreeCard：三卡=总/语音/话费；四卡=通用/定向/语音/话费（由布局组件消费）
 *
 * 模块分类 · 日志与边界
 * - 纯渲染逻辑；不做数据请求/缓存
 * ===================================================================== */

export function WidgetRoot(props: { data: CarrierData; ui: UiSettings; logoPath: string }) {
  const { data, ui, logoPath } = props

  const transparent = !!ui.transparentWidgetStyle

  const surfaces = buildWidgetSurfaces({
    transparentStyle: transparent,
    colorfulLineBorder: ui.colorfulLineBorder,
  })

  const {
    showRemainRatio,
    mediumStyle,
    mediumUseThreeCard,
    includeDirectionalInTotal,
    smallCardStyle,
    smallMiniBarUseTotalFlow,
  } = ui

  const useTotalFlow = !!mediumUseThreeCard

  // ==================== 语音 ====================

  const voiceStat = buildUsageStat(data.voice.total ?? 0, data.voice.used ?? 0, showRemainRatio)
  const voiceTitle = showRemainRatio ? "剩余语音" : "已用语音"
  const voiceValueText = `${voiceStat.display.toFixed(0)}${data.voice.unit}`

  // ==================== 通用流量（MB 视角）====================

  const flowStat = buildUsageStat(data.flow.total ?? 0, data.flow.used ?? 0, showRemainRatio)
  const flowDisplayFormatted = formatFlowValue(flowStat.display, "MB")
  const flowTitle = showRemainRatio ? "通用流量" : "已用通用流量"
  const flowValueText = `${flowDisplayFormatted.balance}${flowDisplayFormatted.unit}`

  // ==================== 定向流量（可空）====================

  const otherRaw =
    data.otherFlow ?? {
      title: "定向流量",
      balance: "0",
      unit: "MB",
      used: 0,
      total: 0,
    }

  const otherStat = buildUsageStat(otherRaw.total ?? 0, otherRaw.used ?? 0, showRemainRatio)
  const otherDisplayFormatted = formatFlowValue(otherStat.display, "MB")
  const otherTitle = showRemainRatio ? "定向流量" : "已用定向流量"
  const otherValueText = `${otherDisplayFormatted.balance}${otherDisplayFormatted.unit}`

  // ==================== 总流量（通用 + 可选定向）====================

  const totalUsed = flowStat.used + (includeDirectionalInTotal ? otherStat.used : 0)
  const totalTotal = flowStat.total + (includeDirectionalInTotal ? otherStat.total : 0)

  const totalStat = buildUsageStat(totalTotal, totalUsed, showRemainRatio)
  const totalDisplayFormatted = formatFlowValue(totalStat.display, "MB")

  const totalFlowTitle = includeDirectionalInTotal
    ? showRemainRatio
      ? "总流量"
      : "已用总流量"
    : flowTitle

  const totalFlowValueText = `${totalDisplayFormatted.balance}${totalDisplayFormatted.unit}`

  // ==================== 小号 ====================

  if (Widget.family === "systemSmall") {
    const style: SmallCardStyle = (smallCardStyle as SmallCardStyle) || ("summary" as SmallCardStyle)

    const rawVoiceUnit = data.voice.unit || "分钟"
    const voiceUnitLabel =
      rawVoiceUnit.includes("分") || rawVoiceUnit.toLowerCase?.().includes("min") ? "分钟" : rawVoiceUnit

    const summaryTotalFlowLabel = includeDirectionalInTotal ? "总流量" : "通用流量"
    const summaryTotalFlowUnit = includeDirectionalInTotal ? totalDisplayFormatted.unit : flowDisplayFormatted.unit
    const summaryTotalFlowValue = includeDirectionalInTotal ? totalDisplayFormatted.balance : flowDisplayFormatted.balance
    const summaryTotalFlowRatio = includeDirectionalInTotal ? totalStat.ratio : flowStat.ratio

    return (
      <SmallLayout
        style={style}
        surfaces={surfaces}
        feeTitle={data.fee.title}
        feeText={`${data.fee.balance}${data.fee.unit}`}
        logoPath={logoPath}
        updateTime={data.updateTime}
        totalFlowLabel={summaryTotalFlowLabel}
        totalFlowValue={summaryTotalFlowValue}
        totalFlowUnit={summaryTotalFlowUnit}
        totalFlowRatio={summaryTotalFlowRatio}
        flowLabel={"通用流量"}
        flowValue={flowDisplayFormatted.balance}
        flowUnit={flowDisplayFormatted.unit}
        flowRatio={flowStat.ratio}
        otherFlowLabel={"定向流量"}
        otherFlowValue={otherDisplayFormatted.balance}
        otherFlowUnit={otherDisplayFormatted.unit}
        otherFlowRatio={otherStat.ratio}
        voiceLabel={showRemainRatio ? "剩余语音" : "已用语音"}
        voiceValue={voiceStat.display.toFixed(0)}
        voiceUnit={voiceUnitLabel}
        voiceRatio={voiceStat.ratio}
        smallMiniBarUseTotalFlow={!!smallMiniBarUseTotalFlow}
      />
    )
  }

  // ==================== 中号 ====================

  if (Widget.family === "systemMedium") {
    return (
      <MediumLayout
        layout={mediumStyle}
        surfaces={surfaces}
        transparent={transparent}
        feeTitle={data.fee.title}
        feeText={`${data.fee.balance}${data.fee.unit}`}
        logoPath={logoPath}
        updateTime={data.updateTime}
        flowTitle={useTotalFlow ? totalFlowTitle : flowTitle}
        flowValueText={useTotalFlow ? totalFlowValueText : flowValueText}
        flowRatio={useTotalFlow ? totalStat.ratio : flowStat.ratio}
        otherTitle={useTotalFlow ? undefined : otherTitle}
        otherValueText={useTotalFlow ? undefined : otherValueText}
        otherRatio={useTotalFlow ? undefined : otherStat.ratio}
        voiceTitle={voiceTitle}
        voiceValueText={voiceValueText}
        voiceRatio={voiceStat.ratio}
      />
    )
  }

  // ==================== 大号 ====================

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
        <FeeCard
          title={data.fee.title}
          valueText={`${data.fee.balance}${data.fee.unit}`}
          theme={ringThemes.fee}
          logoPath={logoPath}
          updateTime={data.updateTime}
          transparent={transparent}
          surfaces={surfaces}
        />

        <FullRingStatCard
          title={flowTitle}
          valueText={flowValueText}
          theme={ringThemes.flow}
          ratio={flowStat.ratio}
          transparent={transparent}
          surfaces={surfaces}
        />

        <FullRingStatCard
          title={otherTitle}
          valueText={otherValueText}
          theme={ringThemes.flowDir}
          ratio={otherStat.ratio}
          transparent={transparent}
          surfaces={surfaces}
        />

        <FullRingStatCard
          title={voiceTitle}
          valueText={voiceValueText}
          theme={ringThemes.voice}
          ratio={voiceStat.ratio}
          transparent={transparent}
          surfaces={surfaces}
        />
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
