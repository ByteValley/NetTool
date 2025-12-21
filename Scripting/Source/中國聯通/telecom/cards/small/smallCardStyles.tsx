// telecom/cards/small/smallCardStyles.tsx

import { VStack, HStack, ZStack, Text, Spacer, Image } from "scripting"
import type { SmallCardCommonProps } from "./common"
import { ringThemes, timeStyle } from "../../theme"
import type { RingCardTheme } from "../../theme"
import {
  buildCardBackground,
  wrapWithOutline,
  defaultVisualStyle,
  type VisualStyleConfig,
} from "../../visualStyle"

// =====================================================================
// Layout Helpers · 强制“靠左”
// 说明：有些渲染器在 VStack 内对 Text 会出现“视觉居中”倾向
// 这里用 HStack + Spacer() 直接把内容钉死在左侧
// =====================================================================
function Left(props: { children: any }) {
  return (
    <HStack alignment="center" spacing={0} frame={{ minWidth: 0, maxWidth: Infinity }}>
      {props.children}
      <Spacer />
    </HStack>
  )
}

function Right(props: { children: any }) {
  return (
    <HStack alignment="center" spacing={0} frame={{ minWidth: 0, maxWidth: Infinity }}>
      <Spacer />
      {props.children}
    </HStack>
  )
}

// =====================================================================
// SmallCardSurface · 外壳统一：systemBackground + 单一圆角（防露边）
// 关键：外层不要 center；否则内部“块”容易被居中摆放
// =====================================================================
function SmallCardSurface(props: { children: any; visualStyle?: VisualStyleConfig }) {
  const visualStyle = props.visualStyle ?? defaultVisualStyle
  const card = (
    <VStack
      alignment="leading"
      padding={{ top: 6, leading: 8, bottom: 6, trailing: 8 }}
      widgetBackground={buildCardBackground({
        visual: visualStyle,
        base: "systemBackground",
        cornerRadius: 26,
      })}
      frame={{ minWidth: 0, maxWidth: Infinity, minHeight: 0, maxHeight: Infinity }}
    >
      <Spacer minLength={2} />

      <VStack alignment="leading" frame={{ minWidth: 0, maxWidth: Infinity }}>
        {props.children}
      </VStack>

      <Spacer minLength={2} />
    </VStack>
  )

  return wrapWithOutline(card, { visual: visualStyle, cornerRadius: 26 })
}

// =====================================================================
// ContentCard · 内容卡统一：半透明背景 + 次级圆角
// =====================================================================
function ContentCard(props: {
  children: any
  padding?: { top: number; leading: number; bottom: number; trailing: number }
  visualStyle?: VisualStyleConfig
}) {
  const pad = props.padding ?? { top: 6, leading: 10, bottom: 6, trailing: 10 }
  const visualStyle = props.visualStyle ?? defaultVisualStyle
  const card = (
    <VStack
      alignment="leading"
      padding={pad}
      frame={{ minWidth: 0, maxWidth: Infinity }}
      widgetBackground={buildCardBackground({
        visual: visualStyle,
        base: { light: "rgba(0,0,0,0.04)", dark: "rgba(255,255,255,0.06)" } as any,
        cornerRadius: 16,
      })}
    >
      {props.children}
    </VStack>
  )

  return wrapWithOutline(card, { visual: visualStyle, cornerRadius: 16 })
}

// =====================================================================
// TintPanel · 次级面板统一：更浅的内层底（用于列表/条形）
// =====================================================================
function TintPanel(props: {
  children: any
  cornerRadius?: number
  padding?: { top: number; leading: number; bottom: number; trailing: number }
  spacing?: number
  visualStyle?: VisualStyleConfig
}) {
  const r = props.cornerRadius ?? 16
  const pad = props.padding ?? { top: 8, leading: 10, bottom: 8, trailing: 10 }
  const sp = props.spacing ?? 6
  const visualStyle = props.visualStyle ?? defaultVisualStyle
  const card = (
    <VStack
      spacing={sp}
      alignment="leading"
      padding={pad}
      frame={{ minWidth: 0, maxWidth: Infinity }}
      widgetBackground={buildCardBackground({
        visual: visualStyle,
        base: { light: "rgba(0,0,0,0.03)", dark: "rgba(255,255,255,0.07)" } as any,
        cornerRadius: r,
      })}
    >
      {props.children}
    </VStack>
  )

  return wrapWithOutline(card, { visual: visualStyle, cornerRadius: r })
}

// =====================================================================
// Helpers · 文本/图标/Logo
// =====================================================================
function parseFeeText(feeText: string): { balance: string; unit: string } {
  const s = String(feeText ?? "").trim()
  const m = s.match(/^([0-9]+(?:\.[0-9]+)?)(.*)$/)
  if (!m) return { balance: s || "0", unit: "" }
  return { balance: m[1] || "0", unit: (m[2] || "").trim() }
}

function isUrlLogo(logoPath?: string | null) {
  if (!logoPath) return false
  return logoPath.startsWith("http://") || logoPath.startsWith("https://")
}

