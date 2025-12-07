import {
  Widget,
  VStack,
  HStack,
  Text,
  Image,
  Color,
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

const SETTINGS_KEY = "chinaTelecomSettings"
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
      } catch { }
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
  fee: { title: string; balance: string; unit: string }
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

// 格式化流量值
function formatFlowValue(
  value: number,
  unit: string = "MB"
): { balance: string; unit: string } {
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

// ================= 样式定义（对齐移动版） =================

// 外层大卡底
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

const labelStyle: DynamicShapeStyle = {
  light: "rgba(0, 0, 0, 0.55)",
  dark: "rgba(255,255,255,0.65)",
}

const valueStyle: DynamicShapeStyle = {
  light: "rgba(0, 0, 0, 0.92)",
  dark: "rgba(255,255,255,0.96)",
}

const timeStyle: DynamicShapeStyle = {
  light: "rgba(0, 0, 0, 0.55)",
  dark: "rgba(255,255,255,0.65)",
}

// ================= UI 组件（对齐移动版 FeeCard / RingStatCard） =================

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

      {/* 更新时间：一行，图标小一点，时间略大 */}
      <Spacer minLength={4} />
      <HStack alignment="center" spacing={3}>
        <Spacer />
        <Image systemName="arrow.triangle.2.circlepath" font={4} foregroundStyle={timeStyle} />
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

  let balance = parseFloat(indexBalanceDataInfo?.balance || "0")
  const arrear = parseFloat(indexBalanceDataInfo?.arrear || "0")

  console.log(
    "💰 [Telecom] 话费 balanceInfo =",
    JSON.stringify(balanceInfo),
    "解析后 balance =",
    balance,
    "arrear =",
    arrear
  )

  let feeTitle = "剩余话费"
  let feeValue = balance

  if (arrear > 0) {
    feeTitle = "账户余额"
    feeValue = balance - arrear
    console.log("💰 [Telecom] 存在欠费，展示账户余额:", feeValue)
  } else if (balance === 0 && phoneBillRegion?.subTitleHh) {
    const realTimeFee = parseFloat(phoneBillRegion.subTitleHh.replace("元", "") || "0")
    if (realTimeFee > 0) {
      feeTitle = "实时费用"
      feeValue = realTimeFee
      console.log("💰 [Telecom] 使用实时费用展示:", feeValue)
    }
  }

  const feeData = {
    title: feeTitle,
    balance: feeValue.toFixed(2),
    unit: "元",
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

  const voiceData = {
    title: "剩余语音",
    balance: voiceBalance.toFixed(0),
    unit: "MIN",
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

      let usedMB = parseFlowStrToMB(usedStr)
      let remainMB = parseFlowStrToMB(remainStr)

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

  const flowFormatted = formatFlowValue(commonRemainMB, "MB")
  const flowData_converted = {
    title: "通用流量",
    balance: flowFormatted.balance,
    unit: flowFormatted.unit,
    used: commonUsedMB,
    total: commonTotalMB,
  }

  let otherFlowData:
    | { title: string; balance: string; unit: string; used?: number; total?: number }
    | undefined

  if (specialRemainMB > 0 || specialUsedMB > 0) {
    const otherFlowFormatted = formatFlowValue(specialRemainMB, "MB")
    otherFlowData = {
      title: "定向流量",
      balance: otherFlowFormatted.balance,
      unit: otherFlowFormatted.unit,
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

function WidgetView({ data, logoPath }: { data: TelecomData; logoPath?: string | null }) {
  // 计算剩余比例：remain / total
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

  let otherRatio = 0
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
  if (otherTotal > 0) otherRatio = otherRemain / otherTotal

  // 小号组件：沿用大话费卡
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
          logoPath={logoPath ?? undefined}
          updateTime={nowHHMM()}
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
          title={data.fee.title}
          valueText={`${data.fee.balance}${data.fee.unit}`}
          theme={ringCardThemes.fee}
          logoPath={logoPath ?? undefined}
          updateTime={nowHHMM()}
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
          valueText={`${data.voice.balance}MIN`}
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

  try {
    const logoPath = await getLogoPath()
    const apiData = await queryImportantData()
    const telecomData = convertToTelecomData(apiData)
    Widget.present(<WidgetView data={telecomData} logoPath={logoPath} />, reloadPolicy)
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    console.error("渲染失败:", errorMessage)
    Widget.present(<Text>发生错误: {errorMessage}</Text>, reloadPolicy)
  }
}

render()