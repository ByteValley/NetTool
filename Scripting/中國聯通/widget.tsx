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

/* 兼容声明：避免 TS 报 “找不到 Storage” */
declare const Storage: any

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
  otherFlowMatchType?: "flowType" | "addupItemCode"
  otherFlowMatchValue?: string
  enableBoxJs?: boolean
  boxJsUrl?: string
  // 统一控制圆环百分比：false=已用，true=剩余
  showRemainRatio?: boolean
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

// 组件数据结构
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
        root,
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
    console.log("📡 请求联通话费接口:", API_URL)
    const response = await fetch(API_URL, {
      headers: {
        Host: "m.client.10010.com",
        "User-Agent": "ChinaUnicom.x CFNetwork iOS/16.3 unicom{version:iphone_c@10.0100}",
        cookie: cookie,
      },
    })

    if (response.ok) {
      const data = await response.json()
      console.log("📦 话费接口返回 code:", data.code)

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
        console.warn("⚠️ 话费接口返回非成功状态:", data.code, data.msg || data.message)
      }
    } else {
      console.error("❌ 话费 HTTP 请求失败，状态码:", response.status)
    }
  } catch (error) {
    console.error("🚨 话费接口请求异常:", error)
  }
  return null
}

// 获取详细数据（从第二个 API）
async function fetchDetailData(cookie: string): Promise<DetailApiResponse | null> {
  try {
    console.log("📡 请求联通详细接口:", API_DETAIL_URL)
    const response = await fetch(API_DETAIL_URL, {
      headers: {
        Host: "m.client.10010.com",
        "User-Agent": "ChinaUnicom.x CFNetwork iOS/16.3 unicom{version:iphone_c@10.0100}",
        cookie: cookie,
      },
    })

    if (!response.ok) {
      console.error("❌ 详细接口 HTTP 请求失败，状态码:", response.status)
      return null
    }

    const data = (await response.json()) as DetailApiResponse
    console.log(
      "📦 详细接口返回 code:",
      data.code,
      "| flowSumList:",
      data.flowSumList?.length ?? 0,
      "| fresSumList:",
      data.fresSumList?.length ?? 0,
      "| resources:",
      data.resources?.length ?? 0,
    )

    const resourceTypes = (data.resources || []).map((r) => r.type)
    console.log("📑 resources.type 列表:", resourceTypes)

    if (data.code === "0000" || data.code === "Y") {
      return data
    } else {
      console.warn("⚠️ 详细接口返回非成功状态:", data.code)
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
    const voiceUnit = "分钟"

    // 通用流量：优先 flowSumList flowtype = "1"
    const generalFlow = detailData.flowSumList?.find((item) => item.flowtype === "1")
    let flowRemainMB = 0
    let flowUsedMB = 0

    if (generalFlow?.xcanusevalue) {
      console.log("📶 使用 flowSumList 作为通用流量，flowtype=1:", generalFlow)
      flowRemainMB = parseFloat(generalFlow.xcanusevalue)
      flowUsedMB = parseFloat(generalFlow.xusedvalue || "0")
    } else {
      // 兼容 resources
      const flowResource = detailData.resources?.find((r) => r.type === "Flow")
      console.log(
        "📶 fallback 使用 resources.Flow 作为通用流量，存在:",
        !!flowResource,
      )
      const remainStr = flowResource?.remainResource || "0"
      const usedStr = flowResource?.userResource || "0"
      const unit = detailData.canuseFlowAllUnit || "GB"
      console.log(
        "📶 resources.Flow remain / used / unit:",
        remainStr,
        usedStr,
        unit,
      )

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
      "📞 语音汇总:",
      `已用${voiceUsed}${voiceUnit} 剩余${voiceRemain}${voiceUnit} 总计${voiceTotal}${voiceUnit}`,
    )
    console.log(
      "📶 通用流量汇总:",
      `已用${formatFlowValue(flowUsedMB, "MB").balance}${formatFlowValue(flowUsedMB, "MB").unit} ` +
      `剩余${flowFormatted.balance}${flowFormatted.unit} ` +
      `总计${formatFlowValue(flowTotalMB, "MB").balance}${formatFlowValue(flowTotalMB, "MB").unit}`,
    )

    return result
  } catch (error) {
    console.error("❌ 提取语音/通用流量失败:", error)
    return null
  }
}

// 格式化流量值（自动转换单位）
function formatFlowValue(
  value: number,
  unit: string = "MB",
): {
  balance: string
  unit: string
} {
  if (!isFinite(value)) {
    return { balance: "0.00", unit }
  }
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

// ===== 工具：百分比/时间 =====
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

// 根据开关计算比例：true = 剩余 / total；false = 已用 / total
function calcRatio(total: number, remain: number, showRemainRatio: boolean): number {
  if (total <= 0) return 0

  const remainRatio = remain / total
  const usedRatio = (total - remain) / total

  const r = showRemainRatio ? remainRatio : usedRatio
  return clamp01(r)
}

// ================= 样式定义 =================

// 外层大卡底
const outerCardBg: DynamicShapeStyle = {
  light: "rgba(255,255,255,0.98)",
  dark: "rgba(0, 0, 0, 0.90)",
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
      dark: "rgba(3, 9, 28, 1.0)",
    } as DynamicShapeStyle,
  },
  flowDir: {
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
      dark: "rgba(13, 10, 34, 1.0)",
    } as DynamicShapeStyle,
  },
}

