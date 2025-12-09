import {
  Navigation,
  NavigationStack,
  List,
  Section,
  TextField,
  Button,
  Color,
  Text,
  Toggle,
  Picker,
  Script,
  useState,
} from "scripting"

declare const Storage: any
declare const Dialog: any
declare const Safari: any

// 版本号说明（Semantic Versioning）
// MAJOR：破坏性变更或配置结构调整（不兼容旧版）
// MINOR：新增功能、兼容性增强（兼容旧版）
// PATCH：修复 Bug、UI 微调、文案修改等小改动
const VERSION = "1.0.0"

// 构建日期：YYYY-MM-DD
const BUILD_DATE = "2025-12-09"

// 联通 BoxJS 订阅 & 模块地址
const UNICOM_BOXJS_SUB_URL =
  "http://boxjs.com/#/sub/add/https://raw.githubusercontent.com/ByteValley/NetTool/main/BoxJs/DataCollection/ChinaUnicom.box.json"

const UNICOM_MODULE_URL =
  "https://raw.githubusercontent.com/ByteValley/NetTool/main/Surge/Module/DataCollection/ChinaUnicom.module"

// 刷新间隔选项（单位：分钟）
const REFRESH_OPTIONS = [
  { label: "15 分钟", value: 15 },
  { label: "30 分钟", value: 30 },
  { label: "1 小时", value: 60 },
  { label: "2 小时", value: 120 },
  { label: "3 小时", value: 180 }, // 默认
  { label: "6 小时", value: 360 },
  { label: "12 小时", value: 720 },
  { label: "24 小时", value: 1440 },
]

// 定向流量匹配类型选项
const MATCH_TYPE_OPTIONS: { label: string; value: "flowType" | "addupItemCode" }[] = [
  { label: "按 flowType 聚合（默认）", value: "flowType" },
  { label: "按 addupItemCode 精确匹配", value: "addupItemCode" },
]

// 设置结构
type ChinaUnicomSettings = {
  cookie: string
  titleDayColor: Color
  titleNightColor: Color
  descDayColor: Color
  descNightColor: Color
  refreshTimeDayColor: Color
  refreshTimeNightColor: Color
  refreshInterval: number // 以分钟为单位
  otherFlowMatchType: "flowType" | "addupItemCode"
  otherFlowMatchValue: string
  enableBoxJs: boolean
  boxJsUrl: string
  // 统一控制圆环百分比：false=已用，true=剩余
  showRemainRatio: boolean
  // 设置页打开方式：true = 页面（全屏），false = 弹层
  fullscreen?: boolean
}

const SETTINGS_KEY = "chinaUnicomSettings"

// 默认设置
const defaultSettings: ChinaUnicomSettings = {
  cookie: "",
  titleDayColor: "#666666",
  titleNightColor: "#CCCCCC",
  descDayColor: "#000000",
  descNightColor: "#FFFFFF",
  refreshTimeDayColor: "#999999",
  refreshTimeNightColor: "#AAAAAA",
  // 默认刷新间隔：3 小时
  refreshInterval: 180,
  otherFlowMatchType: "flowType",
  otherFlowMatchValue: "3",
  enableBoxJs: false,
  boxJsUrl: "",
  showRemainRatio: false,
  fullscreen: true,
}

// ======== 全屏偏好读写（共用 settings 存储） ========

function getFullscreenPref(): boolean {
  try {
    const raw = Storage.get(SETTINGS_KEY) as ChinaUnicomSettings | null
    if (raw && typeof raw === "object" && typeof raw.fullscreen === "boolean") {
      return raw.fullscreen
    }
  } catch {}
  return true
}

function setFullscreenPref(value: boolean) {
  try {
    const raw = (Storage.get(SETTINGS_KEY) as ChinaUnicomSettings | null) ?? defaultSettings
    const next: ChinaUnicomSettings = { ...raw, fullscreen: value }
    Storage.set(SETTINGS_KEY, next)
  } catch {}
}

