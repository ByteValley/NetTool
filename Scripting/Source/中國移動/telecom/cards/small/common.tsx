// telecom/cards/small/common.tsx
import {
  Text,
  Image,
} from "scripting"
import { telecomRingThemes } from "../../theme"

/**
 * 小号组件公用的 props：
 *  - 话费 + logo
 *  - 通用流量 / 定向流量 / 语音
 *  - （可选）更新时间和百分比进度
 * - summary：用 totalFlow + voice
 * - mini：用 flow + otherFlow + voice
 * - bar：用 flow + otherFlow + voice + 各自 ratio
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

  // 通用流量
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

  /** 仅作用于 CompactList / ProgressList */
  smallMiniBarUseTotalFlow?: boolean
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