function LogoImage(props: { logoPath?: string | null; size: number; fallbackTheme?: RingCardTheme }) {
  const { logoPath, size, fallbackTheme } = props
  if (!logoPath) {
    const icon = fallbackTheme?.icon ?? ringThemes.fee.icon
    const tint = fallbackTheme?.tint ?? ringThemes.fee.tint
    return <Image systemName={icon} font={size} fontWeight="semibold" foregroundStyle={tint} />
  }
  return isUrlLogo(logoPath) ? (
    <Image imageUrl={logoPath} resizable frame={{ width: size, height: size }} />
  ) : (
    <Image filePath={logoPath} resizable frame={{ width: size, height: size }} />
  )
}

function SymbolImage(props: { systemName: string; size: number; tint: any; opacity?: number }) {
  const { systemName, size, tint, opacity } = props
  return (
    <Image
      systemName={systemName}
      font={size}
      fontWeight="semibold"
      foregroundStyle={tint}
      {...(opacity === undefined ? ({} as any) : ({ opacity } as any))}
    />
  )
}

function UnitPill(props: { text: string; tint: any }) {
  return (
    <VStack
      padding={{ top: 1, leading: 8, bottom: 1, trailing: 8 }}
      widgetBackground={{
        style: { light: "rgba(0,0,0,0.10)", dark: "rgba(255,255,255,0.10)" } as any,
        shape: { type: "capsule", style: "continuous" },
      }}
    >
      <Text
        font={10}
        fontWeight="semibold"
        foregroundStyle={{ light: "rgba(0,0,0,0.70)", dark: "rgba(255,255,255,0.78)" } as any}
        lineLimit={1}
        minScaleFactor={0.65}
      >
        {props.text}
      </Text>
    </VStack>
  )
}

function MorePill(props: { child?: any }) {
  return (
    <HStack
      alignment="center"
      spacing={0}
      frame={{ width: 44, height: 28 }}
      widgetBackground={{
        style: { light: "rgba(0,0,0,0.10)", dark: "rgba(255,255,255,0.12)" } as any,
        shape: { type: "capsule", style: "continuous" },
      }}
    >
      <Spacer />
      {props.child ? (
        props.child
      ) : (
        <Text
          font={12}
          fontWeight="bold"
          foregroundStyle={{ light: "rgba(0,0,0,0.55)", dark: "rgba(255,255,255,0.65)" } as any}
          lineLimit={1}
          minScaleFactor={0.7}
        >
          …
        </Text>
      )}
      <Spacer />
    </HStack>
  )
}

function ValueWithUnit(props: { value: string; unit: string; tint: any; big?: boolean }) {
  return (
    <HStack alignment="center" spacing={4} frame={{ minWidth: 0, maxWidth: Infinity }}>
      <Text font={props.big ? 20 : 16} fontWeight="bold" foregroundStyle={props.tint} lineLimit={1} minScaleFactor={0.55}>
        {props.value}
      </Text>
      <Text font={10} fontWeight="semibold" foregroundStyle={timeStyle} lineLimit={1} minScaleFactor={0.65}>
        {props.unit}
      </Text>
      <Spacer />
    </HStack>
  )
}

// =====================================================================
// ListRow · 列表行统一（防溢出 + 文案靠左）
// =====================================================================
function ListRow(props: { theme: RingCardTheme; label: string; valueText: string; unitText: string }) {
  const { theme, label, valueText, unitText } = props
  return (
    <HStack alignment="center" spacing={8} frame={{ minWidth: 0, maxWidth: Infinity }}>
      <VStack
        frame={{ width: 3, height: 18 }}
        widgetBackground={{ style: theme.tint, shape: { type: "capsule", style: "continuous" } }}
      />
      <VStack spacing={1} alignment="leading" frame={{ minWidth: 0, maxWidth: Infinity }}>
        <Left>
          <Text font={10} foregroundStyle={timeStyle} lineLimit={1} minScaleFactor={0.6}>
            {label}
          </Text>
        </Left>

        <HStack alignment="center" spacing={6} frame={{ minWidth: 0, maxWidth: Infinity }}>
          <Text font={14} fontWeight="semibold" foregroundStyle={theme.tint} lineLimit={1} minScaleFactor={0.5}>
            {valueText}
          </Text>
          <UnitPill text={unitText} tint={theme.tint} />
          <Spacer />
        </HStack>
      </VStack>
      <SymbolImage systemName={theme.icon} size={16} tint={theme.tint} opacity={0.9} />
    </HStack>
  )
}

// =====================================================================
// BarRow · 条形行统一（文案靠左 + 不炸边）
// =====================================================================
function clamp01(n: number) {
  if (!Number.isFinite(n)) return 0
  if (n < 0) return 0
  if (n > 1) return 1
  return n
}

