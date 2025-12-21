/* =====================================================================
 * index.tsx（中国联通）
 *
 * 模块分类 · 背景
 * - 设置页支持「页面（全屏）/ 弹层弹出」切换；偏好存 Storage
 * - ⚠️ main() 不在组件渲染树内，不能调用 hook（useFullscreenPref），否则可能直接“无法执行”
 * - settings.ts 负责 merge + normalize；UI 层只做“确定值收敛”
 *
 * 模块分类 · 目标
 * - 修复“弹层/页面切换后无法执行”：main() 改用 readFullscreenPref（非 hook）
 * - 设置页：继续用 useFullscreenPref（切换时写入 + 弹窗提示）
 * - RenderConfigSection + CacheSection + cacheScopeKey 指纹隔离
 *
 * 模块分类 · 使用方式
 * - 运行脚本打开设置页；切换显示模式后，下次打开设置页生效
 *
 * 模块分类 · 日志与边界
 * - 本文件不主动刷屏；异常由 main() 捕获并 Dialog.alert
 * ===================================================================== */

import {
  Navigation,
  NavigationStack,
  List,
  Section,
  TextField,
  Button,
  Text,
  Toggle,
  Picker,
  Script,
  useState,
} from "scripting"

import {
  type ChinaUnicomSettings,
  defaultChinaUnicomSettings,
  loadChinaUnicomSettings,
  saveChinaUnicomSettings,
  FULLSCREEN_KEY,
  MODULE_COLLAPSE_KEY,
} from "./settings"

import { RenderConfigSection } from "./shared/ui-kit/renderConfigSection"
import type { SmallCardStyle } from "./shared/carrier/cards/small"
import { ModuleSection } from "./shared/ui-kit/moduleSection"
import type { ModuleLinks } from "./shared/ui-kit/moduleActions"
import { createModuleHandles, createModuleActions } from "./shared/ui-kit/moduleActions"

// ✅ hook 只在组件内使用；main 用 readFullscreenPref（非 hook）
import { useFullscreenPref, readFullscreenPref } from "./shared/ui-kit/useFullscreenPref"

// ✅ 缓存策略（CacheSection）
import { CacheSection, type CacheConfig } from "./shared/ui-kit/cacheSection"
import { formatDuration } from "./shared/utils/time"

declare const Dialog: any

/* =====================================================================
 * 模块分类 · 版本信息
 *
 * 模块分类 · 背景
 * - 语义化版本：便于你定位构建与回溯变更
 *
 * 模块分类 · 目标
 * - VERSION：x.y.z
 * - BUILD_DATE：YYYY-MM-DD
 *
 * 模块分类 · 使用方式
 * - About 弹窗展示：v${VERSION}（${BUILD_DATE}）
 *
 * 模块分类 · 日志与边界
 * - 常量区无日志
 * ===================================================================== */

const VERSION = "1.0.0"
const BUILD_DATE = "2025-12-20"

/* =====================================================================
 * 模块分类 · BoxJS / 模块链接
 *
 * 模块分类 · 背景
 * - ModuleSection 需要 actions（复制/跳转/订阅）
 *
 * 模块分类 · 目标
 * - 统一维护：BoxJS 订阅 / Surge 模块 / Loon 插件 / QuanX 重写
 *
 * 模块分类 · 日志与边界
 * - 常量区无日志
 * ===================================================================== */

const UNICOM_BOXJS_SUB_URL =
  "http://boxjs.com/#/sub/add/https://raw.githubusercontent.com/ByteValley/NetTool/main/BoxJs/ComponentService.boxjs.json"
const UNICOM_MODULE_URL =
  "https://raw.githubusercontent.com/ByteValley/NetTool/main/Surge/Module/Component/ChinaUnicom.module"
const UNICOM_LOON_PLUGIN_URL =
  "https://raw.githubusercontent.com/ByteValley/NetTool/main/Loon/Plugin/Component/ChinaUnicom.lpx"
const UNICOM_QX_REWRITE_URL =
  "https://raw.githubusercontent.com/ByteValley/NetTool/refs/heads/main/QuantumultX/Rewrite/Component/ChinaUnicom.conf"

const links: ModuleLinks = {
  boxjsSubUrl: UNICOM_BOXJS_SUB_URL,
  surgeModuleUrl: UNICOM_MODULE_URL,
  loonPluginUrl: UNICOM_LOON_PLUGIN_URL,
  qxRewriteUrl: UNICOM_QX_REWRITE_URL,
  extras: [],
}

const handles = createModuleHandles({ egernName: "中国联通组件服务" }, links)
const moduleActions = createModuleActions(handles, links)

