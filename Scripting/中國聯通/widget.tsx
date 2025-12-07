import {
  Widget,
  VStack,
  HStack,
  Text,
  Image,
  Color,
  Spacer,
  fetch,
  DynamicShapeStyle,
  WidgetReloadPolicy,
  ZStack,
  Gauge,
} from "scripting"

/* 兼容声明：避免 TS 报 “找不到 Storage / FileManager” */
declare const Storage: any
declare const FileManager: any

// 设置结构定义
type ChinaUnicomSettings = {
  cookie: string
  titleDayColor: Color
  titleNightColor: Color
  descDayColor: Color
  descNightColor: Color
  refreshTimeDayColor: Color
  refreshTimeNightColor: Color
  refreshInterval: number
  showFlow?: boolean
  showOtherFlow?: boolean
  otherFlowMatchType?: "flowType" | "addupItemCode"
  otherFlowMatchValue?: string
  enableBoxJs?: boolean
  boxJsUrl?: string
}

const SETTINGS_KEY = "chinaUnicomSettings"

// API 地址
const API_URL =
  "https://m.client.10010.com/mobileserviceimportant/home/queryUserInfoSeven?version=iphone_c@10.0100&desmobiel=13232135179&showType=0"
const API_DETAIL_URL =
  "https://m.client.10010.com/servicequerybusiness/operationservice/queryOcsPackageFlowLeftContentRevisedInJune"

// 联通 Logo（用于话费卡大图标）
const UNICOM_LOGO_URL =
  "https://raw.githubusercontent.com/Nanako718/Scripting/refs/heads/main/images/10010.png"

// 组件数据结构（加入 updateTime，方便和移动保持一致）
type UnicomData = {
  fee: { title: string; balance: string; unit: string }
  voice: { title: string; balance: string; unit: string; used?: number; total?: number }
  flow: { title: string; balance: string; unit: string; used?: number; total?: number }
  otherFlow?: { title: string; balance: string; unit: string; used?: number; total?: number }
  updateTime: string
}

// 话费数据类型
type FeeData = {
  title: string
  balance: string
  unit: string
}

// 详细 API 响应结构
type DetailApiResponse = {
  code: string
  resources?: Array<{
    type: string
    userResource: string
    remainResource: string
    details?: Array<{
      use: string
      total: string
      remain: string
      addUpItemName: string
      feePolicyName: string
      flowType?: string
      addupItemCode?: string
    }>
  }>
  canuseFlowAllUnit?: string
  canuseVoiceAllUnit?: string
  canuseSmsAllUnit?: string
  // 流量汇总列表：flowtype=1通用流量，2/3定向流量
  flowSumList?: Array<{
    flowtype: string
    xcanusevalue: string
    xusedvalue: string
    elemtype?: string
  }>
  fresSumList?: Array<{
    flowtype: string
    xcanusevalue: string
    xusedvalue: string
  }>
}

// ================= BoxJS / 数据获取 =================

// 从 BoxJs 读取 Cookie（DataCollection -> ChinaUnicom.Settings.Cookie）
async function fetchCookieFromBoxJs(boxJsUrl: string): Promise<string | null> {
  const boxKey = "DataCollection"

  try {
    const base = boxJsUrl.replace(/\/$/, "")
    const url = `${base}/query/data/${boxKey}`
    console.log("📡 从 BoxJs 读取联通 Cookie:", url)

    const response = await fetch(url, {
      headers: {
        Accept: "application/json",
      },
    })

    if (!response.ok) {
      console.error("❌ 从 BoxJs 读取 Cookie 失败，状态码:", response.status)
      return null
    }

    const data = await response.json()
    const rawVal = data?.val

    if (!rawVal) {
      console.warn("⚠️ BoxJs 返回的 val 为空:", data)
      return null
    }

    let root: any
    try {
      root = typeof rawVal === "string" ? JSON.parse(rawVal) : rawVal
    } catch (e) {
      console.error("❌ 解析 BoxJs DataCollection JSON 失败:", e, "原始 val:", rawVal)
      return null
    }

    const cookie = root?.ChinaUnicom?.Settings?.Cookie
    if (cookie && typeof cookie === "string" && cookie.trim()) {
      console.log("✅ 从 BoxJs 成功读取联通 Cookie")
      return cookie.trim()
    } else {
      console.warn(
        "⚠️ DataCollection.ChinaUnicom.Settings.Cookie 不存在或格式不正确:",
        root
      )
      return null
    }
  } catch (error) {
    console.error("🚨 从 BoxJs 读取 Cookie 异常:", error)
    return null
  }
}