function InfoRowWithBar(props: { label: string; value: string; unit: string; theme: RingCardTheme; ratio?: number }) {
  const { label, value, unit, theme, ratio } = props
  const hasRatio = typeof ratio === "number" && Number.isFinite(ratio) && ratio > 0
  const pct = hasRatio ? clamp01(ratio!) : 0

  const BAR_WIDTH = 92
  const BAR_HEIGHT = 4
  const filledWidth = Math.max(0, Math.min(BAR_WIDTH, BAR_WIDTH * pct))

  return (
    <VStack spacing={4} alignment="leading" frame={{ minWidth: 0, maxWidth: Infinity }}>
      <HStack alignment="center" spacing={6} frame={{ minWidth: 0, maxWidth: Infinity }}>
        <VStack
          frame={{ width: 3, height: 16 }}
          widgetBackground={{ style: theme.tint, shape: { type: "capsule", style: "continuous" } }}
        />

        <VStack spacing={1} alignment="leading" frame={{ minWidth: 0, maxWidth: Infinity }}>
          <Left>
            <Text font={10} foregroundStyle={timeStyle} lineLimit={1} minScaleFactor={0.6}>
              {label}
            </Text>
          </Left>
          <Left>
            <Text font={13} fontWeight="semibold" foregroundStyle={theme.tint} lineLimit={1} minScaleFactor={0.5}>
              {value}
            </Text>
          </Left>
        </VStack>

        <UnitPill text={unit} tint={theme.tint} />
      </HStack>

      <HStack alignment="center" spacing={6} frame={{ minWidth: 0, maxWidth: Infinity }}>
        <VStack
          frame={{ width: BAR_WIDTH, height: BAR_HEIGHT }}
          widgetBackground={{
            style: { light: "rgba(0,0,0,0.10)", dark: "rgba(255,255,255,0.12)" } as any,
            shape: { type: "capsule", style: "continuous" },
          }}
          alignment="leading"
        >
          <HStack spacing={0} alignment="center" frame={{ minWidth: 0, maxWidth: Infinity }}>
            {hasRatio && filledWidth > 0 ? (
              <VStack
                frame={{ width: filledWidth, height: BAR_HEIGHT }}
                widgetBackground={{ style: theme.tint, shape: { type: "capsule", style: "continuous" } }}
              />
            ) : null}
            <Spacer />
          </HStack>
        </VStack>
        <Spacer />
      </HStack>
    </VStack>
  )
}

// =====================================================================
// Styles · 小卡样式键 & 选项
// =====================================================================
export type SmallStyleKey =
  | "CompactList"
  | "ProgressList"
  | "TripleRows"
  | "IconCells"
  | "BalanceFocus"
  | "DualList"
  | "DualGauges"
  | "TextList"

export const SMALL_STYLE_OPTIONS: Array<{ key: SmallStyleKey; nameCN: string; nameEN: string }> = [
  { key: "CompactList", nameCN: "紧凑清单", nameEN: "CompactList" },
  { key: "ProgressList", nameCN: "进度清单", nameEN: "ProgressList" },
  { key: "TripleRows", nameCN: "三条信息卡", nameEN: "TripleRows" },
  { key: "IconCells", nameCN: "圆标信息卡", nameEN: "IconCells" },
  { key: "BalanceFocus", nameCN: "余额主卡", nameEN: "BalanceFocus" },
  { key: "DualList", nameCN: "上余额下列表", nameEN: "DualList" },
  { key: "DualGauges", nameCN: "双环仪表", nameEN: "DualGauges" },
  { key: "TextList", nameCN: "文字清单", nameEN: "TextList" },
]

function pickVisualStyle(props: SmallCardCommonProps): VisualStyleConfig {
  return props.visualStyle ?? defaultVisualStyle
}

