import {
  Navigation,
  Form,
  Section,
  Button,
  Text,
  VStack,
  Spacer,
  HStack,
  TextField,
  useState,
} from "scripting"

const VERSION = "1.0.0"
const REWRITE_RULE_URL =
  "https://raw.githubusercontent.com/Nanako718/Scripting/refs/heads/main/Quantumult%20X/scripting.qx.conf"

// 和 widget.tsx 对应的设置结构
type ChinaMobileSettings = {
  refreshInterval: number
}

const SETTINGS_KEY = "chinaMobileSettings"

// 默认配置
const defaultSettings: ChinaMobileSettings = {
  refreshInterval: 60, // 默认 60 分钟
}

function SettingsPage() {
  const dismiss = Navigation.useDismiss()
  const initialSettings =
    (Storage.get<ChinaMobileSettings>(SETTINGS_KEY) as ChinaMobileSettings | null) ??
    defaultSettings

  const [refreshInterval, setRefreshInterval] = useState<number>(
    initialSettings.refreshInterval ?? 60
  )

  // 复制链接并打开 Quantumult X（保持你原来的逻辑）
  const handleInstallRewrite = async () => {
    await Pasteboard.setString(REWRITE_RULE_URL)

    const qxAppUrl = "quantumult-x:///"
    await Safari.openURL(qxAppUrl)

    await Dialog.alert({
      title: "链接已复制",
      message:
        "重写规则链接已复制到剪贴板，请在 Quantumult X 中手动添加：\n设置 → 重写 → + → 从 URL 添加",
      buttonLabel: "确定",
    })
  }

  // 保存刷新间隔
  const handleSaveSettings = () => {
    let interval = Number(refreshInterval)
    if (!isFinite(interval)) interval = 60
    interval = Math.round(interval)
    if (interval < 5) interval = 5
    if (interval > 360) interval = 360

    const newSettings: ChinaMobileSettings = { refreshInterval: interval }
    Storage.set(SETTINGS_KEY, newSettings)

    Dialog.alert({
      title: "已保存",
      message: `刷新间隔已设置为 ${interval} 分钟`,
      buttonLabel: "确定",
    })

    dismiss()
  }

  return (
    <VStack>
      <Form>
        {/* 重写规则安装（保持原样） */}
        <Section title="重写规则安装">
          <Text font="body" padding={{ bottom: 8 }}>
            本脚本需要通过 Quantumult X 重写规则来获取数据。点击下方按钮直接安装：
          </Text>
          <Button title="📥 点击安装重写规则" action={handleInstallRewrite} />
          <Text font="caption2" foregroundStyle="secondaryLabel" padding={{ top: 8 }}>
            • 点击按钮将复制重写规则链接并打开 Quantumult X{"\n"}
            • 请在 Quantumult X 中手动添加：设置 → 重写 → + → 从 URL 添加{"\n"}
            • 链接已复制到剪贴板，可直接粘贴{"\n"}
            • 确保已启用 MitM 并安装证书
          </Text>
          <Text font="caption" foregroundStyle="secondaryLabel" padding={{ top: 8 }}>
            重写规则地址：{REWRITE_RULE_URL}
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

        {/* 缓存管理（保持原逻辑） */}
        <Section title="缓存管理">
          <Button
            title="🗑️ 清除缓存"
            action={async () => {
              try {
                const path = FileManager.appGroupDocumentsDirectory + "/cm_data_cache.json"
                if (FileManager.existsSync(path)) {
                  FileManager.removeSync(path)
                  await Dialog.alert({
                    title: "清除成功",
                    message: "缓存已清除",
                    buttonLabel: "确定",
                  })
                } else {
                  await Dialog.alert({
                    title: "提示",
                    message: "缓存文件不存在",
                    buttonLabel: "确定",
                  })
                }
              } catch (e) {
                await Dialog.alert({
                  title: "清除失败",
                  message: String(e),
                  buttonLabel: "确定",
                })
              }
            }}
          />
          <Text font="caption2" foregroundStyle="secondaryLabel" padding={{ top: 4 }}>
            清除缓存数据，下次将重新获取最新数据。
          </Text>
        </Section>

        {/* 保存按钮 */}
        <Section>
          <Button title="💾 保存设置" action={handleSaveSettings} />
        </Section>
      </Form>

      <Spacer />
      <VStack alignment="center" spacing={4} padding={{ bottom: 10 }}>
        <HStack alignment="center" spacing={4}>
          <Text font="caption2" foregroundStyle="secondaryLabel">
            数据来源：Quantumult X 重写规则
          </Text>
        </HStack>
        <HStack alignment="center" spacing={4}>
          <Text font="caption2" foregroundStyle="secondaryLabel">
            开发：
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