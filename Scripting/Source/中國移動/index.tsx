// index.tsx（中国移动）

import {
  Navigation,
  NavigationStack,
  List,
  Section,
  Button,
  Text,
  Script,
  useState,
} from "scripting"

declare const Storage: any
declare const Dialog: any
declare const FileManager: any

import {
  type ChinaMobileSettings,
  MOBILE_SETTINGS_KEY,
} from "./telecom/settings"
import { RenderConfigSection } from "./telecom/index/renderConfigSection"
import type { SmallCardStyle } from "./telecom/cards/small"
import { useFullscreenPref } from "./telecom/index/useFullscreenPref"

import type { ModuleLinks } from "./telecom/index/moduleActions"
import { ModuleSection } from "./telecom/index/moduleSection"
import {
  createModuleHandles,
  createModuleActions,
} from "./telecom/index/moduleActions"

// ==================== 版本信息 ====================
// 版本号说明（Semantic Versioning）
// MAJOR：破坏性变更或配置结构调整（不兼容旧版）
// MINOR：新增功能、兼容性增强（兼容旧版）
// PATCH：修复 Bug、UI 微调、文案修改等小改动
const VERSION = "1.0.1"

// 构建日期：YYYY-MM-DD
const BUILD_DATE = "2025-12-14"

const SETTINGS_KEY = MOBILE_SETTINGS_KEY
const FULLSCREEN_KEY = "chinaMobileSettingsFullscreen"

// ✅ 给「组件模块折叠」单独一个 key（避免别的运营商串）
const MODULE_COLLAPSE_KEY = "chinaMobileModuleSectionCollapsed"

// ==================== 默认设置 ====================

const defaultSettings: ChinaMobileSettings = {
  refreshInterval: 180,
  showRemainRatio: false,

  // ✅ 中号：样式 + 三卡/四卡（默认四卡）
  mediumStyle: "FullRing",
  mediumUseThreeLayout: false,
  includeDirectionalInTotal: true,

  // 小号组件（新体系）
  smallCardStyle: "summary",

  // ✅ 仅作用于「紧凑清单 / 进度清单」：
  // true  = 总流量 + 语音（2 行）
  // false = 通用 + 定向 + 语音（3 行）
  smallMiniBarUseTotalFlow: false,
}

// ==================== 链接 ====================

const BOXJS_SUB_URL =
  "http://boxjs.com/#/sub/add/https://github.com/ChinaTelecomOperators/ChinaMobile/releases/download/Prerelease-Alpha/boxjs.json"

const CM_MODULE_URL =
  "https://raw.githubusercontent.com/ByteValley/NetTool/main/Surge/Module/Component/ChinaMobile.module"
const CM_LOON_PLUGIN_URL =
  "https://raw.githubusercontent.com/ByteValley/NetTool/main/Loon/Plugin/Component/ChinaMobile.lpx"
const CM_QX_REWRITE_URL =
  "https://raw.githubusercontent.com/ByteValley/NetTool/main/QuantumultX/Rewrite/Component/ChinaMobile.conf"

const GITHUB_URL1 =
  "https://github.com/ChinaTelecomOperators/ChinaMobile/releases/tag/Prerelease-Alpha"
const GITHUB_URL2 =
  "https://github.com/Yuheng0101/X/tree/main/Scripts/ChinaMobile"

// ==================== 安装 / 跳转 ====================

const links: ModuleLinks = {
  boxjsSubUrl: BOXJS_SUB_URL,
  surgeModuleUrl: CM_MODULE_URL,
  loonPluginUrl: CM_LOON_PLUGIN_URL,
  qxRewriteUrl: CM_QX_REWRITE_URL,
  extras: [
    { title: "📂 ChinaTelecomOperators 仓库", url: GITHUB_URL1 },
    { title: "📂 Yuheng0101 仓库", url: GITHUB_URL2 },
  ],
}

const handles = createModuleHandles(
  { egernName: "中国移动余量查询" },
  links,
)

const moduleActions = createModuleActions(handles, links)

// ==================== 设置页面 ====================

