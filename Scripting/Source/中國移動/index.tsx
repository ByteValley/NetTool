/* =====================================================================
 * index.tsx（中国移动）
 *
 * 模块分类 · 背景
 * - 设置页内允许使用 useFullscreenPref（hook）管理“页面/弹层”偏好与提示弹窗
 * - ⚠️ main() 属于组件外（非 React 渲染树），不能调用 hook，否则会导致宿主无法执行
 *
 * 模块分类 · 目标
 * - 修复“弹层/页面切换后无法执行”：main() 改为读取 Storage（非 hook）
 * - 设置页：继续复用 useFullscreenPref（切换时写入 + 弹窗提示）
 * - 注释风格统一为：背景 / 目标 / 使用方式 / 日志与边界
 *
 * 模块分类 · 使用方式
 * - 运行脚本打开设置页；切换“页面/弹层”后，下次打开设置页生效
 *
 * 模块分类 · 日志与边界
 * - 本文件不主动刷屏；异常在 main() 捕获并 Dialog.alert
 * ===================================================================== */

import {
  Navigation,
  NavigationStack,
  List,
  Section,
  TextField,
  Button,
  Text,
  Script,
  useState,
} from "scripting"

import {
  type ChinaMobileSettings,
  defaultChinaMobileSettings,
  loadChinaMobileSettings,
  saveChinaMobileSettings,
  FULLSCREEN_KEY,
  MODULE_COLLAPSE_KEY,
} from "./settings"

import { RenderConfigSection } from "./shared/ui-kit/renderConfigSection"
import type { SmallCardStyle } from "./shared/carrier/cards/small"

import { ModuleSection } from "./shared/ui-kit/moduleSection"
import type { ModuleLinks } from "./shared/ui-kit/moduleActions"
import { createModuleHandles, createModuleActions } from "./shared/ui-kit/moduleActions"

// ✅ hook 仅在 SettingsView 内使用
import { useFullscreenPref, readFullscreenPref } from "./shared/ui-kit/useFullscreenPref"

// ✅ 缓存策略（联通/国网同款 CacheSection）
import { CacheSection, type CacheConfig } from "./shared/ui-kit/cacheSection"
import { formatDuration } from "./shared/utils/time"

declare const Dialog: any

/* =====================================================================
 * 模块分类 · 版本信息
 *
 * 模块分类 · 背景
 * - 语义化版本：便于你定位“哪次构建、是否破坏性变更”
 *
 * 模块分类 · 目标
 * - VERSION：x.y.z
 * - BUILD_DATE：YYYY-MM-DD
 *
 * 模块分类 · 使用方式
 * - About 弹窗展示：v${VERSION}（${BUILD_DATE}）
 *
 * 模块分类 · 日志与边界
 * - 常量区不打日志
 * ===================================================================== */

const VERSION = "1.0.0"
const BUILD_DATE = "2025-12-20"

/* =====================================================================
 * 模块分类 · BoxJS / 模块链接
 *
 * 模块分类 · 背景
 * - ModuleSection 需要一组“订阅/模块/插件/重写”链接
 *
 * 模块分类 · 目标
 * - 统一维护 URL，供 createModuleHandles / createModuleActions 使用
 *
 * 模块分类 · 使用方式
 * - ModuleSection.actions = moduleActions
 *
 * 模块分类 · 日志与边界
 * - 常量区不打日志
 * ===================================================================== */

const MOBILE_BOXJS_SUB_URL =
  "http://boxjs.com/#/sub/add/https://raw.githubusercontent.com/ByteValley/NetTool/main/BoxJs/ComponentService.boxjs.json"
const MOBILE_MODULE_URL =
  "https://raw.githubusercontent.com/ByteValley/NetTool/main/Surge/Module/Component/ChinaMobile.module"
const MOBILE_LOON_PLUGIN_URL =
  "https://raw.githubusercontent.com/ByteValley/NetTool/main/Loon/Plugin/Component/ChinaMobile.lpx"
const MOBILE_QX_REWRITE_URL =
  "https://raw.githubusercontent.com/ByteValley/NetTool/main/QuantumultX/Rewrite/Component/ChinaMobile.conf"

const links: ModuleLinks = {
  boxjsSubUrl: MOBILE_BOXJS_SUB_URL,
  surgeModuleUrl: MOBILE_MODULE_URL,
  loonPluginUrl: MOBILE_LOON_PLUGIN_URL,
  qxRewriteUrl: MOBILE_QX_REWRITE_URL,
  extras: [],
}

const handles = createModuleHandles({ egernName: "中国移动组件服务" }, links)
const moduleActions = createModuleActions(handles, links)

