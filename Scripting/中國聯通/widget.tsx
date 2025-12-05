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
const API_URL = "https://m.client.10010.com/mobileserviceimportant/home/queryUserInfoSeven?version=iphone_c@10.0100&desmobiel=13232135179&showType=0"
const API_DETAIL_URL = "https://m.client.10010.com/servicequerybusiness/operationservice/queryOcsPackageFlowLeftContentRevisedInJune"

// 组件数据结构
type UnicomData = {
  fee: { title: string; balance: string; unit: string }
  voice: { title: string; balance: string; unit: string; used?: number; total?: number }
  flow: { title: string; balance: string; unit: string; used?: number; total?: number }
  otherFlow?: { title: string; balance: string; unit: string; used?: number; total?: number }
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
  // 流量汇总列表：flowtype=1通用流量，2定向流量，3其他流量
  flowSumList?: Array<{
    flowtype: string      // 流量类型
    xcanusevalue: string  // 剩余流量（MB）
    xusedvalue: string    // 已用流量（MB）
    elemtype?: string
  }>
  fresSumList?: Array<{
    flowtype: string
    xcanusevalue: string
    xusedvalue: string
  }>
}

// 从 BoxJs 读取 Cookie
async function fetchCookieFromBoxJs(boxJsUrl: string): Promise<string | null> {
  try {
    const url = `${boxJsUrl.replace(/\/$/, "")}/query/data/10010.cookie`
    console.log("📡 从 BoxJs 读取 Cookie:", url)
    
    const response = await fetch(url, {
      headers: {
        'Accept': 'application/json',
      }
    })
    
    if (response.ok) {
      const data = await response.json()
      // BoxJs 返回格式: { "key": "10010.cookie", "val": "cookie值" }
      const cookie = data?.val
      if (cookie && typeof cookie === 'string' && cookie.trim()) {
        console.log("✅ 从 BoxJs 成功读取 Cookie")
        return cookie.trim()
      } else {
        console.warn("⚠️ BoxJs 返回的数据格式不正确:", data)
      }
    } else {
      console.error("❌ 从 BoxJs 读取 Cookie 失败，状态码:", response.status)
    }
  } catch (error) {
    console.error("🚨 从 BoxJs 读取 Cookie 异常:", error)
  }
  return null
}

// 获取话费数据（仅从第一个 API）
async function fetchFeeData(cookie: string): Promise<FeeData | null> {
  try {
    const response = await fetch(API_URL, {
      headers: {
        'Host': 'm.client.10010.com',
        'User-Agent': 'ChinaUnicom.x CFNetwork iOS/16.3 unicom{version:iphone_c@10.0100}',
        'cookie': cookie,
      }
    })

    if (response.ok) {
      const data = await response.json()
      
      if (data.code === 'Y') {
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
        'Host': 'm.client.10010.com',
        'User-Agent': 'ChinaUnicom.x CFNetwork iOS/16.3 unicom{version:iphone_c@10.0100}',
        'cookie': cookie,
      }
    })
    if (response.ok) {
      const data = await response.json()
      if (data.code === '0000' || data.code === 'Y') {
        return data as DetailApiResponse
      }
    }
  } catch (error) {
    console.error("❌ 获取详细数据失败:", error)
  }
  return null
}

