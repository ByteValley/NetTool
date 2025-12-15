// =====================================================
// styles/billPanel.tsx
// =====================================================
import {
  Widget,
  VStack,
  HStack,
  ZStack,
  Text,
  Spacer,
  Image,
  RoundedRectangle,
} from "scripting"
import type { SGCCWidgetRenderer } from "./types"
import type { SGCCSettings } from "../api"

// ========== Theme ==========
const C = {
  bgCard: { light: "#F2F2F7", dark: "#1C1C1E" } as any,
  divider: { light: "rgba(0,0,0,0.08)", dark: "rgba(255,255,255,0.10)" } as any,

  textPrimary: { light: "#111111", dark: "#FFFFFF" } as any,
  textSecondary: { light: "rgba(60, 60, 67, 0.65)", dark: "rgba(235,235,245,0.60)" } as any,

  teal: "#00706B" as any,
  yellow: "#E8C70B" as any,
  orange: "#D0580D" as any,

  leftCardBg: { light: "rgba(0,0,0,0.06)", dark: "rgba(255,255,255,0.10)" } as any,
} as const

// ========== Size helpers ==========
function getWidgetSize() {
  const phones: { [key: number]: any } = {
    956: { small: 170, medium: 364, large: 382 },
    874: { small: 162, medium: 344, large: 366 },
    932: { small: 170, medium: 364, large: 382 },
    926: { small: 170, medium: 364, large: 382 },
    896: { small: 169, medium: 360, large: 379 },
    736: { small: 157, medium: 348, large: 357 },
    852: { small: 158, medium: 338, large: 354 },
    844: { small: 158, medium: 338, large: 354 },
    812: { small: 155, medium: 329, large: 345 },
    667: { small: 148, medium: 321, large: 324 },
    1194: { small: 155, medium: 342, large: 342, extraLarge: 715.5 },
    1024: { small: 141, medium: 305.5, large: 305.5, extraLarge: 634.5 },
  }

  try {
    // @ts-ignore
    if (typeof Device !== "undefined" && Device.screenSize) {
      // @ts-ignore
      let { width, height } = Device.screenSize()
      if (typeof width === "number" && typeof height === "number") {
        if (width > height) height = width
        if (phones[height]) return phones[height]
      }
    }
  } catch { }

  return { small: 155, medium: 329, large: 329 }
}

function vmin(num: number): number {
  const size = getWidgetSize()
  let family: any = Widget.family
  if (family === "systemSmall") family = "small"
  else if (family === "systemMedium") family = "medium"
  else if (family === "systemLarge") family = "large"
  else if (family === "systemExtraLarge") family = "extraLarge"
  else family = "medium"

  const width = size[family === "large" ? "medium" : family] || 329
  let height = 155
  if (family === "medium") height = size.small
  else if (family === "extraLarge") height = size.large
  else height = size[family]

  return (num * Math.min(width, height)) / 100
}

function rpt(n: number): number {
  return vmin((n * 100) / 155)
}

// ========== Utils ==========
function fmtMoney(v: any): { num: string; unit: string } {
  const s = String(v ?? "0.00")
  const m = s.match(/-?\d+(?:\.\d+)?/)
  return { num: m ? m[0] : "0.00", unit: "元" }
}

function fmtUsage(v: any): { num: string; unit: string } {
  const s = String(v ?? "0")
  const m = s.match(/-?\d+(?:\.\d+)?/)
  return { num: m ? m[0] : "0", unit: "度" }
}

/**
 * ✅ 统一更新时间文案选择器
 * 优先级：
 * 1) widget 层已算好的 updatedAtText（可带“缓存”）
 * 2) lastUpdateTime → HH:mm（当前时间语义）
 */
function pickUpdateText(displayData: any): string {
  if (typeof displayData?.updatedAtText === "string") {
    return displayData.updatedAtText
  }

  const ts = Number(displayData?.lastUpdateTime)
  if (!Number.isFinite(ts) || ts <= 0) return "--"

  // 用统一 time 工具，语义是“多久前”
  // 但展示成：HH:mm（今天）
  const d = new Date(ts)
  const hh = String(d.getHours()).padStart(2, "0")
  const mm = String(d.getMinutes()).padStart(2, "0")
  return `${hh}:${mm}`
}

