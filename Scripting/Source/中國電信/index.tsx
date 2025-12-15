// index.tsx（中国电信）

import {
  Navigation,
  NavigationStack,
  List,
  Section,
  Button,
  Text,
  TextField,
  SecureField,
  Script,
  useState,
} from "scripting"

import {
  type ChinaTelecomSettings,
  TELECOM_SETTINGS_KEY,
} from "./telecom/settings"
import { RenderConfigSection } from "./telecom/index/renderConfigSection"
import type { SmallCardStyle } from "./telecom/cards/small"
import { useFullscreenPref } from "./telecom/index/useFullscreenPref"

declare const Storage: any
declare const Dialog: any

// ==================== 版本信息 ====================
// 版本号说明（Semantic Versioning）
// MAJOR：破坏性变更或配置结构调整（不兼容旧版）
// MINOR：新增功能、兼容性增强（兼容旧版）
// PATCH：修复 Bug、UI 微调、文案修改等小改动
const VERSION = "1.0.1"

// 构建日期：YYYY-MM-DD
const BUILD_DATE = "2025-12-14"

const SETTINGS_KEY = TELECOM_SETTINGS_KEY
const FULLSCREEN_KEY = "chinaTelecomSettingsFullscreen"

// ==================== 小工具 ====================

function toSafeIntMinutes(v: unknown, fallback: number): number {
  let n: number
  if (typeof v === "number") n = v
  else if (typeof v === "string") n = parseInt(v, 10)
  else n = fallback

  if (!Number.isFinite(n)) n = fallback
  n = Math.round(n)

  if (n < 15) n = 15
  if (n > 1440) n = 1440
  return n
}

// ==================== 默认设置 ====================

const defaultSettings: ChinaTelecomSettings = {
  mobile: "",
  password: "",

  refreshTimeDayColor: "#999999",
  refreshTimeNightColor: "#AAAAAA",
  refreshInterval: 180,

  showRemainRatio: false,

  // ✅ 中号：样式 + 三卡开关（关=四卡默认，开=三卡）
  mediumStyle: "FullRing",
  mediumUseThreeLayout: false,

  includeDirectionalInTotal: true,

  // 小号组件（新体系）
  smallCardStyle: "summary",

  // ✅ 仅作用于「紧凑清单 / 进度清单」
  // true  = 总流量 + 语音（2 行）
  // false = 通用 + 定向 + 语音（3 行）
  smallMiniBarUseTotalFlow: false,
}

// ==================== 设置页面 ====================