// 从详细 API 提取语音和流量数据
function extractVoiceAndFlowData(detailData: DetailApiResponse): {
  voice: { title: string; balance: string; unit: string; used?: number; total?: number }
  flow: { title: string; balance: string; unit: string; used?: number; total?: number }
} | null {
  try {
    // 提取语音数据
    const voiceResource = detailData.resources?.find(r => r.type === "Voice")
    const voiceRemain = voiceResource?.remainResource || "0"
    const voiceUsed = voiceResource?.userResource || "0"
    const voiceTotal = parseFloat(voiceRemain) + parseFloat(voiceUsed)
    const voiceUnit = detailData.canuseVoiceAllUnit || "分钟"
    
    // 提取流量数据：优先从 flowSumList 获取通用流量（flowtype="1"）
    const generalFlow = detailData.flowSumList?.find(item => item.flowtype === "1")
    let flowRemainMB = 0
    let flowUsedMB = 0
    
    if (generalFlow?.xcanusevalue) {
      flowRemainMB = parseFloat(generalFlow.xcanusevalue)
      flowUsedMB = parseFloat(generalFlow.xusedvalue || "0")
    } else {
      // 兼容：从 resources 获取
      const flowResource = detailData.resources?.find(r => r.type === "Flow")
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
    
    console.log("📞 语音:", `已用${voiceUsed}${voiceUnit} 剩余${voiceRemain}${voiceUnit} 总计${voiceTotal}${voiceUnit}`)
    console.log("📶 通用流量:", `已用${formatFlowValue(flowUsedMB, "MB").balance}${formatFlowValue(flowUsedMB, "MB").unit} 剩余${flowFormatted.balance}${flowFormatted.unit} 总计${formatFlowValue(flowTotalMB, "MB").balance}${formatFlowValue(flowTotalMB, "MB").unit}`)
    
    return result
  } catch (error) {
    console.error("❌ 提取数据失败:", error)
    return null
  }
}

// 格式化流量值（自动转换单位）
function formatFlowValue(value: number, unit: string = "MB"): { balance: string; unit: string } {
  if (value >= 1024) {
    return {
      balance: (value / 1024).toFixed(2),
      unit: "GB"
    }
  }
  return {
    balance: value.toFixed(2),
    unit
  }
}

// 卡片主题配置 - Catppuccin 配色方案
const cardThemes = {
  fee: {
    background: { light: "rgba(140, 170, 238, 0.12)", dark: "rgba(140, 170, 238, 0.18)" } as DynamicShapeStyle,
    iconColor: { light: "#8caaee", dark: "#8caaee" } as DynamicShapeStyle,
    titleColor: { light: "#737994", dark: "#99d1db" } as DynamicShapeStyle,
    descColor: { light: "#51576d", dark: "#c6d0f5" } as DynamicShapeStyle,
    icon: "creditcard.fill"
  },
  voice: {
    background: { light: "rgba(166, 209, 137, 0.12)", dark: "rgba(166, 209, 137, 0.18)" } as DynamicShapeStyle,
    iconColor: { light: "#a6d189", dark: "#a6d189" } as DynamicShapeStyle,
    titleColor: { light: "#626880", dark: "#81c8be" } as DynamicShapeStyle,
    descColor: { light: "#51576d", dark: "#c6d0f5" } as DynamicShapeStyle,
    icon: "phone.fill"
  },
  flow: {
    background: { light: "rgba(239, 159, 118, 0.12)", dark: "rgba(239, 159, 118, 0.18)" } as DynamicShapeStyle,
    iconColor: { light: "#ef9f76", dark: "#ef9f76" } as DynamicShapeStyle,
    titleColor: { light: "#737994", dark: "#e5c890" } as DynamicShapeStyle,
    descColor: { light: "#51576d", dark: "#c6d0f5" } as DynamicShapeStyle,
    icon: "antenna.radiowaves.left.and.right"
  },
  otherFlow: {
    background: { light: "rgba(202, 158, 230, 0.12)", dark: "rgba(202, 158, 230, 0.18)" } as DynamicShapeStyle,
    iconColor: { light: "#ca9ee6", dark: "#ca9ee6" } as DynamicShapeStyle,
    titleColor: { light: "#737994", dark: "#babbf1" } as DynamicShapeStyle,
    descColor: { light: "#51576d", dark: "#c6d0f5" } as DynamicShapeStyle,
    icon: "wifi.circle.fill"
  }
}

// 可复用卡片组件
function DataCard({
  title,
  value,
  unit,
  theme,
  titleStyle,
  descStyle,
  showLogo,
  progressUsed,
  progressTotal
}: {
  title: string
  value: string
  unit: string
  theme: typeof cardThemes.fee
  titleStyle: DynamicShapeStyle
  descStyle: DynamicShapeStyle
  showLogo?: boolean
  progressUsed?: number
  progressTotal?: number
}) {
  const showProgress = progressUsed !== undefined && progressTotal !== undefined && progressTotal > 0
  const progressPercentage = showProgress ? progressUsed / progressTotal! : 0
  const percentageText = showProgress ? `${Math.round(progressPercentage * 100)}%` : "0%"
  const cardTitleStyle = theme.titleColor || titleStyle
  const cardDescStyle = theme.descColor || descStyle
  
  return (
    <ZStack>
      <VStack
        alignment="center"
        padding={{ top: 8, leading: 6, bottom: 8, trailing: 6 }}
        frame={{ minWidth: 0, maxWidth: Infinity }}
        widgetBackground={{
          style: theme.background,
          shape: {
            type: "rect",
            cornerRadius: 15,
            style: "continuous"
          }
        }}
      >
        <Image 
          systemName={theme.icon} 
          font={13}
          fontWeight="medium"
          foregroundStyle={theme.iconColor} 
        />
        <Spacer minLength={3} />
        <VStack alignment="center" spacing={2}>
          <Text 
            font={8} 
            fontWeight="medium" 
            foregroundStyle={cardTitleStyle}
            lineLimit={1}
            minScaleFactor={0.8}
          >{title}</Text>
          <Text
            font={13}
            fontWeight="bold"
            foregroundStyle={cardDescStyle}
            lineLimit={1}
            minScaleFactor={0.7}
          >{`${value}${unit}`}</Text>
        </VStack>
      </VStack>
      {showProgress ? (
        <VStack alignment="center">
          <Spacer />
          <VStack
            alignment="center"
            frame={{ width: 28, height: 28 }}
          >
            <Gauge
              value={progressPercentage}
              min={0}
              max={1}
              label={<Text font={1}> </Text>}
              currentValueLabel={
                <Text 
                  font={10}
                  fontWeight="semibold"
                  foregroundStyle={theme.descColor || descStyle}
                >
                  {percentageText}
                </Text>
              }
              gaugeStyle="accessoryCircularCapacity"
              tint={theme.iconColor}
              scaleEffect={0.7}
            />
          </VStack>
          <Spacer />
        </VStack>
      ) : null}
      {showLogo ? (
        <VStack alignment="center">
          <Spacer />
          <Image 
            imageUrl="https://raw.githubusercontent.com/Nanako718/Scripting/refs/heads/main/images/10010.png" 
            frame={{ width: 32, height: 32 }} 
            resizable 
          />
          <Spacer />
        </VStack>
      ) : null}
    </ZStack>
  )
}

// 小尺寸组件卡片
function SmallDataCard({
  title,
  value,
  unit,
  theme,
  titleStyle,
  descStyle,
  showLogo,
  useLogoAsIcon
}: {
  title: string
  value: string
  unit: string
  theme: typeof cardThemes.fee
  titleStyle: DynamicShapeStyle
  descStyle: DynamicShapeStyle
  showLogo?: boolean
  useLogoAsIcon?: boolean
}) {
  const cardTitleStyle = theme.titleColor || titleStyle
  const cardDescStyle = theme.descColor || descStyle
  
  return (
    <ZStack>
      <HStack
        alignment="center"
        padding={{ top: 6, leading: 8, bottom: 6, trailing: 8 }}
        spacing={6}
        frame={{ minWidth: 0, maxWidth: Infinity }}
        widgetBackground={{
          style: theme.background,
          shape: {
            type: "rect",
            cornerRadius: 12,
            style: "continuous"
          }
        }}
      >
        <HStack alignment="center" frame={{ width: 20, height: 20 }}>
          {useLogoAsIcon ? (
            <Image 
              imageUrl="https://raw.githubusercontent.com/Enjoyee/Scriptable/v2/img/ic_logo_10010.png" 
              frame={{ width: 16, height: 16 }} 
              resizable 
            />
          ) : (
            <Image 
              systemName={theme.icon} 
              font={12}
              fontWeight="medium"
              foregroundStyle={theme.iconColor} 
            />
          )}
        </HStack>
        <VStack alignment="leading" spacing={2} frame={{ minWidth: 0, maxWidth: Infinity }}>
          <Text 
            font={9} 
            fontWeight="medium" 
            foregroundStyle={cardTitleStyle}
            lineLimit={1}
            minScaleFactor={0.8}
          >
            {title}
          </Text>
          <Text
            font={14}
            fontWeight="bold"
            foregroundStyle={cardDescStyle}
            lineLimit={1}
            minScaleFactor={0.7}
          >
            {`${value}${unit}`}
          </Text>
        </VStack>
        {showLogo && !useLogoAsIcon ? (
          <HStack alignment="center" frame={{ width: 20, height: 20 }}>
            <Image 
              imageUrl="https://raw.githubusercontent.com/Enjoyee/Scriptable/v2/img/ic_logo_10010.png" 
              frame={{ width: 16, height: 16 }} 
              resizable 
            />
          </HStack>
        ) : null}
      </HStack>
    </ZStack>
  )
}

// 小尺寸组件视图
function SmallWidgetView({ data, titleStyle, descStyle }: { 
  data: UnicomData
  titleStyle: DynamicShapeStyle
  descStyle: DynamicShapeStyle
}) {
  // 计算总流量剩余（通用流量 + 其他流量）
  const flowRemain = (data.flow?.total && data.flow?.used !== undefined) 
    ? Math.max(0, data.flow.total - data.flow.used) : 0
  const otherFlowRemain = (data.otherFlow?.total && data.otherFlow?.used !== undefined)
    ? Math.max(0, data.otherFlow.total - data.otherFlow.used) : 0
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

function WidgetView({ data, settings }: { data: UnicomData; settings: ChinaUnicomSettings }) {
  const titleStyle: DynamicShapeStyle = {
    light: settings.titleDayColor,
    dark: settings.titleNightColor,
  }
  const descStyle: DynamicShapeStyle = {
    light: settings.descDayColor,
    dark: settings.descNightColor,
  }

  if (Widget.family === "systemSmall") {
    return <SmallWidgetView data={data} titleStyle={titleStyle} descStyle={descStyle} />
  }

  return (
    <VStack alignment="leading" padding={{ top: 10, leading: 10, bottom: 10, trailing: 10 }} spacing={8}>
      <HStack alignment="center" spacing={6}>
        <DataCard
          title={data.fee.title}
          value={data.fee.balance}
          unit={data.fee.unit}
          theme={cardThemes.fee}
          titleStyle={titleStyle}
          descStyle={descStyle}
          showLogo={true}
        />
        <DataCard
          title={data.voice.title}
          value={data.voice.balance}
          unit={data.voice.unit}
          theme={cardThemes.voice}
          titleStyle={titleStyle}
          descStyle={descStyle}
          progressUsed={data.voice.used}
          progressTotal={data.voice.total}
        />
        {settings?.showFlow !== false ? (
          <DataCard
            title={data.flow.title}
            value={data.flow.balance}
            unit={data.flow.unit}
            theme={cardThemes.flow}
            titleStyle={titleStyle}
            descStyle={descStyle}
            progressUsed={data.flow.used}
            progressTotal={data.flow.total}
          />
        ) : null}
        {data.otherFlow && settings?.showOtherFlow !== false ? (
          <DataCard
            title={data.otherFlow.title}
            value={data.otherFlow.balance}
            unit={data.otherFlow.unit}
            theme={cardThemes.otherFlow}
            titleStyle={titleStyle}
            descStyle={descStyle}
            progressUsed={data.otherFlow.used}
            progressTotal={data.otherFlow.total}
          />
        ) : null}
      </HStack>
    </VStack>
  )
}

async function render() {
  const settings = Storage.get<ChinaUnicomSettings>(SETTINGS_KEY)
  
  const refreshInterval = settings?.refreshInterval ?? 15
  const nextUpdate = new Date(Date.now() + refreshInterval * 60 * 1000)
  const reloadPolicy: WidgetReloadPolicy = {
    policy: "after",
    date: nextUpdate
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
    Widget.present(<Text>请先在主应用中设置联通 Cookie，或配置 BoxJs 地址。</Text>, reloadPolicy)
    return
  }

  // 并行获取两个 API 数据
  const [feeData, detailData] = await Promise.all([
    fetchFeeData(cookie),
    fetchDetailData(cookie)
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

  // 提取其他流量数据
  let otherFlowData: { title: string; balance: string; unit: string; used?: number; total?: number } | undefined
  const showOtherFlow = settings?.showOtherFlow ?? true
  const matchType = settings?.otherFlowMatchType ?? "flowType"
  const matchValue = settings?.otherFlowMatchValue ?? "3"
  
  if (showOtherFlow && detailData) {
    let totalRemainMB = 0
    let totalUsedMB = 0
    
    // 方法1：从 flowSumList 获取（flowtype="3"）
    // flowSumList 中的值单位是 MB
    if (matchType === "flowType" && matchValue === "3") {
      const item = detailData.flowSumList?.find(item => item.flowtype === "3")
      if (item) {
        totalRemainMB = parseFloat(item.xcanusevalue || "0")
        totalUsedMB = parseFloat(item.xusedvalue || "0")
      }
    }
    
    // 方法2：从 fresSumList 获取
    // fresSumList 中的值单位也是 MB
    if (totalRemainMB === 0 && matchType === "flowType") {
      const item = detailData.fresSumList?.find(item => item.flowtype === matchValue)
      if (item) {
        totalRemainMB = parseFloat(item.xcanusevalue || "0")
        totalUsedMB = parseFloat(item.xusedvalue || "0")
      }
    }
    
    // 方法3：从 resources 计算
    // resources 中的值需要根据 canuseFlowAllUnit 判断单位
    if (totalRemainMB === 0) {
      const unit = detailData.canuseFlowAllUnit || "MB"
      detailData.resources?.find(r => r.type === "Flow")?.details?.forEach((detail: any) => {
        const match = matchType === "flowType" 
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
        title: "其他流量",
        balance: formatted.balance,
        unit: formatted.unit,
        used: totalUsedMB,
        total: totalMB
      }
      
      console.log("🌐 其他流量:", 
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
  }

  // 确保 settings 不为 null
  if (!settings) {
    Widget.present(<Text>请先在主应用中设置联通 Cookie，或配置 BoxJs 地址。</Text>, reloadPolicy)
    return
  }

  Widget.present(<WidgetView data={mergedData} settings={settings} />, reloadPolicy)
}

render()