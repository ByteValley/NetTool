// telecom/cards/medium/index.tsx
import type {
  MediumLayout,
  TelecomMediumCommonProps,
} from "./common"
import { TelecomMediumThreeCard } from "./threeCardStyle"
import { TelecomMediumFourCard } from "./fourCardStyle"

export type { MediumLayout, TelecomMediumCommonProps }

/**
 * 对外统一入口：
 *  - layout = "three" → 三卡布局
 *  - layout = "four"  → 四卡布局
 *
 * 调用方（widgetRoot）保持不变：
 *   <TelecomMediumLayout layout={mediumCardStyle} ... />
 */
export function TelecomMediumLayout(
  props: TelecomMediumCommonProps & { layout: MediumLayout },
) {
  const { layout, ...rest } = props

  if (layout === "three") {
    return <TelecomMediumThreeCard {...rest} />
  }

  // 默认走四卡
  return <TelecomMediumFourCard {...rest} />
}