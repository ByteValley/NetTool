// shared/carrier/cards/small/index.tsx

import type { SmallCardCommonProps } from "./common"
import { TelecomSmallSummaryCard } from "./summaryCardStyle"

// 其它小号样式：统一走 styles 注册表
import {
  renderSmallCard,
  SMALL_STYLE_OPTIONS,
  type SmallStyleKey,
} from "./smallCardStyles"

/**
 * 小号组件对外暴露的样式 Key：
 * - "summary"：固定摘要卡（总流量 + 语音）
 * - 其它：SmallStyleKey（由 smallCardStyles.tsx 注册）
 */
export type SmallCardStyle = "summary" | SmallStyleKey

export type TelecomSmallCardProps = SmallCardCommonProps & {
  style: SmallCardStyle
}

export { SMALL_STYLE_OPTIONS }
export type { SmallStyleKey }

/**
 * 对外统一入口：
 *  - style = "summary" → 摘要卡（总流量 + 语音）
 *  - 其它 style         → smallCardStyles 注册的布局
 */
export function SmallLayout(props: TelecomSmallCardProps) {
  const { style, ...rest } = props

  if (style === "summary") {
    return <TelecomSmallSummaryCard {...rest} />
  }

  return renderSmallCard(style, rest)
}