// ========== Pieces ==========
function MetricCell(props: { title: string; valueNum: string; valueUnit: string }) {
  const { title, valueNum, valueUnit } = props
  return (
    <VStack alignment="leading" spacing={rpt(2)} frame={{ maxWidth: Infinity }}>
      <Text font={rpt(10)} foregroundStyle={C.textSecondary} lineLimit={1}>
        {title}
      </Text>
      <HStack alignment="lastTextBaseline" spacing={rpt(2)}>
        <Text
          font={rpt(20)}
          fontWeight="heavy"
          fontDesign="rounded"
          foregroundStyle={C.textPrimary}
          lineLimit={1}
          minScaleFactor={0.6}
        >
          {valueNum}
        </Text>
        <Text font={rpt(10)} foregroundStyle={C.textSecondary}>
          {valueUnit}
        </Text>
      </HStack>
    </VStack>
  )
}

function StepLineProgress(props: { totalYearPq: number; settings: SGCCSettings }) {
  const { totalYearPq, settings } = props

  const one = Number((settings as any).oneLevelPq || 2160)
  const two = Number((settings as any).twoLevelPq || 4800)
  const tier3Max = two + two - one

  const level = totalYearPq > two ? 3 : totalYearPq > one ? 2 : 1
  const max = level === 1 ? one : level === 2 ? two : tier3Max
  let p = max > 0 ? totalYearPq / max : 0
  p = Math.min(Math.max(p, 0), 1)

  const trackH = rpt(3)
  const dot = rpt(5)

  const fillColor = level === 3 ? C.orange : level === 2 ? C.yellow : C.teal
  const trackColor = { light: "rgba(0,0,0,0.10)", dark: "rgba(255,255,255,0.12)" } as any

  return (
    <ZStack alignment="leading" frame={{ maxWidth: Infinity, height: Math.max(trackH, dot) }}>
      <RoundedRectangle
        cornerRadius={trackH / 2}
        style="continuous"
        fill={trackColor}
        frame={{ maxWidth: Infinity, height: trackH }}
      />
      <RoundedRectangle
        cornerRadius={trackH / 2}
        style="continuous"
        fill={fillColor}
        frame={{ width: `${(p * 100).toFixed(2)}%` as any, height: trackH }}
      />
      <RoundedRectangle
        cornerRadius={dot / 2}
        style="continuous"
        fill={fillColor}
        frame={{ width: dot, height: dot }}
        offset={{ x: (p * 100) as any, y: 0 } as any}
      />
    </ZStack>
  )
}

function LeftPanel(props: {
  logoPath: any
  updateText: string
  balanceNum: string
  balanceUnit: string
}) {
  const { logoPath, updateText, balanceNum, balanceUnit } = props
  const logoSize = rpt(40)

  return (
    <VStack alignment="center" spacing={rpt(8)} frame={{ maxWidth: Infinity, maxHeight: Infinity }}>
      {logoPath ? (
        <Image filePath={logoPath} resizable frame={{ width: logoSize, height: logoSize }} />
      ) : (
        <Image
          systemName="bolt.circle.fill"
          resizable
          frame={{ width: logoSize, height: logoSize }}
          foregroundStyle={C.teal}
        />
      )}

      {/* refresh time */}
      <HStack spacing={rpt(4)} alignment="center" frame={{ maxWidth: Infinity }}>
        <Image
          systemName="arrow.clockwise"
          resizable
          frame={{ width: rpt(10), height: rpt(10) }}
          foregroundStyle={C.textSecondary}
        />
        <Text
          font={rpt(10)}
          foregroundStyle={C.textSecondary}
          lineLimit={1}
          minScaleFactor={0.55}
          frame={{ maxWidth: Infinity }}
        >
          {updateText}
        </Text>
      </HStack>

      <ZStack alignment="center" frame={{ maxWidth: Infinity }}>
        <RoundedRectangle
          cornerRadius={rpt(10)}
          style="continuous"
          fill={C.leftCardBg}
          frame={{ maxWidth: Infinity, height: rpt(64) }}
        />
        <VStack alignment="center" spacing={rpt(4)}>
          <HStack alignment="lastTextBaseline" spacing={rpt(2)}>
            <Text
              font={rpt(28)}
              fontWeight="heavy"
              fontDesign="rounded"
              foregroundStyle={C.textPrimary}
              lineLimit={1}
              minScaleFactor={0.6}
            >
              {balanceNum}
            </Text>
            <Text font={rpt(11)} foregroundStyle={C.textSecondary}>
              {balanceUnit}
            </Text>
          </HStack>
          <Text font={rpt(11)} foregroundStyle={C.textSecondary}>
            电费余额
          </Text>
        </VStack>
      </ZStack>
    </VStack>
  )
}