/* =====================================================================
 * 模块分类 · 匹配类型（定向流量）
 *
 * 模块分类 · 背景
 * - 定向流量可通过 flowType 聚合，也可用 addupItemCode 精确匹配
 *
 * 模块分类 · 目标
 * - 统一 options：label/value
 * - UI 使用 Picker 选择
 *
 * 模块分类 · 日志与边界
 * - 常量区无日志
 * ===================================================================== */

const MATCH_TYPE_OPTIONS: { label: string; value: "flowType" | "addupItemCode" }[] = [
  { label: "flowType 聚合", value: "flowType" },
  { label: "addupItemCode 精确匹配", value: "addupItemCode" },
]

/* =====================================================================
 * 模块分类 · SettingsView（设置页主体）
 *
 * 模块分类 · 背景
 * - loadChinaUnicomSettings 已做 merge + normalize
 * - UI 层统一把关键字段收敛成“确定值”，避免 undefined/类型问题
 *
 * 模块分类 · 目标
 * - BoxJS：可选读取 Cookie（enableBoxJs + boxJsUrl）
 * - 登录凭证：Cookie
 * - 渲染配置：RenderConfigSection（对齐移动/电信）
 * - 定向流量：匹配类型 + 匹配值
 * - 缓存隔离：cacheScopeKey
 * - 缓存策略：CacheSection（deferPersist=true）
 *
 * 模块分类 · 日志与边界
 * - 不主动刷屏；保存失败由外层 try/catch 兜底
 * ===================================================================== */

