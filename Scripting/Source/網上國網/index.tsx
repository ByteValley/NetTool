// index.tsx（网上国网 / WSGW）

import {
  Navigation,
  NavigationStack,
  List,
  Section,
  Text,
  TextField,
  Picker,
  Button,
  useState,
  Script,
  HStack,
  Spacer,
} from "scripting"

import {
  type SGCCSettings,
  defaultSGCCSettings,
  loadSGCCSettings,
  saveSGCCSettings,
  readFullscreenPrefForRun,
  writeSGCCFullscreenPref,
  SGCC_REFRESH_OPTIONS,
  SGCC_BARCOUNT_OPTIONS,
  SGCC_WIDGET_STYLE_OPTIONS,
  SETTINGS_KEY,
} from "./settings"

import type { SGCCWidgetStyleKey } from "./styles/registry"

import { showNoticeOnce } from "./shared/utils/noticeOnce"

import { ModuleSection } from "./shared/ui-kit/moduleSection"
import { useFullscreenPref } from "./shared/ui-kit/useFullscreenPref"

// ✅ 新增：通用缓存 Section
import { CacheSection, type CacheConfig } from "./shared/ui-kit/cacheSection"
import { formatDuration } from "./shared/utils/time"

declare const Safari: any
declare const Dialog: any

const VERSION = "1.0.0"
const BUILD_DATE = "2025-12-12"

const BOXJS_SUB_URL =
  "http://boxjs.com/#/sub/add/https://raw.githubusercontent.com/ByteValley/NetTool/main/BoxJs/ComponentService.boxjs.json"

const MODULE_URL =
  "https://raw.githubusercontent.com/ByteValley/NetTool/main/Surge/Module/Component/WSGW.module"

const LOON_PLUGIN_URL =
  "https://raw.githubusercontent.com/ByteValley/NetTool/main/Loon/Plugin/Component/WSGW.lpx"

const QX_WSGW_REWRITE_URL =
  "https://raw.githubusercontent.com/ByteValley/NetTool/main/QuantumultX/Rewrite/Component/WSGW.conf"

const MODULE_SECTION_COLLAPSED_KEY = `${SETTINGS_KEY}:ui:moduleSectionCollapsed`
const FULLSCREEN_KEY = `${SETTINGS_KEY}:ui:fullscreenPref`

async function installBoxJsSubscription() {
  await Safari.openURL(BOXJS_SUB_URL)
}

async function installSurgeModule() {
  const surgeUrl = `surge:///install-module?url=${encodeURIComponent(MODULE_URL)}`
  await Safari.openURL(surgeUrl)
}

async function installEgernModule() {
  const name = encodeURIComponent("网上国网组件服务")
  const egernUrl = `egern:/modules/new?name=${name}&url=${encodeURIComponent(MODULE_URL)}`
  await Safari.openURL(egernUrl)
}

async function installLoonPlugin() {
  await Safari.openURL(`loon://import?plugin=${encodeURIComponent(LOON_PLUGIN_URL)}`)
}

async function installQXWSGWRewrite() {
  const tagName = "网上国网组件服务"
  const config = JSON.stringify({
    rewrite_remote: [
      `${QX_WSGW_REWRITE_URL}, tag=${tagName}, update-interval=172800, opt-parser=true, enabled=true`,
    ],
  })
  const qxUrl = `quantumult-x:///add-resource?remote-resource=${encodeURIComponent(config)}`
  await Safari.openURL(qxUrl)
}