function SettingsView() {
  const dismiss = Navigation.useDismiss()
  const { fullscreenPref, toggleFullscreen } =
    useFullscreenPref(FULLSCREEN_KEY)

  const stored = Storage.get(SETTINGS_KEY) as ChinaTelecomSettings | null
  const initial: ChinaTelecomSettings = stored ?? defaultSettings

  // ==================== State ====================

  const [mobile, setMobile] = useState(initial.mobile || "")
  const [password, setPassword] = useState(initial.password || "")

  // 颜色字段仅透传
  const refreshTimeDayColor =
    initial.refreshTimeDayColor ?? defaultSettings.refreshTimeDayColor
  const refreshTimeNightColor =
    initial.refreshTimeNightColor ?? defaultSettings.refreshTimeNightColor

  const [refreshInterval, setRefreshInterval] = useState(
    toSafeIntMinutes(initial.refreshInterval, 180),
  )

  const [showRemainRatio, setShowRemainRatio] = useState(
    initial.showRemainRatio ?? false,
  )

  // ✅ 中号：样式 + “三卡开关”（关=默认四卡）
  const [mediumStyle, setMediumStyle] = useState<"FullRing" | "DialRing">(
    (initial as any).mediumStyle ?? "FullRing",
  )
  const [mediumUseThreeLayout, setMediumUseThreeLayout] = useState<boolean>(
    (initial as any).mediumUseThreeLayout ?? false,
  )

  const [includeDirectionalInTotal, setIncludeDirectionalInTotal] =
    useState<boolean>(initial.includeDirectionalInTotal ?? true)

  const [smallCardStyle, setSmallCardStyle] = useState<SmallCardStyle>(
    (initial.smallCardStyle as SmallCardStyle) ?? "summary",
  )

  // ✅ 紧凑清单 / 进度清单 2行 / 3行 联动
  const [smallMiniBarUseTotalFlow, setSmallMiniBarUseTotalFlow] =
    useState<boolean>(initial.smallMiniBarUseTotalFlow ?? false)

  // ==================== 保存 ====================

  const handleSave = () => {
    const newSettings: ChinaTelecomSettings = {
      mobile: mobile.trim(),
      password: password.trim(),

      refreshTimeDayColor,
      refreshTimeNightColor,
      refreshInterval: toSafeIntMinutes(refreshInterval, 180),

      showRemainRatio: !!showRemainRatio,

      // ✅ 新结构保存：只写 mediumUseThreeLayout + mediumStyle
      mediumStyle,
      mediumUseThreeLayout: !!mediumUseThreeLayout,

      includeDirectionalInTotal: !!includeDirectionalInTotal,

      smallCardStyle,
      smallMiniBarUseTotalFlow: !!smallMiniBarUseTotalFlow,
    }

    Storage.set(SETTINGS_KEY, newSettings)
    dismiss()
  }

  const handleAbout = async () => {
    await Dialog.alert({
      title: "电信余量组件",
      message:
        `作者：©ByteValley\n` +
        `版本：v${VERSION}（${BUILD_DATE}）\n` +
        `致谢：@DTZSGHNR`,
      buttonLabel: "关闭",
    })
  }

  // ==================== UI ====================

  return (
    <NavigationStack>
      <List
        navigationTitle={"电信余量组件"}
        navigationBarTitleDisplayMode={"inline"}
        toolbar={{
          topBarLeading: [<Button title="关闭" action={dismiss} />],
          topBarTrailing: [
            <Button
              title={fullscreenPref ? "页面" : "弹层"}
              systemImage={
                fullscreenPref
                  ? "rectangle.arrowtriangle.2.outward"
                  : "rectangle"
              }
              action={toggleFullscreen}
            />,
            <Button title="完成" action={handleSave} />,
          ],
          bottomBar: [
            <Button
              systemImage="info.circle"
              title="关于本组件"
              action={handleAbout}
              foregroundStyle="secondaryLabel"
            />,
          ],
        }}
      >
        {/* 账号设置 */}
        <Section
          header={<Text font="body" fontWeight="semibold">账号设置</Text>}
          footer={
            <Text font="caption2" foregroundStyle="secondaryLabel">
              使用官方接口查询数据，账号信息仅保存在本机，不上传到任何第三方服务器。
            </Text>
          }
        >
          <TextField
            title="手机号"
            prompt="请输入 11 位手机号"
            value={mobile}
            onChanged={setMobile}
          />
          <SecureField
            title="服务密码"
            prompt="请输入服务密码"
            value={password}
            onChanged={setPassword}
          />
        </Section>

        {/* 渲染配置（对齐联通新结构：mediumStyle + mediumUseThreeLayout） */}
        <RenderConfigSection
          smallCardStyle={smallCardStyle}
          setSmallCardStyle={setSmallCardStyle}
          showRemainRatio={showRemainRatio}
          setShowRemainRatio={setShowRemainRatio}
          smallMiniBarUseTotalFlow={smallMiniBarUseTotalFlow}
          setSmallMiniBarUseTotalFlow={setSmallMiniBarUseTotalFlow}
          mediumStyle={mediumStyle}
          setMediumStyle={setMediumStyle}
          mediumUseThreeLayout={mediumUseThreeLayout}
          setMediumUseThreeLayout={setMediumUseThreeLayout}
          includeDirectionalInTotal={includeDirectionalInTotal}
          setIncludeDirectionalInTotal={setIncludeDirectionalInTotal}
          refreshInterval={refreshInterval}
          setRefreshInterval={setRefreshInterval}
        />
      </List>
    </NavigationStack>
  )
}

// ==================== App / Run ====================

type AppProps = { interactiveDismissDisabled?: boolean }

function App(_props: AppProps) {
  return <SettingsView />
}

function readFullscreenPrefForRun(): boolean {
  try {
    const v = Storage.get(FULLSCREEN_KEY)
    if (typeof v === "boolean") return v
  } catch { }
  return true
}

async function run() {
  const fullscreen = readFullscreenPrefForRun()

  await Navigation.present({
    element: <App interactiveDismissDisabled />,
    ...(fullscreen ? { modalPresentationStyle: "fullScreen" } : {}),
  })

  Script.exit()
}

run()