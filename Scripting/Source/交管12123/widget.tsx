// widget.tsx（交管12123）

import {
  Widget,
  VStack,
  HStack,
  Text,
  Image,
  Spacer,
  DynamicShapeStyle,
  WidgetReloadPolicy,
  ZStack,
  RoundedRectangle,
  Link,
  fetch,
} from "scripting"

import {
  fetchTrafficDataCached,
  fetchTokenFromBoxJs,
  TrafficData,
} from "./api"

import {
  type Traffic12123Settings,
  loadTraffic12123Settings,
} from "./settings"

import { formatRefreshIntervalLabel } from "./shared/utils/time"

declare const Storage: any
declare const FileManager: any

// =====================================================================
// 常量
// =====================================================================
const ALIPAY_12123_URL = "alipays://platformapi/startapp?appId=2019050964403523"

// =====================================================================
// 车辆图片缓存
// =====================================================================
const VEHICLE_IMAGE_CACHE_KEY = "traffic12123_vehicle_image_path"
const VEHICLE_IMAGE_URL_KEY = "traffic12123_vehicle_image_url"

function formatTimeHM(d: Date): string {
  const h = d.getHours().toString().padStart(2, "0")
  const m = d.getMinutes().toString().padStart(2, "0")
  return `${h}:${m}`
}

async function getVehicleImagePath(imageUrl?: string): Promise<string | null> {
  if (!imageUrl) return null

  try {
    const cachedUrl = Storage.get(VEHICLE_IMAGE_URL_KEY)
    const cachedPath = Storage.get(VEHICLE_IMAGE_CACHE_KEY)

    if (cachedUrl === imageUrl && cachedPath && FileManager.existsSync(cachedPath)) {
      return cachedPath
    }

    if (cachedPath && FileManager.existsSync(cachedPath)) {
      try {
        FileManager.removeSync(cachedPath)
      } catch { }
    }

    const res = await fetch(imageUrl)
    if (!res.ok) return null

    const buf = await res.arrayBuffer()
    const filePath = `${FileManager.temporaryDirectory}/vehicle_${Date.now()}.png`
    FileManager.writeAsBytesSync(filePath, new Uint8Array(buf))

    Storage.set(VEHICLE_IMAGE_URL_KEY, imageUrl)
    Storage.set(VEHICLE_IMAGE_CACHE_KEY, filePath)

    return filePath
  } catch {
    return null
  }
}

// =====================================================================
// UI：Fallback / Error
// =====================================================================
function FallbackView(props: {
  title: string
  message?: string
  hint?: string
  reloadPolicy: WidgetReloadPolicy
}) {
  const { title, message, hint, reloadPolicy } = props
  return Widget.present(
    <Link url={ALIPAY_12123_URL}>
      <VStack padding spacing={8} alignment="center">
        <Text font="headline" foregroundStyle="systemRed">
          {title}
        </Text>
        {message ? (
          <Text font="body" foregroundStyle="secondaryLabel">
            {message}
          </Text>
        ) : null}
        {hint ? (
          <Text font="caption" foregroundStyle="secondaryLabel">
            {hint}
          </Text>
        ) : null}
        <Text font="caption" foregroundStyle="accentColor" padding={{ top: 8 }}>
          点击打开支付宝小程序
        </Text>
      </VStack>
    </Link>,
    reloadPolicy,
  )
}

