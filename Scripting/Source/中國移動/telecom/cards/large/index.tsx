// telecom/cards/large/index.tsx
// 大号组件布局：四卡（话费 + 通用流量 + 定向流量 + 语音）

import {
  VStack,
  HStack,
} from "scripting"

import { outerCardBg, telecomRingThemes } from "../../theme"
import { TelecomFeeCard } from "../feeCard"
import { TelecomRingStatCard } from "../ringStatCard"

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
          title={otherTitle}
          valueText={otherValueText}
          theme={telecomRingThemes.flowDir}
          ratio={otherRatio}
        />

        <TelecomRingStatCard
          title={voiceTitle}
          valueText={voiceValueText}
          theme={telecomRingThemes.voice}
          ratio={voiceRatio}
        />
      </HStack>
    </VStack>
  )
}