// 获取话费数据（仅从第一个 API）
async function fetchFeeData(cookie: string): Promise<FeeData | null> {
  try {
    const response = await fetch(API_URL, {
      headers: {
        Host: "m.client.10010.com",
        "User-Agent": "ChinaUnicom.x CFNetwork iOS/16.3 unicom{version:iphone_c@10.0100}",
        cookie: cookie,
      },
    })

    if (response.ok) {
      const data = await response.json()

      if (data.code === "Y") {
        const { feeResource } = data
        const feeData = {
          title: feeResource?.dynamicFeeTitle || "剩余话费",
          balance: feeResource?.feePersent || "0",
          unit: feeResource?.newUnit || "元",
        }
        console.log("💰 话费数据:", `${feeData.balance}${feeData.unit}`)
        return feeData
      } else {
        console.warn("⚠️ API 返回非成功状态:", data.code, data.msg || data.message)
      }
    } else {
      console.error("❌ HTTP 请求失败，状态码:", response.status)
    }
  } catch (error) {
    console.error("🚨 请求异常:", error)
  }
  return null
}

// 获取详细数据（从第二个 API）
async function fetchDetailData(cookie: string): Promise<DetailApiResponse | null> {
  try {
    const response = await fetch(API_DETAIL_URL, {
      headers: {
        Host: "m.client.10010.com",
        "User-Agent": "ChinaUnicom.x CFNetwork iOS/16.3 unicom{version:iphone_c@10.0100}",
        cookie: cookie,
      },
    })
    if (response.ok) {
      const data = await response.json()
      if (data.code === "0000" || data.code === "Y") {
        return data as DetailApiResponse
      }
    }
  } catch (error) {
    console.error("❌ 获取详细数据失败:", error)
  }
  return null
}

// 从详细 API 提取语音和流量数据（通用流量）
function extractVoiceAndFlowData(detailData: DetailApiResponse): {
  voice: { title: string; balance: string; unit: string; used?: number; total?: number }
  flow: { title: string; balance: string; unit: string; used?: number; total?: number }
} | null {
  try {
    // 语音
    const voiceResource = detailData.resources?.find((r) => r.type === "Voice")
    const voiceRemain = voiceResource?.remainResource || "0"
    const voiceUsed = voiceResource?.userResource || "0"
    const voiceTotal = parseFloat(voiceRemain) + parseFloat(voiceUsed)
    const voiceUnit = detailData.canuseVoiceAllUnit || "MIN"

    // 通用流量：优先 flowSumList flowtype = "1"
    const generalFlow = detailData.flowSumList?.find((item) => item.flowtype === "1")
    let flowRemainMB = 0
    let flowUsedMB = 0

    if (generalFlow?.xcanusevalue) {
      flowRemainMB = parseFloat(generalFlow.xcanusevalue)
      flowUsedMB = parseFloat(generalFlow.xusedvalue || "0")
    } else {
      // 兼容 resources
      const flowResource = detailData.resources?.find((r) => r.type === "Flow")
      const remainStr = flowResource?.remainResource || "0"
      const usedStr = flowResource?.userResource || "0"
      const unit = detailData.canuseFlowAllUnit || "GB"

      if (unit === "MB") {
        flowRemainMB = parseFloat(remainStr)
        flowUsedMB = parseFloat(usedStr)
      } else if (unit === "GB") {
        flowRemainMB = parseFloat(remainStr) * 1024
        flowUsedMB = parseFloat(usedStr) * 1024
      }
    }

    const flowFormatted = formatFlowValue(flowRemainMB, "MB")
    const flowTotalMB = flowRemainMB + flowUsedMB

    const result = {
      voice: {
        title: "剩余语音",
        balance: voiceRemain,
        unit: voiceUnit,
        used: parseFloat(voiceUsed),
        total: voiceTotal,
      },
      flow: {
        title: "通用流量",
        balance: flowFormatted.balance,
        unit: flowFormatted.unit,
        used: flowUsedMB,
        total: flowTotalMB,
      },
    }

    console.log(
      "📞 语音:",
      `已用${voiceUsed}${voiceUnit} 剩余${voiceRemain}${voiceUnit} 总计${voiceTotal}${voiceUnit}`
    )
    console.log(
      "📶 通用流量:",
      `已用${formatFlowValue(flowUsedMB, "MB").balance}${formatFlowValue(flowUsedMB, "MB").unit} ` +
      `剩余${flowFormatted.balance}${flowFormatted.unit} ` +
      `总计${formatFlowValue(flowTotalMB, "MB").balance}${formatFlowValue(flowTotalMB, "MB").unit}`
    )

    return result
  } catch (error) {
    console.error("❌ 提取数据失败:", error)
    return null
  }
}