// =====================================================================
// Widget View
// =====================================================================
function WidgetView(props: {
  data: TrafficData
  headerTitle: string
  plateNumber: string
  annualInspectionDate: string
  recordText: string
  updatedAtText: string
  refreshIntervalMinutes: number
  vehicleImagePath?: string | null
  imageWidth?: number
  imageHeight?: number
  imageOffsetY?: number
}) {
  const {
    data,
    headerTitle,
    plateNumber,
    annualInspectionDate,
    recordText,
    updatedAtText,
    refreshIntervalMinutes,
    vehicleImagePath,
    imageWidth,
    imageHeight,
    imageOffsetY,
  } = props

  const lightBg: DynamicShapeStyle = { light: "#E8F4FD", dark: "#1A1A2E" }
  const primaryBlue: DynamicShapeStyle = { light: "#2581F2", dark: "#4A9EFF" }
  const purple: DynamicShapeStyle = { light: "#722ED1", dark: "#9D6FFF" }
  const textColor: DynamicShapeStyle = { light: "#000000", dark: "#FFFFFF" }

  return (
    <ZStack
      frame={{ maxWidth: Infinity, maxHeight: Infinity }}
      widgetBackground={{
        style: lightBg,
        shape: { type: "rect", cornerRadius: 20, style: "continuous" },
      }}
    >
      <VStack padding={{ top: 13, leading: 13, bottom: 13, trailing: 13 }} spacing={4} zIndex={10 as any}>
        {/* 顶部 */}
        <HStack alignment="center" spacing={6}>
          <Text font={19.5} fontWeight="medium" foregroundStyle={textColor} lineLimit={1} minScaleFactor={0.7}>
            {plateNumber}
          </Text>

          <Spacer />

          <Text font={9.5} opacity={0.7} foregroundStyle={textColor} lineLimit={1} minScaleFactor={0.7}>
            更新：{updatedAtText} · {formatRefreshIntervalLabel(refreshIntervalMinutes)}
          </Text>

          <Spacer />

          <Text font={18} fontWeight="medium" foregroundStyle={primaryBlue} lineLimit={1}>
            {headerTitle}
          </Text>
        </HStack>

        {/* 主体 */}
        <HStack alignment="top" spacing={0}>
          <VStack alignment="leading" spacing={0} frame={{ width: 100 }} padding={{ top: 3, trailing: 3 }}>
            <Text font={11.5} opacity={0.78} foregroundStyle={textColor} lineLimit={1}>
              准驾车型 {data.drivingLicenseType}
            </Text>
            <Text font={11.5} opacity={0.78} foregroundStyle={textColor} lineLimit={1}>
              换证 {data.renewalDate}
            </Text>
            <Text font={11.5} opacity={0.78} foregroundStyle={textColor} lineLimit={1}>
              年检 {annualInspectionDate}
            </Text>

            <Spacer />

            <ZStack frame={{ width: 90 }}>
              <RoundedRectangle cornerRadius={10} style="continuous" stroke={{ shapeStyle: primaryBlue, strokeStyle: { lineWidth: 1 } }} />
              <HStack padding={{ top: 3, bottom: 3 }} spacing={4}>
                <Text font={11} fontWeight="medium" foregroundStyle={primaryBlue}>
                  {data.violationCount} 违章
                </Text>
              </HStack>
            </ZStack>

            <Spacer minLength={6} />

            <ZStack frame={{ width: 90 }}>
              <RoundedRectangle cornerRadius={10} style="continuous" stroke={{ shapeStyle: purple, strokeStyle: { lineWidth: 1 } }} />
              <HStack padding={{ top: 3, bottom: 3 }} spacing={4}>
                <Text font={11} fontWeight="medium" foregroundStyle={purple} opacity={0.75}>
                  记{data.penaltyPoints}分
                </Text>
              </HStack>
            </ZStack>
          </VStack>

          <Spacer />

          <VStack alignment="trailing" spacing={0} frame={{ width: 200, maxHeight: Infinity }}>
            <Spacer />
            <VStack alignment="center" spacing={0} frame={{ width: 200, height: 28 }}>
              <Text
                font={11}
                fontWeight="medium"
                foregroundStyle={textColor}
                lineLimit={2}
                opacity={0.8}
                minScaleFactor={0.7}
                frame={{ maxWidth: Infinity }}
                multilineTextAlignment="center"
              >
                {recordText}
              </Text>
            </VStack>
          </VStack>
        </HStack>
      </VStack>

      {/* 车辆图片 */}
      {vehicleImagePath ? (
        <VStack
          alignment="leading"
          frame={{ maxWidth: Infinity, maxHeight: Infinity }}
          padding={{ top: 13, leading: 13, bottom: 13, trailing: 13 }}
          zIndex={0 as any}
        >
          <Spacer minLength={imageOffsetY ?? 30} />
          <HStack alignment="center" frame={{ maxWidth: Infinity }}>
            <Spacer />
            <VStack alignment="leading">
              <Image filePath={vehicleImagePath} frame={{ width: imageWidth ?? 120, height: imageHeight ?? 60 }} resizable />
            </VStack>
          </HStack>
          <Spacer />
        </VStack>
      ) : null}
    </ZStack>
  )
}

