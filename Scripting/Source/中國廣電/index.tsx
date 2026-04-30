/* =====================================================================
 * index.tsx（中国广电）
 *
 * 模块分类 · 背景
 * - 设置页支持「页面（全屏）/ 弹层弹出」切换；偏好存 Storage
 * - main() 不在组件渲染树内，不能调用 hook（useFullscreenPref）
 * - settings.ts 负责 merge + normalize；UI 层只做“确定值收敛”
 *
 * 模块分类 · 目标
 * - 广电 10099：配置 Access / 请求体 data（Session 可选）
 * - 渲染配置：复用联通组件 UI
 * - 缓存策略：CacheSection（deferPersist=true）
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
  Script,
  useState,
} from "scripting"

import {
  type ChinaBroadnetSettings,
  defaultChinaBroadnetSettings,
  loadChinaBroadnetSettings,
  saveChinaBroadnetSettings,
  FULLSCREEN_KEY,
  MODULE_COLLAPSE_KEY,
} from "./settings"

import { RenderConfigSection } from "./shared/ui-kit/renderConfigSection"
import type { SmallCardStyle } from "./shared/carrier/cards/small"
import { ModuleSection } from "./shared/ui-kit/moduleSection"
import type { ModuleLinks } from "./shared/ui-kit/moduleActions"
import { createModuleHandles, createModuleActions } from "./shared/ui-kit/moduleActions"
import { useFullscreenPref, readFullscreenPref } from "./shared/ui-kit/useFullscreenPref"
import { CacheSection, type CacheConfig } from "./shared/ui-kit/cacheSection"
import { formatDuration } from "./shared/utils/time"

declare const Dialog: any

const VERSION = "1.0.1"
const BUILD_DATE = "2026-05-01"

const BROADNET_BOXJS_SUB_URL =
  "http://boxjs.com/#/sub/add/https://raw.githubusercontent.com/ByteValley/NetTool/main/BoxJs/ComponentService.boxjs.json"
const BROADNET_MODULE_URL =
  "https://raw.githubusercontent.com/ByteValley/NetTool/main/Surge/Module/Component/ChinaBroadnet.module"
const BROADNET_EGERN_MODULE_URL =
  "https://raw.githubusercontent.com/ByteValley/NetTool/main/Egern/Module/Component/ChinaBroadnet.module"
const BROADNET_LOON_PLUGIN_URL =
  "https://raw.githubusercontent.com/ByteValley/NetTool/main/Loon/Plugin/Component/ChinaBroadnet.lpx"
const BROADNET_QX_REWRITE_URL =
  "https://raw.githubusercontent.com/ByteValley/NetTool/refs/heads/main/QuantumultX/Rewrite/Component/ChinaBroadnet.conf"
const BROADNET_STASH_OVERRIDE_URL =
  "https://raw.githubusercontent.com/ByteValley/NetTool/main/Stash/Stoverride/Component/ChinaBroadnet.stoverride"

const links: ModuleLinks = {
  boxjsSubUrl: BROADNET_BOXJS_SUB_URL,
  surgeModuleUrl: BROADNET_MODULE_URL,
  egernModuleUrl: BROADNET_EGERN_MODULE_URL,
  loonPluginUrl: BROADNET_LOON_PLUGIN_URL,
  qxRewriteUrl: BROADNET_QX_REWRITE_URL,
  extras: [
    {
      title: "复制/打开 Stash 覆写",
      systemImage: "slider.horizontal.3",
      url: BROADNET_STASH_OVERRIDE_URL,
    },
  ],
}

const handles = createModuleHandles({ egernName: "中国广电组件服务" }, links)
const moduleActions = createModuleActions(handles, links)

function SettingsView() {
  const dismiss = Navigation.useDismiss()
  const { fullscreenPref, toggleFullscreen } = useFullscreenPref(FULLSCREEN_KEY)

  const initial = loadChinaBroadnetSettings()

  const initialRefreshInterval =
    typeof initial.refreshInterval === "number" && Number.isFinite(initial.refreshInterval)
      ? initial.refreshInterval
      : defaultChinaBroadnetSettings.refreshInterval

  const initialShowRemainRatio =
    typeof initial.showRemainRatio === "boolean"
      ? initial.showRemainRatio
      : !!defaultChinaBroadnetSettings.showRemainRatio

  const initialMediumStyle =
    (initial.mediumStyle ?? defaultChinaBroadnetSettings.mediumStyle ?? "FullRing") as "FullRing" | "DialRing"

  const initialMediumUseThreeCard =
    typeof initial.mediumUseThreeCard === "boolean"
      ? initial.mediumUseThreeCard
      : !!defaultChinaBroadnetSettings.mediumUseThreeCard

  const initialIncludeDirectionalInTotal =
    typeof initial.includeDirectionalInTotal === "boolean"
      ? initial.includeDirectionalInTotal
      : (defaultChinaBroadnetSettings.includeDirectionalInTotal ?? true)

  const initialSmallCardStyle =
    ((initial.smallCardStyle ?? defaultChinaBroadnetSettings.smallCardStyle) as SmallCardStyle) ??
    ("summary" as SmallCardStyle)

  const initialSmallMiniBarUseTotalFlow =
    typeof initial.smallMiniBarUseTotalFlow === "boolean"
      ? initial.smallMiniBarUseTotalFlow
      : !!defaultChinaBroadnetSettings.smallMiniBarUseTotalFlow

  const initialCache = (initial.cache ?? defaultChinaBroadnetSettings.cache) as CacheConfig
  const initialEnableBoxJs =
    typeof initial.enableBoxJs === "boolean" ? initial.enableBoxJs : !!defaultChinaBroadnetSettings.enableBoxJs
  const initialBoxJsUrl = String(initial.boxJsUrl ?? defaultChinaBroadnetSettings.boxJsUrl ?? "").trim()

  const [session, setSession] = useState<string>(String(initial.session ?? ""))
  const [access, setAccess] = useState<string>(String(initial.access ?? ""))
  const [bodyData, setBodyData] = useState<string>(String(initial.bodyData ?? ""))
  const [refreshInterval, setRefreshInterval] = useState<number>(initialRefreshInterval)
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
  const [cacheDraft, setCacheDraft] = useState<CacheConfig>(initialCache)

  const cacheStore = {
    title: "启用缓存",
    load: () => loadChinaBroadnetSettings(),
    save: (next: ChinaBroadnetSettings) => saveChinaBroadnetSettings(next),
    getCache: (s: ChinaBroadnetSettings) => (s.cache ?? defaultChinaBroadnetSettings.cache),
    setCache: (s: ChinaBroadnetSettings, cache: CacheConfig) => ({ ...s, cache }),
  }

  const handleSave = () => {
    const next: ChinaBroadnetSettings = {
      ...initial,

      session: String(session ?? "").trim(),
      access: String(access ?? "").trim(),
      bodyData: String(bodyData ?? "").trim(),
      refreshInterval:
        typeof refreshInterval === "number" && Number.isFinite(refreshInterval)
          ? refreshInterval
          : defaultChinaBroadnetSettings.refreshInterval,
      enableBoxJs: !!enableBoxJs,
      boxJsUrl: String(boxJsUrl ?? "").trim(),

      showRemainRatio: !!showRemainRatio,
      mediumStyle,
      mediumUseThreeCard: !!mediumUseThreeCard,
      includeDirectionalInTotal: !!includeDirectionalInTotal,
      smallCardStyle,
      smallMiniBarUseTotalFlow: !!smallMiniBarUseTotalFlow,

      cacheScopeKey: `${String(access ?? "").trim()}`,
      cache: cacheDraft,
    }

    saveChinaBroadnetSettings(next)
    dismiss()
  }

  const handleAbout = async () => {
    try {
      await Dialog?.alert?.({
        title: "广电余量组件",
        message: `作者：©ByteValley\n版本：v${VERSION}（${BUILD_DATE}）\n接口：10099 微信小程序`,
        buttonLabel: "关闭",
      })
    } catch { }
  }

  return (
    <NavigationStack>
      <List
        navigationTitle="广电余量组件"
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
            "1）在 BoxJS 中订阅配置（用于保存 Access / data，Session 可选）",
            "2）安装中国广电组件服务模块/插件/重写到支持的客户端",
            "3）打开中国广电 10099 微信小程序并进入套餐/余量页面触发抓取",
          ]}
          collapsible
          collapseStorageKey={MODULE_COLLAPSE_KEY}
          defaultCollapsed={true}
          actions={moduleActions}
        />

        <Section header={<Text font="body" fontWeight="semibold">BoxJs 配置</Text>}>
          <Toggle
            title="启用 BoxJs 自动读取"
            value={enableBoxJs}
            onChanged={(value) => {
              setEnableBoxJs(value)
              if (value && !String(boxJsUrl || "").trim()) setBoxJsUrl("https://boxjs.com")
            }}
          />
          {enableBoxJs ? <TextField title="BoxJs 地址" value={boxJsUrl} onChanged={setBoxJsUrl} /> : null}
        </Section>

        <Section
          header={<Text font="body" fontWeight="semibold">登录凭证</Text>}
          footer={
            <Text font="caption2" foregroundStyle="secondaryLabel">
              可由 BoxJs 自动读取；也可以从 10099 微信小程序请求 wx.10099.com.cn/contact-web/api/busi/qryUserInfo 中手动复制 Access 和请求体 data，Session 可留空。
            </Text>
          }
        >
          <TextField title="Session（可选）" value={session} prompt="请求头 Session，可留空" onChanged={setSession} />
          <TextField title="Access" value={access} prompt="请求头 Access" onChanged={setAccess} />
          <TextField title="data" value={bodyData} prompt="请求体 data（Base64 整段）" onChanged={setBodyData} />
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

type AppProps = { interactiveDismissDisabled?: boolean }
function App(_props: AppProps) {
  return <SettingsView />
}

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
