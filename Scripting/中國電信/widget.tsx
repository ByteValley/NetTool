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
import { getSettings, queryImportantData } from "./telecomApi"

/* 兼容声明：避免 TS 报 “找不到 Storage / FileManager” */
declare const Storage: any
declare const FileManager: any

// 设置结构定义
type ChinaTelecomSettings = {
  apiUrl: string
  mobile: string
  password: string
}

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
  voice: { title: string; balance: string; unit: string; used?: number; total?: number }
  flow: { title: string; balance: string; unit: string; used?: number; total?: number }
  otherFlow?: { title: string; balance: string; unit: string; used?: number; total?: number }
}

// 格式化流量值（自动转换单位：大于1GB显示GB，不够1GB显示MB）
function formatFlowValue(value: number, unit: string = "MB"): { balance: string; unit: string } {
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
  return `${Math.round(clamp01(ratio) * 100)}%`
}

function nowHHMM(): string {
  const d = new Date()
  const hh = String(d.getHours()).padStart(2, "0")
  const mm = String(d.getMinutes()).padStart(2, "0")
  return `${hh}:${mm}`
}

// ======= 暗色大图标/圆环卡片主题 =======
const darkCardBg: DynamicShapeStyle = {
  light: "rgba(0, 0, 0, 0.10)",
  dark: "rgba(0, 0, 0, 0.25)",
}

const cardThemes = {
  fee: {
    tint: { light: "#1a73e8", dark: "#66adff" } as DynamicShapeStyle,
    icon: "bolt.horizontal.circle.fill",
  },
  voice: {
    tint: { light: "#34b38f", dark: "#63d8a0" } as DynamicShapeStyle,
    icon: "phone.fill",
  },
  flow: {
    tint: { light: "#ff8c42", dark: "#ffb07a" } as DynamicShapeStyle,
    icon: "antenna.radiowaves.left.and.right",
  },
  otherFlow: {
    tint: { light: "#8a6eff", dark: "#c59bff" } as DynamicShapeStyle,
    icon: "wifi.circle.fill",
  },
}

// 文字颜色
const labelStyle: DynamicShapeStyle = {
  light: "rgba(0, 0, 0, 0.72)",
  dark: "rgba(255,255,255,0.72)",
}

const valueStyle: DynamicShapeStyle = {
  light: "rgba(0, 0, 0, 0.92)",
  dark: "rgba(255,255,255,0.96)",
}

const timeStyle: DynamicShapeStyle = {
  light: "rgba(0, 0, 0, 0.40)",
  dark: "rgba(255,255,255,0.58)",
}

