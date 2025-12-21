// 中國聯通/index.tsx

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

import {
  type ChinaUnicomSettings,
  UNICOM_SETTINGS_KEY,
} from "./telecom/settings"

import { RenderConfigSection } from "./telecom/index/renderConfigSection"
import type { SmallCardStyle } from "./telecom/cards/small"
import { ModuleSection } from "./telecom/index/moduleSection"
import type { ModuleLinks } from "./telecom/index/moduleActions"
import { createModuleHandles, createModuleActions } from "./telecom/index/moduleActions"
import { useFullscreenPref } from "./telecom/index/useFullscreenPref"
// import { showNoticeOnce } from "./telecom/utils/noticeOnce"

declare const Storage: any
declare const Dialog: any

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
const MODULE_COLLAPSE_KEY = "chinaUnicomModuleSectionCollapsed"

// ==================== BoxJs / 模块 ====================

const UNICOM_BOXJS_SUB_URL =
  "http://boxjs.com/#/sub/add/https://raw.githubusercontent.com/ByteValley/NetTool/main/BoxJs/ComponentService.boxjs.json"
const UNICOM_MODULE_URL =
  "https://raw.githubusercontent.com/ByteValley/NetTool/main/Surge/Module/Component/ChinaUnicom.module"
const UNICOM_LOON_PLUGIN_URL =
  "https://raw.githubusercontent.com/ByteValley/NetTool/main/Loon/Plugin/Component/ChinaUnicom.lpx"

const UNICOM_QX_REWRITE_URL =
  "https://raw.githubusercontent.com/ByteValley/NetTool/refs/heads/main/QuantumultX/Rewrite/Component/ChinaUnicom.conf"

// ==================== 安装 / 跳转（抽象） ====================

const links: ModuleLinks = {
  boxjsSubUrl: UNICOM_BOXJS_SUB_URL,
  surgeModuleUrl: UNICOM_MODULE_URL,
  loonPluginUrl: UNICOM_LOON_PLUGIN_URL,
  qxRewriteUrl: UNICOM_QX_REWRITE_URL,
  extras: [],
}

const handles = createModuleHandles(
  { egernName: "中国联通组件服务" },
  links,
)

const moduleActions = createModuleActions(handles, links)

// ==================== 匹配类型 ====================

const MATCH_TYPE_OPTIONS: { label: string; value: "flowType" | "addupItemCode" }[] =
  [
    { label: "flowType 聚合", value: "flowType" },
    { label: "addupItemCode 精确匹配", value: "addupItemCode" },
  ]

// ==================== 默认设置 ====================
// ✅ 不做旧结构兼容：以当前新结构为准
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

  // ✅ 中号：样式 + 三卡/四卡（默认四卡）
  mediumStyle: "FullRing",
  mediumUseThreeLayout: false,
  // ✅ 三卡时：总流量是否包含定向
  includeDirectionalInTotal: true,

  // 小号组件
  smallCardStyle: "summary",

  // ✅ 仅作用于紧凑/进度清单：2行/3行
  smallMiniBarUseTotalFlow: false,

  // 透明样式
  useTransparentStyle: false,
  useTintBorderOnTransparent: false,
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

  // ✅ 中号：样式 + “三卡开关”（关=默认四卡）
  const [mediumStyle, setMediumStyle] = useState<"FullRing" | "DialRing">(
    initial.mediumStyle ?? "FullRing",
  )
  const [mediumUseThreeLayout, setMediumUseThreeLayout] = useState<boolean>(
    initial.mediumUseThreeLayout ?? false,
  )

  // ✅ 三卡时的总/通用联动控制
  const [includeDirectionalInTotal, setIncludeDirectionalInTotal] =
    useState<boolean>(initial.includeDirectionalInTotal ?? true)

  const [smallCardStyle, setSmallCardStyle] = useState<SmallCardStyle>(
    (initial.smallCardStyle as SmallCardStyle) ?? "summary",
  )

  const [smallMiniBarUseTotalFlow, setSmallMiniBarUseTotalFlow] =
    useState<boolean>(initial.smallMiniBarUseTotalFlow ?? false)

  // 透明样式
  const [useTransparentStyle, setUseTransparentStyle] = useState<boolean>(
    initial.useTransparentStyle ?? false,
  )
  const [useTintBorderOnTransparent, setUseTintBorderOnTransparent] =
    useState<boolean>(initial.useTintBorderOnTransparent ?? false)

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

      mediumStyle,
      mediumUseThreeLayout: !!mediumUseThreeLayout,
      includeDirectionalInTotal: !!includeDirectionalInTotal,

      smallCardStyle,
      smallMiniBarUseTotalFlow: !!smallMiniBarUseTotalFlow,

      useTransparentStyle: !!useTransparentStyle,
      useTintBorderOnTransparent: !!useTintBorderOnTransparent,
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
        <ModuleSection
          footerLines={[
            "使用前建议按顺序完成：",
            "1）在 BoxJS 中订阅配置（可同步 Cookie 等信息）",
            "2）安装中国联通余量查询模块到支持的客户端",
          ]}
          collapsible
          collapseStorageKey={MODULE_COLLAPSE_KEY}
          defaultCollapsed={true}
          actions={moduleActions}
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

        {/* 渲染配置（改为开关版） */}
        <RenderConfigSection
          smallCardStyle={smallCardStyle}
          setSmallCardStyle={setSmallCardStyle}
          showRemainRatio={showRemainRatio}
          setShowRemainRatio={setShowRemainRatio}
          smallMiniBarUseTotalFlow={smallMiniBarUseTotalFlow}
          setSmallMiniBarUseTotalFlow={setSmallMiniBarUseTotalFlow}
          mediumStyle={mediumStyle}
          setMediumStyle={setMediumStyle}
          mediumUseThreeLayout={mediumUseThreeLayout}
          setMediumUseThreeLayout={setMediumUseThreeLayout}
          includeDirectionalInTotal={includeDirectionalInTotal}
          setIncludeDirectionalInTotal={setIncludeDirectionalInTotal}
          refreshInterval={refreshInterval}
          setRefreshInterval={setRefreshInterval}
          useTransparentStyle={useTransparentStyle}
          setUseTransparentStyle={setUseTransparentStyle}
          useTintBorderOnTransparent={useTintBorderOnTransparent}
          setUseTintBorderOnTransparent={setUseTintBorderOnTransparent}
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

/* const FUNCTION_NOTICE_ID = "boxjs-kv-v2"
const NOTICE_TAG = "2025-12-13" */

async function run() {
  /*   await showNoticeOnce({
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
    }) */

  const fullscreen = readFullscreenPrefForRun()
  await Navigation.present({
    element: <App interactiveDismissDisabled />,
    ...(fullscreen ? { modalPresentationStyle: "fullScreen" } : {}),
  })
  Script.exit()
}

run()