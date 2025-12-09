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
  Gauge,
  fetch,
} from "scripting"
import type { ChinaTelecomSettings } from "./telecomApi"
import { getSettings, queryImportantData } from "./telecomApi"

/* 兼容声明：避免 TS 报 “找不到 Storage / FileManager” */
declare const Storage: any
declare const FileManager: any

const LOGO_URL =
  "https://raw.githubusercontent.com/Nanako718/Scripting/refs/heads/main/images/10000.png"
const LOGO_CACHE_KEY = "chinaTelecom_logo_path"

// 下载并缓存 Logo 图片
async function getLogoPath(): Promise<string | null> {
  try {
    const cachedPath = Storage?.get?.(LOGO_CACHE_KEY)
    if (cachedPath) {
      try {
        if (FileManager?.existsSync?.(cachedPath)) return cachedPath
        if (FileManager?.fileExists?.(cachedPath)) return cachedPath
      } catch {
        // ignore
      }
    }

    const response = await fetch(LOGO_URL)
    if (!response.ok) {
      console.error("下载 Logo 失败:", response.status)
      return null
    }

    const imageData = await response.arrayBuffer()
    const fileName = "chinaTelecom_logo.png"
    const tempDir = FileManager?.temporaryDirectory
    if (!tempDir) return null

    const filePath = `${tempDir}/${fileName}`
    const uint8Array = new Uint8Array(imageData)
    FileManager?.writeAsBytesSync?.(filePath, uint8Array)
    Storage?.set?.(LOGO_CACHE_KEY, filePath)

    return filePath
  } catch (error) {
    console.error("获取 Logo 失败:", error)
    return null
  }
}

// 组件数据结构
type TelecomData = {
  fee: {
    title: string
    balance: string
    unit: string
    remain?: number
    realTimeFee?: number
    hasArrear?: boolean
  }
  voice: {
    title: string
    balance: string
    unit: string
    used?: number
    total?: number
  }
  flow: {
    title: string
    balance: string
    unit: string
    used?: number
    total?: number
  }
  otherFlow?: {
    title: string
    balance: string
    unit: string
    used?: number
    total?: number
  }
}

// 格式化流量值（自动 MB→GB）
function formatFlowValue(value: number): { balance: string; unit: string } {
  if (value > 1024) {
    return {
      balance: (value / 1024).toFixed(2),
      unit: "GB",
    }
  }
  return {
    balance: value.toFixed(2),
    unit: "MB",
  }
}

function safeNum(v: unknown, fallback = 0): number {
  const n = typeof v === "number" ? v : parseFloat(String(v ?? ""))
  return Number.isFinite(n) ? n : fallback
}