// ======= 样式卡片 =======
function RingCard({
  title,
  valueText,
  theme,
  ratio,
  logoPath,
  useLogo,
  showTime,
  noRing,
}: {
  title: string
  valueText: string
  theme: typeof cardThemes.fee
  ratio?: number
  logoPath?: string | null
  useLogo?: boolean
  showTime?: boolean
  noRing?: boolean
}) {
  const showGauge = ratio !== undefined && !noRing
  const r = showGauge ? clamp01(ratio!) : 1

  return (
    <VStack
      alignment="center"
      padding={{ top: 10, leading: 10, bottom: 10, trailing: 10 }}
      frame={{ minWidth: 0, maxWidth: Infinity }}
      widgetBackground={{
        style: darkCardBg,
        shape: { type: "rect", cornerRadius: 18, style: "continuous" },
      }}
    >
      {/* 顶部：首卡不画圈 -> 仅大 Logo 居中；其它卡 -> 圆环 + 上图标下百分比 */}
      {noRing ? (
        <VStack alignment="center" frame={{ width: 48, height: 48 }}>
          <Spacer />
          {useLogo && logoPath ? (
            <Image filePath={logoPath} resizable frame={{ width: 30, height: 30 }} />
          ) : (
            <Image
              systemName={theme.icon}
              font={26}
              fontWeight="semibold"
              foregroundStyle={theme.tint}
            />
          )}
          <Spacer />
        </VStack>
      ) : (
        <ZStack frame={{ width: 48, height: 48 }}>
          <Gauge
            value={r}
            min={0}
            max={1}
            label={<Text font={1}> </Text>}
            currentValueLabel={<Text font={1}> </Text>}
            gaugeStyle="accessoryCircularCapacity"
            tint={theme.tint}
            scaleEffect={0.95}
          />

          <VStack alignment="center" frame={{ width: 48, height: 48 }}>
            <Spacer minLength={2} />

            {/* 上半部分：图标 */}
            {useLogo && logoPath ? (
              <Image filePath={logoPath} resizable frame={{ width: 22, height: 22 }} />
            ) : (
              <Image
                systemName={theme.icon}
                font={18}
                fontWeight="semibold"
                foregroundStyle={theme.tint}
              />
            )}

            <Spacer />

            {/* 下半部分：百分比 */}
            {showGauge ? (
              <Text font={9} fontWeight="bold" foregroundStyle={valueStyle}>
                {percentText(r)}
              </Text>
            ) : (
              <Text font={1}> </Text>
            )}

            <Spacer minLength={2} />
          </VStack>
        </ZStack>
      )}

      {/* 左卡片时间 */}
      {showTime ? (
        <>
          <Spacer minLength={4} />
          <Text font={9} fontWeight="medium" foregroundStyle={timeStyle}>
            {nowHHMM()}
          </Text>
        </>
      ) : (
        <Spacer minLength={8} />
      )}

      {/* 大数值 */}
      <Text
        font={16}
        fontWeight="bold"
        foregroundStyle={valueStyle}
        lineLimit={1}
        minScaleFactor={0.6}
      >
        {valueText}
      </Text>

      <Spacer minLength={2} />

      {/* 小标题 */}
      <Text
        font={9}
        fontWeight="medium"
        foregroundStyle={labelStyle}
        lineLimit={1}
        minScaleFactor={0.8}
      >
        {title}
      </Text>
    </VStack>
  )
}

// 小尺寸组件：保持你原先的竖排三条信息（不动也行）
function SmallDataCard({
  title,
  value,
  unit,
  theme,
  titleStyle,
  descStyle,
  showLogo,
  useLogoAsIcon,
  logoPath,
}: {
  title: string
  value: string
  unit: string
  theme: typeof cardThemes.fee
  titleStyle: DynamicShapeStyle
  descStyle: DynamicShapeStyle
  showLogo?: boolean
  useLogoAsIcon?: boolean
  logoPath?: string | null
}) {
  const cardTitleStyle = titleStyle
  const cardDescStyle = descStyle

  return (
    <ZStack>
      <HStack
        alignment="center"
        padding={{ top: 6, leading: 8, bottom: 6, trailing: 8 }}
        spacing={6}
        frame={{ minWidth: 0, maxWidth: Infinity }}
        widgetBackground={{
          style: darkCardBg,
          shape: { type: "rect", cornerRadius: 12, style: "continuous" },
        }}
      >
        <HStack alignment="center" frame={{ width: 20, height: 20 }}>
          {useLogoAsIcon && logoPath ? (
            <Image filePath={logoPath} frame={{ width: 16, height: 16 }} resizable />
          ) : (
            <Image systemName={theme.icon} font={12} fontWeight="medium" foregroundStyle={theme.tint} />
          )}
        </HStack>
        <VStack alignment="leading" spacing={2} frame={{ minWidth: 0, maxWidth: Infinity }}>
          <Text font={9} fontWeight="medium" foregroundStyle={cardTitleStyle} lineLimit={1} minScaleFactor={0.8}>
            {title}
          </Text>
          <Text font={14} fontWeight="bold" foregroundStyle={cardDescStyle} lineLimit={1} minScaleFactor={0.7}>
            {`${value}${unit}`}
          </Text>
        </VStack>
        {showLogo && !useLogoAsIcon && logoPath ? (
          <HStack alignment="center" frame={{ width: 20, height: 20 }}>
            <Image filePath={logoPath} frame={{ width: 16, height: 16 }} resizable />
          </HStack>
        ) : null}
      </HStack>
    </ZStack>
  )
}

