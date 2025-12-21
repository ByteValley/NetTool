/* =====================================================================
 * index.tsx（中国电信）
 *
 * 模块分类 · 背景
 * - 设置页需要“页面（全屏）/ 弹层弹出”切换；偏好存 Storage
 * - ⚠️ main() 不在组件渲染树内，不能调用 hook（useFullscreenPref），否则可能直接“无法执行”
 * - settings.ts 负责 merge + normalize；UI 层只做“确定值收敛”
 *
 * 模块分类 · 目标
 * - 修复“弹层/页面切换后无法执行”：main() 改用 readFullscreenPref（非 hook）
 * - 设置页：继续用 useFullscreenPref（切换时写入 + 弹窗提示）
 * - 对齐移动/联通：RenderConfigSection + CacheSection + cacheScopeKey 指纹隔离
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
  Script,
  useState,
} from "scripting"

import {
  type ChinaTelecomSettings,
  defaultChinaTelecomSettings,
  loadChinaTelecomSettings,
  saveChinaTelecomSettings,
  FULLSCREEN_KEY,
  MODULE_COLLAPSE_KEY,
} from "./settings"

import { ModuleSection } from "./shared/ui-kit/moduleSection"
import { RenderConfigSection } from "./shared/ui-kit/renderConfigSection"
import type { SmallCardStyle } from "./shared/carrier/cards/small"

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
 * 模块分类 · SettingsView（设置页主体）
 *
 * 模块分类 · 背景
 * - loadChinaTelecomSettings 已做 merge + normalize
 * - UI 层统一把关键字段收敛成“确定值”，避免 undefined/类型问题
 *
 * 模块分类 · 目标
 * - 基础配置：手机号/密码
 * - 渲染配置：RenderConfigSection（对齐移动/联通）
 * - 缓存隔离：cacheScopeKey
 * - 缓存策略：CacheSection（deferPersist=true）
 *
 * 模块分类 · 使用方式
 * - main() present SettingsView
 *
 * 模块分类 · 日志与边界
 * - 不主动刷屏；保存失败由外层 try/catch 兜底
 * ===================================================================== */