function SettingsView() {
  const dismiss = Navigation.useDismiss()
  const { fullscreenPref, toggleFullscreen } = useFullscreenPref(FULLSCREEN_KEY)

  const stored = Storage.get(SETTINGS_KEY) as ChinaMobileSettings | null
  const initial: ChinaMobileSettings = stored ?? defaultSettings

  // ==================== State ====================

  const [refreshInterval, setRefreshInterval] = useState(
    initial.refreshInterval ?? 180,
  )
  const [showRemainRatio, setShowRemainRatio] = useState(
    initial.showRemainRatio ?? false,
  )

  // ✅ 中号：样式 + “三卡开关”（关=默认四卡）
  const [mediumStyle, setMediumStyle] = useState<"FullRing" | "DialRing">(
    (initial.mediumStyle as any) ?? "FullRing",
  )
  const [mediumUseThreeLayout, setMediumUseThreeLayout] = useState<boolean>(
    initial.mediumUseThreeLayout ?? false,
  )

  const [includeDirectionalInTotal, setIncludeDirectionalInTotal] =
    useState<boolean>(initial.includeDirectionalInTotal ?? true)

  const [smallCardStyle, setSmallCardStyle] = useState<SmallCardStyle>(
    (initial.smallCardStyle as SmallCardStyle) ?? "summary",
  )

  // ✅ 紧凑清单 / 进度清单 联动开关
  const [smallMiniBarUseTotalFlow, setSmallMiniBarUseTotalFlow] =
    useState<boolean>(initial.smallMiniBarUseTotalFlow ?? false)

  // ==================== 保存（对齐联通：点击完成才写入 Storage） ====================

  const handleSave = () => {
    const interval = Number(refreshInterval) || 180

    const newSettings: ChinaMobileSettings = {
      refreshInterval: interval,
      showRemainRatio: !!showRemainRatio,

      mediumStyle,
      mediumUseThreeLayout: !!mediumUseThreeLayout,
      includeDirectionalInTotal: !!includeDirectionalInTotal,

      smallCardStyle,
      smallMiniBarUseTotalFlow: !!smallMiniBarUseTotalFlow,
    }

    try {
      Storage.set(SETTINGS_KEY, newSettings)
    } catch { }

    dismiss()
  }

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

  // ==================== 缓存管理 ====================

  const handleClearCache = async () => {
    try {
      const path =
        FileManager.appGroupDocumentsDirectory + "/cm_data_cache.json"
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

  // ==================== UI ====================

  return (
    <NavigationStack>
      <List
        navigationTitle={"移动余量组件"}
        navigationBarTitleDisplayMode={"inline"}
        toolbar={{
          topBarLeading: [<Button title="关闭" action={dismiss} />],
          topBarTrailing: [
            <Button
              title={fullscreenPref ? "页面" : "弹层"}
              systemImage={
                fullscreenPref
                  ? "rectangle.arrowtriangle.2.outward"
                  : "rectangle"
              }
              action={toggleFullscreen}
            />,
            <Button title="完成" action={handleSave} />,
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

        <ModuleSection
          collapsible
          collapseStorageKey={MODULE_COLLAPSE_KEY}
          defaultCollapsed
          footerLines={[
            "使用前建议按顺序完成：",
            "1）在 BoxJS 中订阅配置并填写手机号等参数",
            "2）安装中国移动余量查询模块到支持的客户端",
          ]}
          actions={moduleActions}
        />

        <RenderConfigSection
          smallCardStyle={smallCardStyle}
          setSmallCardStyle={setSmallCardStyle}
          showRemainRatio={showRemainRatio}
          setShowRemainRatio={setShowRemainRatio}
          smallMiniBarUseTotalFlow={smallMiniBarUseTotalFlow}
          setSmallMiniBarUseTotalFlow={setSmallMiniBarUseTotalFlow}
          // ✅ 对齐联通：中号样式 + 三卡开关
          mediumStyle={mediumStyle}
          setMediumStyle={setMediumStyle}
          mediumUseThreeLayout={mediumUseThreeLayout}
          setMediumUseThreeLayout={setMediumUseThreeLayout}
          includeDirectionalInTotal={includeDirectionalInTotal}
          setIncludeDirectionalInTotal={setIncludeDirectionalInTotal}
          refreshInterval={refreshInterval}
          setRefreshInterval={setRefreshInterval}
        />

        <Section
          header={<Text font="body" fontWeight="semibold">缓存管理</Text>}
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

// ==================== App / Run ====================

type AppProps = { interactiveDismissDisabled?: boolean }
function App(_props: AppProps) {
  return <SettingsView />
}

function readFullscreenPrefForRun(): boolean {
  try {
    const v = Storage.get(FULLSCREEN_KEY)
    if (typeof v === "boolean") return v
  } catch { }
  return true
}

async function run() {
  const fullscreen = readFullscreenPrefForRun()
  await Navigation.present({
    element: <App interactiveDismissDisabled />,
    ...(fullscreen ? { modalPresentationStyle: "fullScreen" } : {}),
  })
  Script.exit()
}

run()