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

const VERSION = "1.0.1"

// 和 widget.tsx 对应的设置结构
type ChinaMobileSettings = {
  refreshInterval: number
}

const SETTINGS_KEY = "chinaMobileSettings"

// 中国移动模块地址（Surge / Egern 共用）
const CM_MODULE_URL =
  "https://raw.githubusercontent.com/ByteValley/NetTool/main/Surge/Module/DataCollection/ChinaMobile.module"

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

  // 一键安装到 Surge
  const handleInstallToSurge = async () => {
    const encodedUrl = encodeURIComponent(CM_MODULE_URL)
    const surgeUrl = `surge:///install-module?url=${encodedUrl}`
    await Safari.openURL(surgeUrl)
  }

  // 一键安装到 Egern（使用 modules/new Scheme）
  const handleInstallToEgern = async () => {
    const encodedUrl = encodeURIComponent(CM_MODULE_URL)
    const name = encodeURIComponent("中国移动余量查询")
    // egern:/modules/new?name=name&url=url
    const egernUrl = `egern:/modules/new?name=${name}&url=${encodedUrl}`
    await Safari.openURL(egernUrl)
  }

  // 清除缓存文件
  const handleClearCache = async () => {
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
  }

  // 保存刷新间隔
  const handleSaveSettings = async () => {
    let interval = Number(refreshInterval)
    if (!isFinite(interval)) interval = 60
    interval = Math.round(interval)
    if (interval < 5) interval = 5
    if (interval > 360) interval = 360

    const newSettings: ChinaMobileSettings = { refreshInterval: interval }
    Storage.set(SETTINGS_KEY, newSettings)

    await Dialog.alert({
      title: "已保存",
      message: `刷新间隔已设置为 ${interval} 分钟`,
      buttonLabel: "确定",
    })

    dismiss()
  }

  return (
    <VStack>
      <Form>
        {/* 模块一键安装 */}
        <Section title="组件模块一键安装">
          <Text font="body" padding={{ bottom: 8 }}>
            直接将中国移动余量查询模块安装到支持的客户端：
          </Text>
          <Button title="⚡ 安装到 Surge" action={handleInstallToSurge} />
          <Button
            title="🌀 安装到 Egern"
            action={handleInstallToEgern}
          />
          <Text font="caption2" foregroundStyle="secondaryLabel" padding={{ top: 8 }}>
            • Surge：跳转到模块安装页，确认后即可添加{'\n'}
            • Egern：打开“添加模块”页面并自动填入模块地址
          </Text>
        </Section>

        {/* 刷新设置 */}
        <Section title="刷新设置">
          <Text font="caption2" foregroundStyle="secondaryLabel" padding={{ bottom: 4 }}>
            设置小组件自动刷新的频率（分钟，建议 5–360）。
          </Text>
          <TextField
            title="刷新间隔 (分钟)"
            value={String(refreshInterval)}
            prompt="例如：60"
            onChanged={(text) => {
              const v = parseInt(text, 10)
              setRefreshInterval(isNaN(v) ? 0 : v)
            }}
          />
        </Section>

        {/* 缓存管理 */}
        <Section title="缓存管理">
          <Button title="🗑️ 清除缓存" action={handleClearCache} />
          <Text font="caption2" foregroundStyle="secondaryLabel" padding={{ top: 4 }}>
            清除缓存数据，下次将重新获取最新数据。
          </Text>
        </Section>

        {/* 保存按钮 */}
        <Section title="保存设置">
          <Button title="💾 保存刷新间隔" action={handleSaveSettings} />
        </Section>
      </Form>

      <Spacer />
      <VStack alignment="center" spacing={4} padding={{ bottom: 10 }}>
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