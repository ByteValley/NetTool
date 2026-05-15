// widget.tsx（网上国网 / WSGW）

import {
  Widget,
  VStack,
  Text,
  WidgetReloadPolicy,
} from "scripting"

import {
  getAccountData,
  getSettings,
  processBarChartData,
  extractDisplayData,
} from "./api"

import { SGCC_WIDGET_STYLES } from "./styles/registry"
import { formatRefreshIntervalLabel } from "./shared/utils/time"

// ✅ 联通同款：本地图片缓存（safeGetObject/safeSet + FileManager）
import { ensureImageFilePath } from "./shared/utils/imageCache"

const LOGO_URL =
  "https://raw.githubusercontent.com/Honye/scriptable-scripts/master/static/sgcc.png"

const SGCC_LOGO_CACHE_KEY = "wsgw_sgcc.logo.cache.v1"

function toHM(d: Date): string {
  const h = d.getHours().toString().padStart(2, "0")
  const m = d.getMinutes().toString().padStart(2, "0")
  return `${h}:${m}`
}

function toMDHM(d: Date): string {
  const MM = String(d.getMonth() + 1).padStart(2, "0")
  const DD = String(d.getDate()).padStart(2, "0")
  const HH = String(d.getHours()).padStart(2, "0")
  const mm = String(d.getMinutes()).padStart(2, "0")
  return `${MM}-${DD} ${HH}:${mm}`
}

// ✅ 只认 api 给的真值
function pickFromCache(meta: any): boolean {
  if (!meta) return false
  return meta.fromCache === true
}

function clampRefreshMinutes(v: any) {
  const n = Number(v)
  if (!Number.isFinite(n) || n <= 0) return 180
  return Math.max(60, Math.floor(n))
}

function renderError(message: string, reloadPolicy: WidgetReloadPolicy) {
  Widget.present(
    <VStack padding={12} alignment="leading" spacing={6}>
      <Text font={14} fontWeight="semibold" foregroundStyle={"#D0580D" as any}>
        网上国网取数失败
      </Text>
      <Text font={11} foregroundStyle={"#666666" as any} lineLimit={4}>
        {message || "接口未返回可用数据"}
      </Text>
      <Text font={10} foregroundStyle={"#999999" as any}>
        请检查 BoxJs 账号密码或稍后再试
      </Text>
    </VStack>,
    reloadPolicy,
  )
}

async function render() {
  try {
    const settings = getSettings()

    const refreshMinutes = clampRefreshMinutes((settings as any).refreshInterval)
    const reloadPolicy: WidgetReloadPolicy = {
      policy: "after",
      date: new Date(Date.now() + refreshMinutes * 60 * 1000),
    }

    console.log(
      `⚙️ WSGW Widget 设置消费：refresh=${refreshMinutes}min（${formatRefreshIntervalLabel(refreshMinutes)}） | cache.enabled=${settings.cache?.enabled ? "Y" : "N"} | cache.mode=${settings.cache?.mode} | cache.ttlPolicy=${settings.cache?.ttlPolicy} | cache.ttlFixed=${settings.cache?.ttlMinutesFixed}min | cache.allowStale=${settings.cache?.allowStaleOnError ? "Y" : "N"} | cache.maxStale=${settings.cache?.maxStaleMinutes}min`,
    )

    const forceRefresh = false
    const rawData = await getAccountData(forceRefresh)

    if (rawData?.__cacheMeta) {
      console.log("🧠 WSGW Cache meta:", JSON.stringify(rawData.__cacheMeta))
    }

    if (rawData?.__errorMessage && rawData?.__cacheMeta?.mode === "none") {
      renderError(String(rawData.__errorMessage), reloadPolicy)
      return
    }

    const now = new Date()
    const fromCache = pickFromCache(rawData?.__cacheMeta)

    // ✅ 更推荐：用数据的 updatedAt 作为“数据时间”，fallback 用 now
    const dataTime = new Date(rawData?.__cacheMeta?.updatedAt || now.getTime())
    const updatedAtText = `${toMDHM(dataTime)}${fromCache ? "（缓存）" : ""}`

    // 兼容旧样式：如果样式吃 lastUpdateTime，就给它一个“数据时间”
    try {
      rawData.lastUpdateTime = dataTime.getTime()
    } catch { }

    const displayData = extractDisplayData(rawData)
    const barData = processBarChartData(rawData, settings)

      ; (displayData as any).updatedAtText = updatedAtText
      ; (displayData as any).fromCache = fromCache

    // ============================
    // Logo：联通同款本地缓存
    // ============================
    let logoPath: string | null = null
    try {
      logoPath = await Promise.race([
        ensureImageFilePath({
          url: LOGO_URL,
          cacheKey: SGCC_LOGO_CACHE_KEY,
          filePrefix: "sgcc_logo",
          fileExt: "png",
          forceRefresh: false,
        }),
        new Promise<string | null>((r) => setTimeout(() => r(null), 800)),
      ])

      if (!logoPath) {
        console.log("🖼️ WSGW Logo：首帧跳过下载（避免阻塞渲染）")
      } else {
        console.log("🖼️ WSGW Logo：使用本地缓存路径", logoPath)
      }
    } catch (e) {
      console.warn("⚠️ WSGW Logo：缓存异常，跳过显示", e)
      logoPath = null
    }

    console.log(
      `⏱️ WSGW 渲染：${toHM(now)} | 数据时间：${updatedAtText}${rawData?.__cacheMeta?.decision ? ` | ${rawData.__cacheMeta.decision}` : ""}`,
    )

    const styleKey = (settings as any).widgetStyle || "classic"
    const renderer =
      (SGCC_WIDGET_STYLES as any)[styleKey] || SGCC_WIDGET_STYLES.classic

    Widget.present(
      renderer({
        displayData,
        barData,
        settings,
        logoPath,
      }),
      reloadPolicy,
    )
  } catch (e) {
    console.error("⛔️ WSGW Widget 渲染失败:", e)
    Widget.present(
      <VStack padding={10} alignment="center">
        <Text font={12} foregroundStyle={"#000000" as any}>加载失败</Text>
        <Text font={10} foregroundStyle={"#888888" as any}>{String(e)}</Text>
      </VStack>,
    )
  }
}

render()