// =====================================================================
// Style · CompactList（紧凑清单）
// =====================================================================
export function CompactListSmallStyle(props: SmallCardCommonProps) {
  const visualStyle = pickVisualStyle(props)
  const fee = parseFeeText(props.feeText)

  const useTotal = !!props.smallMiniBarUseTotalFlow
  const hasOther = !!(props.otherFlowLabel && String(props.otherFlowLabel).trim().length > 0)
  const showOther = !useTotal && hasOther

  const flowLabel = useTotal ? (props.totalFlowLabel || "总流量") : (props.flowLabel || "通用流量")
  const flowValue = useTotal ? props.totalFlowValue : props.flowValue
  const flowUnit = useTotal ? props.totalFlowUnit : props.flowUnit

  const NeoRow = (p: { label: string; value: string; theme: RingCardTheme }) => (
    <HStack alignment="center" spacing={8} frame={{ minWidth: 0, maxWidth: Infinity }}>
      <VStack
        frame={{ width: 3, height: 18 }}
        widgetBackground={{ style: p.theme.tint, shape: { type: "capsule", style: "continuous" } }}
      />
      <VStack spacing={1} alignment="leading" frame={{ minWidth: 0, maxWidth: Infinity }}>
        <Left>
          <Text font={9} foregroundStyle={timeStyle} lineLimit={1} minScaleFactor={0.7}>
            {p.label}
          </Text>
        </Left>
        <Left>
          <Text font={13} fontWeight="semibold" foregroundStyle={p.theme.tint} lineLimit={1} minScaleFactor={0.5}>
            {p.value}
          </Text>
        </Left>
      </VStack>
      <MorePill child={<SymbolImage systemName={p.theme.icon} size={15} tint={p.theme.tint} opacity={0.9} />} />
    </HStack>
  )

  const flowText = `${String(flowValue ?? "0")}${String(flowUnit ?? "").toUpperCase() || "GB"}`
  const otherText = `${String(props.otherFlowValue ?? "0")}${String(props.otherFlowUnit ?? "").toUpperCase() || "GB"}`
  const voiceText = `${String(props.voiceValue ?? "0")}${String(props.voiceUnit ?? "") || "分钟"}`

  return (
    <SmallCardSurface visualStyle={visualStyle}>
      <VStack spacing={4} frame={{ minWidth: 0, maxWidth: Infinity }} alignment="leading">
        <HStack alignment="top" spacing={6} frame={{ minWidth: 0, maxWidth: Infinity }}>
          <VStack spacing={2} alignment="leading" frame={{ minWidth: 0, maxWidth: Infinity }}>
            <Left>
              <Text font={10} foregroundStyle={timeStyle} lineLimit={1} minScaleFactor={0.7}>
                {props.feeTitle || "剩余话费"}
              </Text>
            </Left>

            <HStack alignment="lastTextBaseline" spacing={5} frame={{ minWidth: 0, maxWidth: Infinity }}>
              <Text font={26} fontWeight="bold" foregroundStyle={ringThemes.fee.tint} lineLimit={1} minScaleFactor={0.5}>
                {fee.balance}
              </Text>
              <Text font={10} fontWeight="semibold" foregroundStyle={timeStyle} lineLimit={1} minScaleFactor={0.65}>
                {fee.unit || "元"}
              </Text>
              <Spacer />
            </HStack>
          </VStack>

          <VStack spacing={3} alignment="trailing" frame={{ minWidth: 0 }}>
            <LogoImage logoPath={props.logoPath} size={24} fallbackTheme={ringThemes.fee} />
            {props.updateTime ? (
              <Text font={9} foregroundStyle={timeStyle} lineLimit={1} minScaleFactor={0.65}>
                {props.updateTime}
              </Text>
            ) : null}
          </VStack>
        </HStack>

        <VStack
          alignment="leading"
          padding={{ top: 7, leading: 10, bottom: 7, trailing: 10 }}
          spacing={showOther ? 7 : 8}
          widgetBackground={buildCardBackground({
            visual: visualStyle,
            base: { light: "rgba(0,0,0,0.06)", dark: "rgba(255,255,255,0.08)" } as any,
            cornerRadius: 18,
          })}
          frame={{ minWidth: 0, maxWidth: Infinity }}
        >
          <NeoRow label={flowLabel} value={flowText} theme={ringThemes.flow} />
          {showOther ? <NeoRow label={String(props.otherFlowLabel)} value={otherText} theme={ringThemes.flowDir} /> : null}
          <NeoRow label={props.voiceLabel || "剩余语音"} value={voiceText} theme={ringThemes.voice} />
        </VStack>
      </VStack>
    </SmallCardSurface>
  )
}

// =====================================================================
// Style · ProgressList（进度清单）
// =====================================================================
export function ProgressListSmallStyle(props: SmallCardCommonProps) {
  const visualStyle = pickVisualStyle(props)
  const fee = parseFeeText(props.feeText)

  const useTotal = !!props.smallMiniBarUseTotalFlow
  const hasOther = !!(props.otherFlowLabel && String(props.otherFlowLabel).trim().length > 0)
  const showOther = !useTotal && hasOther

  const flowLabel = useTotal ? (props.totalFlowLabel || "总流量") : (props.flowLabel || "通用流量")
  const flowValue = useTotal ? props.totalFlowValue : props.flowValue
  const flowUnit = useTotal ? props.totalFlowUnit : props.flowUnit
  const flowRatio = useTotal ? props.totalFlowRatio : props.flowRatio

  return (
    <SmallCardSurface visualStyle={visualStyle}>
      <VStack spacing={4} frame={{ minWidth: 0, maxWidth: Infinity }} alignment="leading">
        <HStack alignment="top" spacing={6} frame={{ minWidth: 0, maxWidth: Infinity }}>
          <VStack spacing={2} alignment="leading" frame={{ minWidth: 0, maxWidth: Infinity }}>
            <Left>
              <Text font={10} foregroundStyle={timeStyle} lineLimit={1} minScaleFactor={0.7}>
                {props.feeTitle || "剩余话费"}
              </Text>
            </Left>

            <HStack alignment="lastTextBaseline" spacing={5} frame={{ minWidth: 0, maxWidth: Infinity }}>
              <Text font={26} fontWeight="bold" foregroundStyle={ringThemes.fee.tint} lineLimit={1} minScaleFactor={0.5}>
                {fee.balance}
              </Text>
              <Text font={10} fontWeight="semibold" foregroundStyle={timeStyle} lineLimit={1} minScaleFactor={0.65}>
                {fee.unit || "元"}
              </Text>
              <Spacer />
            </HStack>
          </VStack>

          <VStack spacing={3} alignment="trailing" frame={{ minWidth: 0 }}>
            <LogoImage logoPath={props.logoPath} size={24} fallbackTheme={ringThemes.fee} />
            {props.updateTime ? (
              <Text font={9} foregroundStyle={timeStyle} lineLimit={1} minScaleFactor={0.65}>
                {props.updateTime}
              </Text>
            ) : null}
          </VStack>
        </HStack>

        <VStack
          alignment="leading"
          padding={{ top: 7, leading: 10, bottom: 7, trailing: 10 }}
          spacing={showOther ? 7 : 8}
          widgetBackground={buildCardBackground({
            visual: visualStyle,
            base: { light: "rgba(0,0,0,0.06)", dark: "rgba(255,255,255,0.08)" } as any,
            cornerRadius: 18,
          })}
          frame={{ minWidth: 0, maxWidth: Infinity }}
        >
          <InfoRowWithBar
            label={flowLabel}
            value={`${String(flowValue ?? "0")}`}
            unit={String(flowUnit ?? "").toUpperCase() || "GB"}
            theme={ringThemes.flow}
            ratio={flowRatio}
          />

          {showOther ? (
            <InfoRowWithBar
              label={String(props.otherFlowLabel)}
              value={`${String(props.otherFlowValue ?? "0")}`}
              unit={String(props.otherFlowUnit ?? "").toUpperCase() || "GB"}
              theme={ringThemes.flowDir}
              ratio={props.otherFlowRatio}
            />
          ) : null}

          <InfoRowWithBar
            label={props.voiceLabel || "剩余语音"}
            value={`${String(props.voiceValue ?? "0")}`}
            unit={"分钟"}
            theme={ringThemes.voice}
            ratio={props.voiceRatio}
          />
        </VStack>
      </VStack>
    </SmallCardSurface>
  )
}

