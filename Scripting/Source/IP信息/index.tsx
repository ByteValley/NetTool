import {
  Navigation,
  NavigationStack,
  List,
  Section,
  Button,
  Text,
  Script,
  useState,
  Toggle,
  TextField,
  Picker,
} from "scripting"

import {
  defaultSkkIpInfoSettings,
  loadSkkIpInfoSettings,
  readFullscreenPreference,
  saveFullscreenPreference,
  saveSkkIpInfoSettings,
  type SkkIpInfoSettings,
} from "./settings"

declare const Safari: any
declare const Dialog: any

const VERSION = "1.0.0"
const BUILD_DATE = "2026-04-25"

const REFRESH_OPTIONS = [
  { label: "5 分钟", value: 5 },
  { label: "10 分钟", value: 10 },
  { label: "30 分钟（默认）", value: 30 },
  { label: "1 小时", value: 60 },
  { label: "2 小时", value: 120 },
  { label: "6 小时", value: 360 },
  { label: "12 小时", value: 720 },
]

const TIMEOUT_OPTIONS = [
  { label: "3 秒（默认）", value: 3000 },
  { label: "6 秒", value: 6000 },
  { label: "10 秒", value: 10000 },
  { label: "15 秒", value: 15000 },
]

function SettingsView() {
  const dismiss = Navigation.useDismiss()
  const initial = loadSkkIpInfoSettings()

  const [fullscreenPref, setFullscreenPref] = useState(readFullscreenPreference())
  const [title, setTitle] = useState(initial.title)
  const [refreshIntervalMinutes, setRefreshIntervalMinutes] = useState(
    initial.refreshIntervalMinutes,
  )
  const [timeoutMs, setTimeoutMs] = useState(initial.timeoutMs)
  const [enableIPv6, setEnableIPv6] = useState(initial.enableIPv6)
  const [enableConnectivity, setEnableConnectivity] = useState(initial.enableConnectivity)
  const [maskIp, setMaskIp] = useState(initial.maskIp)
  const [maskLocation, setMaskLocation] = useState(initial.maskLocation)
  const [showSourceName, setShowSourceName] = useState(initial.showSourceName)

  const handleSave = () => {
    const settings: SkkIpInfoSettings = {
      ...defaultSkkIpInfoSettings,
      ...initial,
      title: title.trim() || defaultSkkIpInfoSettings.title,
      refreshIntervalMinutes,
      timeoutMs,
      enableIPv6,
      enableConnectivity,
      maskIp,
      maskLocation,
      showSourceName,
    }
    saveSkkIpInfoSettings(settings)
    dismiss()
  }

  const handleAbout = async () => {
    await Dialog?.alert?.({
      title: "IP 信息组件",
      message:
        `作者：ByteValley\n` +
        `版本：v${VERSION}（${BUILD_DATE}）\n` +
        `数据源：ip.skk.moe（聚合 IP 信息服务）`,
      buttonLabel: "关闭",
    })
  }

  const toggleFullscreen = () => {
    const next = !fullscreenPref
    setFullscreenPref(next)
    saveFullscreenPreference(next)
  }

  return (
    <NavigationStack>
      <List
        navigationTitle="IP 信息组件"
        navigationBarTitleDisplayMode="inline"
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
        <Section
          header={<Text font="body" fontWeight="semibold">显示配置</Text>}
          footer={
            <Text font="caption2" foregroundStyle="secondaryLabel">
              隐藏 IP 时仅展示前两段；隐藏位置时保留是否成功与耗时。
            </Text>
          }
        >
          <TextField
            title="顶部标题"
            prompt="例如：IP 信息 / 出口检测"
            value={title}
            onChanged={setTitle}
          />
          <Toggle title="隐藏 IP" value={maskIp} onChanged={setMaskIp} />
          <Toggle title="隐藏位置" value={maskLocation} onChanged={setMaskLocation} />
          <Toggle title="显示数据源名称" value={showSourceName} onChanged={setShowSourceName} />
        </Section>

        <Section
          header={<Text font="body" fontWeight="semibold">探针配置</Text>}
          footer={
            <Text font="caption2" foregroundStyle="secondaryLabel">
              IPv6 探针会在当前网络不支持 IPv6 时自然失败；服务检测覆盖国内站点、ChatGPT、Netflix 与主流流媒体。
            </Text>
          }
        >
          <Toggle title="启用 IPv6 探针" value={enableIPv6} onChanged={setEnableIPv6} />
          <Toggle
            title="启用网站与服务检测"
            value={enableConnectivity}
            onChanged={setEnableConnectivity}
          />
          <Picker
            title="单项超时"
            value={timeoutMs}
            onChanged={(value: number) => setTimeoutMs(Number(value) || 3000)}
            pickerStyle="menu"
          >
            {TIMEOUT_OPTIONS.map((option) => (
              <Text key={option.value} tag={option.value as any}>
                {option.label}
              </Text>
            ))}
          </Picker>
        </Section>

        <Section
          header={<Text font="body" fontWeight="semibold">刷新</Text>}
          footer={
            <Text font="caption2" foregroundStyle="secondaryLabel">
              刷新间隔是系统小组件调度建议；每次刷新都会实时请求探针数据。
            </Text>
          }
        >
          <Picker
            title="刷新间隔"
            value={refreshIntervalMinutes}
            onChanged={(value: number) => setRefreshIntervalMinutes(Number(value) || 30)}
            pickerStyle="menu"
          >
            {REFRESH_OPTIONS.map((option) => (
              <Text key={option.value} tag={option.value as any}>
                {option.label}
              </Text>
            ))}
          </Picker>
        </Section>

        <Section
          header={<Text font="body" fontWeight="semibold">外部工具</Text>}
          footer={
            <Text font="caption2" foregroundStyle="secondaryLabel">
              可打开原站点查看完整网页检测结果。
            </Text>
          }
        >
          <Button
            title="打开 ip.skk.moe"
            systemImage="safari"
            action={() => Safari?.openURL?.("https://ip.skk.moe")}
          />
        </Section>
      </List>
    </NavigationStack>
  )
}

async function main() {
  try {
    const fullscreen = readFullscreenPreference()
    await Navigation.present({
      element: <SettingsView />,
      ...(fullscreen ? { modalPresentationStyle: "fullScreen" } : {}),
    })
    Script.exit()
  } catch (error: any) {
    const message = error?.message ? String(error.message) : String(error)
    try {
      await Dialog?.alert?.({
        title: "脚本执行失败",
        message,
        buttonLabel: "知道了",
      })
    } catch { }
    Script.exit()
  }
}

main()