// 更新时间颜色
const timeStyle: DynamicShapeStyle = {
  light: "rgba(0, 0, 0, 0.55)",
  dark: "rgba(255,255,255,0.65)",
}

// 左侧话费块
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

      {/* 更新时间 */}
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

// 圆环卡
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
function WidgetView(props: { data: UnicomData; showRemainRatio: boolean }) {
  const { data, showRemainRatio } = props
  const logoPath = UNICOM_LOGO_URL

  // ===== 语音：全部用 used / total（分钟） =====
  const voiceTotal =
    typeof data.voice.total === "number"
      ? data.voice.total
      : parseFloat(String(data.voice.total ?? "0"))
  const voiceUsed =
    typeof data.voice.used === "number"
      ? data.voice.used
      : 0
  const voiceRemain = Math.max(voiceTotal - voiceUsed, 0)

  const voiceRatio = calcRatio(voiceTotal, voiceRemain, showRemainRatio)

  const voiceRemainText = `${voiceRemain.toFixed(0)}${data.voice.unit}`
  const voiceUsedText = `${Number.isFinite(voiceUsed) ? voiceUsed.toFixed(0) : 0}${data.voice.unit
    }`
  const voiceValueText = showRemainRatio ? voiceRemainText : voiceUsedText
  const voiceTitle = showRemainRatio ? "剩余语音" : "已用语音"

  // ===== 通用流量：used / total 均为 MB，显示时再格式化 =====
  const flowTotal =
    typeof data.flow.total === "number"
      ? data.flow.total
      : parseFloat(String(data.flow.total ?? "0"))
  const flowUsed =
    typeof data.flow.used === "number"
      ? data.flow.used
      : 0
  const flowRemain = Math.max(flowTotal - flowUsed, 0)

  const flowRatio = calcRatio(flowTotal, flowRemain, showRemainRatio)

  const flowRemainFormatted = formatFlowValue(flowRemain, "MB")
  const flowUsedFormatted = formatFlowValue(flowUsed, "MB")

  const flowRemainText = `${flowRemainFormatted.balance}${flowRemainFormatted.unit}`
  const flowUsedText = `${flowUsedFormatted.balance}${flowUsedFormatted.unit}`
  const flowValueText = showRemainRatio ? flowRemainText : flowUsedText
  const flowTitle = showRemainRatio ? "通用流量" : "已用通用流量"

  // ===== 定向流量（无则补 0），同样只用 MB 数值 =====
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
  const otherUsed =
    typeof other.used === "number"
      ? other.used
      : 0
  const otherRemain = Math.max(otherTotal - otherUsed, 0)

  const otherRatio = calcRatio(otherTotal, otherRemain, showRemainRatio)

  const otherRemainFormatted = formatFlowValue(otherRemain, "MB")
  const otherUsedFormatted = formatFlowValue(otherUsed, "MB")

  const otherRemainText = `${otherRemainFormatted.balance}${otherRemainFormatted.unit}`
  const otherUsedText = `${otherUsedFormatted.balance}${otherUsedFormatted.unit}`
  const otherValueText = showRemainRatio ? otherRemainText : otherUsedText
  const otherTitle = showRemainRatio ? "定向流量" : "已用定向流量"

  // 小号组件：只展示话费卡
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

  // 中 / 大号组件：四格
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
          title={flowTitle}
          valueText={flowValueText}
          theme={ringCardThemes.flow}
          ratio={flowRatio}
        />

        <RingStatCard
          title={otherTitle}
          valueText={otherValueText}
          theme={ringCardThemes.flowDir}
          ratio={otherRatio}
        />

        <RingStatCard
          title={voiceTitle}
          valueText={voiceValueText}
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

  const showRemainRatio = !!settings?.showRemainRatio
  const matchType = settings?.otherFlowMatchType ?? "flowType"
  const matchValue = settings?.otherFlowMatchValue ?? "3"
  const enableBoxJs = !!settings?.enableBoxJs
  const boxJsUrl = settings?.boxJsUrl || ""

  console.log(
    "⚙️ 当前设置:",
    JSON.stringify(
      {
        refreshInterval,
        matchType,
        matchValue,
        showRemainRatio,
        enableBoxJs,
        boxJsUrl,
      },
      null,
      2,
    ),
  )

  if (enableBoxJs && boxJsUrl) {
    const boxJsCookie = await fetchCookieFromBoxJs(boxJsUrl)
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
      reloadPolicy,
    )
    return
  }

  console.log("📡 请求联通话费接口:", API_URL)
  console.log("📡 请求联通详细接口:", API_DETAIL_URL)

  // 并行获取两个 API 数据
  const [feeData, detailData] = await Promise.all([
    fetchFeeData(cookie),
    fetchDetailData(cookie),
  ])

  if (!feeData || !detailData) {
    console.error("❌ feeData 或 detailData 为空:", {
      hasFeeData: !!feeData,
      hasDetailData: !!detailData,
    })
    Widget.present(<Text>获取数据失败，请检查网络或 Cookie。</Text>, reloadPolicy)
    return
  }

  console.log(
    "📦 详细接口返回 code:",
    detailData.code,
    "| flowSumList:",
    detailData.flowSumList?.length ?? 0,
    "| fresSumList:",
    detailData.fresSumList?.length ?? 0,
    "| resources:",
    detailData.resources?.length ?? 0,
  )

  console.log(
    "📑 resources.type 列表:",
    JSON.stringify(
      (detailData.resources ?? []).map((r) => r.type),
      null,
      2,
    ),
  )

  const voiceAndFlowData = extractVoiceAndFlowData(detailData)
  if (!voiceAndFlowData) {
    Widget.present(<Text>提取数据失败。</Text>, reloadPolicy)
    return
  }

  // ======== 定向 / 专属流量提取（统一视作 MB 累加） ========
  let otherFlowData:
    | { title: string; balance: string; unit: string; used?: number; total?: number }
    | undefined

  console.log("🔍 开始计算定向/专属流量, matchType:", matchType, "matchValue:", matchValue)

  if (detailData.flowSumList && detailData.flowSumList.length > 0) {
    console.log("📊 flowSumList 原始数据:", JSON.stringify(detailData.flowSumList, null, 2))
  } else {
    console.log("📭 flowSumList 为空")
  }

  if (detailData.fresSumList && detailData.fresSumList.length > 0) {
    console.log("📊 fresSumList 原始数据:", JSON.stringify(detailData.fresSumList, null, 2))
  } else {
    console.log("📭 fresSumList 为空")
  }

  const flowRes = detailData.resources?.find(
    (r) => String(r.type).toLowerCase() === "flow",
  )

  if (flowRes?.details && flowRes.details.length > 0) {
    console.log(`📋 Flow.details 共 ${flowRes.details.length} 条，逐条打印关键信息:`)
    for (const d of flowRes.details) {
      console.log(
        "🔹 detail 条目:",
        JSON.stringify(
          {
            flowType: d.flowType,
            addupItemCode: d.addupItemCode,
            remain: d.remain,
            use: d.use,
            total: d.total,
            addUpItemName: d.addUpItemName,
            feePolicyName: d.feePolicyName,
          },
          null,
          2,
        ),
      )
    }
  } else {
    console.warn("⚠️ Flow.details 为空或不存在，可能无按明细拆分的流量包")
  }

  // 统一用 “MB 数值” 来累加：detail 中的 remain / use / xcanusevalue / xusedvalue 都当成 MB
  let totalRemainMB = 0
  let totalUsedMB = 0

  // 方法1：flowSumList 精确按 flowType=matchValue（默认 3）匹配
  if (matchType === "flowType") {
    const item = detailData.flowSumList?.find(
      (item) => String(item.flowtype) === String(matchValue),
    )
    console.log(`🔎 flowSumList 查找 flowtype=${matchValue}, 命中:`, !!item)
    if (item) {
      totalRemainMB = parseFloat(item.xcanusevalue || "0")
      totalUsedMB = parseFloat(item.xusedvalue || "0")
    }
  }

  // 方法2：fresSumList 再按 flowType 兜一遍
  if (totalRemainMB === 0 && totalUsedMB === 0 && matchType === "flowType") {
    const item = detailData.fresSumList?.find(
      (item) => String(item.flowtype) === String(matchValue),
    )
    console.log(`🔎 fresSumList 查找 flowtype=${matchValue} 命中:`, !!item)
    if (item) {
      totalRemainMB = parseFloat(item.xcanusevalue || "0")
      totalUsedMB = parseFloat(item.xusedvalue || "0")
    }
  }

  // 方法3：从 resources.Flow.details 精确匹配（支持 flowType / addupItemCode）
  if (totalRemainMB === 0 && totalUsedMB === 0 && flowRes?.details?.length) {
    console.log("🔎 resources.Flow.details 精确匹配定向流量 (按 matchType/matchValue)")

    for (const detail of flowRes.details as any[]) {
      const isMatch =
        matchType === "flowType"
          ? String(detail.flowType) === String(matchValue)
          : String(detail.addupItemCode) === String(matchValue)

      if (!isMatch) continue

      const remain = parseFloat(detail.remain || "0")
      const used = parseFloat(detail.use || "0")

      console.log(
        "   ✅ 命中条目:",
        JSON.stringify(
          {
            flowType: detail.flowType,
            addupItemCode: detail.addupItemCode,
            remain: detail.remain,
            use: detail.use,
            addUpItemName: detail.addUpItemName,
            feePolicyName: detail.feePolicyName,
          },
          null,
          2,
        ),
      )

      if (!isNaN(remain) || !isNaN(used)) {
        // ⚠️ 这里统一按 “值是 MB” 来累加
        if (!isNaN(remain)) totalRemainMB += remain
        if (!isNaN(used)) totalUsedMB += used
      }
    }
  }

  // 方法4（兜底）：如果还没匹配到，就把 flowType != "1" 的全部视为“定向/专属”
  if (totalRemainMB === 0 && totalUsedMB === 0 && flowRes?.details?.length) {
    console.warn(
      "⚠️ 未找到匹配的定向/专属流量（按 matchType/matchValue），开始兜底汇总 flowType != '1' 的所有条目为定向/专属",
    )

    for (const detail of flowRes.details as any[]) {
      const ft = String(detail.flowType ?? "")
      if (ft === "1") continue // 跳过通用流量

      const remain = parseFloat(detail.remain || "0")
      const used = parseFloat(detail.use || "0")

      console.log(
        "   🔁 兜底纳入条目:",
        JSON.stringify(
          {
            flowType: detail.flowType,
            addupItemCode: detail.addupItemCode,
            remain: detail.remain,
            use: detail.use,
            addUpItemName: detail.addUpItemName,
            feePolicyName: detail.feePolicyName,
          },
          null,
          2,
        ),
      )

      if (!isNaN(remain) || !isNaN(used)) {
        // 同样按 MB 累加
        if (!isNaN(remain)) totalRemainMB += remain
        if (!isNaN(used)) totalUsedMB += used
      }
    }
  }

  if (totalRemainMB > 0 || totalUsedMB > 0) {
    const remainFormatted = formatFlowValue(totalRemainMB, "MB")
    const usedFormatted = formatFlowValue(totalUsedMB, "MB")
    const totalMB = totalRemainMB + totalUsedMB
    const totalFormatted = formatFlowValue(totalMB, "MB")

    otherFlowData = {
      title: "定向流量",
      balance: remainFormatted.balance,
      unit: remainFormatted.unit,
      used: totalUsedMB, // 内部仍使用 MB 参与比例计算
      total: totalMB,
    }

    console.log(
      "🌐 定向/专属流量:",
      `已用${usedFormatted.balance}${usedFormatted.unit} ` +
      `剩余${remainFormatted.balance}${remainFormatted.unit} ` +
      `总计${totalFormatted.balance}${totalFormatted.unit}`,
    )
  } else {
    console.warn(
      "⚠️ 兜底后仍未统计到任何定向/专属流量，totalRemainMB / totalUsedMB =",
      totalRemainMB,
      totalUsedMB,
    )
  }

  const mergedData: UnicomData = {
    fee: feeData,
    voice: voiceAndFlowData.voice,
    flow: voiceAndFlowData.flow,
    otherFlow: otherFlowData,
    updateTime: nowHHMM(),
  }

  Widget.present(
    <WidgetView data={mergedData} showRemainRatio={showRemainRatio} />,
    reloadPolicy,
  )
}

render()