function clamp01(n: number): number {
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

// 根据开关计算比例：true=剩余 / total；false=已用 / total
function calcRatio(total: number, remain: number, showRemainRatio: boolean): number {
  if (total <= 0) return 0
  const used = Math.max(0, Math.min(total, total - remain))
  const remainSafe = Math.max(0, Math.min(total, remain))
  return showRemainRatio ? remainSafe / total : used / total
}

// ================= 样式定义 =================

// 外层大卡底
const outerCardBg: DynamicShapeStyle = {
  light: "rgba(255,255,255,0.98)",
  dark: "rgba(0, 0, 0, 0.90)",
}

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

type RingCardTheme = (typeof ringCardThemes)[keyof typeof ringCardThemes]

const timeStyle: DynamicShapeStyle = {
  light: "rgba(0, 0, 0, 0.55)",
  dark: "rgba(255,255,255,0.65)",
}

// ================= UI 组件 =================

// 左侧话费块
function FeeCard(props: {
  title: string
  valueText: string
  theme: RingCardTheme
  logoPath?: string | null
  updateTime: string
}) {
  const { title, valueText, theme, logoPath, updateTime } = props

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
          font={4}
          foregroundStyle={timeStyle}
        />
        <Text font={11} foregroundStyle={timeStyle} lineLimit={1} minScaleFactor={0.5}>
          {updateTime}
        </Text>
        <Spacer />
      </HStack>

      {/* 大数字 */}
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

      {/* 标题 */}
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
function RingStatCard(props: {
  title: string
  valueText: string
  theme: RingCardTheme
  ratio?: number
}) {
  const { title, valueText, theme, ratio } = props
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

// ================= 将 API 响应转换为 TelecomData =================

function convertToTelecomData(apiData: any): TelecomData {
  console.log("📦 [Telecom] 原始 apiData =", JSON.stringify(apiData))

  const responseData = apiData.responseData?.data
  if (!responseData) {
    console.error("❌ [Telecom] API 响应数据格式不正确，无 responseData.data")
    throw new Error("API 响应数据格式不正确")
  }

  // ========== 话费 ==========
  const balanceInfo = responseData.balanceInfo
  const indexBalanceDataInfo = balanceInfo?.indexBalanceDataInfo
  const phoneBillRegion = balanceInfo?.phoneBillRegion

  const rawBalance = safeNum(indexBalanceDataInfo?.balance)
  const arrear = safeNum(indexBalanceDataInfo?.arrear)

  // 计算“剩余”侧：有欠费则账户余额，没有则剩余话费
  let remainFee = rawBalance
  if (arrear > 0) {
    remainFee = rawBalance - arrear
  }

  // 实时费用（如果有）
  let realTimeFee = 0
  if (phoneBillRegion?.subTitleHh) {
    realTimeFee = safeNum(
      (phoneBillRegion.subTitleHh as string)?.replace("元", ""),
    )
  }

  console.log(
    "💰 [Telecom] 话费 balanceInfo =",
    JSON.stringify(balanceInfo),
    "rawBalance =",
    rawBalance,
    "arrear =",
    arrear,
    "remainFee =",
    remainFee,
    "realTimeFee =",
    realTimeFee,
  )

  // 默认仍按“剩余侧”展示，具体显示逻辑放到 WidgetView 里按开关切
  let feeTitle = arrear > 0 ? "账户余额" : "剩余话费"
  let feeValueNumber = remainFee

  // 如果剩余为 0 但实时费用 > 0，就默认用实时费用兜底
  if (remainFee === 0 && realTimeFee > 0) {
    feeTitle = "实时费用"
    feeValueNumber = realTimeFee
  }

  const feeData: TelecomData["fee"] = {
    title: feeTitle,
    balance: feeValueNumber.toFixed(2),
    unit: "元",
    remain: remainFee,
    realTimeFee: realTimeFee > 0 ? realTimeFee : undefined,
    hasArrear: arrear > 0,
  }

  // ========== 语音 ==========
  const voiceInfo = responseData.voiceInfo
  const voiceDataInfo = voiceInfo?.voiceDataInfo

  console.log("📞 [Telecom] voiceInfo =", JSON.stringify(voiceInfo))

  const voiceBalance = safeNum(voiceDataInfo?.balance)
  const voiceUsed = safeNum(voiceDataInfo?.used)
  const voiceTotalRaw = safeNum(voiceDataInfo?.total)
  const voiceTotal = voiceTotalRaw > 0 ? voiceTotalRaw : voiceUsed + voiceBalance

  console.log(
    "📞 [Telecom] 语音解析: balance=",
    voiceBalance,
    "used=",
    voiceUsed,
    "totalRaw=",
    voiceTotalRaw,
    "finalTotal=",
    voiceTotal
  )

  const voiceData: TelecomData["voice"] = {
    title: "剩余语音",
    balance: voiceBalance.toFixed(0),
    unit: "分钟",
    used: voiceUsed,
    total: voiceTotal,
  }

  // ========== 流量（通用 + 其他） ==========
  const flowInfo = responseData.flowInfo || {}
  console.log("📶 [Telecom] flowInfo =", JSON.stringify(flowInfo))

  const commonFlow = flowInfo.commonFlow
  const specialAmount = flowInfo.specialAmount
  const flowList: any[] = flowInfo.flowList || []

  let commonRemainKB = safeNum(commonFlow?.balance)
  let commonUsedKB = safeNum(commonFlow?.used)
  let specialRemainKB = safeNum(specialAmount?.balance)
  let specialUsedKB = safeNum(specialAmount?.used)

  const hasCommonFromBytes = commonRemainKB > 0 || commonUsedKB > 0
  const hasSpecialFromBytes = specialRemainKB > 0 || specialUsedKB > 0

  console.log(
    "📶 [Telecom] 使用 commonFlow（KB） => remainKB =",
    commonRemainKB,
    "usedKB =",
    commonUsedKB
  )
  console.log(
    "🌐 [Telecom] 使用 specialAmount（KB） => remainKB =",
    specialRemainKB,
    "usedKB =",
    specialUsedKB
  )

  let commonRemainMB = commonRemainKB / 1024
  let commonUsedMB = commonUsedKB / 1024
  let specialRemainMB = specialRemainKB / 1024
  let specialUsedMB = specialUsedKB / 1024

  console.log(
    "📶 [Telecom] 初始通用流量 MB: remainMB=",
    commonRemainMB,
    "usedMB=",
    commonUsedMB
  )
  console.log(
    "🌐 [Telecom] 初始定向流量 MB: remainMB=",
    specialRemainMB,
    "usedMB=",
    specialUsedMB
  )

  function parseFlowStrToMB(str?: string | null): number {
    if (!str) return 0
    const s = String(str).trim()
    if (!s) return 0

    const num = parseFloat(s)
    if (!Number.isFinite(num)) return 0

    if (/gb/i.test(s)) return num * 1024
    if (/mb/i.test(s)) return num
    if (/kb/i.test(s)) return num / 1024
    return num
  }

  const COMMON_KEYWORDS = ["通用", "全国", "国内"]
  const SPECIAL_KEYWORDS = ["专用", "定向", "专属"]

  if (Array.isArray(flowList) && flowList.length > 0) {
    console.log(
      "📶 [Telecom] 尝试从 flowList 兜底修正通用/定向流量，共",
      flowList.length,
      "条"
    )

    for (const item of flowList) {
      const title: string = String(item.title || "")
      const usedStr: string = String(item.leftTitleHh || "")
      const remainStr: string = String(item.rightTitleHh || "")

      const usedMB = parseFlowStrToMB(usedStr)
      const remainMB = parseFlowStrToMB(remainStr)

      if (usedMB <= 0 && remainMB <= 0) continue

      const isCommonTitle = COMMON_KEYWORDS.some((k) => title.includes(k))
      const isSpecialTitle = SPECIAL_KEYWORDS.some((k) => title.includes(k))

      console.log(
        "📶 [Telecom] flowList item:",
        title,
        "used=",
        usedStr,
        "->",
        usedMB,
        "MB; remain=",
        remainStr,
        "->",
        remainMB,
        "MB"
      )

      if (isCommonTitle && hasCommonFromBytes) continue
      if (isSpecialTitle && hasSpecialFromBytes) continue

      if (isCommonTitle && !hasCommonFromBytes) {
        commonUsedMB += usedMB
        commonRemainMB += remainMB
      } else {
        specialUsedMB += usedMB
        specialRemainMB += remainMB
      }
    }
  }

  if (
    commonRemainMB === 0 &&
    commonUsedMB === 0 &&
    (specialRemainMB > 0 || specialUsedMB > 0)
  ) {
    // 兜底：只有定向流量时，把它当通用
    commonRemainMB = specialRemainMB
    commonUsedMB = specialUsedMB
    specialRemainMB = 0
    specialUsedMB = 0
  }

  const commonTotalMB = commonRemainMB + commonUsedMB
  const specialTotalMB = specialRemainMB + specialUsedMB

  console.log(
    "📶 [Telecom] 最终通用流量 MB: remainMB=",
    commonRemainMB,
    "usedMB=",
    commonUsedMB,
    "totalMB=",
    commonTotalMB
  )
  console.log(
    "🌐 [Telecom] 最终定向流量 MB: remainMB=",
    specialRemainMB,
    "usedMB=",
    specialUsedMB,
    "totalMB=",
    specialTotalMB
  )

  const flowRemainFormatted = formatFlowValue(commonRemainMB)
  const flowData_converted: TelecomData["flow"] = {
    title: "通用流量",
    balance: flowRemainFormatted.balance,
    unit: flowRemainFormatted.unit,
    used: commonUsedMB,
    total: commonTotalMB,
  }

  let otherFlowData: TelecomData["otherFlow"]

  if (specialRemainMB > 0 || specialUsedMB > 0) {
    const otherRemainFormatted = formatFlowValue(specialRemainMB)
    otherFlowData = {
      title: "定向流量",
      balance: otherRemainFormatted.balance,
      unit: otherRemainFormatted.unit,
      used: specialUsedMB,
      total: specialTotalMB,
    }
  } else {
    console.log("🌐 [Telecom] 最终定向流量为空，不单独展示")
  }

  const result: TelecomData = {
    fee: feeData,
    voice: voiceData,
    flow: flowData_converted,
    otherFlow: otherFlowData,
  }

  console.log("✅ [Telecom] 最终 TelecomData =", JSON.stringify(result))
  return result
}

// ================= 主视图 =================

function WidgetView(props: {
  data: TelecomData
  logoPath?: string | null
  showRemainRatio: boolean
}) {
  const { data, logoPath, showRemainRatio } = props
  const updateTime = nowHHMM()

  // ===== 话费：按开关决定显示剩余还是实时费用 =====
  const feeRemain = safeNum(
    data.fee.remain ?? data.fee.balance, // 兼容旧数据
  )
  const feeRealtime = data.fee.realTimeFee != null
    ? safeNum(data.fee.realTimeFee)
    : feeRemain
  const feeHasArrear = !!data.fee.hasArrear

  // showRemainRatio = true  显示“剩余话费 / 账户余额”
  // showRemainRatio = false 显示“实时费用”（如果有），否则仍回落到剩余侧
  const feeTitle = showRemainRatio
    ? feeHasArrear
      ? "账户余额"
      : "剩余话费"
    : data.fee.realTimeFee != null
      ? "实时费用"
      : feeHasArrear
        ? "账户余额"
        : "剩余话费"

  const feeNumber = showRemainRatio ? feeRemain : feeRealtime
  const feeValueText = `${feeNumber.toFixed(2)}${data.fee.unit}`

  // ===== 语音：用 used/total 算，显示已用或剩余分钟 =====
  const voiceTotal = safeNum(data.voice.total)
  const voiceUsed = safeNum(data.voice.used)
  const voiceRemain = Math.max(0, voiceTotal - voiceUsed)
  const voiceRatio = calcRatio(voiceTotal, voiceRemain, showRemainRatio)
  const voiceDisplay = showRemainRatio ? voiceRemain : voiceUsed
  const voiceTitle = showRemainRatio ? "剩余语音" : "已用语音"

  // ===== 通用流量：用 MB 数值算比例，再格式化展示 =====
  const flowTotalMB = safeNum(data.flow.total)
  const flowUsedMB = safeNum(data.flow.used)
  const flowRemainMB = Math.max(0, flowTotalMB - flowUsedMB)
  const flowRatio = calcRatio(flowTotalMB, flowRemainMB, showRemainRatio)
  const flowDisplayMB = showRemainRatio ? flowRemainMB : flowUsedMB
  const flowDisplayFormatted = formatFlowValue(flowDisplayMB)
  const flowTitle = showRemainRatio ? "通用流量" : "已用通用流量"

  // ===== 定向流量：同上 =====
  const otherRaw = data.otherFlow ?? {
    title: "定向流量",
    balance: "0",
    unit: "MB",
    used: 0,
    total: 0,
  }
  const otherTotalMB = safeNum(otherRaw.total)
  const otherUsedMB = safeNum(otherRaw.used)
  const otherRemainMB = Math.max(0, otherTotalMB - otherUsedMB)
  const otherRatio = calcRatio(otherTotalMB, otherRemainMB, showRemainRatio)
  const otherDisplayMB = showRemainRatio ? otherRemainMB : otherUsedMB
  const otherDisplayFormatted = formatFlowValue(otherDisplayMB)
  const otherTitle = showRemainRatio ? "定向流量" : "已用定向流量"

  // 小号组件
  if (Widget.family === "systemSmall") {
    return (
      <VStack
        alignment="center"
        padding={{ top: 8, leading: 8, bottom: 8, trailing: 8 }}
      >
        <FeeCard
          title={feeTitle}
          valueText={feeValueText}
          theme={ringCardThemes.fee}
          logoPath={logoPath}
          updateTime={updateTime}
        />
      </VStack>
    )
  }

  // 中 / 大号组件：四格样式
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
          title={feeTitle}
          valueText={feeValueText}
          theme={ringCardThemes.fee}
          logoPath={logoPath}
          updateTime={updateTime}
        />

        <RingStatCard
          title={flowTitle}
          valueText={`${flowDisplayFormatted.balance}${flowDisplayFormatted.unit}`}
          theme={ringCardThemes.flow}
          ratio={flowRatio}
        />

        <RingStatCard
          title={otherTitle}
          valueText={`${otherDisplayFormatted.balance}${otherDisplayFormatted.unit}`}
          theme={ringCardThemes.flowDir}
          ratio={otherRatio}
        />

        <RingStatCard
          title={voiceTitle}
          valueText={`${voiceDisplay.toFixed(0)}分钟`}
          theme={ringCardThemes.voice}
          ratio={voiceRatio}
        />
      </HStack>
    </VStack>
  )
}

// ================= 主渲染入口 =================

async function render() {
  const settings = getSettings() as ChinaTelecomSettings | null

  // 刷新间隔（分钟），默认 15
  const refreshInterval = (settings as any)?.refreshInterval ?? 15
  const nextUpdate = new Date(Date.now() + refreshInterval * 60 * 1000)
  const reloadPolicy: WidgetReloadPolicy = {
    policy: "after",
    date: nextUpdate,
  }

  if (!settings || !settings.mobile || !settings.password) {
    Widget.present(<Text>请先在主应用中设置手机号和密码</Text>, reloadPolicy)
    return
  }

  const showRemainRatio = !!(settings as any)?.showRemainRatio

  try {
    const logoPath = await getLogoPath()
    const apiData = await queryImportantData()
    const telecomData = convertToTelecomData(apiData)
    Widget.present(
      <WidgetView
        data={telecomData}
        logoPath={logoPath}
        showRemainRatio={showRemainRatio}
      />,
      reloadPolicy,
    )
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    console.error("渲染失败:", errorMessage)
    Widget.present(<Text>发生错误: {errorMessage}</Text>, reloadPolicy)
  }
}

render()