import {
  Navigation,
  NavigationStack,
  Form,
  Section,
  TextField,
  Button,
  Color,
  useState,
  Text,
  VStack,
  Toggle,
} from "scripting"

declare const Storage: any
declare const Dialog: any

const VERSION = "2025-12-08R9"

// 联通 BoxJS 订阅 & 模块地址
const UNICOM_BOXJS_SUB_URL =
  "http://boxjs.com/#/sub/add/https://raw.githubusercontent.com/ByteValley/NetTool/main/BoxJs/DataCollection/ChinaUnicom.box.json"

const UNICOM_MODULE_URL =
  "https://raw.githubusercontent.com/ByteValley/NetTool/main/Surge/Module/DataCollection/ChinaUnicom.module"

// 设置结构
type ChinaUnicomSettings = {
  cookie: string
  titleDayColor: Color
  titleNightColor: Color
  descDayColor: Color
  descNightColor: Color
  refreshTimeDayColor: Color
  refreshTimeNightColor: Color
  refreshInterval: number
  showFlow: boolean
  showOtherFlow: boolean
  otherFlowMatchType: "flowType" | "addupItemCode"
  otherFlowMatchValue: string
  enableBoxJs: boolean
  boxJsUrl: string
  // 统一控制圆环百分比：false=已用，true=剩余
  showRemainRatio: boolean
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
  refreshInterval: 15,
  showFlow: true,
  showOtherFlow: true,
  otherFlowMatchType: "flowType",
  otherFlowMatchValue: "3",
  enableBoxJs: false,
  boxJsUrl: "",
  showRemainRatio: false,
}

