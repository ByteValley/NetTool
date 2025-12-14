// telecom/cards/small/index.tsx

import type { SmallCardCommonProps } from "./common"
import { TelecomSmallSummaryCard } from "./summaryCardStyle"

import {
  renderSmallCard,
  SMALL_STYLE_OPTIONS,
  type SmallStyleKey,
} from "./smallCardStyles"

/*
后续再加样式，只需要：
1）在 smallCardStyles.tsx 里扩展 SmallStyleKey + 组件
2）renderSmallCard 里加 case
3）SMALL_STYLE_OPTIONS 里注册显示名
*/

export type SmallCardStyle = "summary" | SmallStyleKey

export type TelecomSmallCardProps = SmallCardCommonProps & {
  style: SmallCardStyle
}

export { SMALL_STYLE_OPTIONS }
export type { SmallStyleKey }

export function TelecomSmallCard(props: TelecomSmallCardProps) {
  const { style, ...rest } = props

  if (style === "summary") {
    return <TelecomSmallSummaryCard {...rest} />
  }

  return renderSmallCard(style, rest)
}