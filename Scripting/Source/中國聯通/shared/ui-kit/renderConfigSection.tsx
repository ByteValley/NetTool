// shared/ui-kit/renderConfigSection.tsx

import { Section, Text, Picker, Toggle } from "scripting"
import { type SmallCardStyle, SMALL_STYLE_OPTIONS, } from "../carrier/cards/small"

// ✅ 中号样式：FullRing / DialRing（新结构）
export type MediumStyleKey = "FullRing" | "DialRing"

type RenderConfigSectionProps = {
  showRemainRatio: boolean
  setShowRemainRatio: (v: boolean) => void

  // 小号
  smallCardStyle: SmallCardStyle
  setSmallCardStyle: (v: SmallCardStyle) => void
  smallMiniBarUseTotalFlow: boolean
  setSmallMiniBarUseTotalFlow: (v: boolean) => void

  // 中号：样式（满圆环 / 仪表盘）
  mediumStyle: MediumStyleKey
  setMediumStyle: (v: MediumStyleKey) => void

  // ✅ 中号：三卡开关（true=三卡，false=四卡默认）
  mediumUseThreeCard: boolean
  setMediumUseThreeCard: (v: boolean) => void

  // 三卡时：总/通用联动
  includeDirectionalInTotal: boolean
  setIncludeDirectionalInTotal: (v: boolean) => void

  refreshInterval: number
  setRefreshInterval: (v: number) => void
}

const REFRESH_OPTIONS = [
  { label: "15 分钟", value: 15 },
  { label: "30 分钟", value: 30 },
  { label: "1 小时", value: 60 },
  { label: "2 小时", value: 120 },
  { label: "3 小时", value: 180 },
  { label: "6 小时", value: 360 },
  { label: "12 小时", value: 720 },
  { label: "24 小时", value: 1440 },
]

const MEDIUM_STYLE_OPTIONS: Array<{ label: string; value: MediumStyleKey }> = [
  { label: "全圆环", value: "FullRing" },
  { label: "仪表盘", value: "DialRing" },
]

const SMALL_CARD_OPTIONS: { label: string; value: SmallCardStyle }[] = [
  { label: "摘要", value: "summary" },
  ...SMALL_STYLE_OPTIONS.map((opt) => ({
    label: opt.nameCN,
    value: opt.key as SmallCardStyle,
  })),
]

export function RenderConfigSection(props: RenderConfigSectionProps) {
  const {
    showRemainRatio,
    setShowRemainRatio,

    smallCardStyle,
    setSmallCardStyle,
    smallMiniBarUseTotalFlow,
    setSmallMiniBarUseTotalFlow,

    mediumStyle,
    setMediumStyle,

    mediumUseThreeCard,
    setMediumUseThreeCard,

    includeDirectionalInTotal,
    setIncludeDirectionalInTotal,

    refreshInterval,
    setRefreshInterval,
  } = props

  // ✅ 只对 CompactList / ProgressList 生效的联动开关（保持原逻辑不动）
  const isCompactOrProgress =
    smallCardStyle === ("CompactList" as SmallCardStyle) ||
    smallCardStyle === ("ProgressList" as SmallCardStyle)

  // ✅ 三卡判断现在改为 boolean（唯一真源）
  const isThreeCard = !!mediumUseThreeCard

  return (
    <Section
      header={<Text font="body" fontWeight="semibold">渲染配置</Text>}
      footer={
        <Text font="caption2" foregroundStyle="secondaryLabel">
          • 小号组件：摘要 / 紧凑清单 / 进度清单 / 其余布局可选。
          {"\n"}• “进度清单”会显示条形进度；“紧凑清单”不显示条形，仅显示数值。
          {"\n"}• 百分比含义：作用于通用/定向/语音（或总流量/语音），由「显示剩余/已使用」决定。
          {"\n"}• 中号组件：样式=全圆环/仪表盘；布局=三卡/四卡（三卡会隐藏定向卡）。
          {"\n"}• 三卡布局下：可选择“总流量包含定向”或“仅通用流量”。
          {"\n"}• 刷新间隔建议 15 分钟～24 小时（系统调度可能更慢）。
        </Text>
      }
    >
      <Toggle
        title={showRemainRatio ? "当前：显示剩余百分比" : "当前：显示已使用百分比"}
        value={showRemainRatio}
        onChanged={setShowRemainRatio}
      />

      {/* ==================== 小号 ==================== */}
      <Picker
        title={"小号组件样式"}
        value={smallCardStyle}
        onChanged={(value: string) =>
          setSmallCardStyle((value as SmallCardStyle) || "summary")
        }
        pickerStyle={"menu"}
      >
        {SMALL_CARD_OPTIONS.map((opt) => (
          <Text key={opt.value} tag={opt.value as any}>
            {opt.label}
          </Text>
        ))}
      </Picker>

      {/* ✅ 只对 CompactList / ProgressList 生效的联动开关 */}
      {isCompactOrProgress ? (
        <Toggle
          title={
            smallMiniBarUseTotalFlow
              ? "紧凑/进度清单：显示总流量 + 语音（2 行）"
              : "紧凑/进度清单：显示通用 + 定向 + 语音（3 行）"
          }
          value={smallMiniBarUseTotalFlow}
          onChanged={setSmallMiniBarUseTotalFlow}
        />
      ) : null}

      {/* ==================== 中号 ==================== */}
      <Picker
        title={"中号组件样式"}
        value={mediumStyle}
        onChanged={(value: string) =>
          setMediumStyle((value as MediumStyleKey) || "FullRing")
        }
        pickerStyle={"menu"}
      >
        {MEDIUM_STYLE_OPTIONS.map((opt) => (
          <Text key={opt.value} tag={opt.value as any}>
            {opt.label}
          </Text>
        ))}
      </Picker>

      {/* ✅ 中号组件布局：boolean 开关（关=默认四卡） */}
      <Toggle
        title={isThreeCard ? "中号组件布局：三卡（隐藏定向卡）" : "中号组件布局：四卡（默认）"}
        value={isThreeCard}
        onChanged={setMediumUseThreeCard}
      />

      {/* ✅ 三卡时才需要“总/通用联动”（联动开关恢复出现） */}
      {isThreeCard ? (
        <Toggle
          title={includeDirectionalInTotal ? "总流量：包含定向流量" : "总流量：仅统计通用流量"}
          value={includeDirectionalInTotal}
          onChanged={setIncludeDirectionalInTotal}
        />
      ) : null}

      {/* ==================== 刷新 ==================== */}
      <Picker
        title={"刷新间隔"}
        value={refreshInterval}
        onChanged={(value: number) => {
          const n = Number(value)
          setRefreshInterval(Number.isFinite(n) ? n : 180)
        }}
        pickerStyle={"menu"}
      >
        {REFRESH_OPTIONS.map((opt) => (
          <Text key={opt.value} tag={opt.value as any}>
            {opt.label}
          </Text>
        ))}
      </Picker>
    </Section>
  )
}