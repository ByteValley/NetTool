// telecom/cards/small/common.tsx
import { Text, Image } from "scripting"
import { telecomRingThemes } from "../../theme"
import type { VisualStyleConfig } from "../../visualStyle"

/**
 * 小号组件通用 Props：
 *  - 顶部：话费 + logo + 更新时间（可选）
 *  - 数据：总流量（summary 用）、通用/定向/语音（其它样式用）
 *  - smallMiniBarUseTotalFlow：仅对 CompactList / ProgressList 生效（2行/3行联动）
 */
export type SmallCardCommonProps = {
  // 顶部：话费 + logo + 更新时间
  feeTitle: string
  feeText: string
  logoPath: string
  updateTime?: string

  // 总流量（可能包含定向）：给 summary 用
  totalFlowLabel: string
  totalFlowValue: string
  totalFlowUnit: string
  totalFlowRatio: number

  // 通用流量（其它样式一般用它）
  flowLabel: string
  flowValue: string
  flowUnit: string
  flowRatio: number

  // 定向流量（可空）
  otherFlowLabel?: string
  otherFlowValue?: string | number
  otherFlowUnit?: string
  otherFlowRatio?: number

  // 语音
  voiceLabel: string
  voiceValue: string
  voiceUnit: string
  voiceRatio: number

  /** 仅作用于 CompactList / ProgressList：true=总流量+语音（2行），false=通用+定向+语音（3行） */
  smallMiniBarUseTotalFlow?: boolean

  /** 视觉样式控制 */
  visualStyle?: VisualStyleConfig
}

// ========= 小工具：Logo + 胶囊单位 =========

export function LogoImage(props: { logoPath: string; size?: number }) {
  const { logoPath, size = 26 } = props

  if (!logoPath) {
    return (
      <Image
        systemName="antenna.radiowaves.left.and.right"
        font={size}
        fontWeight="semibold"
        foregroundStyle={telecomRingThemes.flow.tint}
      />
    )
  }

  if (logoPath.startsWith("http://") || logoPath.startsWith("https://")) {
    return (
      <Image
        imageUrl={logoPath}
        resizable
        frame={{ width: size, height: size }}
      />
    )
  }

  return (
    <Image
      filePath={logoPath}
      resizable
      frame={{ width: size, height: size }}
    />
  )
}

export function UnitPill(props: { text: string }) {
  return (
    <Text
      font={9}
      fontWeight="semibold"
      padding={{ top: 2, leading: 8, bottom: 2, trailing: 8 }}
      widgetBackground={{
        style: "systemGray5",
        shape: { type: "capsule", style: "continuous" },
      }}
    >
      {props.text}
    </Text>
  )
}