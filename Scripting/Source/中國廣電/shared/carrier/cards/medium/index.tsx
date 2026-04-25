// shared/carrier/cards/medium/index.tsx
import type { MediumCommonProps, MediumStyleKey } from "./common"

import { DialRingCardStyle } from "./styles/DialRingCardStyle"
import { FullRingCardStyle } from "./styles/FullRingCardStyle"

export type { MediumCommonProps, MediumStyleKey }

export function MediumLayout(props: MediumCommonProps & { layout: MediumStyleKey }) {
  const { layout, ...rest } = props
  return layout === "DialRing"
    ? <DialRingCardStyle {...rest} />
    : <FullRingCardStyle {...rest} />
}

export const MEDIUM_STYLE_OPTIONS: Array<{ key: MediumStyleKey; nameCN: string; nameEN: string }> = [
  { key: "FullRing", nameCN: "全圆环", nameEN: "FullRing" },
  { key: "DialRing", nameCN: "仪表盘", nameEN: "DialRing" },
]