function SettingsView() {
  const dismiss = Navigation.useDismiss()
  const { fullscreenPref, toggleFullscreen } = useFullscreenPref(FULLSCREEN_KEY)

  const initial = loadSGCCSettings()

  const [accountIndex, setAccountIndex] = useState(String(initial.accountIndex ?? 0))

  const [widgetStyle, setWidgetStyle] = useState<SGCCWidgetStyleKey>(
    ((initial as any).widgetStyle ??
      defaultSGCCSettings.widgetStyle ??
      "classic") as SGCCWidgetStyleKey,
  )

  const [dimension, setDimension] = useState<"daily" | "monthly">(initial.dimension ?? "daily")
  const [barCount, setBarCount] = useState<number>(initial.barCount ?? defaultSGCCSettings.barCount)

  const [oneLevelPq, setOneLevelPq] = useState(
    String(initial.oneLevelPq ?? defaultSGCCSettings.oneLevelPq),
  )
  const [twoLevelPq, setTwoLevelPq] = useState(
    String(initial.twoLevelPq ?? defaultSGCCSettings.twoLevelPq),
  )

  const [refreshInterval, setRefreshInterval] = useState<number>(
    initial.refreshInterval ?? defaultSGCCSettings.refreshInterval,
  )

  // ✅ 缓存：直接用 CacheSection 即时落盘
  const [cacheDraft, setCacheDraft] = useState<CacheConfig>(initial.cache ?? defaultSGCCSettings.cache)

  const cacheStore = {
    title: "启用缓存",
    load: () => loadSGCCSettings(),
    save: (next: SGCCSettings) => saveSGCCSettings(next),
    getCache: (s: SGCCSettings) => (s.cache ?? defaultSGCCSettings.cache),
    setCache: (s: SGCCSettings, cache: CacheConfig) => ({ ...s, cache }),
  }

  const handleAbout = async () => {
    await Dialog?.alert?.({
      title: "网上国网组件",
      message:
        `作者：©ByteValley\n` +
        `版本：v${VERSION}（${BUILD_DATE}）\n` +
        `说明：改自群友无名大佬，侵删。\n`,
      buttonLabel: "关闭",
    })
  }

  const handleSave = () => {
    const next: SGCCSettings = {
      accountIndex: parseInt(accountIndex, 10) || 0,
      dimension,
      barCount: Number(barCount) || defaultSGCCSettings.barCount,
      oneLevelPq: Number(oneLevelPq) || defaultSGCCSettings.oneLevelPq,
      twoLevelPq: Number(twoLevelPq) || defaultSGCCSettings.twoLevelPq,
      refreshInterval: Number(refreshInterval) || defaultSGCCSettings.refreshInterval,
      widgetStyle,
      cache: cacheDraft,
    }

    if (next.twoLevelPq < next.oneLevelPq) {
      Dialog?.alert?.({
        title: "阶梯阈值不合法",
        message: "二阶电量上限不能小于一阶电量上限。",
        buttonLabel: "好的",
      })
      return
    }

    saveSGCCSettings(next)
    dismiss()
  }

  const handleResetAll = async () => {
    const confirmed = await Dialog?.confirm?.({
      title: "重置设置",
      message: "确定要恢复默认设置吗？",
    })
    if (!confirmed) return

    setAccountIndex(String(defaultSGCCSettings.accountIndex))
    setWidgetStyle((defaultSGCCSettings.widgetStyle ?? "classic") as SGCCWidgetStyleKey)
    setDimension(defaultSGCCSettings.dimension)
    setBarCount(defaultSGCCSettings.barCount)
    setOneLevelPq(String(defaultSGCCSettings.oneLevelPq))
    setTwoLevelPq(String(defaultSGCCSettings.twoLevelPq))
    setRefreshInterval(defaultSGCCSettings.refreshInterval)
    setCacheDraft(defaultSGCCSettings.cache)
  }

  return (
    <NavigationStack>
      <List
        navigationTitle="网上国网组件"
        navigationBarTitleDisplayMode="inline"
        toolbar={{
          topBarLeading: [<Button title="关闭" action={dismiss} />],
          topBarTrailing: [
            <Button
              title={fullscreenPref ? "页面" : "弹层"}
              systemImage={fullscreenPref ? "rectangle.arrowtriangle.2.outward" : "rectangle"}
              action={async () => {
                await toggleFullscreen()
                try {
                  writeSGCCFullscreenPref(!fullscreenPref)
                } catch { }
              }}
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
            "建议顺序：",
            "1）添加 BoxJs 订阅并按订阅说明配置账号密码；",
            "2）安装 Surge/Egern 模块 或 Loon 插件（按工具选择其一）；",
            "3）回到桌面添加组件查看数据。",
          ]}
          collapsible
          collapseStorageKey={MODULE_SECTION_COLLAPSED_KEY}
          defaultCollapsed={true}
          onOpenBoxJsSub={installBoxJsSubscription}
          onInstallSurge={installSurgeModule}
          onInstallEgern={installEgernModule}
          onInstallLoon={installLoonPlugin}
          onInstallQx={installQXWSGWRewrite}
        />

        <Section
          header={
            <Text font="body" fontWeight="semibold">
              账号
            </Text>
          }
          footer={
            <Text font="caption2" foregroundStyle="secondaryLabel">
              绑定多个户号时：0 为第一个，1 为第二个，以此类推。
            </Text>
          }
        >
          <HStack alignment="center">
            <Text>户号索引</Text>
            <Spacer />
            <Button title="重置" action={() => setAccountIndex(String(defaultSGCCSettings.accountIndex))} />
          </HStack>
          <TextField title="" value={accountIndex} prompt="0" keyboardType="numberPad" onChanged={setAccountIndex} />
        </Section>

        <Section
          header={
            <Text font="body" fontWeight="semibold">
              外观
            </Text>
          }
          footer={
            <Text font="caption2" foregroundStyle="secondaryLabel">
              新增样式：只需新增 styles/*.tsx，并在 registry/settings 注册即可。
            </Text>
          }
        >
          <Picker title="组件样式" value={widgetStyle} onChanged={(v: any) => setWidgetStyle(v)} pickerStyle="menu">
            {SGCC_WIDGET_STYLE_OPTIONS.map((opt) => (
              <Text key={opt.value} tag={opt.value as any}>
                {opt.label}
              </Text>
            ))}
          </Picker>
        </Section>

        <Section
          header={
            <Text font="body" fontWeight="semibold">
              数据展示
            </Text>
          }
        >
          <Picker title="统计维度" value={dimension} onChanged={(v: any) => setDimension(v)} pickerStyle="menu">
            <Text tag="daily">每日用电</Text>
            <Text tag="monthly">每月用电</Text>
          </Picker>

          <Picker title="图表条数" value={barCount} onChanged={(v: number) => setBarCount(v)} pickerStyle="menu">
            {SGCC_BARCOUNT_OPTIONS.map((opt) => (
              <Text key={opt.value} tag={opt.value as any}>
                {opt.label}
              </Text>
            ))}
          </Picker>
        </Section>

        <Section
          header={
            <Text font="body" fontWeight="semibold">
              阶梯阈值
            </Text>
          }
          footer={
            <Text font="caption2" foregroundStyle="secondaryLabel">
              用于计算阶梯电价进度条颜色。
            </Text>
          }
        >
          <HStack alignment="center">
            <Text>一阶电量上限</Text>
            <Spacer />
            <Button title="重置" action={() => setOneLevelPq(String(defaultSGCCSettings.oneLevelPq))} />
          </HStack>
          <TextField
            title=""
            value={oneLevelPq}
            prompt={String(defaultSGCCSettings.oneLevelPq)}
            keyboardType="numberPad"
            onChanged={setOneLevelPq}
          />

          <HStack alignment="center">
            <Text>二阶电量上限</Text>
            <Spacer />
            <Button title="重置" action={() => setTwoLevelPq(String(defaultSGCCSettings.twoLevelPq))} />
          </HStack>
          <TextField
            title=""
            value={twoLevelPq}
            prompt={String(defaultSGCCSettings.twoLevelPq)}
            keyboardType="numberPad"
            onChanged={setTwoLevelPq}
          />
        </Section>

        {/* ✅ 缓存策略（统一 CacheSection） */}
        <CacheSection
          store={cacheStore as any}
          refreshKey={refreshInterval}
          draft={cacheDraft}
          onDraftChange={(next) => {
            setCacheDraft(next)
          }}
          deferPersist={true}
        />
        <Section
          footer={
            <Text font="caption2" foregroundStyle="secondaryLabel">
              当前生效示例：refresh={refreshInterval} 分钟，TTL 自动为 max(4 小时, refresh)；
              固定 TTL 则为 max(4 小时, 固定值)。
              {"\n"}提示：你设置的“兜底旧缓存最长允许”会被自动纠偏为 ≥ TTL（避免反直觉）。
              {"\n"}（用于说明：{formatDuration(Math.max(240, Number(refreshInterval) || 0), { includeSeconds: false })}）
            </Text>
          }
        />

        <Section
          header={
            <Text font="body" fontWeight="semibold">
              系统
            </Text>
          }
          footer={
            <Text font="caption2" foregroundStyle="secondaryLabel">
              刷新间隔仅作为系统刷新建议，实际以系统调度为准。
            </Text>
          }
        >
          <Picker
            title="自动刷新间隔"
            value={refreshInterval}
            onChanged={(v: number) => setRefreshInterval(v)}
            pickerStyle="menu"
          >
            {SGCC_REFRESH_OPTIONS.map((opt) => (
              <Text key={opt.value} tag={opt.value as any}>
                {opt.label}
              </Text>
            ))}
          </Picker>

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

type AppProps = { interactiveDismissDisabled?: boolean }
function App(_props: AppProps) {
  return <SettingsView />
}

const FUNCTION_NOTICE_ID = "boxjs-kv-v2"
const NOTICE_TAG = "2025-12-13"

async function main() {
  try {
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
  } catch (e: any) {
    const msg =
      e && (e.stack || e.message) ? String(e.stack || e.message) : String(e)
    try {
      await Dialog?.alert?.({
        title: "脚本执行失败",
        message: msg,
        buttonLabel: "知道了",
      })
    } catch { }
    Script.exit()
  }
}

main()