// =====================================================================
// Style · 三条信息卡
// =====================================================================
export function TripleRowsSmallStyle(props: SmallCardCommonProps) {
  const visualStyle = pickVisualStyle(props)
  const fee = parseFeeText(props.feeText)

  const Row = (p: { theme: RingCardTheme; title: string; value: string; unit: string; rightLogo?: boolean }) => (
    <HStack alignment="center" spacing={10} frame={{ minWidth: 0, maxWidth: Infinity }}>
      <VStack spacing={2} alignment="leading" frame={{ minWidth: 0, maxWidth: Infinity }}>
        <Left>
          <Text font={10} foregroundStyle={timeStyle} lineLimit={1} minScaleFactor={0.6}>
            {p.title}
          </Text>
        </Left>
        <ValueWithUnit value={p.value} unit={p.unit} tint={p.theme.tint} big />
      </VStack>
      {p.rightLogo ? (
        <LogoImage logoPath={props.logoPath} size={22} fallbackTheme={p.theme} />
      ) : (
        <SymbolImage systemName={p.theme.icon} size={18} tint={p.theme.tint} opacity={0.95} />
      )}
    </HStack>
  )

  return (
    <SmallCardSurface visualStyle={visualStyle}>
      <VStack spacing={10} frame={{ minWidth: 0, maxWidth: Infinity }} alignment="leading">
        <ContentCard visualStyle={visualStyle}>
          <Row theme={ringThemes.fee} title={props.feeTitle || "剩余话费"} value={fee.balance} unit={fee.unit || "元"} rightLogo />
        </ContentCard>
        <ContentCard visualStyle={visualStyle}>
          <Row theme={ringThemes.flow} title={props.flowLabel || "剩余流量"} value={String(props.flowValue ?? "0")} unit={String(props.flowUnit ?? "")} />
        </ContentCard>
        <ContentCard visualStyle={visualStyle}>
          <Row theme={ringThemes.voice} title={props.voiceLabel || "剩余语音"} value={String(props.voiceValue ?? "0")} unit={String(props.voiceUnit ?? "") || "分钟"} />
        </ContentCard>
      </VStack>
    </SmallCardSurface>
  )
}

// =====================================================================
// Style · 圆标信息卡
// =====================================================================
export function IconCellsSmallStyle(props: SmallCardCommonProps) {
  const visualStyle = pickVisualStyle(props)
  const fee = parseFeeText(props.feeText)

  const Cell = (p: { theme: RingCardTheme; title: string; value: string; unit: string; leftLogo?: boolean }) => (
    <HStack alignment="center" spacing={8} frame={{ minWidth: 0, maxWidth: Infinity }}>
      <ZStack frame={{ width: 30, height: 30 }}>
        <VStack
          frame={{ width: 30, height: 30 }}
          widgetBackground={{ style: p.theme.tint, shape: { type: "rect", cornerRadius: 15, style: "continuous" } }}
        />
        {p.leftLogo ? (
          <LogoImage logoPath={props.logoPath} size={17} fallbackTheme={p.theme} />
        ) : (
          <SymbolImage systemName={p.theme.icon} size={12} tint={{ light: "#FFFFFF", dark: "#FFFFFF" } as any} opacity={0.95} />
        )}
      </ZStack>

      <VStack spacing={1} alignment="leading" frame={{ minWidth: 0, maxWidth: Infinity }}>
        <ValueWithUnit value={p.value} unit={p.unit} tint={p.theme.tint} />
        <Left>
          <Text font={9} foregroundStyle={timeStyle} lineLimit={1} minScaleFactor={0.6}>
            {p.title}
          </Text>
        </Left>
      </VStack>

      <Spacer />
    </HStack>
  )

  return (
    <SmallCardSurface visualStyle={visualStyle}>
      <VStack spacing={4} frame={{ minWidth: 0, maxWidth: Infinity }} alignment="leading">
        <ContentCard visualStyle={visualStyle} padding={{ top: 5, leading: 9, bottom: 5, trailing: 9 }}>
          <Cell theme={ringThemes.fee} title={props.feeTitle || "剩余话费"} value={fee.balance} unit={fee.unit || "元"} leftLogo />
        </ContentCard>

        <ContentCard visualStyle={visualStyle} padding={{ top: 5, leading: 9, bottom: 5, trailing: 9 }}>
          <Cell theme={ringThemes.flow} title={props.flowLabel || "剩余流量"} value={String(props.flowValue ?? "0")} unit={String(props.flowUnit ?? "")} />
        </ContentCard>

        <ContentCard visualStyle={visualStyle} padding={{ top: 5, leading: 9, bottom: 5, trailing: 9 }}>
          <Cell theme={ringThemes.voice} title={props.voiceLabel || "剩余语音"} value={String(props.voiceValue ?? "0")} unit={String(props.voiceUnit ?? "") || "分钟"} />
        </ContentCard>
      </VStack>
    </SmallCardSurface>
  )
}