// 格式化流量值（自动转换单位）
function formatFlowValue(value: number, unit: string = "MB"): {
  balance: string
  unit: string
} {
  if (value >= 1024) {
    return {
      balance: (value / 1024).toFixed(2),
      unit: "GB",
    }
  }
  return {
    balance: value.toFixed(2),
    unit,
  }
}

// ===== 工具：百分比/时间（和移动保持一致） =====
function clamp01(n: number): number {
  if (!isFinite(n)) return 0
  if (n < 0) return 0
  if (n > 1) return 1
  return n
}

function percentText(ratio: number): string {
  return (clamp01(ratio) * 100).toFixed(2)
}

function nowHHMM(): string {
  const d = new Date()
  const hh = String(d.getHours()).padStart(2, "0")
  const mm = String(d.getMinutes()).padStart(2, "0")
  return `${hh}:${mm}`
}

// ================= UI 样式：对齐中国移动版本 =================

// 外层白色卡片
const outerCardBg: DynamicShapeStyle = {
  light: "rgba(255,255,255,0.98)",
  dark: "rgba(0,0,0,0.80)",
}

// 每格浅色背景 + 主题色
const ringCardThemes = {
  fee: {
    tint: { light: "#0080CB", dark: "#66adff" } as DynamicShapeStyle,
    icon: "bolt.horizontal.circle.fill",
    bg: {
      light: "rgba(0,128,203,0.06)",
      dark: "rgba(5, 16, 32, 0.96)",
    } as DynamicShapeStyle,
  },
  flow: {
    tint: { light: "#32CD32", dark: "#63e08f" } as DynamicShapeStyle,
    icon: "antenna.radiowaves.left.and.right",
    bg: {
      light: "rgba(50,205,50,0.08)",
      dark: "rgba(4, 18, 8, 0.96)",
    } as DynamicShapeStyle,
  },
  otherFlow: {
    tint: { light: "#8A6EFF", dark: "#c59bff" } as DynamicShapeStyle,
    icon: "wifi",
    bg: {
      light: "rgba(138,110,255,0.10)",
      dark: "rgba(8, 6, 24, 0.96)",
    } as DynamicShapeStyle,
  },
  voice: {
    tint: { light: "#F86527", dark: "#ffb07a" } as DynamicShapeStyle,
    icon: "phone.badge.waveform.fill",
    bg: {
      light: "rgba(248,101,39,0.10)",
      dark: "rgba(20, 10, 4, 0.96)",
    } as DynamicShapeStyle,
  },
}

// 文字颜色
const labelStyle: DynamicShapeStyle = {
  light: "rgba(0, 0, 0, 0.55)",
  dark: "rgba(255,255,255,0.65)",
}

const valueStyle: DynamicShapeStyle = {
  light: "rgba(0, 0, 0, 0.92)",
  dark: "rgba(255,255,255,0.96)",
}

// 更新时间颜色
const timeStyle: DynamicShapeStyle = {
  light: "rgba(0, 0, 0, 0.55)",
  dark: "rgba(255,255,255,0.65)",
}

