import {
  Navigation,
  Form,
  Section,
  Button,
  useState,
  Text,
  VStack,
  Spacer,
  TextField,
  SecureField,
} from "scripting"
import type { ChinaTelecomSettings } from "./telecomApi"

// 宿主提供的 Storage
declare const Storage: any

const SETTINGS_KEY = "chinaTelecomSettings"
const VERSION = "1.0.0"

// 默认设置
const defaultSettings: ChinaTelecomSettings = {
  mobile: "",
  password: "",
  // 刷新时间颜色（先占位，后面你要用再加到组件）
  refreshTimeDayColor: "#999999",
  refreshTimeNightColor: "#AAAAAA",
  // 默认刷新间隔 15 分钟
  refreshInterval: 15,
}

function SettingsPage() {
  const dismiss = Navigation.useDismiss()
  // 这里不要用 Storage.get<ChinaTelecomSettings>，用 any 后再断言
  const initialSettings =
    (Storage.get(SETTINGS_KEY) as ChinaTelecomSettings | null) ??
    defaultSettings

  // State for the form fields
  const [mobile, setMobile] = useState(initialSettings.mobile || "")
  const [password, setPassword] = useState(initialSettings.password || "")
  const [refreshTimeDayColor] = useState(
    initialSettings.refreshTimeDayColor ?? "#999999",
  )
  const [refreshTimeNightColor] = useState(
    initialSettings.refreshTimeNightColor ?? "#AAAAAA",
  )
  const [refreshInterval, setRefreshInterval] = useState(
    initialSettings.refreshInterval ?? 15,
  )

  const handleSave = () => {
    const newSettings: ChinaTelecomSettings = {
      mobile: mobile.trim(),
      password: password.trim(),
      refreshTimeDayColor,
      refreshTimeNightColor,
      refreshInterval,
    }

    // 保存设置
    Storage.set(SETTINGS_KEY, newSettings)

    dismiss()
  }

  return (
    <VStack>
      <Form>
        <Section title="账号设置">
          <TextField
            title="手机号"
            prompt="请输入11位手机号"
            value={mobile}
            onChanged={setMobile}
          />
          <SecureField
            title="密码"
            prompt="请输入密码"
            value={password}
            onChanged={setPassword}
          />
          <Text
            font="caption2"
            foregroundStyle="secondaryLabel"
            padding={{ top: 4 }}
          >
            使用官方接口查询数据
          </Text>
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
              setRefreshInterval(Number.isNaN(interval) ? 0 : interval)
            }}
          />
        </Section>

        <Button title="保存设置" action={handleSave} />
      </Form>
      <Spacer />
      <VStack alignment="center" spacing={4} padding={{ bottom: 10 }}>
        <Text font="caption2" foregroundStyle="secondaryLabel">
          Version {VERSION}
        </Text>
      </VStack>
    </VStack>
  )
}

Navigation.present(<SettingsPage />)