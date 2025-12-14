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

declare const Storage: any
declare const Dialog: any

import {
  type ChinaTelecomSettings,
  TELECOM_SETTINGS_KEY,
} from "./telecom/settings"
import { TelecomRenderConfigSection } from "./telecom/index/renderConfigSection"
import type { SmallCardStyle } from "./telecom/cards/small"
import { useFullscreenPref } from "./telecom/index/useFullscreenPref"

// 版本号说明（Semantic Versioning）
// MAJOR：破坏性变更或配置结构调整（不兼容旧版）
// MINOR：新增功能、兼容性增强（兼容旧版）
// PATCH：修复 Bug、UI 微调、文案修改等小改动
const VERSION = "1.0.0"

// 构建日期：YYYY-MM-DD
const BUILD_DATE = "2025-12-12"

const SETTINGS_KEY = TELECOM_SETTINGS_KEY
const FULLSCREEN_KEY = "chinaTelecomSettingsFullscreen"

// 默认设置
const defaultSettings: ChinaTelecomSettings = {
  mobile: "",
  password: "",
  refreshTimeDayColor: "#999999",
  refreshTimeNightColor: "#AAAAAA",
  refreshInterval: 180,
  showRemainRatio: false,
  mediumCardStyle: "four",
  includeDirectionalInTotal: true,
  // 小号组件默认样式
  smallCardStyle: "summary",
}

// ===== 设置页面 =====

function SettingsView() {
  const dismiss = Navigation.useDismiss()

  // ⭐ 用通用 Hook 读取/切换「页面/弹层」偏好
  const { fullscreenPref, toggleFullscreen } = useFullscreenPref(FULLSCREEN_KEY)

  const stored = Storage.get(SETTINGS_KEY) as ChinaTelecomSettings | null
  const initial: ChinaTelecomSettings = stored ?? defaultSettings

  const [mobile, setMobile] = useState(initial.mobile || "")
  const [password, setPassword] = useState(initial.password || "")

  // 刷新时间颜色只透传，不在设置页改
  const refreshTimeDayColor =
    initial.refreshTimeDayColor ?? defaultSettings.refreshTimeDayColor
  const refreshTimeNightColor =
    initial.refreshTimeNightColor ?? defaultSettings.refreshTimeNightColor

  const [refreshInterval, setRefreshInterval] = useState(
    initial.refreshInterval ?? 180,
  )
  const [showRemainRatio, setShowRemainRatio] = useState(
    initial.showRemainRatio ?? false,
  )
  const [mediumCardStyle, setMediumCardStyle] = useState<"four" | "three">(
    initial.mediumCardStyle ?? "four",
  )
  const [includeDirectionalInTotal, setIncludeDirectionalInTotal] =
    useState<boolean>(initial.includeDirectionalInTotal ?? true)

  // 小号组件样式 state
  const [smallCardStyle, setSmallCardStyle] = useState<SmallCardStyle>(
    (initial.smallCardStyle as SmallCardStyle) ?? "summary",
  )

  const handleSave = () => {
    const newSettings: ChinaTelecomSettings = {
      mobile: mobile.trim(),
      password: password.trim(),
      refreshTimeDayColor,
      refreshTimeNightColor,
      refreshInterval,
      showRemainRatio,
      mediumCardStyle,
      includeDirectionalInTotal,
      smallCardStyle,
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

        {/* 渲染配置（公共 Section + 小号样式） */}
        <TelecomRenderConfigSection
          smallCardStyle={smallCardStyle}
          setSmallCardStyle={setSmallCardStyle}
          showRemainRatio={showRemainRatio}
          setShowRemainRatio={setShowRemainRatio}
          mediumCardStyle={mediumCardStyle}
          setMediumCardStyle={setMediumCardStyle}
          includeDirectionalInTotal={includeDirectionalInTotal}
          setIncludeDirectionalInTotal={setIncludeDirectionalInTotal}
          refreshInterval={refreshInterval}
          setRefreshInterval={setRefreshInterval}
        />
      </List>
    </NavigationStack>
  )
}

// ===== App / 入口 =====

type AppProps = { interactiveDismissDisabled?: boolean }

function App(_props: AppProps) {
  return <SettingsView />
}

// run 里只需要读一次 Storage，不用 Hook
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