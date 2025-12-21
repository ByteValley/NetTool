// shared/carrier/cards/components/dialRingStatCard.tsx

import { VStack, Text, Image, Spacer, ZStack, Gauge } from "scripting"
import { RingCardTheme, timeStyle } from "../../theme"
import { type WidgetSurfacePalette, wrapWithBorderLayer } from "../../surfaces"
import { clamp01, percentText } from "../../utils/carrierUtils"

const Empty = <Text font={1}> </Text>

/**
 * DialRingStatCard（缺口仪表盘）
 * - 百分比固定在圆心
 * - 图标固定到缺口附近（单独一层，不在同一个 VStack 里上下塞，避免裁剪）
 */
export function DialRingStatCard(props: {
  title: string
  valueText: string
  theme: RingCardTheme
  ratio?: number
  surfaces?: WidgetSurfacePalette
}) {
  const { title, valueText, theme, ratio, surfaces } = props
  const r = clamp01(ratio ?? 0)

  const background = surfaces?.panel ?? theme.bg

  const card = (
    <VStack
      alignment="center"
      padding={{ top: 10, leading: 8, bottom: 10, trailing: 8 }}
      frame={{ minWidth: 0, maxWidth: Infinity }}
      widgetBackground={{
        style: background,
        shape: { type: "rect", cornerRadius: 18, style: "continuous" },
      }}
    >
      <Spacer minLength={2} />
      <ZStack frame={{ width: 56, height: 56 }}>
        <Gauge
          value={r}
          min={0}
          max={1}
          label={Empty}
          currentValueLabel={Empty}
          gaugeStyle="accessoryCircular"
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

  return wrapWithBorderLayer({ child: card, surfaces, cornerRadius: 18, padding: 2 })
}