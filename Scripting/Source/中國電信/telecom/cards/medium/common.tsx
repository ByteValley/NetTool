// telecom/cards/medium/common.tsx
import { VStack, HStack } from "scripting"
import { outerCardBg } from "../../theme"

export type MediumLayout = "three" | "four"

export type TelecomMediumCommonProps = {
  feeTitle: string
  feeText: string
  logoPath: string
  updateTime: string

  // 通用 / 总流量
  flowTitle: string
  flowValueText: string
  flowRatio: number

  // 定向流量（四卡可见）
  otherTitle?: string
  otherValueText?: string
  otherRatio?: number

  // 语音
  voiceTitle: string
  voiceValueText: string
  voiceRatio: number
}

/**
 * 中号卡片公共外壳：
 *  - 白色大圆角卡片
 *  - 内部一行 HStack 放 3 / 4 个 Ring 卡
 */
export function TelecomMediumOuter(props: { children: any }) {
  const { children } = props

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
        {children}
      </HStack>
    </VStack>
  )
}