// 左侧话费块（和移动 FeeCard 同版，只是 logo 换成联通）
function FeeCard({
  title,
  valueText,
  theme,
  logoPath,
  updateTime,
}: {
  title: string
  valueText: string
  theme: typeof ringCardThemes.fee
  logoPath?: string | null
  updateTime: string
}) {
  const isUrlLogo =
    !!logoPath && (logoPath.startsWith("http://") || logoPath.startsWith("https://"))

  const LogoImage = ({ size }: { size: number }) =>
    logoPath ? (
      isUrlLogo ? (
        <Image imageUrl={logoPath} resizable frame={{ width: size, height: size }} />
      ) : (
        <Image filePath={logoPath} resizable frame={{ width: size, height: size }} />
      )
    ) : (
      <Image
        systemName={theme.icon}
        font={size}
        fontWeight="semibold"
        foregroundStyle={theme.tint}
      />
    )

  return (
    <VStack
      alignment="center"
      padding={{ top: 10, leading: 10, bottom: 10, trailing: 10 }}
      frame={{ minWidth: 0, maxWidth: Infinity }}
      widgetBackground={{
        style: theme.bg,
        shape: { type: "rect", cornerRadius: 18, style: "continuous" },
      }}
    >
      {/* 顶部 logo */}
      <Spacer minLength={2} />
      <HStack alignment="center">
        <Spacer />
        <LogoImage size={40} />
        <Spacer />
      </HStack>

      {/* 更新时间：保证不换行 */}
      <Spacer minLength={4} />
      <HStack alignment="center" spacing={3}>
        <Spacer />
        <Image
          systemName="arrow.triangle.2.circlepath"
          font={5}
          foregroundStyle={timeStyle}
        />
        <Text
          font={11}
          foregroundStyle={timeStyle}
          lineLimit={1}
          minScaleFactor={0.5}
        >
          {updateTime}
        </Text>
        <Spacer />
      </HStack>

      {/* 数值 + 标题 */}
      <Spacer minLength={6} />
      <Text
        font={15}
        fontWeight="semibold"
        foregroundStyle={theme.tint}
        lineLimit={1}
        minScaleFactor={0.7}
      >
        {valueText}
      </Text>
      <Spacer minLength={2} />
      <Text
        font={10}
        fontWeight="semibold"
        foregroundStyle={theme.tint}
        lineLimit={1}
        minScaleFactor={0.7}
      >
        {title}
      </Text>
      <Spacer minLength={4} />
    </VStack>
  )
}

// 圆环卡（和移动 RingStatCard 同版）
function RingStatCard({
  title,
  valueText,
  theme,
  ratio,
}: {
  title: string
  valueText: string
  theme: typeof ringCardThemes.flow
  ratio?: number
}) {
  const r = clamp01(ratio ?? 0)

  return (
    <VStack
      alignment="center"
      padding={{ top: 10, leading: 8, bottom: 10, trailing: 8 }}
      frame={{ minWidth: 0, maxWidth: Infinity }}
      widgetBackground={{
        style: theme.bg,
        shape: { type: "rect", cornerRadius: 18, style: "continuous" },
      }}
    >
      <Spacer minLength={2} />
      <ZStack frame={{ width: 56, height: 56 }}>
        <Gauge
          value={r}
          min={0}
          max={1}
          label={<Text font={1}> </Text>}
          currentValueLabel={<Text font={1}> </Text>}
          gaugeStyle="accessoryCircularCapacity"
          tint={theme.tint}
        />
        <VStack alignment="center">
          <Spacer minLength={4} />
          <Image
            systemName={theme.icon}
            font={12}
            fontWeight="semibold"
            foregroundStyle={theme.tint}
          />
          <Spacer minLength={2} />
          <Text font={11} fontWeight="semibold" foregroundStyle={theme.tint}>
            {percentText(r)}
          </Text>
          <Text font={9} foregroundStyle={timeStyle}>
            %
          </Text>
          <Spacer minLength={4} />
        </VStack>
      </ZStack>

      {/* 数值 + 标题 */}
      <Spacer minLength={6} />
      <Text
        font={15}
        fontWeight="semibold"
        foregroundStyle={theme.tint}
        lineLimit={1}
        minScaleFactor={0.7}
      >
        {valueText}
      </Text>
      <Spacer minLength={2} />
      <Text
        font={10}
        fontWeight="semibold"
        foregroundStyle={theme.tint}
        lineLimit={1}
        minScaleFactor={0.7}
      >
        {title}
      </Text>
      <Spacer minLength={4} />
    </VStack>
  )
}

