// index.tsx（中国联通）

import {
  Navigation,
  NavigationStack,
  List,
  Section,
  TextField,
  Button,
  Color,
  Text,
  Toggle,
  Picker,
  Script,
  useState,
} from "scripting"

declare const Storage: any
declare const Dialog: any
declare const Safari: any

import {
  type ChinaUnicomSettings,
  UNICOM_SETTINGS_KEY,
} from "./telecom/settings"
import { RenderConfigSection } from "./telecom/index/renderConfigSection"
import type { SmallCardStyle } from "./telecom/cards/small"
import { TelecomModuleSection } from "./telecom/index/moduleSection"
import { useFullscreenPref } from "./telecom/index/useFullscreenPref"
import { showNoticeOnce } from "./telecom/utils/noticeOnce"

// ==================== 版本信息 ====================
// 版本号说明（Semantic Versioning）
// MAJOR：破坏性变更或配置结构调整（不兼容旧版）
// MINOR：新增功能、兼容性增强（兼容旧版）
// PATCH：修复 Bug、UI 微调、文案修改等小改动
const VERSION = "1.0.1"

// 构建日期：YYYY-MM-DD
const BUILD_DATE = "2025-12-14"

const SETTINGS_KEY = UNICOM_SETTINGS_KEY
const FULLSCREEN_KEY = "chinaUnicomSettingsFullscreen"

// ==================== BoxJs / 模块 ====================

const UNICOM_BOXJS_SUB_URL =
  "http://boxjs.com/#/sub/add/https://raw.githubusercontent.com/ByteValley/NetTool/main/BoxJs/ComponentService.boxjs.json"
const UNICOM_MODULE_URL =
  "https://raw.githubusercontent.com/ByteValley/NetTool/main/Surge/Module/Component/ChinaUnicom.module"
const UNICOM_LOON_PLUGIN_URL =
  "https://raw.githubusercontent.com/ByteValley/NetTool/main/Loon/Plugin/Component/ChinaUnicom.lpx"

// ==================== 匹配类型 ====================

const MATCH_TYPE_OPTIONS: {
  label: string
  value: "flowType" | "addupItemCode"
}[] = [
    { label: "flowType 聚合", value: "flowType" },
    { label: "addupItemCode 精确匹配", value: "addupItemCode" },
  ]

// ==================== 默认设置 ====================

const defaultSettings: ChinaUnicomSettings = {
  cookie: "",
  titleDayColor: "#666666" as unknown as Color,
  titleNightColor: "#CCCCCC" as unknown as Color,
  descDayColor: "#000000" as unknown as Color,
  descNightColor: "#FFFFFF" as unknown as Color,
  refreshTimeDayColor: "#999999" as unknown as Color,
  refreshTimeNightColor: "#AAAAAA" as unknown as Color,
  refreshInterval: 180,

  otherFlowMatchType: "flowType",
  otherFlowMatchValue: "2",

  enableBoxJs: false,
  boxJsUrl: "",

  showRemainRatio: false,
  mediumCardStyle: "four",
  includeDirectionalInTotal: true,

  // 小号组件样式
  smallCardStyle: "summary",

  // ✅ 仅作用于「紧凑清单 / 进度清单」：
  // true  = 总流量 + 语音（2 行）
  // false = 通用 + 定向 + 语音（3 行）
  smallMiniBarUseTotalFlow: false,
}

// ==================== 设置页面 ====================

