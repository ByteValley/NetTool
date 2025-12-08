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
  Toggle,
} from "scripting"
import type { ChinaTelecomSettings } from "./telecomApi"

// 宿主提供的 Storage
declare const Storage: any

const SETTINGS_KEY = "chinaTelecomSettings"
const VERSION = "2025-12-08R1"

// 默认设置
const defaultSettings: ChinaTelecomSettings = {
  mobile: "",
  password: "",
  // 刷新时间颜色（预留给组件用）
  refreshTimeDayColor: "#999999",
  refreshTimeNightColor: "#AAAAAA",
  // 默认刷新间隔 15 分钟
  refreshInterval: 15,
  // 默认显示“已使用百分比”
  showRemainRatio: false,
}

function SettingsPage() {
  const dismiss = Navigation.useDismiss()

  // 读取本地配置
  const initialSettings =
    (Storage.get(SETTINGS_KEY) as ChinaTelecomSettings | null) ??
    defaultSettings

  // 表单状态
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
  // 新增：是否显示“剩余百分比”
  const [showRemainRatio, setShowRemainRatio] = useState(
    initialSettings.showRemainRatio ?? false,
  )

  const handleSave = () => {
    const newSettings: ChinaTelecomSettings = {
      mobile: mobile.trim(),
      password: password.trim(),
      refreshTimeDayColor,
      refreshTimeNightColor,
      refreshInterval,
      showRemainRatio,
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
            使用官方接口查询数据（仅存本机，不上传服务器）。
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

        <Section title="面板渲染设置">
          <Text
            font="caption2"
            foregroundStyle="secondaryLabel"
            padding={{ bottom: 4 }}
          >
            统一控制卡片的「已用 / 剩余」视角：
            关闭＝查看已使用（流量/语音显示已用百分比和已用数值，话费优先显示实时费用）；
            开启＝查看剩余（流量/语音显示剩余百分比和剩余数值，话费显示剩余话费/账户余额）。
          </Text>
          <Toggle
            title={showRemainRatio ? "当前：显示剩余百分比" : "当前：显示已使用百分比"}
            value={showRemainRatio}
            onChanged={setShowRemainRatio}
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