import {
  Navigation,
  Form,
  Section,
  TextField,
  Button,
  Color,
  useState,
  Text,
  VStack,
  Spacer,
  HStack,
  Link,
  Toggle,
} from "scripting"

declare const Storage: any

const VERSION = "2025-12-08R1"

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
  // 标题颜色：浅色模式用深灰，暗色模式用浅灰
  titleDayColor: "#666666",
  titleNightColor: "#CCCCCC",
  // 内容颜色：浅色模式用黑色，暗色模式用白色
  descDayColor: "#000000",
  descNightColor: "#FFFFFF",
  // 刷新时间颜色：浅色模式用中灰，暗色模式用浅灰
  refreshTimeDayColor: "#999999",
  refreshTimeNightColor: "#AAAAAA",
  // 默认刷新间隔 15 分钟
  refreshInterval: 15,
  // 通用流量配置
  showFlow: true,
  // 其他流量配置
  showOtherFlow: true,
  otherFlowMatchType: "flowType",
  otherFlowMatchValue: "3",
  // BoxJs 配置
  enableBoxJs: false,
  boxJsUrl: "",
  // 默认：显示“已使用百分比”
  showRemainRatio: false,
}

function SettingsPage() {
  const dismiss = Navigation.useDismiss()
  const initialSettings =
    (Storage.get(SETTINGS_KEY) as ChinaUnicomSettings | null) ?? defaultSettings

  // State for the form fields
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
  // 新增：是否显示“剩余百分比”
  const [showRemainRatio, setShowRemainRatio] = useState(
    initialSettings.showRemainRatio ?? false,
  )

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

  return (
    <VStack>
      <Form>
        {/* BoxJS 订阅 + 模块一键安装 */}
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

          <Button title="📦 打开 BoxJS 订阅" action={handleOpenUnicomBoxJsSub} />
          <Button title="⚡ 安装到 Surge" action={handleInstallToSurge} />
          <Button title="🌀 安装到 Egern" action={handleInstallToEgern} />

          <Text font="caption2" foregroundStyle="secondaryLabel" padding={{ top: 8 }}>
            • BoxJS：在浏览器中打开 BoxJS 后，订阅联通配置
            {"\n"}• Surge：跳转到模块安装页，确认后即可添加
            {"\n"}• Egern：打开“添加模块”页面并自动填入模块地址
          </Text>
        </Section>

        <Section title="登录凭证">
          <Text
            font="caption2"
            foregroundStyle="secondaryLabel"
            padding={{ bottom: 4 }}
          >
            请在此处粘贴您获取的联通营业厅 App 的 Cookie。
          </Text>
          <TextField
            title="Cookie"
            value={cookie}
            prompt="在此处粘贴 Cookie"
            onChanged={setCookie}
          />
        </Section>

        <Section title="刷新设置">
          <Text
            font="caption2"
            foregroundStyle="secondaryLabel"
            padding={{ bottom: 4 }}
          >
            设置小组件自动刷新的频率（分钟）。
          </Text>
          <TextField
            title="刷新间隔 (分钟)"
            value={String(refreshInterval)}
            onChanged={(text) => {
              const interval = parseInt(text, 10)
              setRefreshInterval(isNaN(interval) ? 0 : interval)
            }}
          />
        </Section>

        <Section title="面板渲染设置">
          <Text
            font="caption2"
            foregroundStyle="secondaryLabel"
            padding={{ bottom: 4 }}
          >
            控制圆环百分比的含义（通用流量 / 定向流量 / 语音）：
            关闭＝显示已使用百分比；开启＝显示剩余百分比。
          </Text>
          <Toggle
            title={showRemainRatio ? "当前：显示剩余百分比" : "当前：显示已使用百分比"}
            value={showRemainRatio}
            onChanged={setShowRemainRatio}
          />
        </Section>

        <Section title="流量显示设置">
          <Text
            font="caption2"
            foregroundStyle="secondaryLabel"
            padding={{ bottom: 4 }}
          >
            配置是否显示通用流量和其他流量。
          </Text>
          <Toggle
            title="显示剩余通用流量"
            value={showFlow}
            onChanged={setShowFlow}
          />
        </Section>

        <Section title="其他流量设置">
          <Text
            font="caption2"
            foregroundStyle="secondaryLabel"
            padding={{ bottom: 4 }}
          >
            配置是否显示其他流量（如省内流量、闲时流量等）。可通过 flowType 或
            addupItemCode 来匹配。
          </Text>

          <Toggle
            title="显示其他流量"
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
              <Text
                font="caption2"
                foregroundStyle="secondaryLabel"
                padding={{ top: 4 }}
              >
                • flowType="3": 匹配所有其他类型流量（省内、闲时等）
                {"\n"}• addupItemCode="40026": 匹配特定类型的套餐内流量
                {"\n"}• 建议使用 flowType="3" 以适配不同套餐
              </Text>
            </>
          ) : null}
        </Section>

        <Section title="BoxJs 配置">
          <Text
            font="caption2"
            foregroundStyle="secondaryLabel"
            padding={{ bottom: 4 }}
          >
            开启后将从 BoxJs 读取 10010.cookie 作为 Cookie。开启时将优先使用
            BoxJs 中的 Cookie。
          </Text>
          <Toggle
            title="启用 BoxJs"
            value={enableBoxJs}
            onChanged={setEnableBoxJs}
          />
          {enableBoxJs ? (
            <TextField
              title="BoxJs 地址"
              value={boxJsUrl}
              prompt="请输入 BoxJs 地址，例如：http://boxjs.com"
              onChanged={setBoxJsUrl}
            />
          ) : null}
        </Section>

        <Button title="保存设置" action={handleSave} />
      </Form>
      <Spacer />
      <VStack alignment="center" spacing={4} padding={{ bottom: 10 }}>
        <HStack alignment="center" spacing={4}>
          <Text font="caption2" foregroundStyle="secondaryLabel">
            ©界面样式修改自
          </Text>
          <Link url="mailto:627908664@qq.com">
            <Text font="caption2" foregroundStyle="accentColor">@王大大</Text>
          </Link>
        </HStack>
        <HStack alignment="center" spacing={4}>
          <Text font="caption2" foregroundStyle="secondaryLabel">
            优化开发：
          </Text>
          <Text font="caption2" foregroundStyle="accentColor">@DTZSGHNR</Text>
        </HStack>
        <Text font="caption2" foregroundStyle="secondaryLabel">
          Version {VERSION}
        </Text>
      </VStack>
    </VStack>
  )
}

Navigation.present(<SettingsPage />)