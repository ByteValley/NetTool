import {
  Navigation,
  Form,
  Section,
  TextField,
  ColorPicker,
  Button,
  Color,
  useState,
  Text,
  VStack,
  Spacer,
  HStack,
  Link,
  Toggle
} from "scripting"

// Define the settings structure
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
}

const SETTINGS_KEY = "chinaUnicomSettings"
const VERSION = "1.0.0"

// Default settings - 适配暗色模式的简洁配色
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
}

function SettingsPage() {
  const dismiss = Navigation.useDismiss()
  const initialSettings = Storage.get<ChinaUnicomSettings>(SETTINGS_KEY) ?? defaultSettings

  // State for the form fields
  const [cookie, setCookie] = useState(initialSettings.cookie)
  const [titleDayColor, setTitleDayColor] = useState(initialSettings.titleDayColor)
  const [titleNightColor, setTitleNightColor] = useState(initialSettings.titleNightColor)
  const [descDayColor, setDescDayColor] = useState(initialSettings.descDayColor)
  const [descNightColor, setDescNightColor] = useState(initialSettings.descNightColor)
  const [refreshTimeDayColor, setRefreshTimeDayColor] = useState(initialSettings.refreshTimeDayColor)
  const [refreshTimeNightColor, setRefreshTimeNightColor] = useState(initialSettings.refreshTimeNightColor)
  const [refreshInterval, setRefreshInterval] = useState(initialSettings.refreshInterval)
  const [showFlow, setShowFlow] = useState(initialSettings.showFlow ?? true)
  const [showOtherFlow, setShowOtherFlow] = useState(initialSettings.showOtherFlow ?? true)
  const [otherFlowMatchType, setOtherFlowMatchType] = useState<"flowType" | "addupItemCode">(initialSettings.otherFlowMatchType ?? "flowType")
  const [otherFlowMatchValue, setOtherFlowMatchValue] = useState(initialSettings.otherFlowMatchValue ?? "3")
  const [enableBoxJs, setEnableBoxJs] = useState(initialSettings.enableBoxJs ?? false)
  const [boxJsUrl, setBoxJsUrl] = useState(initialSettings.boxJsUrl ?? "")

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
    }
    Storage.set(SETTINGS_KEY, newSettings)
    dismiss()
  }

  return (
    <VStack>
      <Form>
        <Section
          title="登录凭证"
          footer={<Text>请在此处粘贴您获取的联通营业厅 App 的 Cookie。</Text>}
        >
          <TextField
            title="Cookie"
            value={cookie}
            prompt="在此处粘贴 Cookie"
            onChanged={setCookie}
          />
        </Section>

        <Section
          title="刷新设置"
          footer={<Text>设置小组件自动刷新的频率（分钟）。</Text>}
        >
          <TextField
            title="刷新间隔 (分钟)"
            value={String(refreshInterval)}
            onChanged={(text) => {
              const interval = parseInt(text, 10)
              setRefreshInterval(isNaN(interval) ? 0 : interval)
            }}
          />
        </Section>

        <Section
          title="流量显示设置"
          footer={<Text>配置是否显示通用流量和其他流量。</Text>}
        >
          <Toggle
            title="显示剩余通用流量"
            value={showFlow}
            onChanged={setShowFlow}
          />
        </Section>

        <Section
          title="其他流量设置"
          footer={<Text>配置是否显示其他流量（如省内流量、闲时流量等）。可通过 flowType 或 addupItemCode 来匹配。</Text>}
        >
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
              <Text font="caption2" foregroundStyle="secondaryLabel" padding={{ top: 4 }}>
                • flowType="3": 匹配所有其他类型流量（省内、闲时等）{'\n'}
                • addupItemCode="40026": 匹配特定类型的套餐内流量{'\n'}
                • 建议使用 flowType="3" 以适配不同套餐
              </Text>
            </>
          ) : null}
        </Section>

        <Section
          title="BoxJs 配置"
          footer={<Text>开启后将从 BoxJs 读取 10010.cookie 作为 Cookie。如果开启，将优先使用 BoxJs 中的 Cookie。</Text>}
        >
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