// 主视图
function WidgetView({ data }: { data: UnicomData }) {
  const logoPath = UNICOM_LOGO_URL

  // ==== 计算百分比：remain / total ====
  const voiceTotal =
    typeof data.voice.total === "number"
      ? data.voice.total
      : parseFloat(String(data.voice.total ?? "0"))
  const voiceRemain = parseFloat(String(data.voice.balance ?? "0"))
  const voiceRatio = voiceTotal > 0 ? voiceRemain / voiceTotal : 0

  const flowTotal =
    typeof data.flow.total === "number"
      ? data.flow.total
      : parseFloat(String(data.flow.total ?? "0"))
  const flowRemain = parseFloat(String(data.flow.balance ?? "0"))
  const flowRatio = flowTotal > 0 ? flowRemain / flowTotal : 0

  // 👉 没有 otherFlow 也补一格 0 定向流量
  const other = data.otherFlow ?? {
    title: "定向流量",
    balance: "0",
    unit: "MB",
    used: 0,
    total: 0,
  }

  const otherTotal =
    typeof other.total === "number"
      ? other.total
      : parseFloat(String(other.total ?? "0"))
  const otherRemain = parseFloat(String(other.balance ?? "0"))
  const otherRatio = otherTotal > 0 ? otherRemain / otherTotal : 0

  // ==== 小号组件：跟移动一样，只展示话费卡 ====
  if (Widget.family === "systemSmall") {
    return (
      <VStack
        alignment="center"
        padding={{ top: 8, leading: 8, bottom: 8, trailing: 8 }}
      >
        <FeeCard
          title={data.fee.title}
          valueText={`${data.fee.balance}${data.fee.unit}`}
          theme={ringCardThemes.fee}
          logoPath={logoPath}
          updateTime={data.updateTime}
        />
      </VStack>
    )
  }

  // ==== 中 / 大号组件：固定 4 列 ====
  return (
    <VStack
      alignment="center"
      padding={{ top: 10, leading: 10, bottom: 10, trailing: 10 }}
      widgetBackground={{
        style: outerCardBg,
        shape: { type: "rect", cornerRadius: 24, style: "continuous" },
      }}
    >
      <HStack alignment="center" spacing={10}>
        <FeeCard
          title={data.fee.title}
          valueText={`${data.fee.balance}${data.fee.unit}`}
          theme={ringCardThemes.fee}
          logoPath={logoPath}
          updateTime={data.updateTime}
        />

        <RingStatCard
          title={data.flow.title}
          valueText={`${data.flow.balance}${data.flow.unit}`}
          theme={ringCardThemes.flow}
          ratio={flowRatio}
        />

        <RingStatCard
          title={other.title}
          valueText={`${other.balance}${other.unit}`}
          theme={ringCardThemes.otherFlow}
          ratio={otherRatio}
        />

        <RingStatCard
          title={data.voice.title}
          valueText={`${data.voice.balance}${data.voice.unit}`}
          theme={ringCardThemes.voice}
          ratio={voiceRatio}
        />
      </HStack>
    </VStack>
  )
}

// ================= 主渲染入口 =================