// =====================================================================
// Style · 余额主卡 + 下两块
// =====================================================================
export function BalanceFocusSmallStyle(props: SmallCardCommonProps) {
  const visualStyle = pickVisualStyle(props)
  const fee = parseFeeText(props.feeText)

  const BLOCK_W = 80
  const BLOCK_H = 60
  const TOP_MIN_H = 46

  const flowValue = `${String(props.flowValue ?? "0")}${String(props.flowUnit ?? "") || "GB"}`
  const voiceValue = `${String(props.voiceValue ?? "0")}${String(props.voiceUnit ?? "") || "分钟"}`

  const MiniBlock = (p: { theme: RingCardTheme; label: string; value: string }) => (
    <VStack frame={{ width: BLOCK_W }}>
      <ContentCard visualStyle={visualStyle} padding={{ top: 6, leading: 6, bottom: 6, trailing: 6 }}>
        <VStack spacing={4} alignment="center" frame={{ width: BLOCK_W - 12, height: BLOCK_H }}>
          <SymbolImage systemName={p.theme.icon} size={16} tint={p.theme.tint} opacity={0.9} />
          <Text font={9} foregroundStyle={timeStyle} lineLimit={1} minScaleFactor={0.7}>
            {p.label}
          </Text>
          <Text font={14} fontWeight="semibold" foregroundStyle={p.theme.tint} lineLimit={1} minScaleFactor={0.5}>
            {p.value}
          </Text>
        </VStack>
      </ContentCard>
    </VStack>
  )

  return (
    <SmallCardSurface visualStyle={visualStyle}>
      <VStack spacing={0} frame={{ minWidth: 0, maxWidth: Infinity }} alignment="leading">
        <ContentCard visualStyle={visualStyle} padding={{ top: 7, leading: 8, bottom: 4, trailing: 8 }}>
          <VStack frame={{ minWidth: 0, maxWidth: Infinity, height: TOP_MIN_H }} alignment="leading">
            <HStack alignment="center" spacing={8} frame={{ minWidth: 0, maxWidth: Infinity }}>
              <VStack spacing={2} alignment="leading" frame={{ minWidth: 0, maxWidth: Infinity }}>
                <Left>
                  <Text font={10} foregroundStyle={timeStyle} lineLimit={1} minScaleFactor={0.7}>
                    {props.feeTitle || "剩余话费"}
                  </Text>
                </Left>

                <HStack alignment="lastTextBaseline" spacing={4} frame={{ minWidth: 0, maxWidth: Infinity }}>
                  <Text font={22} fontWeight="bold" foregroundStyle={ringThemes.fee.tint} lineLimit={1} minScaleFactor={0.5}>
                    {fee.balance}
                  </Text>
                  <Text font={10} fontWeight="semibold" foregroundStyle={timeStyle} lineLimit={1} minScaleFactor={0.65}>
                    {fee.unit || "元"}
                  </Text>
                  <Spacer />
                </HStack>
              </VStack>

              <VStack spacing={2} alignment="trailing" frame={{ minWidth: 0 }}>
                <LogoImage logoPath={props.logoPath} size={22} fallbackTheme={ringThemes.fee} />
                {props.updateTime ? (
                  <Text font={9} foregroundStyle={timeStyle} lineLimit={1} minScaleFactor={0.65}>
                    {props.updateTime}
                  </Text>
                ) : null}
              </VStack>
            </HStack>
          </VStack>
        </ContentCard>

        <Spacer minLength={4} />

        <HStack alignment="center" spacing={6} frame={{ minWidth: 0, maxWidth: Infinity }}>
          <Spacer />
          <MiniBlock theme={ringThemes.flow} label={props.flowLabel || "通用流量"} value={flowValue} />
          <MiniBlock theme={ringThemes.voice} label={props.voiceLabel || "剩余语音"} value={voiceValue} />
          <Spacer />
        </HStack>
      </VStack>
    </SmallCardSurface>
  )
}

