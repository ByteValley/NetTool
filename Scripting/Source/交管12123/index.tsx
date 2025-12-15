// index.tsx（交管 12123）

import {
  Navigation,
  NavigationStack,
  List,
  Section,
  Button,
  Text,
  Script,
  useState,
  Toggle,
  TextField,
  Picker,
  HStack,
  Spacer,
} from "scripting"

import { CacheSection, CacheConfig, } from "./shared/ui-kit/cacheSection"

import {
  type Traffic12123Settings,
  TRAFFIC_SETTINGS_KEY,
  TRAFFIC_FULLSCREEN_KEY,
  defaultTraffic12123Settings,
  loadTraffic12123Settings, saveTraffic12123Settings,
} from "./settings"

import { showNoticeOnce } from "./shared/utils/noticeOnce"

import { ModuleSection } from "./shared/ui-kit/moduleSection"
import { useFullscreenPref } from "./shared/ui-kit/useFullscreenPref"

// ✅ 抽离：Storage 安全读写
import { safeSet, safeGetBoolean, safeGetObject } from "./shared/utils/storage"


declare const Storage: any
declare const Safari: any
declare const Pasteboard: any
declare const Dialog: any

// 版本号说明（Semantic Versioning）
// MAJOR：破坏性变更或配置结构调整（不兼容旧版）
// MINOR：新增功能、兼容性增强（兼容旧版）
// PATCH：修复 Bug、UI 微调、文案修改等小改动
const VERSION = "1.0.0"

// 构建日期：YYYY-MM-DD
const BUILD_DATE = "2025-12-12"

// Storage Key（局部别名）
const SETTINGS_KEY = TRAFFIC_SETTINGS_KEY
const FULLSCREEN_KEY = TRAFFIC_FULLSCREEN_KEY
const MODULE_SECTION_COLLAPSED_KEY = `${SETTINGS_KEY}:ui:moduleSectionCollapsed`
const IMAGE_SECTION_EXPANDED_KEY = `${SETTINGS_KEY}:ui:imageSectionExpanded`
const cacheStore = {
  title: "缓存策略",
  load: loadTraffic12123Settings,
  save: saveTraffic12123Settings,
  getCache: (s: Traffic12123Settings) => s.cache,
  setCache: (s: Traffic12123Settings, cache: CacheConfig) => ({ ...s, cache }),
}

// ========== 外部链接定义 ==========

const BOXJS_SUB_URL =
  "http://boxjs.com/#/sub/add/https://raw.githubusercontent.com/ByteValley/NetTool/main/BoxJs/ComponentService.boxjs.json"

const MODULE_URL =
  "https://raw.githubusercontent.com/ByteValley/NetTool/main/Surge/Module/Component/12123.module"

const LOON_12123_PLUGIN_URL =
  "https://raw.githubusercontent.com/ByteValley/NetTool/main/Loon/Plugin/Component/12123.lpx"

const QX_12123_REWRITE_URL =
  "https://raw.githubusercontent.com/ByteValley/NetTool/main/QuantumultX/Rewrite/Component/12123.conf"

const ALIPAY_12123_URL =
  "alipays://platformapi/startapp?appId=2019050964403523"

// 刷新间隔选项（单位：分钟）
const REFRESH_OPTIONS = [
  { label: "15 分钟", value: 15 },
  { label: "30 分钟", value: 30 },
  { label: "1 小时", value: 60 },
  { label: "2 小时", value: 120 },
  { label: "3 小时（默认）", value: 180 },
  { label: "6 小时", value: 360 },
  { label: "12 小时", value: 720 },
  { label: "1 天", value: 1440 },
]

// 图片宽度选项 120–220，步长 5
const IMAGE_WIDTH_OPTIONS = Array.from(
  { length: (220 - 120) / 5 + 1 },
  (_, i) => 120 + i * 5,
)

// 图片高度选项 40–100，步长 5
const IMAGE_HEIGHT_OPTIONS = Array.from(
  { length: (100 - 40) / 5 + 1 },
  (_, i) => 40 + i * 5,
)

// ========== Storage 工具（抽到 shared/utils/storage） ==========

function loadSettings(): Traffic12123Settings {
  return safeGetObject<Traffic12123Settings>(SETTINGS_KEY, {
    ...defaultTraffic12123Settings,
  })
}

// run 阶段只读一次全屏偏好
function readFullscreenPrefForRun(): boolean {
  try {
    const v = Storage.get(FULLSCREEN_KEY)
    if (typeof v === "boolean") return v
  } catch { }
  return true
}

// ========== 顶部环境配置相关动作（外链入口） ==========

async function installBoxJsSubscription() {
  await Safari.openURL(BOXJS_SUB_URL)
}

