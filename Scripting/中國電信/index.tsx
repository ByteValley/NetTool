import {
  Navigation,
  NavigationStack,
  List,
  Section,
  Button,
  useState,
  Text,
  TextField,
  SecureField,
  Toggle,
  Picker,
} from "scripting"
import type { ChinaTelecomSettings } from "./telecomApi"

// 宿主提供的 Storage / Dialog
declare const Storage: any
declare const Dialog: any

// 版本号说明（Semantic Versioning）
// MAJOR：破坏性变更或配置结构调整（不兼容旧版）
// MINOR：新增功能、兼容性增强（兼容旧版）
// PATCH：修复 Bug、UI 微调、文案修改等小改动
const VERSION = "1.0.0"

// 构建日期：YYYY-MM-DD
const BUILD_DATE = "2025-12-08"

const SETTINGS_KEY = "chinaTelecomSettings"

// 刷新间隔选项（单位：分钟）
const REFRESH_OPTIONS = [
  { label: "15 分钟", value: 15 },
  { label: "30 分钟", value: 30 },
  { label: "1 小时", value: 60 },
  { label: "2 小时", value: 120 },
  { label: "3 小时", value: 180 },   // 默认
  { label: "6 小时", value: 360 },
  { label: "12 小时", value: 720 },
  { label: "24 小时", value: 1440 },
]

// 默认设置（与 telecomApi 中结构保持一致）
const defaultSettings: ChinaTelecomSettings = {
  mobile: "",
  password: "",
  // 刷新时间颜色（预留给组件用）
  refreshTimeDayColor: "#999999",
  refreshTimeNightColor: "#AAAAAA",
  // 默认刷新间隔 3 小时
  refreshInterval: 180,
  // 默认显示“已使用百分比”
  showRemainRatio: false,
}

function SettingsView() {
  const dismiss = Navigation.useDismiss()

  // 读取本地配置
  const initialSettings =
    (Storage.get(SETTINGS_KEY) as ChinaTelecomSettings | null) ??
    defaultSettings

  // 表单状态
  const [mobile, setMobile] = useState(initialSettings.mobile || "")
  const [password, setPassword] = useState(initialSettings.password || "")
  // 颜色目前仅作为占位存储，不暴露在 UI 中
  const [refreshTimeDayColor] = useState(
    initialSettings.refreshTimeDayColor ?? "#999999",
  )
  const [refreshTimeNightColor] = useState(
    initialSettings.refreshTimeNightColor ?? "#AAAAAA",
  )
  const [refreshInterval, setRefreshInterval] = useState(
    initialSettings.refreshInterval || 15,
  )
  const [showRemainRatio, setShowRemainRatio] = useState(
    initialSettings.showRemainRatio ?? false,
  )

  // 保存设置
  const handleSave = () => {
    const newSettings: ChinaTelecomSettings = {
      mobile: mobile.trim(),
      password: password.trim(),
      refreshTimeDayColor,
      refreshTimeNightColor,
      refreshInterval,
      showRemainRatio,
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
          topBarLeading: [<Button title={"关闭"} action={dismiss} />],
          topBarTrailing: [<Button title={"完成"} action={handleSave} />],
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
          header={
            <Text font="body" fontWeight="semibold">
              账号设置
            </Text>
          }
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

        {/* 渲染配置（合并刷新配置） */}
        <Section
          header={
            <Text font="body" fontWeight="semibold">
              渲染配置
            </Text>
          }
          footer={
            <Text font="caption2" foregroundStyle="secondaryLabel">
              • 百分比含义：统一控制卡片的「已用 / 剩余」视角。
              {"\n\t"}1）关闭＝查看已使用（流量/语音显示已用百分比和已用数值，话费优先显示实时费用）；
              {"\n\t"}2）开启＝查看剩余（流量/语音显示剩余百分比和剩余数值，话费显示剩余话费/账户余额）。
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
      </List>
    </NavigationStack>
  )
}

async function run() {
  await Navigation.present({
    element: <SettingsView />,
  })
}

run()