function SettingsView() {
  const dismiss = Navigation.useDismiss()
  const { fullscreenPref, toggleFullscreen } = useFullscreenPref(FULLSCREEN_KEY)

  const initial = loadChinaUnicomSettings()

  // ==================== 初始化收敛（确定值） ====================

  const initialRefreshInterval =
    typeof initial.refreshInterval === "number" && Number.isFinite(initial.refreshInterval)
      ? initial.refreshInterval
      : defaultChinaUnicomSettings.refreshInterval

  const initialEnableBoxJs =
    typeof initial.enableBoxJs === "boolean" ? initial.enableBoxJs : !!defaultChinaUnicomSettings.enableBoxJs

  const initialBoxJsUrl = String(initial.boxJsUrl ?? defaultChinaUnicomSettings.boxJsUrl ?? "").trim()

  const initialShowRemainRatio =
    typeof initial.showRemainRatio === "boolean"
      ? initial.showRemainRatio
      : !!defaultChinaUnicomSettings.showRemainRatio

  const initialMediumStyle =
    (initial.mediumStyle ?? defaultChinaUnicomSettings.mediumStyle ?? "FullRing") as "FullRing" | "DialRing"

  const initialMediumUseThreeCard =
    typeof initial.mediumUseThreeCard === "boolean"
      ? initial.mediumUseThreeCard
      : !!defaultChinaUnicomSettings.mediumUseThreeCard

  const initialIncludeDirectionalInTotal =
    typeof initial.includeDirectionalInTotal === "boolean"
      ? initial.includeDirectionalInTotal
      : (defaultChinaUnicomSettings.includeDirectionalInTotal ?? true)

  const initialSmallCardStyle =
    ((initial.smallCardStyle ?? defaultChinaUnicomSettings.smallCardStyle) as SmallCardStyle) ??
    ("summary" as SmallCardStyle)

  const initialSmallMiniBarUseTotalFlow =
    typeof initial.smallMiniBarUseTotalFlow === "boolean"
      ? initial.smallMiniBarUseTotalFlow
      : !!defaultChinaUnicomSettings.smallMiniBarUseTotalFlow

  const initialCacheScopeKey = String(initial.cacheScopeKey ?? defaultChinaUnicomSettings.cacheScopeKey ?? "")

  const initialCache = (initial.cache ?? defaultChinaUnicomSettings.cache) as CacheConfig

  // 定向流量匹配：index 收敛
  const initialMatchType = (initial.otherFlowMatchType ??
    defaultChinaUnicomSettings.otherFlowMatchType ??
    "flowType") as "flowType" | "addupItemCode"

  const initialMatchIndex = Math.max(0, MATCH_TYPE_OPTIONS.findIndex((opt) => opt.value === initialMatchType))

  // ==================== State ====================

  const [cookie, setCookie] = useState<string>(String(initial.cookie ?? ""))
  const [refreshInterval, setRefreshInterval] = useState<number>(initialRefreshInterval)

  const [matchTypeIndex, setMatchTypeIndex] = useState<number>(initialMatchIndex)
  const [otherFlowMatchValue, setOtherFlowMatchValue] = useState<string>(String(initial.otherFlowMatchValue ?? ""))

  const [enableBoxJs, setEnableBoxJs] = useState<boolean>(initialEnableBoxJs)
  const [boxJsUrl, setBoxJsUrl] = useState<string>(initialBoxJsUrl)

  const [showRemainRatio, setShowRemainRatio] = useState<boolean>(initialShowRemainRatio)

  const [mediumStyle, setMediumStyle] = useState<"FullRing" | "DialRing">(initialMediumStyle)
  const [mediumUseThreeCard, setMediumUseThreeCard] = useState<boolean>(initialMediumUseThreeCard)

  const [includeDirectionalInTotal, setIncludeDirectionalInTotal] = useState<boolean>(
    !!initialIncludeDirectionalInTotal,
  )

  const [smallCardStyle, setSmallCardStyle] = useState<SmallCardStyle>(initialSmallCardStyle)
  const [smallMiniBarUseTotalFlow, setSmallMiniBarUseTotalFlow] = useState<boolean>(
    initialSmallMiniBarUseTotalFlow,
  )

  const [cacheScopeKey, setCacheScopeKey] = useState<string>(initialCacheScopeKey)
  const [cacheDraft, setCacheDraft] = useState<CacheConfig>(initialCache)

  const cacheStore = {
    title: "启用缓存",
    load: () => loadChinaUnicomSettings(),
    save: (next: ChinaUnicomSettings) => saveChinaUnicomSettings(next),
    getCache: (s: ChinaUnicomSettings) => (s.cache ?? defaultChinaUnicomSettings.cache),
    setCache: (s: ChinaUnicomSettings, cache: CacheConfig) => ({ ...s, cache }),
  }

  const currentMatchType: "flowType" | "addupItemCode" =
    MATCH_TYPE_OPTIONS[matchTypeIndex]?.value ?? "flowType"

  /* =====================================================================
   * 模块分类 · 保存（统一写回）
   *
   * 模块分类 · 背景
   * - CacheSection deferPersist=true：编辑过程不落盘，避免频繁写 Storage
   *
   * 模块分类 · 目标
   * - 将 state 汇总为 next → saveChinaUnicomSettings
   *
   * 模块分类 · 使用方式
   * - 点击“完成”
   *
   * 模块分类 · 日志与边界
   * - 保存后 dismiss
   * ===================================================================== */

  const handleSave = () => {
    const next: ChinaUnicomSettings = {
      ...initial,

      cookie: String(cookie ?? "").trim(),
      refreshInterval:
        typeof refreshInterval === "number" && Number.isFinite(refreshInterval)
          ? refreshInterval
          : defaultChinaUnicomSettings.refreshInterval,

      otherFlowMatchType: currentMatchType,
      otherFlowMatchValue: String(otherFlowMatchValue ?? "").trim(),

      enableBoxJs: !!enableBoxJs,
      boxJsUrl: String(boxJsUrl ?? "").trim(),

      showRemainRatio: !!showRemainRatio,

      mediumStyle,
      mediumUseThreeCard: !!mediumUseThreeCard,
      includeDirectionalInTotal: !!includeDirectionalInTotal,

      smallCardStyle,
      smallMiniBarUseTotalFlow: !!smallMiniBarUseTotalFlow,

      cacheScopeKey: String(cacheScopeKey || "").trim(),
      cache: cacheDraft,
    }

    saveChinaUnicomSettings(next)
    dismiss()
  }

  /* =====================================================================
   * 模块分类 · About（版本信息弹窗）
   *
   * 模块分类 · 背景
   * - 便于确认版本/构建日期
   *
   * 模块分类 · 目标
   * - Dialog.alert 展示 VERSION / BUILD_DATE / 致谢
   *
   * 模块分类 · 使用方式
   * - 工具栏底部“关于本组件”
   *
   * 模块分类 · 日志与边界
   * - Dialog 不可用则静默
   * ===================================================================== */

  const handleAbout = async () => {
    try {
      await Dialog?.alert?.({
        title: "联通余量组件",
        message: `作者：©ByteValley\n版本：v${VERSION}（${BUILD_DATE}）\n致谢：@DTZSGHNR`,
        buttonLabel: "关闭",
      })
    } catch { }
  }

  // ==================== UI ====================

  return (
    <NavigationStack>
      <List
        navigationTitle="联通余量组件"
        navigationBarTitleDisplayMode="inline"
        toolbar={{
          topBarLeading: [<Button title="关闭" action={dismiss} />],
          topBarTrailing: [
            <Button
              title={fullscreenPref ? "页面" : "弹层"}
              systemImage={fullscreenPref ? "rectangle.arrowtriangle.2.outward" : "rectangle"}
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

        <Section header={<Text font="body" fontWeight="semibold">BoxJs 配置</Text>}>
          <Toggle
            title="启用 BoxJs 读取 Cookie"
            value={enableBoxJs}
            onChanged={(value) => {
              setEnableBoxJs(value)
              if (value && !String(boxJsUrl || "").trim()) setBoxJsUrl("https://boxjs.com")
            }}
          />
          {enableBoxJs ? <TextField title="BoxJs 地址" value={boxJsUrl} onChanged={setBoxJsUrl} /> : null}
        </Section>

        <Section header={<Text font="body" fontWeight="semibold">登录凭证</Text>}>
          <TextField title="Cookie" value={cookie} prompt="在此处粘贴联通 App 的 Cookie" onChanged={setCookie} />
        </Section>

        <RenderConfigSection
          smallCardStyle={smallCardStyle}
          setSmallCardStyle={setSmallCardStyle}
          showRemainRatio={showRemainRatio}
          setShowRemainRatio={setShowRemainRatio}
          smallMiniBarUseTotalFlow={smallMiniBarUseTotalFlow}
          setSmallMiniBarUseTotalFlow={setSmallMiniBarUseTotalFlow}
          mediumStyle={mediumStyle}
          setMediumStyle={setMediumStyle}
          mediumUseThreeCard={mediumUseThreeCard}
          setMediumUseThreeCard={setMediumUseThreeCard}
          includeDirectionalInTotal={includeDirectionalInTotal}
          setIncludeDirectionalInTotal={setIncludeDirectionalInTotal}
          refreshInterval={refreshInterval}
          setRefreshInterval={setRefreshInterval}
        />

        <Section
          header={<Text font="body" fontWeight="semibold">定向流量配置</Text>}
          footer={
            <Text font="caption2" foregroundStyle="secondaryLabel">
              定向流量可配置 flowType 或具体的 addupItemCode 精确匹配。默认使用 flowType：2 定向，也可改为 3 聚合；不匹配会有兜底逻辑。
            </Text>
          }
        >
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

          <TextField title="匹配值" value={otherFlowMatchValue} onChanged={setOtherFlowMatchValue} />
        </Section>

{/*         <Section
          header={<Text font="body" fontWeight="semibold">缓存隔离</Text>}
          footer={
            <Text font="caption2" foregroundStyle="secondaryLabel">
              填一个稳定标识（如：主号/副号、A套餐）。它会被哈希为指纹用于绑定数据缓存；更改后缓存会自动隔离，避免切账号/切数据源读到旧缓存。
            </Text>
          }
        >
          <TextField title="隔离标识" value={cacheScopeKey} prompt="主号/副号" onChanged={setCacheScopeKey} />
        </Section> */}

        <CacheSection
          store={cacheStore as any}
          refreshKey={refreshInterval}
          draft={cacheDraft}
          onDraftChange={(next) => setCacheDraft(next)}
          deferPersist={true}
        />

        <Section
          footer={
            <Text font="caption2" foregroundStyle="secondaryLabel">
              当前生效示例：refresh={refreshInterval} 分钟，TTL 自动为 max(4 小时, refresh)；固定 TTL 则为 max(4 小时, 固定值)。
              {"\n"}提示：你设置的“兜底旧缓存最长允许”会被自动纠偏为 ≥ TTL（避免反直觉）。
              {"\n"}（用于说明：
              {formatDuration(Math.max(240, Number(refreshInterval) || 0), { includeSeconds: false })}）
            </Text>
          }
        />
      </List>
    </NavigationStack>
  )
}

/* =====================================================================
 * 模块分类 · App 包装层
 *
 * 模块分类 · 背景
 * - 与移动/电信保持一致：便于未来扩展 props
 *
 * 模块分类 · 目标
 * - 提供 interactiveDismissDisabled 入口（宿主支持则生效）
 *
 * 模块分类 · 日志与边界
 * - 纯 UI 包装，无日志
 * ===================================================================== */

type AppProps = { interactiveDismissDisabled?: boolean }
function App(_props: AppProps) {
  return <SettingsView />
}

/* =====================================================================
 * 模块分类 · main（呈现入口）
 *
 * 模块分类 · 背景
 * - ⚠️ main() 不能调用 useFullscreenPref（hook）
 * - 正确方式：readFullscreenPref(storageKey) 读取 Storage 偏好
 *
 * 模块分类 · 目标
 * - fullscreen=true → fullScreen
 * - fullscreen=false → 默认弹层
 *
 * 模块分类 · 日志与边界
 * - 捕获异常：Dialog.alert；最后 Script.exit()
 * ===================================================================== */

async function main() {
  try {
    const fullscreen = readFullscreenPref(FULLSCREEN_KEY, true)

    await Navigation.present({
      element: <App interactiveDismissDisabled />,
      ...(fullscreen ? { modalPresentationStyle: "fullScreen" } : {}),
    })

    Script.exit()
  } catch (e) {
    const msg =
      e && typeof e === "object" && "stack" in e ? String((e as { stack?: unknown }).stack ?? e) : String(e)
    try {
      await Dialog?.alert?.({ title: "脚本执行失败", message: msg, buttonLabel: "知道了" })
    } catch { }
    Script.exit()
  }
}

main()