async function installQX12123Rewrite() {
  const tagName = "交管12123"
  const config = JSON.stringify({
    rewrite_remote: [
      `${QX_12123_REWRITE_URL}, tag=${tagName}, update-interval=172800, opt-parser=true, enabled=true`,
    ],
  })
  const qxUrl = `quantumult-x:///add-resource?remote-resource=${encodeURIComponent(
    config,
  )}`
  await Safari.openURL(qxUrl)
}

async function installLoon12123Plugin() {
  await Pasteboard.setString(LOON_12123_PLUGIN_URL)
  await Safari.openURL("loon:///")
}

async function installSurgeModule() {
  const surgeUrl = `surge:///install-module?url=${encodeURIComponent(MODULE_URL)}`
  await Safari.openURL(surgeUrl)
}

async function installEgernModule() {
  const name = encodeURIComponent("交管12123组件服务")
  const egernUrl = `egern:/modules/new?name=${name}&url=${encodeURIComponent(
    MODULE_URL,
  )}`
  await Safari.openURL(egernUrl)
}

async function openAlipayMiniProgram() {
  await Safari.openURL(ALIPAY_12123_URL)
}

// ========== 设置页 ==========

function SettingsView() {
  const dismiss = Navigation.useDismiss()

  // ✅ shared/ui-kit：全屏 / 弹层
  const { fullscreenPref, toggleFullscreen } = useFullscreenPref(FULLSCREEN_KEY)

  const initial = loadSettings()

  // 表单状态
  const [token, setToken] = useState(initial.token ?? "")
  const [enableBoxJs, setEnableBoxJs] = useState(initial.enableBoxJs ?? false)
  const [boxJsUrl, setBoxJsUrl] = useState(initial.boxJsUrl ?? "")

  const [refreshInterval, setRefreshInterval] = useState<number>(
    initial.refreshIntervalMinutes ?? 180,
  )

  const [cacheDraft, setCacheDraft] = useState<CacheConfig>(
    initial.cache ?? defaultTraffic12123Settings.cache,
  )

  const [vehicleImageUrl, setVehicleImageUrl] = useState(
    initial.vehicleImageUrl ?? "",
  )
  const [vehicleImageWidth, setVehicleImageWidth] = useState<number>(
    initial.vehicleImageWidth ?? 120,
  )
  const [vehicleImageHeight, setVehicleImageHeight] = useState(
    String(initial.vehicleImageHeight ?? 60),
  )
  const [vehicleImageOffsetY, setVehicleImageOffsetY] = useState(
    String(initial.vehicleImageOffsetY ?? 30),
  )

  // 文案相关
  const [headerTitle, setHeaderTitle] = useState(initial.headerTitle ?? "12123")
  const [customPlateNumber, setCustomPlateNumber] = useState(
    initial.customPlateNumber ?? "",
  )
  const [customAnnualInspectionDate, setCustomAnnualInspectionDate] = useState(
    initial.customAnnualInspectionDate ?? "",
  )
  const [maskRecordInfo, setMaskRecordInfo] = useState(
    initial.maskRecordInfo ?? false,
  )

  // 图片配置折叠（持久化）
  const [imageSectionExpanded, setImageSectionExpanded] = useState<boolean>(
    safeGetBoolean(IMAGE_SECTION_EXPANDED_KEY, false),
  )

  const handleAbout = async () => {
    await Dialog?.alert?.({
      title: "交管 12123 组件",
      message:
        `作者：©ByteValley\n` +
        `版本：v${VERSION}（${BUILD_DATE}）\n` +
        `致谢：@DTZSGHNR`,
      buttonLabel: "关闭",
    })
  }

  const handleSave = () => {
    const width = Number.isFinite(refreshInterval) ? refreshInterval : 180
    const imgWidth = Number.isFinite(vehicleImageWidth) ? vehicleImageWidth : 120

    const height = parseInt(vehicleImageHeight, 10) || 60
    const offsetY = parseInt(vehicleImageOffsetY, 10) || 30

    // ✅ 保存前再读一次最新 settings，避免覆盖掉 CacheSection 刚写入的 cache
    const latest = loadTraffic12123Settings()

    const newSettings: Traffic12123Settings = {
      // ✅ 先把 latest 全铺进去（含 cache / 未来新增字段）
      ...latest,

      // ✅ 再覆盖本页表单字段
      token: (token ?? "").trim(),
      enableBoxJs,
      boxJsUrl: (boxJsUrl ?? "").trim(),

      refreshIntervalMinutes: width,

      vehicleImageUrl: (vehicleImageUrl ?? "").trim(),
      vehicleImageWidth: imgWidth,
      vehicleImageHeight: height,
      vehicleImageOffsetY: offsetY,

      headerTitle: (headerTitle ?? "").trim(),
      customPlateNumber: (customPlateNumber ?? "").trim(),
      customAnnualInspectionDate: (customAnnualInspectionDate ?? "").trim(),
      maskRecordInfo,
      // ✅ 用草稿覆盖 cache（只在“完成”保存）
      cache: cacheDraft,
    }

    if (enableBoxJs && !newSettings.boxJsUrl) {
      Dialog?.alert?.({
        title: "缺少 BoxJs 地址",
        message: "启用 BoxJs 时需要填写 BoxJs 地址。",
        buttonLabel: "好的",
      })
      return
    }

    if (!enableBoxJs && !newSettings.token) {
      Dialog?.alert?.({
        title: "缺少 Token",
        message: "未启用 BoxJs 时，需要填写 Token（params=...）。",
        buttonLabel: "好的",
      })
      return
    }

    // ✅ 统一走 settings.ts 的保存函数
    saveTraffic12123Settings(newSettings)
    dismiss()
  }

  return (
    <NavigationStack>
      <List
        navigationTitle={"交管 12123 组件"}
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
        {/* 组件模块（shared/ui-kit：可折叠 Section） */}
        <ModuleSection
          footerLines={[
            "使用前建议按序完成：",
            "1）已安装 BoxJs 重写/插件/模块；",
            "2）订阅 BoxJs 配置；",
            "3）安装交管 12123 重写 / 插件 / 模块并开启（需开启重写及 MITM）；",
            "4）打开支付宝小程序并登录抓取 Token。",
          ]}
          collapsible
          collapseStorageKey={MODULE_SECTION_COLLAPSED_KEY}
          defaultCollapsed={true}
          onOpenBoxJsSub={installBoxJsSubscription}
          onInstallSurge={installSurgeModule}
          onInstallEgern={installEgernModule}
          onInstallLoon={installLoon12123Plugin}
          onInstallQx={installQX12123Rewrite}
          // ✅ 放在“安装 QX 重写”后面：用 extra 插槽塞进去
          onOpenExtra={openAlipayMiniProgram}
          extraTitle="🧾 打开『交管 12123』支付宝小程序"
        />

        {/* BoxJs 配置 */}
        <Section
          header={
            <Text font="body" fontWeight="semibold">
              BoxJs 配置
            </Text>
          }
          footer={
            <Text font="caption2" foregroundStyle="secondaryLabel">
              • 开启后优先从 BoxJs 读取 Token；
              {"\n"}• BoxJs 地址例如：https://boxjs.com 或 https://192.168.1.5:9999。
            </Text>
          }
        >
          <Toggle
            title="启用 BoxJs"
            value={enableBoxJs}
            onChanged={(value: boolean) => {
              setEnableBoxJs(value)
              if (value && !boxJsUrl) {
                setBoxJsUrl("https://boxjs.com")
              }
            }}
          />
          {enableBoxJs ? (
            <TextField
              title="BoxJs 地址"
              value={boxJsUrl}
              prompt="请输入 BoxJs 地址，例如：https://boxjs.com"
              onChanged={setBoxJsUrl}
            />
          ) : null}
        </Section>

        {/* Token 设置 */}
        <Section
          header={
            <Text font="body" fontWeight="semibold">
              Token 设置
            </Text>
          }
          footer={
            <Text font="caption2" foregroundStyle="secondaryLabel">
              • 未启用 BoxJs 时，从此处读取 Token（params=...）；
              {"\n"}• 建议优先用 BoxJs 自动抓取 Token。
            </Text>
          }
        >
          <TextField
            title="Token"
            prompt="请输入 Token（params=...）"
            value={token}
            onChanged={setToken}
          />
        </Section>

        {/* 渲染配置（标题 / 车牌 / 年检日期 / 刷新间隔） */}
        <Section
          header={
            <Text font="body" fontWeight="semibold">
              渲染配置
            </Text>
          }
          footer={
            <Text font="caption2" foregroundStyle="secondaryLabel">
              • 顶部标题为空时默认显示「12123」；
              {"\n"}• 车牌号和年检日期留空则使用接口返回的原始值；
              {"\n"}• 开启「隐藏备案详情」时，仅保留驾驶证状态。
              {"\n\n"}• 刷新间隔仅作为系统刷新建议，具体时间仍以系统调度为准。
            </Text>
          }
        >
          <TextField
            title="顶部标题"
            prompt="例如：12123 / 交管业务"
            value={headerTitle}
            onChanged={setHeaderTitle}
          />
          <TextField
            title="车牌号（覆盖）"
            prompt="可自定义展示车牌号，留空使用接口值"
            value={customPlateNumber}
            onChanged={setCustomPlateNumber}
          />
          <TextField
            title="年检日期（覆盖）"
            prompt="例如：2026-06-30，留空使用接口值"
            value={customAnnualInspectionDate}
            onChanged={setCustomAnnualInspectionDate}
          />
          <Toggle
            title="隐藏备案详情，只显示驾驶证状态"
            value={maskRecordInfo}
            onChanged={setMaskRecordInfo}
          />
          <Picker
            title={"刷新间隔"}
            value={refreshInterval}
            onChanged={(value: number) => {
              const n = Number(value)
              setRefreshInterval(Number.isFinite(n) ? n : 180)
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

        <CacheSection
          store={cacheStore}
          // ✅ 草稿模式：不落盘
          deferPersist
          draft={cacheDraft}
          onDraftChange={setCacheDraft}
          // refreshKey 这里其实可留可不留；草稿优先不会读 store
          refreshKey={refreshInterval}
        />

        {/* 图片配置（可折叠 Section） */}
        <Section
          header={
            <Text font="body" fontWeight="semibold">
              图片配置
            </Text>
          }
          footer={
            <Text font="caption2" foregroundStyle="secondaryLabel">
              • 图片为可选配置，用于组件内展示车辆样式；
              {"\n"}• 手动输入优先于下拉选择；
              {"\n"}• 上下偏移数值越大，图片越靠下。
            </Text>
          }
        >
          {/* 折叠开关按钮 */}
          <Button
            title={imageSectionExpanded ? "收起图片配置" : "展开图片配置"}
            systemImage={imageSectionExpanded ? "chevron.down" : "chevron.right"}
            foregroundStyle="secondaryLabel"
            action={async () => {
              const next = !imageSectionExpanded
              setImageSectionExpanded(next)
              safeSet(IMAGE_SECTION_EXPANDED_KEY, next)
            }}
          />

          {imageSectionExpanded ? (
            <>
              {/* 图片 URL */}
              <HStack alignment="center">
                <Text>车辆图片 URL</Text>
                <Spacer />
                <Button title="重置" action={() => setVehicleImageUrl("")} />
              </HStack>

              <TextField
                title=""
                prompt="请输入车辆图片 URL（可选）"
                value={vehicleImageUrl}
                onChanged={setVehicleImageUrl}
              />

              {/* 图片宽度 */}
              <HStack alignment="center">
                <Text>图片宽度</Text>
                <Spacer />
                <Button title="重置" action={() => setVehicleImageWidth(120)} />
              </HStack>

              <TextField
                title=""
                prompt="宽度（pt，默认 120）"
                value={String(vehicleImageWidth)}
                onChanged={(v) => {
                  const n = Number(v)
                  if (Number.isFinite(n)) setVehicleImageWidth(n)
                }}
              />

              <Picker
                title=""
                value={vehicleImageWidth}
                onChanged={(value: number) => {
                  const n = Number(value)
                  setVehicleImageWidth(Number.isFinite(n) ? n : 120)
                }}
                pickerStyle="menu"
              >
                {IMAGE_WIDTH_OPTIONS.map((w) => (
                  <Text key={w} tag={w as any}>
                    {w} pt
                  </Text>
                ))}
              </Picker>

              {/* 图片高度 */}
              <HStack alignment="center">
                <Text>图片高度</Text>
                <Spacer />
                <Button title="重置" action={() => setVehicleImageHeight("60")} />
              </HStack>

              <TextField
                title=""
                prompt="高度（pt，默认 60）"
                value={vehicleImageHeight}
                onChanged={setVehicleImageHeight}
              />

              <Picker
                title=""
                value={parseInt(vehicleImageHeight, 10) || 60}
                onChanged={(value: number) => {
                  setVehicleImageHeight(String(value))
                }}
                pickerStyle="menu"
              >
                {IMAGE_HEIGHT_OPTIONS.map((h) => (
                  <Text key={h} tag={h as any}>
                    {h} pt
                  </Text>
                ))}
              </Picker>

              {/* 图片上下偏移 */}
              <HStack alignment="center">
                <Text>图片上下偏移</Text>
                <Spacer />
                <Button title="重置" action={() => setVehicleImageOffsetY("30")} />
              </HStack>

              <TextField
                title=""
                prompt="偏移（默认 30，数值越大越靠下）"
                value={vehicleImageOffsetY}
                onChanged={setVehicleImageOffsetY}
              />
            </>
          ) : null}
        </Section>
      </List>
    </NavigationStack>
  )
}

// ===== App / 入口 =====

type AppProps = { interactiveDismissDisabled?: boolean }

function App(_props: AppProps) {
  return <SettingsView />
}

const FUNCTION_NOTICE_ID = "boxjs-kv-v2"
const NOTICE_TAG = "2025-12-13"

// ✅ 兜底：避免“点执行没反应”（异常弹窗）
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