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
import { fetchNetworkInfoCached } from "./api"

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

const CACHE_OPTIONS = [
  { label: "5 分钟", value: 5 },
  { label: "10 分钟（默认）", value: 10 },
  { label: "30 分钟", value: 30 },
  { label: "1 小时", value: 60 },
  { label: "6 小时", value: 360 },
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
  const [cacheEnabled, setCacheEnabled] = useState(initial.cacheEnabled)
  const [cacheMinutes, setCacheMinutes] = useState(initial.cacheMinutes)
  const [enableIPv6, setEnableIPv6] = useState(initial.enableIPv6)
  const [enableConnectivity, setEnableConnectivity] = useState(initial.enableConnectivity)
  const [maskIp, setMaskIp] = useState(initial.maskIp)
  const [maskLocation, setMaskLocation] = useState(initial.maskLocation)
  const [showSourceName, setShowSourceName] = useState(initial.showSourceName)

  const currentSettings = (overrides: Partial<SkkIpInfoSettings> = {}): SkkIpInfoSettings => ({
    ...defaultSkkIpInfoSettings,
    ...initial,
    title: title.trim() || defaultSkkIpInfoSettings.title,
    refreshIntervalMinutes,
    timeoutMs,
    cacheEnabled,
    cacheMinutes,
    enableIPv6,
    enableConnectivity,
    maskIp,
    maskLocation,
    showSourceName,
    ...overrides,
  })

  const handleSave = () => {
    const settings = currentSettings()
    saveSkkIpInfoSettings(settings)
    dismiss()
  }

  const handleRefreshCache = async () => {
    const settings = currentSettings({ cacheEnabled: true })
    saveSkkIpInfoSettings(settings)
    try {
      await fetchNetworkInfoCached(settings, { forceRefresh: true })
      await Dialog?.alert?.({
        title: "刷新完成",
        message: "完整检测结果已写入缓存，桌面小组件会优先读取这份结果。",
        buttonLabel: "知道了",
      })
    } catch (error: any) {
      await Dialog?.alert?.({
        title: "刷新失败",
        message: error?.message ? String(error.message) : String(error),
        buttonLabel: "知道了",
      })
    }
  }

  const handleAbout = async () => {
    await Dialog?.alert?.({
      title: "IP 信息组件",
      message:
        `作者：ByteValley\n` +
        `版本：v${VERSION}（${BUILD_DATE}）\n` +
        `数据源参考：ip.skk.moe / network_info.js`,
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
          header={<Text font="body" fontWeight="semibold">刷新与缓存</Text>}
          footer={
            <Text font="caption2" foregroundStyle="secondaryLabel">
              刷新间隔是系统小组件调度建议；缓存用于减少探针请求并在网络失败时兜底。
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

          <Toggle title="启用缓存" value={cacheEnabled} onChanged={setCacheEnabled} />

          {cacheEnabled ? (
            <Picker
              title="缓存有效期"
              value={cacheMinutes}
              onChanged={(value: number) => setCacheMinutes(Number(value) || 10)}
              pickerStyle="menu"
            >
              {CACHE_OPTIONS.map((option) => (
                <Text key={option.value} tag={option.value as any}>
                  {option.label}
                </Text>
              ))}
            </Picker>
          ) : null}
        </Section>

        <Section
          header={<Text font="body" fontWeight="semibold">外部工具</Text>}
          footer={
            <Text font="caption2" foregroundStyle="secondaryLabel">
              桌面小组件会先读取缓存；需要更新 ChatGPT、Netflix 等检测结果时，可先在这里刷新完整缓存。
            </Text>
          }
        >
          <Button
            title="刷新完整检测缓存"
            systemImage="arrow.clockwise"
            action={handleRefreshCache}
          />
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
    } catch {}
    Script.exit()
  }
}

main()