function SettingsView() {
  const dismiss = Navigation.useDismiss()
  const { fullscreenPref, toggleFullscreen } = useFullscreenPref(FULLSCREEN_KEY)

  const stored = Storage.get(SETTINGS_KEY) as ChinaUnicomSettings | null
  const initial: ChinaUnicomSettings = stored ?? defaultSettings

  // 颜色字段仅透传
  const colorFields = {
    titleDayColor: initial.titleDayColor,
    titleNightColor: initial.titleNightColor,
    descDayColor: initial.descDayColor,
    descNightColor: initial.descNightColor,
    refreshTimeDayColor: initial.refreshTimeDayColor,
    refreshTimeNightColor: initial.refreshTimeNightColor,
  }

  // 匹配类型 index
  const initialMatchType =
    initial.otherFlowMatchType ?? defaultSettings.otherFlowMatchType
  const initialMatchIndex = Math.max(
    0,
    MATCH_TYPE_OPTIONS.findIndex((opt) => opt.value === initialMatchType),
  )

  // ==================== State ====================

  const [cookie, setCookie] = useState(initial.cookie || "")
  const [refreshInterval, setRefreshInterval] = useState(
    initial.refreshInterval ?? 180,
  )

  const [matchTypeIndex, setMatchTypeIndex] = useState<number>(initialMatchIndex)
  const [otherFlowMatchValue, setOtherFlowMatchValue] = useState(
    initial.otherFlowMatchValue ?? "2",
  )

  const [enableBoxJs, setEnableBoxJs] = useState(initial.enableBoxJs ?? false)
  const [boxJsUrl, setBoxJsUrl] = useState(initial.boxJsUrl ?? "")

  const [showRemainRatio, setShowRemainRatio] = useState(
    initial.showRemainRatio ?? false,
  )

  const [mediumCardStyle, setMediumCardStyle] = useState<"four" | "three">(
    initial.mediumCardStyle ?? "four",
  )

  const [includeDirectionalInTotal, setIncludeDirectionalInTotal] =
    useState<boolean>(initial.includeDirectionalInTotal ?? true)

  const [smallCardStyle, setSmallCardStyle] = useState<SmallCardStyle>(
    (initial.smallCardStyle as SmallCardStyle) ?? "summary",
  )

  // ✅ 紧凑/进度清单 2行/3行联动
  const [smallMiniBarUseTotalFlow, setSmallMiniBarUseTotalFlow] =
    useState<boolean>(initial.smallMiniBarUseTotalFlow ?? false)

  const currentMatchType: "flowType" | "addupItemCode" =
    MATCH_TYPE_OPTIONS[matchTypeIndex]?.value ?? "flowType"

  // ==================== 保存 ====================

  const handleSave = () => {
    const newSettings: ChinaUnicomSettings = {
      ...colorFields,

      cookie: (cookie ?? "").trim(),
      refreshInterval: Number(refreshInterval) || 180,

      otherFlowMatchType: currentMatchType,
      otherFlowMatchValue: (otherFlowMatchValue ?? "").trim(),

      enableBoxJs: !!enableBoxJs,
      boxJsUrl: (boxJsUrl ?? "").trim(),

      showRemainRatio: !!showRemainRatio,
      mediumCardStyle,
      includeDirectionalInTotal: !!includeDirectionalInTotal,

      smallCardStyle,
      smallMiniBarUseTotalFlow: !!smallMiniBarUseTotalFlow,
    }

    Storage.set(SETTINGS_KEY, newSettings)
    dismiss()
  }

  const handleAbout = async () => {
    await Dialog.alert({
      title: "联通余量组件",
      message:
        `作者：©ByteValley\n` +
        `版本：v${VERSION}（${BUILD_DATE}）\n` +
        `致谢：@DTZSGHNR`,
      buttonLabel: "关闭",
    })
  }

  // ==================== 安装 / 跳转 ====================

  const handleOpenUnicomBoxJsSub = async () => Safari.openURL(UNICOM_BOXJS_SUB_URL)

  const handleInstallToSurge = async () => {
    const encodedUrl = encodeURIComponent(UNICOM_MODULE_URL)
    await Safari.openURL(`surge:///install-module?url=${encodedUrl}`)
  }

  const handleInstallToEgern = async () => {
    const encodedUrl = encodeURIComponent(UNICOM_MODULE_URL)
    const name = encodeURIComponent("中国联通组件服务")
    await Safari.openURL(`egern:/modules/new?name=${name}&url=${encodedUrl}`)
  }

  const handleInstallToLoon = async () => {
    const encodedUrl = encodeURIComponent(UNICOM_LOON_PLUGIN_URL)
    await Safari.openURL(`loon://import?plugin=${encodedUrl}`)
  }

  // ==================== UI ====================

  return (
    <NavigationStack>
      <List
        navigationTitle={"联通余量组件"}
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
        {/* 组件模块 */}
        <TelecomModuleSection
          footerLines={[
            "使用前建议按顺序完成：",
            "1）在 BoxJS 中订阅配置（可同步 Cookie 等信息）",
            "2）安装中国联通余量查询模块到支持的客户端",
          ]}
          collapsible
          collapseStorageKey="chinaUnicomModuleSectionCollapsed"
          defaultCollapsed={true}
          onOpenBoxJsSub={handleOpenUnicomBoxJsSub}
          onInstallSurge={handleInstallToSurge}
          onInstallEgern={handleInstallToEgern}
          onInstallLoon={handleInstallToLoon}
        />

        {/* BoxJs */}
        <Section header={<Text font="body" fontWeight="semibold">BoxJs 配置</Text>}>
          <Toggle
            title="启用 BoxJs 读取 Cookie"
            value={enableBoxJs}
            onChanged={(value) => {
              setEnableBoxJs(value)
              if (value && !boxJsUrl) setBoxJsUrl("https://boxjs.com")
            }}
          />
          {enableBoxJs ? (
            <TextField title="BoxJs 地址" value={boxJsUrl} onChanged={setBoxJsUrl} />
          ) : null}
        </Section>

        {/* 登录凭证 */}
        <Section header={<Text font="body" fontWeight="semibold">登录凭证</Text>}>
          <TextField
            title="Cookie"
            value={cookie}
            prompt="在此处粘贴联通 App 的 Cookie"
            onChanged={setCookie}
          />
        </Section>

        {/* 渲染配置 */}
        <RenderConfigSection
          smallCardStyle={smallCardStyle}
          setSmallCardStyle={setSmallCardStyle}
          showRemainRatio={showRemainRatio}
          setShowRemainRatio={setShowRemainRatio}
          smallMiniBarUseTotalFlow={smallMiniBarUseTotalFlow}
          setSmallMiniBarUseTotalFlow={setSmallMiniBarUseTotalFlow}
          mediumCardStyle={mediumCardStyle}
          setMediumCardStyle={setMediumCardStyle}
          includeDirectionalInTotal={includeDirectionalInTotal}
          setIncludeDirectionalInTotal={setIncludeDirectionalInTotal}
          refreshInterval={refreshInterval}
          setRefreshInterval={setRefreshInterval}
        />

        {/* 定向流量配置 */}
        <Section header={<Text font="body" fontWeight="semibold">定向流量配置</Text>}>
          <Picker
            title="匹配类型"
            value={matchTypeIndex}
            onChanged={(v: number) => setMatchTypeIndex(Number(v))}
            pickerStyle="menu"
          >
            {MATCH_TYPE_OPTIONS.map((opt, index) => (
              <Text key={opt.value} tag={index as any}>
                {opt.label}
              </Text>
            ))}
          </Picker>

          <TextField
            title="匹配值"
            value={otherFlowMatchValue}
            onChanged={setOtherFlowMatchValue}
          />
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

const FUNCTION_NOTICE_ID = "boxjs-kv-v2"
const NOTICE_TAG = "2025-12-13"

async function run() {
  await showNoticeOnce({
    scopeKey: SETTINGS_KEY,
    noticeId: FUNCTION_NOTICE_ID,
    tag: NOTICE_TAG,
    title: "BoxJs 配置变更提醒",
    message:
      "本次更新调整 BoxJs 键值对。\n\n" +
      "请重写添加：\n" +
      "• BoxJs 订阅\n" +
      "• BoxJs 重写 / 插件 / 模块\n\n" +
      "否则可能读取不到 Token。",
  })

  const fullscreen = readFullscreenPrefForRun()
  await Navigation.present({
    element: <App interactiveDismissDisabled />,
    ...(fullscreen ? { modalPresentationStyle: "fullScreen" } : {}),
  })
  Script.exit()
}

run()