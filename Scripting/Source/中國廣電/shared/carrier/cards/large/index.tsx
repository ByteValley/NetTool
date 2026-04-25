// shared/carrier/cards/large/index.tsx
// 大号组件布局：四卡（话费 + 通用流量 + 定向流量 + 语音）

import {
  VStack,
  HStack,
} from "scripting"

import { outerCardBg, ringThemes } from "../../theme"
import { FeeCard } from "../components/feeCard"
import { FullRingStatCard } from "../components/fullRingStatCard"

export type TelecomLargeLayoutProps = {
  // 话费
  feeTitle: string
  feeText: string
  logoPath: string
  updateTime: string

  // 通用流量
  flowTitle: string
  flowValueText: string
  flowRatio: number

  // 定向流量
  otherTitle: string
  otherValueText: string
  otherRatio: number

  // 语音
  voiceTitle: string
  voiceValueText: string
  voiceRatio: number
}

export function TelecomLargeLayout(props: TelecomLargeLayoutProps) {
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
    <VStack
      alignment="center"
      padding={{ top: 10, leading: 10, bottom: 10, trailing: 10 }}
      widgetBackground={{
        style: outerCardBg,
        shape: { type: "rect", cornerRadius: 24, style: "continuous" },
      }}
    >
      <HStack alignment="center" spacing={10}>
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

        <FullRingStatCard
          title={otherTitle}
          valueText={otherValueText}
          theme={ringThemes.flowDir}
          ratio={otherRatio}
        />

        <FullRingStatCard
          title={voiceTitle}
          valueText={voiceValueText}
          theme={ringThemes.voice}
          ratio={voiceRatio}
        />
      </HStack>
    </VStack>
  )
}