function SettingsView() {
  const dismiss = Navigation.useDismiss()

  const initialSettings =
    (Storage.get(SETTINGS_KEY) as ChinaUnicomSettings | null) ?? defaultSettings

  // State
  const [cookie, setCookie] = useState(initialSettings.cookie)
  const [titleDayColor] = useState(initialSettings.titleDayColor)
  const [titleNightColor] = useState(initialSettings.titleNightColor)
  const [descDayColor] = useState(initialSettings.descDayColor)
  const [descNightColor] = useState(initialSettings.descNightColor)
  const [refreshTimeDayColor] = useState(initialSettings.refreshTimeDayColor)
  const [refreshTimeNightColor] = useState(initialSettings.refreshTimeNightColor)
  const [refreshInterval, setRefreshInterval] = useState(
    initialSettings.refreshInterval,
  )
  const [showFlow, setShowFlow] = useState(initialSettings.showFlow ?? true)
  const [showOtherFlow, setShowOtherFlow] = useState(
    initialSettings.showOtherFlow ?? true,
  )
  const [otherFlowMatchType, setOtherFlowMatchType] = useState<
    "flowType" | "addupItemCode"
  >(initialSettings.otherFlowMatchType ?? "flowType")
  const [otherFlowMatchValue, setOtherFlowMatchValue] = useState(
    initialSettings.otherFlowMatchValue ?? "3",
  )
  const [enableBoxJs, setEnableBoxJs] = useState(initialSettings.enableBoxJs ?? false)
  const [boxJsUrl, setBoxJsUrl] = useState(initialSettings.boxJsUrl ?? "")
  const [showRemainRatio, setShowRemainRatio] = useState(
    initialSettings.showRemainRatio ?? false,
  )

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
      showFlow,
      showOtherFlow,
      otherFlowMatchType,
      otherFlowMatchValue,
      enableBoxJs,
      boxJsUrl,
      showRemainRatio,
    }
    Storage.set(SETTINGS_KEY, newSettings)
    dismiss()
  }

  const handleAbout = async () => {
    await Dialog.alert({
      title: "联通余量组件",
      message:
        `作者：©ByteValley\n` +
        `版本：v${VERSION}`,
      buttonLabel: "好",
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

  return (
    <VStack
      spacing={0}
      navigationTitle={"联通余量组件"}
      navigationBarTitleDisplayMode={"inline"}
      toolbar={{
        topBarLeading: [
          <Button title={"关闭"} action={dismiss} />,
        ],
        topBarTrailing: [
          <Button title={"完成"} action={handleSave} />,
        ],
        bottomBar: [
          // 用一个正式的按钮来承载版权 & 版本信息
          <Button
            systemImage="info.circle"
            title="关于本组件"
            action={handleAbout}
            foregroundStyle="secondaryLabel"
          />,
        ],
      }}
      background={"clear"}
    >
      {/* 表单本身让系统按默认 grouped 样式铺满 */}
      <Form>
        <Section title="组件模块一键安装">
          <Text
            font="caption2"
            foregroundStyle="secondaryLabel"
            padding={{ bottom: 6 }}
          >
            使用前建议按顺序完成以下步骤：
            {"\n"}1）在 BoxJS 中订阅配置（可同步 Cookie 等信息）
            {"\n"}2）安装中国联通余量查询模块到支持的客户端
          </Text>
          <Button title="📦 添加 BoxJS 订阅" action={handleOpenUnicomBoxJsSub} />
          <Button title="⚡ 安装 Surge 模块" action={handleInstallToSurge} />
          <Button title="🌀 安装 Egern 模块" action={handleInstallToEgern} />
        </Section>

        <Section title="登录凭证">
          <Text
            font="caption2"
            foregroundStyle="secondaryLabel"
            padding={{ bottom: 4 }}
          >
            建议通过重写或 BoxJs 抓取 10010 App 登录态 Cookie 后粘贴到此处。
          </Text>
          <TextField
            title="Cookie"
            value={cookie}
            prompt="在此处粘贴联通 App 的 Cookie"
            onChanged={setCookie}
          />
        </Section>

        <Section title="刷新设置">
          <Text
            font="caption2"
            foregroundStyle="secondaryLabel"
            padding={{ bottom: 4 }}
          >
            控制组件自动刷新的最小间隔时间，建议 5–60 分钟。
          </Text>
          <TextField
            title="刷新间隔 (分钟)"
            value={String(refreshInterval)}
            prompt="例如：15"
            onChanged={(text) => {
              const v = parseInt(text, 10)
              setRefreshInterval(isNaN(v) ? 0 : v)
            }}
          />
        </Section>

        <Section title="面板渲染设置">
          <Text
            font="caption2"
            foregroundStyle="secondaryLabel"
            padding={{ bottom: 4 }}
          >
            作用于通用流量 / 定向流量 / 语音三个圆环：
            关闭＝按已用占比绘制；开启＝按剩余占比绘制。
          </Text>
          <Toggle
            title={showRemainRatio ? "当前：显示剩余百分比" : "当前：显示已使用百分比"}
            value={showRemainRatio}
            onChanged={setShowRemainRatio}
          />
        </Section>

        <Section title="通用流量显示">
          <Text
            font="caption2"
            foregroundStyle="secondaryLabel"
            padding={{ bottom: 4 }}
          >
            关闭后将隐藏绿色「通用流量」卡片，仅保留其它卡片。
          </Text>
          <Toggle
            title="显示通用流量卡片"
            value={showFlow}
            onChanged={setShowFlow}
          />
        </Section>

        <Section title="定向/其它流量">
          <Text
            font="caption2"
            foregroundStyle="secondaryLabel"
            padding={{ bottom: 4 }}
          >
            默认按 flowType=&quot;3&quot; 聚合定向、省内、闲时等其它流量。
            如需精确到某个套餐，可改用 addupItemCode（例如 40026）。
          </Text>
          <Toggle
            title="显示定向/其它流量卡片"
            value={showOtherFlow}
            onChanged={setShowOtherFlow}
          />

          {showOtherFlow ? (
            <>
              <TextField
                title="匹配类型"
                value={otherFlowMatchType}
                prompt="flowType 或 addupItemCode"
                onChanged={(text) => {
                  if (text === "flowType" || text === "addupItemCode") {
                    setOtherFlowMatchType(text)
                  }
                }}
              />
              <TextField
                title="匹配值"
                value={otherFlowMatchValue}
                prompt="flowType: 3 或 addupItemCode: 40026"
                onChanged={setOtherFlowMatchValue}
              />
            </>
          ) : null}
        </Section>

        <Section title="BoxJs 配置">
          <Text
            font="caption2"
            foregroundStyle="secondaryLabel"
            padding={{ bottom: 4 }}
          >
            开启后优先从 BoxJs 的
            DataCollection.ChinaUnicom.Settings.Cookie 读取联通 Cookie；
            未配置或读取失败时退回到上方手动粘贴的 Cookie。
          </Text>
          <Toggle
            title="启用 BoxJs 读取 Cookie"
            value={enableBoxJs}
            onChanged={setEnableBoxJs}
          />
          {enableBoxJs ? (
            <TextField
              title="BoxJs 地址"
              value={boxJsUrl}
              prompt="例如：http://boxjs.com 或 http://192.168.1.5:9999"
              onChanged={setBoxJsUrl}
            />
          ) : null}
        </Section>
      </Form>
    </VStack>
  )
}

async function run() {
  await Navigation.present({
    element: (
      <NavigationStack>
        <SettingsView />
      </NavigationStack>
    ),
  })
}

run()