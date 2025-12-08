import {
  Navigation,
  NavigationStack,
  List,
  Section,
  Button,
  Text,
  Picker,
  Toggle,
  useState,
} from "scripting"

declare const Storage: any
declare const Dialog: any
declare const Safari: any
declare const FileManager: any

// 版本号说明（Semantic Versioning）
// MAJOR：破坏性变更或配置结构调整（不兼容旧版）
// MINOR：新增功能、兼容性增强（兼容旧版）
// PATCH：修复 Bug、UI 微调、文案修改等小改动
const VERSION = "1.0.0"

// 构建日期：YYYY-MM-DD
const BUILD_DATE = "2025-12-08"

// 和 widget.tsx 对应的设置结构
type ChinaMobileSettings = {
  // 小组件自动刷新间隔（单位：分钟）
  refreshInterval: number
  // 统一控制卡片百分比视角：false=已用，true=剩余
  showRemainRatio: boolean
}

const SETTINGS_KEY = "chinaMobileSettings"

// 中国移动模块地址（Surge / Egern 共用）
const CM_MODULE_URL =
  "https://raw.githubusercontent.com/ByteValley/NetTool/main/Surge/Module/DataCollection/ChinaMobile.module"

// BoxJS 订阅地址（用于填写手机号等参数）
const BOXJS_SUB_URL =
  "http://boxjs.com/#/sub/add/https://github.com/ChinaTelecomOperators/ChinaMobile/releases/download/Prerelease-Alpha/boxjs.json"

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

// 默认配置（与 widget.tsx 读取结构保持一致）
const defaultSettings: ChinaMobileSettings = {
  refreshInterval: 180, // 默认 3 小时
  showRemainRatio: false,
}

function SettingsView() {
  const dismiss = Navigation.useDismiss()

  const initialSettings =
    (Storage.get(SETTINGS_KEY) as ChinaMobileSettings | null) ?? defaultSettings

  const [refreshInterval, setRefreshInterval] = useState<number>(
    initialSettings.refreshInterval || 180,
  )
  const [showRemainRatio, setShowRemainRatio] = useState<boolean>(
    initialSettings.showRemainRatio ?? false,
  )

  // About
  const handleAbout = async () => {
    await Dialog.alert({
      title: "移动余量组件",
      message:
        `作者：©ByteValley\n` +
        `版本：v${VERSION}（${BUILD_DATE}）\n` +
        `致谢：@DTZSGHNR`,
      buttonLabel: "关闭",
    })
  }

  // 打开 BoxJS 订阅页面
  const handleOpenBoxJsSub = async () => {
    await Safari.openURL(BOXJS_SUB_URL)
  }

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
          message: "缓存已清除，下次将重新获取最新数据。",
          buttonLabel: "确定",
        })
      } else {
        await Dialog.alert({
          title: "提示",
          message: "缓存文件不存在，无需清除。",
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

  // 保存设置（刷新间隔 + 百分比视角）
  const handleSaveSettings = () => {
    const interval = Number(refreshInterval) || 180
    const newSettings: ChinaMobileSettings = {
      refreshInterval: interval,
      showRemainRatio,
    }
    Storage.set(SETTINGS_KEY, newSettings)
    dismiss()
  }

  return (
    <NavigationStack>
      <List
        navigationTitle={"移动余量组件"}
        navigationBarTitleDisplayMode={"inline"}
        toolbar={{
          topBarLeading: [<Button title={"关闭"} action={dismiss} />],
          topBarTrailing: [<Button title={"完成"} action={handleSaveSettings} />],
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
              {"\n"}1）在 BoxJS 中订阅配置并填写手机号等参数
              {"\n"}2）安装中国移动余量查询模块到支持的客户端
            </Text>
          }
        >
          <Button title="📦 添加 BoxJS 订阅" action={handleOpenBoxJsSub} />
          <Button title="⚡ 安装 Surge 模块" action={handleInstallToSurge} />
          <Button title="🌀 安装 Egern 模块" action={handleInstallToEgern} />
        </Section>

        {/* 渲染配置（百分比视角 + 刷新间隔） */}
        <Section
          header={
            <Text font="body" fontWeight="semibold">
              渲染配置
            </Text>
          }
          footer={
            <Text font="caption2" foregroundStyle="secondaryLabel">
              • 百分比含义：作用于流量 / 语音等卡片；
              关闭＝按已用占比绘制，开启＝按剩余占比绘制。
              {"\n"}• 刷新间隔为小组件自动刷新的最小时间，建议 15 分钟～24 小时。
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

        {/* 缓存管理 */}
        <Section
          header={
            <Text font="body" fontWeight="semibold">
              缓存管理
            </Text>
          }
          footer={
            <Text font="caption2" foregroundStyle="secondaryLabel">
              当数据异常或长期未更新时，可尝试清除缓存后重新拉取。
            </Text>
          }
        >
          <Button title="🗑️ 清除缓存" action={handleClearCache} />
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