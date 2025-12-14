// telecom/index/renderConfigSection.tsx

import { Section, Text, Toggle, Picker } from "scripting"
import type { SmallCardStyle } from "../cards/small"
import { SMALL_STYLE_OPTIONS } from "../cards/small"

type RenderConfigSectionProps = {
  showRemainRatio: boolean
  setShowRemainRatio: (v: boolean) => void
  smallCardStyle: SmallCardStyle
  setSmallCardStyle: (v: SmallCardStyle) => void
  smallMiniBarUseTotalFlow: boolean
  setSmallMiniBarUseTotalFlow: (v: boolean) => void

  mediumCardStyle: "three" | "four"
  setMediumCardStyle: (v: "three" | "four") => void

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

const MEDIUM_LAYOUT_OPTIONS = [
  { label: "三卡", value: "three" as const },
  { label: "四卡", value: "four" as const },
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
    smallCardStyle,
    setSmallCardStyle,
    showRemainRatio,
    setShowRemainRatio,

    smallMiniBarUseTotalFlow,
    setSmallMiniBarUseTotalFlow,

    mediumCardStyle,
    setMediumCardStyle,
    includeDirectionalInTotal,
    setIncludeDirectionalInTotal,
    refreshInterval,
    setRefreshInterval,
  } = props

  // ✅ 只对 CompactList / ProgressList 生效的联动开关
  const isCompactOrProgress =
    smallCardStyle === ("CompactList" as SmallCardStyle) ||
    smallCardStyle === ("ProgressList" as SmallCardStyle)

  return (
    <Section
      header={<Text font="body" fontWeight="semibold">渲染配置</Text>}
      footer={
        <Text font="caption2" foregroundStyle="secondaryLabel">
          • 小号组件：摘要 / 紧凑清单 / 进度清单 / 其余 6 种布局可选。
          {"\n"}• “进度清单”会显示条形进度；“紧凑清单”不显示条形，仅显示数值。
          {"\n"}• 百分比含义：作用于通用/定向/语音（或总流量/语音），由「显示剩余/已使用」决定。
          {"\n"}• 中号组件布局：三卡=话费+总流量+语音；四卡=话费+通用+定向+语音。
          {"\n"}• 刷新间隔建议 15 分钟～24 小时（系统调度可能更慢）。
        </Text>
      }
    >
      <Toggle
        title={showRemainRatio ? "当前：显示剩余百分比" : "当前：显示已使用百分比"}
        value={showRemainRatio}
        onChanged={setShowRemainRatio}
      />

      <Picker
        title={"小号组件样式"}
        value={smallCardStyle}
        onChanged={(value: string) => setSmallCardStyle((value as SmallCardStyle) || "summary")}
        pickerStyle={"menu"}
      >
        {SMALL_CARD_OPTIONS.map((opt) => (
          <Text key={opt.value} tag={opt.value as any}>{opt.label}</Text>
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

      <Picker
        title={"中号组件样式"}
        value={mediumCardStyle}
        onChanged={(value: string) => setMediumCardStyle((value as "four" | "three") || "four")}
        pickerStyle={"menu"}
      >
        {MEDIUM_LAYOUT_OPTIONS.map((opt) => (
          <Text key={opt.value} tag={opt.value as any}>{opt.label}</Text>
        ))}
      </Picker>

      {mediumCardStyle === "three" ? (
        <Toggle
          title={includeDirectionalInTotal ? "总流量：包含定向流量" : "总流量：仅统计通用流量"}
          value={includeDirectionalInTotal}
          onChanged={setIncludeDirectionalInTotal}
        />
      ) : null}

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
          <Text key={opt.value} tag={opt.value as any}>{opt.label}</Text>
        ))}
      </Picker>
    </Section>
  )
}