function WidgetView({ displayData, settings, logoPath }: any) {
  const balance = fmtMoney(displayData?.balance)
  const lastBill = fmtMoney(displayData?.lastBill)
  const yearBill = fmtMoney(displayData?.yearBill)
  const lastUsage = fmtUsage(displayData?.lastUsage)
  const yearUsage = fmtUsage(displayData?.yearUsage)

  const totalYearPq = Number(displayData?.totalYearPq || 0)
  const updateText = pickUpdateText(displayData)

  if (Widget.family === "systemSmall") {
    return (
      <VStack padding={12} alignment="leading" widgetBackground={C.bgCard}>
        <LeftPanel
          logoPath={logoPath}
          updateText={updateText}
          balanceNum={balance.num}
          balanceUnit={balance.unit}
        />
        <Spacer minLength={rpt(10)} />
        <HStack alignment="center" spacing={rpt(8)}>
          <Text font={rpt(10)} foregroundStyle={C.textSecondary}>
            阶梯电量
          </Text>
          <StepLineProgress totalYearPq={totalYearPq} settings={settings} />
        </HStack>
      </VStack>
    )
  }

  return (
    <ZStack alignment="topLeading">
      <RoundedRectangle
        cornerRadius={rpt(14)}
        style="continuous"
        fill={C.bgCard}
        frame={{ maxWidth: Infinity, maxHeight: Infinity }}
      />

      <HStack spacing={0} frame={{ maxWidth: Infinity, maxHeight: Infinity }}>
        {/* Left */}
        <VStack
          padding={{ vertical: rpt(12), horizontal: rpt(12) }}
          frame={{ width: rpt(120), maxHeight: Infinity }}
        >
          <LeftPanel
            logoPath={logoPath}
            updateText={updateText}
            balanceNum={balance.num}
            balanceUnit={balance.unit}
          />
        </VStack>

        {/* Divider */}
        <RoundedRectangle
          cornerRadius={0}
          style="continuous"
          fill={C.divider}
          frame={{ width: 1, maxHeight: Infinity }}
        />

        {/* Right */}
        <VStack padding={{ vertical: rpt(14), horizontal: rpt(16) }} spacing={rpt(10)} frame={{ maxWidth: Infinity }}>
          <VStack spacing={rpt(10)} frame={{ maxWidth: Infinity }}>
            <HStack spacing={rpt(18)} frame={{ maxWidth: Infinity }}>
              <MetricCell title="上期电费" valueNum={lastBill.num} valueUnit={lastBill.unit} />
              <MetricCell title="上期电量" valueNum={lastUsage.num} valueUnit={lastUsage.unit} />
            </HStack>

            <RoundedRectangle cornerRadius={0} style="continuous" fill={C.divider} frame={{ maxWidth: Infinity, height: 1 }} />

            <HStack spacing={rpt(18)} frame={{ maxWidth: Infinity }}>
              <MetricCell title="年度电费" valueNum={yearBill.num} valueUnit={yearBill.unit} />
              <MetricCell title="年度电量" valueNum={yearUsage.num} valueUnit={yearUsage.unit} />
            </HStack>
          </VStack>

          <RoundedRectangle cornerRadius={0} style="continuous" fill={C.divider} frame={{ maxWidth: Infinity, height: 1 }} />

          <HStack alignment="center" spacing={rpt(10)} frame={{ maxWidth: Infinity }}>
            <Text font={rpt(12)} foregroundStyle={C.textSecondary}>
              阶梯电量
            </Text>

            <VStack spacing={rpt(6)} frame={{ maxWidth: Infinity }}>
              <StepLineProgress totalYearPq={totalYearPq} settings={settings} />

              <HStack spacing={rpt(6)} alignment="center" frame={{ maxWidth: Infinity }}>
                <Spacer />
                {(() => {
                  const one = Number((settings as any).oneLevelPq || 2160)
                  const two = Number((settings as any).twoLevelPq || 4800)
                  const tier3Max = two + two - one
                  const lvl = totalYearPq > two ? 3 : totalYearPq > one ? 2 : 1
                  const max = lvl === 1 ? one : lvl === 2 ? two : tier3Max
                  let pct = max > 0 ? (totalYearPq / max) * 100 : 0
                  if (pct < 0) pct = 0
                  if (pct > 100) pct = 100
                  return (
                    <Text font={rpt(12)} foregroundStyle={C.textSecondary}>
                      {lvl}档 · {pct.toFixed(2)}%
                    </Text>
                  )
                })()}
              </HStack>
            </VStack>
          </HStack>
        </VStack>
      </HStack>
    </ZStack>
  )
}

export const renderBillPanel: SGCCWidgetRenderer = (props) => {
  return <WidgetView {...props} />
}