// =====================================================================
// Style · 上余额下列表
// =====================================================================
export function DualListSmallStyle(props: SmallCardCommonProps) {
  const visualStyle = pickVisualStyle(props)
  const fee = parseFeeText(props.feeText)
  const showOther = !!(props.otherFlowLabel && String(props.otherFlowLabel).trim().length > 0)

  const flowValueText = `${String(props.flowValue ?? "0")}`
  const otherValueText = `${String(props.otherFlowValue ?? "0")}`
  const voiceValueText = `${String(props.voiceValue ?? "0")}`

  const flowUnitText = String(props.flowUnit ?? "GB").toUpperCase()
  const otherUnitText = String(props.otherFlowUnit ?? "GB").toUpperCase()

  return (
    <SmallCardSurface visualStyle={visualStyle}>
      <VStack spacing={10} frame={{ minWidth: 0, maxWidth: Infinity }} alignment="leading">
        <ContentCard visualStyle={visualStyle}>
          <HStack alignment="top" spacing={6} frame={{ minWidth: 0, maxWidth: Infinity }}>
            <VStack spacing={2} alignment="leading" frame={{ minWidth: 0, maxWidth: Infinity }}>
              <Left>
                <Text font={10} foregroundStyle={timeStyle} lineLimit={1} minScaleFactor={0.6}>
                  {props.feeTitle || "剩余话费"}
                </Text>
              </Left>

              <HStack alignment="center" spacing={4} frame={{ minWidth: 0, maxWidth: Infinity }}>
                <Text font={22} fontWeight="bold" foregroundStyle={ringThemes.fee.tint} lineLimit={1} minScaleFactor={0.5}>
                  {fee.balance}
                </Text>
                <Text font={10} fontWeight="semibold" foregroundStyle={timeStyle} lineLimit={1} minScaleFactor={0.65}>
                  {fee.unit || "元"}
                </Text>
                <Spacer />
              </HStack>
            </VStack>

            <VStack spacing={2} alignment="trailing" frame={{ minWidth: 0 }}>
              <LogoImage logoPath={props.logoPath} size={24} fallbackTheme={ringThemes.fee} />
              {props.updateTime ? (
                <Text font={9} foregroundStyle={timeStyle} lineLimit={1} minScaleFactor={0.65}>
                  {props.updateTime}
                </Text>
              ) : null}
            </VStack>
          </HStack>
        </ContentCard>

        <TintPanel visualStyle={visualStyle} spacing={showOther ? 6 : 7} cornerRadius={16}>
          <ListRow theme={ringThemes.flow} label={props.flowLabel || "剩余流量"} valueText={flowValueText} unitText={flowUnitText} />
          {showOther ? (
            <ListRow theme={ringThemes.flowDir} label={String(props.otherFlowLabel)} valueText={otherValueText} unitText={otherUnitText} />
          ) : null}
          <ListRow theme={ringThemes.voice} label={props.voiceLabel || "剩余语音"} valueText={voiceValueText} unitText={"分钟"} />
        </TintPanel>
      </VStack>
    </SmallCardSurface>
  )
}

// =====================================================================
// Style · 双环仪表（保持原样）
// =====================================================================
export function DualGaugesSmallStyle(props: SmallCardCommonProps) {
  const visualStyle = pickVisualStyle(props)
  const fee = parseFeeText(props.feeText)

  const Ring = (p: { theme: RingCardTheme; title: string; value: string; unit: string }) => (
    <VStack alignment="center" spacing={6} frame={{ minWidth: 0 }}>
      <ZStack frame={{ width: 64, height: 64 }}>
        <VStack
          frame={{ width: 64, height: 64 }}
          widgetBackground={{
            style: { light: "rgba(0,0,0,0.04)", dark: "rgba(255,255,255,0.07)" } as any,
            shape: { type: "rect", cornerRadius: 32, style: "continuous" },
          }}
        />
        <VStack
          frame={{ width: 50, height: 50 }}
          widgetBackground={{
            style: { light: "rgba(0,0,0,0.03)", dark: "rgba(255,255,255,0.06)" } as any,
            shape: { type: "rect", cornerRadius: 25, style: "continuous" },
          }}
        />
        <VStack alignment="center" spacing={2} frame={{ minWidth: 0, maxWidth: Infinity }}>
          <SymbolImage systemName={p.theme.icon} size={12} tint={p.theme.tint} opacity={0.9} />
          <HStack alignment="center" spacing={3} frame={{ minWidth: 0, maxWidth: Infinity }}>
            <Text font={13} fontWeight="semibold" foregroundStyle={p.theme.tint} lineLimit={1} minScaleFactor={0.55}>
              {p.value}
            </Text>
            <Text font={8} fontWeight="bold" foregroundStyle={timeStyle} lineLimit={1} minScaleFactor={0.7}>
              {p.unit}
            </Text>
          </HStack>
        </VStack>
      </ZStack>

      <Text font={10} foregroundStyle={timeStyle} lineLimit={1} minScaleFactor={0.6}>
        {p.title}
      </Text>
    </VStack>
  )

  return (
    <SmallCardSurface visualStyle={visualStyle}>
      <VStack spacing={10} frame={{ minWidth: 0, maxWidth: Infinity }} alignment="leading">
        <ContentCard visualStyle={visualStyle}>
          <HStack alignment="center" spacing={6} frame={{ minWidth: 0, maxWidth: Infinity }}>
            <Spacer />
            <LogoImage logoPath={props.logoPath} size={34} fallbackTheme={ringThemes.fee} />
            <Spacer />
          </HStack>

          <Spacer minLength={6} />

          <HStack alignment="center" spacing={4} frame={{ minWidth: 0, maxWidth: Infinity }}>
            <Spacer />
            <Text font={22} fontWeight="bold" foregroundStyle={ringThemes.fee.tint} lineLimit={1} minScaleFactor={0.55}>
              {fee.balance}
            </Text>
            <Text font={10} fontWeight="semibold" foregroundStyle={timeStyle} lineLimit={1} minScaleFactor={0.65}>
              {fee.unit || "元"}
            </Text>
            <Spacer />
          </HStack>

          {props.updateTime ? (
            <HStack alignment="center" spacing={4} frame={{ minWidth: 0, maxWidth: Infinity }}>
              <Spacer />
              <Image systemName="arrow.triangle.2.circlepath" font={9} foregroundStyle={timeStyle} />
              <Text font={9} foregroundStyle={timeStyle} lineLimit={1} minScaleFactor={0.65}>
                {props.updateTime}
              </Text>
              <Spacer />
            </HStack>
          ) : null}
        </ContentCard>

        <HStack alignment="center" spacing={10} frame={{ minWidth: 0, maxWidth: Infinity }}>
          <Ring theme={ringThemes.flow} title={props.flowLabel || "流量"} value={String(props.flowValue ?? "0")} unit={String(props.flowUnit ?? "")} />
          <Spacer />
          <Ring theme={ringThemes.voice} title={props.voiceLabel || "语音"} value={String(props.voiceValue ?? "0")} unit={String(props.voiceUnit ?? "") || "分钟"} />
        </HStack>
      </VStack>
    </SmallCardSurface>
  )
}