function SmallWidgetView({
  data,
  titleStyle,
  descStyle,
  logoPath,
}: {
  data: TelecomData
  titleStyle: DynamicShapeStyle
  descStyle: DynamicShapeStyle
  logoPath?: string | null
}) {
  const flowRemain =
    data.flow?.total && data.flow?.used !== undefined ? Math.max(0, data.flow.total - data.flow.used) : 0
  const otherFlowRemain =
    data.otherFlow?.total && data.otherFlow?.used !== undefined
      ? Math.max(0, data.otherFlow.total - data.otherFlow.used)
      : 0
  const totalFlowFormatted = formatFlowValue(flowRemain + otherFlowRemain, "MB")

  return (
    <VStack alignment="leading" padding={{ top: 8, leading: 8, bottom: 8, trailing: 8 }} spacing={6}>
      <SmallDataCard
        title={data.fee.title}
        value={data.fee.balance}
        unit={data.fee.unit}
        theme={cardThemes.fee}
        titleStyle={titleStyle}
        descStyle={descStyle}
        useLogoAsIcon={true}
        logoPath={logoPath}
      />
      <SmallDataCard
        title="剩余总流量"
        value={totalFlowFormatted.balance}
        unit={totalFlowFormatted.unit}
        theme={cardThemes.flow}
        titleStyle={titleStyle}
        descStyle={descStyle}
      />
      <SmallDataCard
        title={data.voice.title}
        value={data.voice.balance}
        unit="MIN"
        theme={cardThemes.voice}
        titleStyle={titleStyle}
        descStyle={descStyle}
      />
    </VStack>
  )
}

// 默认样式
const defaultTitleStyle: DynamicShapeStyle = {
  light: "#666666",
  dark: "#CCCCCC",
}

const defaultDescStyle: DynamicShapeStyle = {
  light: "#000000",
  dark: "#FFFFFF",
}

function WidgetView({ data, logoPath }: { data: TelecomData; logoPath?: string | null }) {
  const titleStyle = defaultTitleStyle
  const descStyle = defaultDescStyle

  if (Widget.family === "systemSmall") {
    return <SmallWidgetView data={data} titleStyle={titleStyle} descStyle={descStyle} logoPath={logoPath} />
  }

  // ===== 强制四列：如果没有 otherFlow 也补一个 0 =====
  const other = data.otherFlow ?? {
    title: "其他流量",
    balance: "0",
    unit: "MB",
    used: 0,
    total: 0,
  }

  const voiceRatio = other ? clamp01((safeNum(data.voice.used) / Math.max(1, safeNum(data.voice.total))) || 0) : 0
  const flowRatio = clamp01((safeNum(data.flow.used) / Math.max(1, safeNum(data.flow.total))) || 0)
  const otherRatio = clamp01((safeNum(other.used) / Math.max(1, safeNum(other.total))) || 0)

  return (
    <VStack alignment="leading" padding={{ top: 10, leading: 10, bottom: 10, trailing: 10 }} spacing={8}>
      <HStack alignment="center" spacing={8}>
        <RingCard
          title={data.fee.title}
          valueText={`${data.fee.balance}${data.fee.unit}`}
          theme={cardThemes.fee}
          logoPath={logoPath}
          useLogo={true}
          showTime={true}
          noRing={true}
        />
        <RingCard
          title={data.flow.title}
          valueText={`${data.flow.balance}${data.flow.unit}`}
          theme={cardThemes.flow}
          ratio={flowRatio}
        />
        <RingCard
          title={other.title}
          valueText={`${other.balance}${other.unit}`}
          theme={cardThemes.otherFlow}
          ratio={otherRatio}
        />
        <RingCard
          title={data.voice.title}
          valueText={`${data.voice.balance}MIN`}
          theme={cardThemes.voice}
          ratio={voiceRatio}
        />
      </HStack>
    </VStack>
  )
}

