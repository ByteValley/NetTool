// styles/registry.ts
import type { SGCCWidgetRenderer } from "./types"

import { renderClassic } from "./classic"
import { renderBillPanel } from "./billPanel"

export type SGCCWidgetStyleKey = "classic" | "billPanel"

export const SGCC_WIDGET_STYLES: Record<SGCCWidgetStyleKey, SGCCWidgetRenderer> = {
  classic: renderClassic,
  billPanel: renderBillPanel,
}

export const SGCC_WIDGET_STYLE_OPTIONS: Array<{ label: string; value: SGCCWidgetStyleKey }> = [
  { label: "经典样式", value: "classic" },
  { label: "账单面板", value: "billPanel" },
]