// =====================================================================
// Style · 文字清单
// =====================================================================
export function TextListSmallStyle(props: SmallCardCommonProps) {
  const visualStyle = pickVisualStyle(props)
  const fee = parseFeeText(props.feeText)
  const showOther = !!(props.otherFlowLabel && String(props.otherFlowLabel).trim().length > 0)

  const Line = (p: { theme: RingCardTheme; title: string; value: string }) => (
    <HStack alignment="center" spacing={8} frame={{ minWidth: 0, maxWidth: Infinity }}>
      <SymbolImage systemName={p.theme.icon} size={14} tint={p.theme.tint} opacity={0.9} />
      <Left>
        <Text font={13} foregroundStyle={timeStyle} lineLimit={1} minScaleFactor={0.55}>
          {p.title}
        </Text>
      </Left>
      <Text font={13} fontWeight="semibold" foregroundStyle={p.theme.tint} lineLimit={1} minScaleFactor={0.55}>
        {p.value}
      </Text>
    </HStack>
  )

  return (
    <SmallCardSurface visualStyle={visualStyle}>
      <VStack spacing={10} frame={{ minWidth: 0, maxWidth: Infinity }} alignment="leading">
        <ContentCard visualStyle={visualStyle}>
          <HStack alignment="center" spacing={8} frame={{ minWidth: 0, maxWidth: Infinity }}>
            <LogoImage logoPath={props.logoPath} size={22} fallbackTheme={ringThemes.fee} />
            <Spacer />
            <Text font={20} fontWeight="bold" foregroundStyle={ringThemes.fee.tint} lineLimit={1} minScaleFactor={0.55}>
              {fee.balance}
            </Text>
            <Text font={10} fontWeight="semibold" foregroundStyle={timeStyle} lineLimit={1} minScaleFactor={0.65}>
              {fee.unit || "元"}
            </Text>
          </HStack>

          {props.updateTime ? (
            <HStack alignment="center" spacing={4} frame={{ minWidth: 0, maxWidth: Infinity }}>
              <Spacer />
              <Image systemName="arrow.triangle.2.circlepath" font={9} foregroundStyle={timeStyle} />
              <Text font={9} foregroundStyle={timeStyle} lineLimit={1} minScaleFactor={0.65}>
                {props.updateTime}
              </Text>
              <Spacer />
            </HStack>
          ) : null}
        </ContentCard>

        <Line theme={ringThemes.flow} title={props.flowLabel || "流量"} value={`${String(props.flowValue ?? "0")}${String(props.flowUnit ?? "")}`} />

        {showOther ? (
          <Line
            theme={ringThemes.flowDir}
            title={String(props.otherFlowLabel)}
            value={`${String(props.otherFlowValue ?? "0")}${String(props.otherFlowUnit ?? "")}`}
          />
        ) : null}

        <Line theme={ringThemes.voice} title={props.voiceLabel || "语音"} value={`${String(props.voiceValue ?? "0")}${String(props.voiceUnit ?? "") || "分钟"}`} />
      </VStack>
    </SmallCardSurface>
  )
}

// =====================================================================
// Renderer · 样式统一出口
// =====================================================================
export function renderSmallCard(style: SmallStyleKey, props: SmallCardCommonProps) {
  switch (style) {
    case "CompactList":
      return <CompactListSmallStyle {...props} />
    case "ProgressList":
      return <ProgressListSmallStyle {...props} />
    case "TripleRows":
      return <TripleRowsSmallStyle {...props} />
    case "IconCells":
      return <IconCellsSmallStyle {...props} />
    case "BalanceFocus":
      return <BalanceFocusSmallStyle {...props} />
    case "DualList":
      return <DualListSmallStyle {...props} />
    case "DualGauges":
      return <DualGaugesSmallStyle {...props} />
    case "TextList":
      return <TextListSmallStyle {...props} />
    default:
      return <DualListSmallStyle {...props} />
  }
}