/* =====================================================================
 * 模块分类 · SettingsView（设置页主体）
 *
 * 模块分类 · 背景
 * - loadChinaMobileSettings 已在 settings.ts 内做 merge + normalize
 * - UI 层把关键字段收敛成“确定值”，避免 undefined/类型不匹配导致运行问题
 *
 * 模块分类 · 目标
 * - 渲染配置：RenderConfigSection（对齐联通）
 * - 缓存隔离：cacheScopeKey
 * - 缓存策略：CacheSection（deferPersist=true）
 * - 系统：恢复默认设置
 *
 * 模块分类 · 使用方式
 * - main() present SettingsView
 *
 * 模块分类 · 日志与边界
 * - 不主动刷屏；保存异常由 settings.ts 兜底
 * ===================================================================== */

function SettingsView() {
  const dismiss = Navigation.useDismiss()

  // ✅ hook 只能放在组件内
  const { fullscreenPref, toggleFullscreen } = useFullscreenPref(FULLSCREEN_KEY)

  const initial = loadChinaMobileSettings()

  // ==================== 初始化收敛（确定值） ====================

  const initialRefreshInterval =
    typeof initial.refreshInterval === "number" && Number.isFinite(initial.refreshInterval)
      ? initial.refreshInterval
      : defaultChinaMobileSettings.refreshInterval

  const initialMediumStyle =
    (initial.mediumStyle ?? defaultChinaMobileSettings.mediumStyle ?? "FullRing") as "FullRing" | "DialRing"

  const initialMediumUseThreeCard =
    typeof initial.mediumUseThreeCard === "boolean"
      ? initial.mediumUseThreeCard
      : !!defaultChinaMobileSettings.mediumUseThreeCard

  const initialIncludeDirectionalInTotal =
    typeof initial.includeDirectionalInTotal === "boolean"
      ? initial.includeDirectionalInTotal
      : !!defaultChinaMobileSettings.includeDirectionalInTotal

  const initialSmallCardStyle =
    ((initial.smallCardStyle ?? defaultChinaMobileSettings.smallCardStyle) as SmallCardStyle) ??
    ("summary" as SmallCardStyle)

  const initialSmallMiniBarUseTotalFlow =
    typeof initial.smallMiniBarUseTotalFlow === "boolean"
      ? initial.smallMiniBarUseTotalFlow
      : !!defaultChinaMobileSettings.smallMiniBarUseTotalFlow

  const initialShowRemainRatio =
    typeof initial.showRemainRatio === "boolean"
      ? initial.showRemainRatio
      : !!defaultChinaMobileSettings.showRemainRatio

  const initialCacheScopeKey = String(initial.cacheScopeKey ?? defaultChinaMobileSettings.cacheScopeKey ?? "")
  const initialCache = (initial.cache ?? defaultChinaMobileSettings.cache) as CacheConfig

  // ==================== State ====================

  const [refreshInterval, setRefreshInterval] = useState<number>(initialRefreshInterval)
  const [showRemainRatio, setShowRemainRatio] = useState<boolean>(initialShowRemainRatio)
  const [mediumStyle, setMediumStyle] = useState<"FullRing" | "DialRing">(initialMediumStyle)
  const [mediumUseThreeCard, setMediumUseThreeCard] = useState<boolean>(initialMediumUseThreeCard)
  const [includeDirectionalInTotal, setIncludeDirectionalInTotal] = useState<boolean>(initialIncludeDirectionalInTotal)

  const [smallCardStyle, setSmallCardStyle] = useState<SmallCardStyle>(initialSmallCardStyle)
  const [smallMiniBarUseTotalFlow, setSmallMiniBarUseTotalFlow] = useState<boolean>(initialSmallMiniBarUseTotalFlow)

  const [cacheScopeKey, setCacheScopeKey] = useState<string>(initialCacheScopeKey)
  const [cacheDraft, setCacheDraft] = useState<CacheConfig>(initialCache)

  const cacheStore = {
    title: "启用缓存",
    load: () => loadChinaMobileSettings(),
    save: (next: ChinaMobileSettings) => saveChinaMobileSettings(next),
    getCache: (s: ChinaMobileSettings) => (s.cache ?? defaultChinaMobileSettings.cache),
    setCache: (s: ChinaMobileSettings, cache: CacheConfig) => ({ ...s, cache }),
  }

  /* =====================================================================
   * 模块分类 · 保存（统一写回）
   *
   * 模块分类 · 背景
   * - CacheSection deferPersist=true：编辑过程不落盘，避免频繁写 Storage
   *
   * 模块分类 · 目标
   * - 将 state 汇总为 next → saveChinaMobileSettings
   *
   * 模块分类 · 使用方式
   * - 点击“完成”
   *
   * 模块分类 · 日志与边界
   * - 保存后 dismiss
   * ===================================================================== */

  const handleSave = () => {
    const next: ChinaMobileSettings = {
      ...initial,

      refreshInterval:
        typeof refreshInterval === "number" && Number.isFinite(refreshInterval)
          ? refreshInterval
          : defaultChinaMobileSettings.refreshInterval,

      showRemainRatio: !!showRemainRatio,
      mediumStyle,
      mediumUseThreeCard: !!mediumUseThreeCard,
      includeDirectionalInTotal: !!includeDirectionalInTotal,
      smallCardStyle,
      smallMiniBarUseTotalFlow: !!smallMiniBarUseTotalFlow,

      cacheScopeKey: String(cacheScopeKey || "").trim(),
      cache: cacheDraft,
    }

    saveChinaMobileSettings(next)
    dismiss()
  }

  /* =====================================================================
   * 模块分类 · About（版本信息弹窗）
   *
   * 模块分类 · 背景
   * - 便于你确认版本/构建日期
   *
   * 模块分类 · 目标
   * - Dialog.alert 展示 VERSION / BUILD_DATE
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
        title: "移动余量组件",
        message: `作者：©ByteValley\n版本：v${VERSION}（${BUILD_DATE}）\n`,
        buttonLabel: "关闭",
      })
    } catch { }
  }

  /* =====================================================================
   * 模块分类 · 重置（恢复默认设置）
   *
   * 模块分类 · 背景
   * - 只重置 UI state；真正落盘仍走“完成”（避免误触立即改配置）
   *
   * 模块分类 · 目标
   * - 一键恢复默认值到当前页面
   *
   * 模块分类 · 使用方式
   * - 系统区按钮
   *
   * 模块分类 · 日志与边界
   * - confirm 不支持时不执行（保守）
   * ===================================================================== */

  const handleResetAll = async () => {
    let confirmed = false
    try {
      confirmed = await Dialog?.confirm?.({
        title: "重置设置",
        message: "确定要恢复默认设置吗？",
      })
    } catch {
      confirmed = false
    }
    if (!confirmed) return

    setRefreshInterval(defaultChinaMobileSettings.refreshInterval)
    setShowRemainRatio(!!defaultChinaMobileSettings.showRemainRatio)
    setMediumStyle((defaultChinaMobileSettings.mediumStyle ?? "FullRing") as any)
    setMediumUseThreeCard(!!defaultChinaMobileSettings.mediumUseThreeCard)
    setIncludeDirectionalInTotal(!!defaultChinaMobileSettings.includeDirectionalInTotal)
    setSmallCardStyle((defaultChinaMobileSettings.smallCardStyle ?? "summary") as any)
    setSmallMiniBarUseTotalFlow(!!defaultChinaMobileSettings.smallMiniBarUseTotalFlow)
    setCacheScopeKey(String(defaultChinaMobileSettings.cacheScopeKey ?? ""))
    setCacheDraft(defaultChinaMobileSettings.cache as any)
  }

  // ==================== UI ====================

  return (
    <NavigationStack>
      <List
        navigationTitle="移动余量组件"
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
            "1）在 BoxJS 中订阅配置账号/Token（如需）；",
            "2）安装中国移动余量查询模块到支持的客户端；",
            "3）回到桌面添加组件查看数据。",
          ]}
          collapsible
          collapseStorageKey={MODULE_COLLAPSE_KEY}
          defaultCollapsed={true}
          actions={moduleActions}
        />

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

        <Section
          header={<Text font="body" fontWeight="semibold">系统</Text>}
          footer={<Text font="caption2" foregroundStyle="secondaryLabel">恢复默认设置。</Text>}
        >
          <Button
            title="恢复默认设置"
            role="destructive"
            action={handleResetAll}
            frame={{ maxWidth: "infinity", alignment: "center" }}
          />
        </Section>
      </List>
    </NavigationStack>
  )
}

/* =====================================================================
 * 模块分类 · App 包装层
 *
 * 模块分类 · 背景
 * - 与联通/国网保持一致：便于未来扩展 props
 *
 * 模块分类 · 目标
 * - 提供 interactiveDismissDisabled 入口（宿主支持则生效）
 *
 * 模块分类 · 使用方式
 * - main() 内 <App interactiveDismissDisabled />
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
 * - ⚠️ 这里不能调用 useFullscreenPref（hook）
 * - 正确方式：用非 hook 的 readFullscreenPref(storageKey) 读取 Storage
 *
 * 模块分类 · 目标
 * - fullscreen=true → fullScreen
 * - fullscreen=false → 默认弹层
 *
 * 模块分类 · 使用方式
 * - 脚本入口：main()
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