async function render() {
  const settings = (Storage?.get?.(SETTINGS_KEY) ?? null) as ChinaUnicomSettings | null

  const refreshInterval = settings?.refreshInterval ?? 15
  const nextUpdate = new Date(Date.now() + refreshInterval * 60 * 1000)
  const reloadPolicy: WidgetReloadPolicy = {
    policy: "after",
    date: nextUpdate,
  }

  // 确定使用的 Cookie：如果开启了 BoxJs，优先从 BoxJs 读取
  let cookie = settings?.cookie || ""

  if (settings?.enableBoxJs && settings?.boxJsUrl) {
    const boxJsCookie = await fetchCookieFromBoxJs(settings.boxJsUrl)
    if (boxJsCookie) {
      cookie = boxJsCookie
      console.log("✅ 使用 BoxJs 中的 Cookie")
    } else {
      console.warn("⚠️ 从 BoxJs 读取 Cookie 失败，使用配置的 Cookie")
    }
  }

  if (!cookie) {
    Widget.present(
      <Text>请先在主应用中设置联通 Cookie，或配置 BoxJs 地址。</Text>,
      reloadPolicy
    )
    return
  }

  // 并行获取两个 API 数据
  const [feeData, detailData] = await Promise.all([
    fetchFeeData(cookie),
    fetchDetailData(cookie),
  ])

  if (!feeData || !detailData) {
    Widget.present(<Text>获取数据失败，请检查网络或 Cookie。</Text>, reloadPolicy)
    return
  }

  const voiceAndFlowData = extractVoiceAndFlowData(detailData)
  if (!voiceAndFlowData) {
    Widget.present(<Text>提取数据失败。</Text>, reloadPolicy)
    return
  }

  // 提取定向流量数据
  let otherFlowData:
    | { title: string; balance: string; unit: string; used?: number; total?: number }
    | undefined

  const showOtherFlow = settings?.showOtherFlow ?? true
  const matchType = settings?.otherFlowMatchType ?? "flowType"
  const matchValue = settings?.otherFlowMatchValue ?? "3"

  if (showOtherFlow && detailData) {
    let totalRemainMB = 0
    let totalUsedMB = 0

    // 方法1：flowSumList （默认为 flowtype=3 作为定向）
    if (matchType === "flowType" && matchValue === "3") {
      const item = detailData.flowSumList?.find((item) => item.flowtype === "3")
      if (item) {
        totalRemainMB = parseFloat(item.xcanusevalue || "0")
        totalUsedMB = parseFloat(item.xusedvalue || "0")
      }
    }

    // 方法2：从 fresSumList 获取
    if (totalRemainMB === 0 && matchType === "flowType") {
      const item = detailData.fresSumList?.find(
        (item) => item.flowtype === matchValue
      )
      if (item) {
        totalRemainMB = parseFloat(item.xcanusevalue || "0")
        totalUsedMB = parseFloat(item.xusedvalue || "0")
      }
    }

    // 方法3：从 resources 计算
    if (totalRemainMB === 0) {
      const unit = detailData.canuseFlowAllUnit || "MB"
      detailData.resources
        ?.find((r) => r.type === "Flow")
        ?.details?.forEach((detail: any) => {
          const match =
            matchType === "flowType"
              ? detail.flowType === matchValue
              : detail.addupItemCode === matchValue

          if (match && detail.remain) {
            const remain = parseFloat(detail.remain)
            const used = parseFloat(detail.use || "0")
            if (!isNaN(remain) && remain > 0) {
              if (unit === "MB") {
                totalRemainMB += remain
                totalUsedMB += used
              } else if (unit === "GB") {
                totalRemainMB += remain * 1024
                totalUsedMB += used * 1024
              }
            }
          }
        })
    }

    if (totalRemainMB > 0 || totalUsedMB > 0) {
      const formatted = formatFlowValue(totalRemainMB, "MB")
      const totalMB = totalRemainMB + totalUsedMB

      otherFlowData = {
        title: "定向流量",
        balance: formatted.balance,
        unit: formatted.unit,
        used: totalUsedMB,
        total: totalMB,
      }

      console.log(
        "🌐 定向流量:",
        `已用${formatFlowValue(totalUsedMB, "MB").balance}${formatFlowValue(totalUsedMB, "MB").unit} ` +
        `剩余${formatted.balance}${formatted.unit} ` +
        `总计${formatFlowValue(totalMB, "MB").balance}${formatFlowValue(totalMB, "MB").unit}`
      )
    }
  }

  const mergedData: UnicomData = {
    fee: feeData,
    voice: voiceAndFlowData.voice,
    flow: voiceAndFlowData.flow,
    otherFlow: otherFlowData,
    updateTime: nowHHMM(),
  }

  if (!settings) {
    Widget.present(
      <Text>请先在主应用中设置联通 Cookie，或配置 BoxJs 地址。</Text>,
      reloadPolicy
    )
    return
  }

  Widget.present(<WidgetView data={mergedData} />, reloadPolicy)
}

render()