function SettingsView() {
  const dismiss = Navigation.useDismiss()
  const { fullscreenPref, toggleFullscreen } = useFullscreenPref(FULLSCREEN_KEY)

  const initial = loadChinaTelecomSettings()

  // ==================== 初始化收敛（确定值） ====================

  const initialMobile = String(initial.mobile ?? "")
  const initialPassword = String(initial.password ?? "")

  const initialRefreshInterval =
    typeof initial.refreshInterval === "number" && Number.isFinite(initial.refreshInterval)
      ? initial.refreshInterval
      : defaultChinaTelecomSettings.refreshInterval

  const initialShowRemainRatio =
    typeof initial.showRemainRatio === "boolean"
      ? initial.showRemainRatio
      : !!defaultChinaTelecomSettings.showRemainRatio

  const initialMediumStyle =
    (initial.mediumStyle ?? defaultChinaTelecomSettings.mediumStyle ?? "FullRing") as "FullRing" | "DialRing"

  const initialMediumUseThreeCard =
    typeof initial.mediumUseThreeCard === "boolean"
      ? initial.mediumUseThreeCard
      : !!defaultChinaTelecomSettings.mediumUseThreeCard

  const initialIncludeDirectionalInTotal =
    typeof initial.includeDirectionalInTotal === "boolean"
      ? initial.includeDirectionalInTotal
      : !!defaultChinaTelecomSettings.includeDirectionalInTotal

  const initialSmallCardStyle =
    ((initial.smallCardStyle ?? defaultChinaTelecomSettings.smallCardStyle) as SmallCardStyle) ??
    ("summary" as SmallCardStyle)

  const initialSmallMiniBarUseTotalFlow =
    typeof initial.smallMiniBarUseTotalFlow === "boolean"
      ? initial.smallMiniBarUseTotalFlow
      : !!defaultChinaTelecomSettings.smallMiniBarUseTotalFlow

  const initialCacheScopeKey = String(initial.cacheScopeKey ?? defaultChinaTelecomSettings.cacheScopeKey ?? "")
  const initialCache = (initial.cache ?? defaultChinaTelecomSettings.cache) as CacheConfig

  // ==================== State（基础配置） ====================

  const [mobile, setMobile] = useState<string>(initialMobile)
  const [password, setPassword] = useState<string>(initialPassword)
  const [refreshInterval, setRefreshInterval] = useState<number>(initialRefreshInterval)

  // ==================== State（渲染配置） ====================

  const [showRemainRatio, setShowRemainRatio] = useState<boolean>(initialShowRemainRatio)
  const [mediumStyle, setMediumStyle] = useState<"FullRing" | "DialRing">(initialMediumStyle)
  const [mediumUseThreeCard, setMediumUseThreeCard] = useState<boolean>(initialMediumUseThreeCard)
  const [includeDirectionalInTotal, setIncludeDirectionalInTotal] = useState<boolean>(
    initialIncludeDirectionalInTotal,
  )
  const [smallCardStyle, setSmallCardStyle] = useState<SmallCardStyle>(initialSmallCardStyle)
  const [smallMiniBarUseTotalFlow, setSmallMiniBarUseTotalFlow] = useState<boolean>(
    initialSmallMiniBarUseTotalFlow,
  )

  // ==================== State（缓存隔离 + CacheSection） ====================

  const [cacheScopeKey, setCacheScopeKey] = useState<string>(initialCacheScopeKey)
  const [cacheDraft, setCacheDraft] = useState<CacheConfig>(initialCache)

  const cacheStore = {
    title: "启用缓存",
    load: () => loadChinaTelecomSettings(),
    save: (next: ChinaTelecomSettings) => saveChinaTelecomSettings(next),
    getCache: (s: ChinaTelecomSettings) => (s.cache ?? defaultChinaTelecomSettings.cache),
    setCache: (s: ChinaTelecomSettings, cache: CacheConfig) => ({ ...s, cache }),
  }

  /* =====================================================================
   * 模块分类 · 保存（统一写回）
   *
   * 模块分类 · 背景
   * - CacheSection deferPersist=true：编辑过程不落盘，避免频繁写 Storage
   *
   * 模块分类 · 目标
   * - 将 state 汇总为 next → saveChinaTelecomSettings
   *
   * 模块分类 · 使用方式
   * - 点击“完成”
   *
   * 模块分类 · 日志与边界
   * - 保存后 dismiss
   * ===================================================================== */

  const handleSave = () => {
    const next: ChinaTelecomSettings = {
      ...initial,

      mobile: String(mobile ?? "").trim(),
      password: String(password ?? "").trim(),
      refreshInterval:
        typeof refreshInterval === "number" && Number.isFinite(refreshInterval)
          ? refreshInterval
          : defaultChinaTelecomSettings.refreshInterval,

      showRemainRatio: !!showRemainRatio,
      mediumStyle,
      mediumUseThreeCard: !!mediumUseThreeCard,
      includeDirectionalInTotal: !!includeDirectionalInTotal,
      smallCardStyle,
      smallMiniBarUseTotalFlow: !!smallMiniBarUseTotalFlow,

      cacheScopeKey: String(cacheScopeKey || "").trim(),
      cache: cacheDraft,
    }

    saveChinaTelecomSettings(next)
    dismiss()
  }

  /* =====================================================================
   * 模块分类 · About（版本信息弹窗）
   *
   * 模块分类 · 背景
   * - 便于确认版本/构建日期
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
        title: "电信余量组件",
        message: `作者：©ByteValley\n版本：v${VERSION}（${BUILD_DATE}）\n`,
        buttonLabel: "关闭",
      })
    } catch { }
  }

  // ==================== UI ====================

  return (
    <NavigationStack>
      <List
        navigationTitle="电信余量组件"
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
            "使用说明：",
            "1）在设置页填写账号/密码（接口会在本地请求中使用）",
            "2）回到桌面添加组件查看数据",
          ]}
          collapsible
          collapseStorageKey={MODULE_COLLAPSE_KEY}
          defaultCollapsed={true}
          actions={{} as any}
        />

        <Section
          header={<Text font="body" fontWeight="semibold">账号</Text>}
          footer={
            <Text font="caption2" foregroundStyle="secondaryLabel">
              账号/密码用于请求新版接口；仅保存在本地 Storage。
            </Text>
          }
        >
          <TextField title="手机号" value={mobile} onChanged={setMobile} prompt="请输入手机号" />
          <TextField title="密码" value={password} onChanged={setPassword} prompt="请输入密码" />
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
 * - 与移动/联通保持一致：便于未来扩展 props
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
 * - ⚠️ main() 不能调用 useFullscreenPref（hook）
 * - 正确方式：readFullscreenPref(storageKey) 读取 Storage 偏好
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