// 将 API 响应转换为 TelecomData（保持你原逻辑）
function convertToTelecomData(apiData: any): TelecomData {
  const responseData = apiData.responseData?.data
  if (!responseData) {
    throw new Error("API 响应数据格式不正确")
  }

  const balanceInfo = responseData.balanceInfo
  const indexBalanceDataInfo = balanceInfo?.indexBalanceDataInfo
  const phoneBillRegion = balanceInfo?.phoneBillRegion

  let balance = parseFloat(indexBalanceDataInfo?.balance || "0")
  const arrear = parseFloat(indexBalanceDataInfo?.arrear || "0")

  let feeTitle = "剩余话费"
  let feeValue = balance

  if (arrear > 0) {
    feeTitle = "账户余额"
    feeValue = balance - arrear
  } else if (balance === 0 && phoneBillRegion?.subTitleHh) {
    const realTimeFee = parseFloat(phoneBillRegion.subTitleHh.replace("元", "") || "0")
    if (realTimeFee > 0) {
      feeTitle = "实时费用"
      feeValue = realTimeFee
    }
  }

  const feeData = {
    title: feeTitle,
    balance: feeValue.toFixed(2),
    unit: "元",
  }

  const voiceInfo = responseData.voiceInfo
  const voiceDataInfo = voiceInfo?.voiceDataInfo
  const voiceBalance = parseFloat(voiceDataInfo?.balance || "0")
  const voiceUsed = parseFloat(voiceDataInfo?.used || "0")
  const voiceTotal = parseFloat(voiceDataInfo?.total || "0")
  const voiceData = {
    title: "剩余语音",
    balance: voiceBalance.toFixed(0),
    unit: "分钟",
    used: voiceUsed,
    total: voiceTotal > 0 ? voiceTotal : voiceUsed + voiceBalance,
  }

  const flowInfo = responseData.flowInfo
  const commonFlow = flowInfo?.commonFlow
  const commonBalanceBytes = parseFloat(commonFlow?.balance || "0")
  const commonUsedBytes = parseFloat(commonFlow?.used || "0")
  const commonBalanceMB = commonBalanceBytes / 1024
  const commonUsedMB = commonUsedBytes / 1024
  const commonTotalMB = commonBalanceMB + commonUsedMB

  const flowFormatted = formatFlowValue(commonBalanceMB, "MB")
  const flowData_converted = {
    title: "通用流量",
    balance: flowFormatted.balance,
    unit: flowFormatted.unit,
    used: commonUsedMB,
    total: commonTotalMB,
  }

  const specialAmount = flowInfo?.specialAmount
  let otherFlowData:
    | { title: string; balance: string; unit: string; used?: number; total?: number }
    | undefined
  if (specialAmount) {
    const specialBalanceBytes = parseFloat(specialAmount.balance || "0")
    const specialUsedBytes = parseFloat(specialAmount.used || "0")
    const specialBalanceMB = specialBalanceBytes / 1024
    const specialUsedMB = specialUsedBytes / 1024
    const specialTotalMB = specialBalanceMB + specialUsedMB

    if (specialBalanceMB > 0 || specialUsedMB > 0) {
      const otherFlowFormatted = formatFlowValue(specialBalanceMB, "MB")
      otherFlowData = {
        title: "其他流量",
        balance: otherFlowFormatted.balance,
        unit: otherFlowFormatted.unit,
        used: specialUsedMB,
        total: specialTotalMB,
      }
    }
  }

  return {
    fee: feeData,
    voice: voiceData,
    flow: flowData_converted,
    otherFlow: otherFlowData,
  }
}

async function render() {
  const refreshInterval = 15
  const nextUpdate = new Date(Date.now() + refreshInterval * 60 * 1000)
  const reloadPolicy: WidgetReloadPolicy = {
    policy: "after",
    date: nextUpdate,
  }

  const settings = getSettings()
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