// shared/carrier/cards/components/fullRingStatCard.tsx

import { VStack, Text, Image, Spacer, ZStack, Gauge } from "scripting"
import { RingCardTheme, timeStyle } from "../../theme"
import { clamp01, percentText } from "../../utils/carrierUtils"

/**
 * FullRingStatCard（全圆环）
 * - icon + 百分比均放圆心区域（同组切换由外部传入 ratio 控制）
 */
export function FullRingStatCard(props: {
  title: string
  valueText: string
  theme: RingCardTheme
  ratio?: number
}) {
  const { title, valueText, theme, ratio } = props
  const r = clamp01(ratio ?? 0)

  return (
    <VStack
      alignment="center"
      padding={{ top: 10, leading: 8, bottom: 10, trailing: 8 }}
      frame={{ minWidth: 0, maxWidth: Infinity }}
      widgetBackground={{
        style: theme.bg,
        shape: { type: "rect", cornerRadius: 18, style: "continuous" },
      }}
    >
      <Spacer minLength={2} />
      <ZStack frame={{ width: 56, height: 56 }}>
        <Gauge
          value={r}
          min={0}
          max={1}
          label={<Text font={1}> </Text>}
          currentValueLabel={<Text font={1}> </Text>}
          gaugeStyle="accessoryCircularCapacity"
          tint={theme.tint}
        />
        <VStack alignment="center">
          <Spacer minLength={4} />
          <Image
            systemName={theme.icon}
            font={12}
            fontWeight="semibold"
            foregroundStyle={theme.tint}
          />
          <Spacer minLength={2} />
          <Text font={11} fontWeight="semibold" foregroundStyle={theme.tint}>
            {percentText(r)}
          </Text>
          <Text font={9} foregroundStyle={timeStyle}>
            %
          </Text>
          <Spacer minLength={4} />
        </VStack>
      </ZStack>

      <Spacer minLength={6} />
      <Text
        font={15}
        fontWeight="semibold"
        foregroundStyle={theme.tint}
        lineLimit={1}
        minScaleFactor={0.7}
      >
        {valueText}
      </Text>
      <Spacer minLength={2} />
      <Text
        font={10}
        fontWeight="semibold"
        foregroundStyle={theme.tint}
        lineLimit={1}
        minScaleFactor={0.7}
      >
        {title}
      </Text>
      <Spacer minLength={4} />
    </VStack>
  )
}