// =====================================================================
// Render
// =====================================================================
async function render() {
  const settings: Traffic12123Settings = loadTraffic12123Settings()

  const refreshMinutes = Math.min(
    1440,
    Math.max(5, Number(settings.refreshIntervalMinutes ?? 180) || 180),
  )

  const reloadPolicy: WidgetReloadPolicy = {
    policy: "after",
    date: new Date(Date.now() + refreshMinutes * 60 * 1000),
  }

  // 只支持中号
  if (Widget.family !== "systemMedium") {
    Widget.present(
      <VStack padding spacing={8} alignment="center">
        <Text font="headline" foregroundStyle="systemRed">
          不支持的组件尺寸
        </Text>
        <Text font="body" foregroundStyle="secondaryLabel">
          请使用中型组件
        </Text>
      </VStack>,
      reloadPolicy,
    )
    return
  }

  // 🔍 设置消费日志（重点：缓存）
  try {
    const c = settings.cache
    console.log(
      `⚙️ Widget 设置消费：refresh=${refreshMinutes}min | cache.enabled=${c?.enabled ? "Y" : "N"} | cache.mode=${c?.mode} | cache.ttlPolicy=${c?.ttlPolicy} | cache.ttlFixed=${c?.ttlMinutesFixed}min | cache.allowStale=${c?.allowStaleOnError ? "Y" : "N"} | cache.maxStale=${c?.maxStaleMinutes}min`,
    )
    console.log("⚙️ Widget settings.cache JSON:", JSON.stringify(c))
  } catch { }

  // Token：BoxJs 优先
  let token: string | null = null
  if (settings.enableBoxJs && settings.boxJsUrl) {
    token = await fetchTokenFromBoxJs(settings.boxJsUrl)
    console.log(token ? "🔑 Token 来源：BoxJs" : "⚠️ Token：BoxJs 未取到")
  }
  if (!token && settings.token) {
    token = settings.token
    console.log("🔑 Token 来源：手动配置")
  }

  if (!token) {
    FallbackView({
      title: "未配置 Token",
      message: "请先在主应用中设置 Token",
      hint: "从支付宝小程序交管12123获取，或配置 BoxJs",
      reloadPolicy,
    })
    return
  }

  try {
    // ✅ 按“新缓存策略”走：把 settings.cache 整包传给 api
    const result = await fetchTrafficDataCached(token, {
      refreshIntervalMinutes: refreshMinutes,
      cache: settings.cache,
    })

    // 🔍 缓存决策日志（widget 侧：精简 + JSON）
    console.log(`🧠 Widget Cache 决策：mode=${result.mode} | fromCache=${result.fromCache ? "Y" : "N"}`)
    if (result.meta) console.log("🧠 Widget Cache meta:", JSON.stringify(result.meta))

    if (result.mode === "cache_fresh") console.log("🗂️ Widget：交管数据来自缓存（新鲜）")
    if (result.mode === "cache_stale_fallback") console.log("🧯 Widget：交管数据来自缓存（兜底）")
    if (result.mode === "network_fresh") console.log("🌐 Widget：交管数据来自网络（已更新缓存）")

    if (!result.data) {
      FallbackView({
        title: "获取数据失败",
        message: "Token 可能已过期或网络异常",
        hint: "请重新获取 Token 后再试",
        reloadPolicy,
      })
      return
    }

    const now = new Date()
    const updatedAtText = formatTimeHM(now) + (result.fromCache ? "（缓存）" : "")

    const headerTitle =
      settings.headerTitle && settings.headerTitle.trim().length > 0
        ? settings.headerTitle.trim()
        : "12123"

    const plateNumber =
      settings.customPlateNumber && settings.customPlateNumber.trim().length > 0
        ? settings.customPlateNumber.trim()
        : result.data.plateNumber

    const annualInspectionDate =
      settings.customAnnualInspectionDate && settings.customAnnualInspectionDate.trim().length > 0
        ? settings.customAnnualInspectionDate.trim()
        : result.data.annualInspectionDate

    const recordText =
      settings.maskRecordInfo === true
        ? `驾驶证状态：${result.data.licenseStatus || "正常"}`
        : result.data.recordInfo

    const imageUrl = settings.vehicleImageUrl || result.data.vehicleImageUrl
    const vehicleImagePath = imageUrl ? await getVehicleImagePath(imageUrl) : null

    Widget.present(
      <WidgetView
        data={result.data}
        headerTitle={headerTitle}
        plateNumber={plateNumber}
        annualInspectionDate={annualInspectionDate}
        recordText={recordText}
        updatedAtText={updatedAtText}
        refreshIntervalMinutes={refreshMinutes}
        vehicleImagePath={vehicleImagePath}
        imageWidth={settings.vehicleImageWidth}
        imageHeight={settings.vehicleImageHeight}
        imageOffsetY={settings.vehicleImageOffsetY}
      />,
      reloadPolicy,
    )
  } catch (e: any) {
    const msg = e && (e.stack || e.message) ? String(e.stack || e.message) : String(e)
    console.error("🚨 Widget 渲染异常:", msg)
    FallbackView({
      title: "发生错误",
      message: msg,
      hint: "点击打开支付宝小程序",
      reloadPolicy,
    })
  }
}

render()