function SettingsView() {
  const dismiss = Navigation.useDismiss()

  const initialSettings =
    (Storage.get(SETTINGS_KEY) as ChinaUnicomSettings | null) ?? defaultSettings

  // 计算初始匹配类型索引
  const initialMatchType =
    initialSettings.otherFlowMatchType ?? defaultSettings.otherFlowMatchType
  const initialMatchIndex = Math.max(
    0,
    MATCH_TYPE_OPTIONS.findIndex((opt) => opt.value === initialMatchType),
  )

  // State
  const [cookie, setCookie] = useState(initialSettings.cookie)
  const [titleDayColor] = useState(initialSettings.titleDayColor)
  const [titleNightColor] = useState(initialSettings.titleNightColor)
  const [descDayColor] = useState(initialSettings.descDayColor)
  const [descNightColor] = useState(initialSettings.descNightColor)
  const [refreshTimeDayColor] = useState(initialSettings.refreshTimeDayColor)
  const [refreshTimeNightColor] = useState(initialSettings.refreshTimeNightColor)
  const [refreshInterval, setRefreshInterval] = useState(
    initialSettings.refreshInterval || 180,
  )
  const [matchTypeIndex, setMatchTypeIndex] = useState<number>(initialMatchIndex)
  const [otherFlowMatchValue, setOtherFlowMatchValue] = useState(
    initialSettings.otherFlowMatchValue ?? "3",
  )
  const [enableBoxJs, setEnableBoxJs] = useState(initialSettings.enableBoxJs ?? false)
  const [boxJsUrl, setBoxJsUrl] = useState(initialSettings.boxJsUrl ?? "")
  const [showRemainRatio, setShowRemainRatio] = useState(
    initialSettings.showRemainRatio ?? false,
  )
  const [fullscreenPref, setFullscreenPrefState] = useState<boolean>(
    typeof initialSettings.fullscreen === "boolean"
      ? initialSettings.fullscreen
      : getFullscreenPref(),
  )

  // 当前匹配类型（由索引映射得到）
  const currentMatchType: "flowType" | "addupItemCode" =
    MATCH_TYPE_OPTIONS[matchTypeIndex]?.value ?? "flowType"

  const handleSave = () => {
    const newSettings: ChinaUnicomSettings = {
      cookie,
      titleDayColor,
      titleNightColor,
      descDayColor,
      descNightColor,
      refreshTimeDayColor,
      refreshTimeNightColor,
      refreshInterval,
      otherFlowMatchType: currentMatchType,
      otherFlowMatchValue,
      enableBoxJs,
      boxJsUrl,
      showRemainRatio,
      fullscreen: fullscreenPref,
    }
    Storage.set(SETTINGS_KEY, newSettings)
    dismiss()
  }

  const handleAbout = async () => {
    await Dialog.alert({
      title: "联通余量组件",
      message:
        `作者：©ByteValley\n` +
        `版本：v${VERSION}（${BUILD_DATE}）\n` +
        `致谢：@DTZSGHNR`,
      buttonLabel: "关闭",
    })
  }

  // 打开联通 BoxJS 订阅
  const handleOpenUnicomBoxJsSub = async () => {
    await Safari.openURL(UNICOM_BOXJS_SUB_URL)
  }

  // 一键安装到 Surge
  const handleInstallToSurge = async () => {
    const encodedUrl = encodeURIComponent(UNICOM_MODULE_URL)
    const surgeUrl = `surge:///install-module?url=${encodedUrl}`
    await Safari.openURL(surgeUrl)
  }

  // 一键安装到 Egern
  const handleInstallToEgern = async () => {
    const encodedUrl = encodeURIComponent(UNICOM_MODULE_URL)
    const name = encodeURIComponent("中国联通余量查询")
    const egernUrl = `egern:/modules/new?name=${name}&url=${encodedUrl}`
    await Safari.openURL(egernUrl)
  }

  // 切换「页面 / 弹层」打开方式
  const handleToggleFullscreen = async () => {
    const next = !fullscreenPref
    setFullscreenPrefState(next)
    setFullscreenPref(next)

    try {
      await Dialog.alert({
        title: "显示模式已更新",
        message: `已切换为「${next ? "页面（全屏）" : "弹层弹出"}」模式，下次打开设置时生效。`,
        buttonLabel: "好的",
      })
    } catch {
      // 环境不支持 Dialog 时忽略
    }
  }

  return (
    <NavigationStack>
      <List
        navigationTitle={"联通余量组件"}
        navigationBarTitleDisplayMode={"inline"}
        toolbar={{
          topBarLeading: [<Button title={"关闭"} action={dismiss} />],
          // ✅ 在完成按钮左侧增加页面 / 弹层切换
          topBarTrailing: [
            <Button
              title={fullscreenPref ? "页面" : "弹层"}
              systemImage={
                fullscreenPref
                  ? "rectangle.arrowtriangle.2.outward"
                  : "rectangle"
              }
              action={handleToggleFullscreen}
            />,
            <Button title={"完成"} action={handleSave} />,
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
        {/* 组件模块 */}
        <Section
          header={
            <Text font="body" fontWeight="semibold">
              组件模块
            </Text>
          }
          footer={
            <Text font="caption2" foregroundStyle="secondaryLabel">
              使用前建议按顺序完成：
              {"\n"}1）在 BoxJS 中订阅配置（可同步 Cookie 等信息）
              {"\n"}2）安装中国联通余量查询模块到支持的客户端
            </Text>
          }
        >
          <Button title="📦 添加 BoxJS 订阅" action={handleOpenUnicomBoxJsSub} />
          <Button title="⚡ 安装 Surge 模块" action={handleInstallToSurge} />
          <Button title="🌀 安装 Egern 模块" action={handleInstallToEgern} />
        </Section>

        {/* BoxJs 配置 */}
        <Section
          header={
            <Text font="body" fontWeight="semibold">
              BoxJs 配置
            </Text>
          }
          footer={
            <Text font="caption2" foregroundStyle="secondaryLabel">
              • 开启后优先从 BoxJs 读取联通 Cookie；
              未配置或读取失败时，再使用下方「登录凭证」中的手动 Cookie。
              {"\n"}• BoxJs 地址，例如：https://boxjs.com 或 http://192.168.1.5:9999
            </Text>
          }
        >
          <Toggle
            title="启用 BoxJs 读取 Cookie"
            value={enableBoxJs}
            onChanged={(value) => {
              setEnableBoxJs(value)
              // 开启时如果地址为空，自动填入 boxjs.com
              if (value && !boxJsUrl) {
                setBoxJsUrl("https://boxjs.com")
              }
            }}
          />
          {enableBoxJs ? (
            <TextField
              title="BoxJs 地址"
              value={boxJsUrl}
              onChanged={setBoxJsUrl}
            />
          ) : null}
        </Section>

        {/* 登录凭证 */}
        <Section
          header={
            <Text font="body" fontWeight="semibold">
              登录凭证
            </Text>
          }
          footer={
            <Text font="caption2" foregroundStyle="secondaryLabel">
              建议通过重写抓取中国联通客户端登录态 Cookie 后粘贴到此处。
            </Text>
          }
        >
          <TextField
            title="Cookie"
            value={cookie}
            prompt="在此处粘贴联通 App 的 Cookie"
            onChanged={setCookie}
          />
        </Section>

        {/* 渲染配置（合并刷新配置） */}
        <Section
          header={
            <Text font="body" fontWeight="semibold">
              渲染配置
            </Text>
          }
          footer={
            <Text font="caption2" foregroundStyle="secondaryLabel">
              • 百分比含义：作用于通用流量 / 定向流量 / 语音三个圆环。
              {"\n\t"}1）关闭＝按已用占比绘制。
              {"\n\t"}2）开启＝按剩余占比绘制。
              {"\n"}• 刷新间隔为组件自动刷新的最小时间，建议 15 分钟～24 小时。
            </Text>
          }
        >
          <Toggle
            title={showRemainRatio ? "当前：显示剩余百分比" : "当前：显示已使用百分比"}
            value={showRemainRatio}
            onChanged={setShowRemainRatio}
          />

          <Picker
            title={"刷新间隔"}
            value={refreshInterval}
            onChanged={(value: number) => {
              setRefreshInterval(Number(value))
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

        {/* 定向流量配置 */}
        <Section
          header={
            <Text font="body" fontWeight="semibold">
              定向流量配置
            </Text>
          }
          footer={
            <Text font="caption2" foregroundStyle="secondaryLabel">
              • 匹配类型：
              {"\n\t"}• flowType：适合按「通用/定向/省内」这类分类聚合（默认 flowType=3）。
              {"\n\t"}• addupItemCode：适合精确指向某一套餐（如 40008 为联通王卡专属 30G）。
              {"\n"}• 匹配值：根据上方类型填写，建议先在日志中确认 flowType / addupItemCode。
            </Text>
          }
        >
          <Picker
            title={"匹配类型"}
            value={matchTypeIndex}
            onChanged={(value: number) => {
              setMatchTypeIndex(Number(value))
            }}
            pickerStyle={"menu"}
          >
            {MATCH_TYPE_OPTIONS.map((opt, index) => (
              <Text key={opt.value} tag={index as any}>
                {opt.label}
              </Text>
            ))}
          </Picker>

          <TextField
            title="匹配值"
            value={otherFlowMatchValue}
            prompt={
              currentMatchType === "flowType"
                ? "例如：3（定向/专属/其它流量）"
                : "例如：40008（联通王卡专属 30G）"
            }
            onChanged={setOtherFlowMatchValue}
          />
        </Section>
      </List>
    </NavigationStack>
  )
}

// ========= App 包装：用于 interactiveDismissDisabled =========

type AppProps = {
  interactiveDismissDisabled?: boolean
}

function App(_props: AppProps) {
  return <SettingsView />
}

// ========= 入口 =========

async function run() {
  const fullscreen = getFullscreenPref()

  await Navigation.present({
    element: <App interactiveDismissDisabled />,
    ...(fullscreen ? { modalPresentationStyle: "fullScreen" } : {}),
  })
  Script.exit()
}

run()