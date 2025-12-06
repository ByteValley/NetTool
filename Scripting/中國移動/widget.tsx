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
type ChinaMobileSettings = {
  refreshInterval: number
}

const SETTINGS_KEY = "chinaMobileSettings"
const REWRITE_URL = "https://api.example.com/10086/query"
const CACHE_FILE = "cm_data_cache.json"

// 组件数据结构（用于 UI 显示）
type MobileData = {
  fee: { title: string; balance: string; unit: string; plan?: string }
  voice: { title: string; balance: string; unit: string; used?: number; total?: number }
  flow: { title: string; balance: string; unit: string; used?: number; total?: number }
  flowDir?: { title: string; balance: string; unit: string; used?: number; total?: number }
}

// 将解析后的数据转换为 UI 显示格式
function convertToMobileData(parsed: any): MobileData {
  return {
    fee: {
      title: "剩余话费",
      balance: parsed.fee.val,
      unit: parsed.fee.unit,
      plan: parsed.fee.plan,
    },
    flow: {
      title: "通用流量",
      balance: parsed.flowGen.remain,
      unit: parsed.flowGen.unit,
      used: parseFloat(parsed.flowGen.used),
      total: parseFloat(parsed.flowGen.total),
    },
    flowDir: {
      title: "定向流量",
      balance: parsed.flowDir.remain,
      unit: parsed.flowDir.unit,
      used: parseFloat(parsed.flowDir.used),
      total: parseFloat(parsed.flowDir.total),
    },
    voice: {
      title: "剩余语音",
      balance: parsed.voice.remain,
      unit: parsed.voice.unit,
      used: parseFloat(parsed.voice.used),
      total: parseFloat(parsed.voice.total),
    },
  }
}

// 从 REWRITE_URL API 读取数据（通过 Quantumult X 重写规则）
async function loadFromRewriteApi(): Promise<any> {
  try {
    const response = await fetch(REWRITE_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({}),
    })

    if (response.ok) {
      const res = await response.json()
      if (res && res.fee) {
        return res
      }
    }
  } catch (error) {
    console.error("[中国移动] API 请求失败:", error)
  }
  return null
}

// 从缓存读取（使用 FileManager，与原代码一致）
function loadFromCache(): any {
  try {
    const path = FileManager.appGroupDocumentsDirectory + "/" + CACHE_FILE
    if (FileManager.existsSync(path)) {
      try {
        const data = FileManager.readAsStringSync(path)
        return JSON.parse(data)
      } catch (e) {
        console.error("[中国移动] 解析缓存失败")
        return null
      }
    }
  } catch (e) {
    console.error("[中国移动] 读取缓存失败")
  }
  return null
}

// 保存到缓存（使用 FileManager，与原代码一致）
function saveToCache(data: any) {
  try {
    const path = FileManager.appGroupDocumentsDirectory + "/" + CACHE_FILE
    // 添加更新时间（如果没有）
    if (!data.updateTime) {
      const now = new Date()
      data.updateTime = `${now.getHours()}:${
        now.getMinutes() < 10 ? "0" + now.getMinutes() : now.getMinutes()
      }`
    }
    FileManager.writeAsStringSync(path, JSON.stringify(data))
  } catch (e) {
    console.error("[中国移动] 保存缓存失败")
  }
}

// 数据解析（完全按照原代码逻辑，返回包含 ok 字段的对象）
function parseData(
  res: any
): {
  ok: boolean
  fee: any
  flowGen: any
  flowDir: any
  voice: any
  source?: string
  refreshInterval?: number
  small_style?: any
  medium_style?: any
  user_boxjs_url?: string
} | null {
  try {
    let fee = "0"
    let planFee = "0"
    if (res.fee) {
      if (res.fee.curFee !== undefined) fee = res.fee.curFee
      else if (res.fee.val !== undefined) fee = res.fee.val

      if (res.fee.realFee !== undefined) planFee = res.fee.realFee
      else if (res.fee.curFeeTotal !== undefined) planFee = res.fee.curFeeTotal
    }

    let flowGen = { total: "0", used: "0", remain: "0", unit: "MB" }
    let flowDir = { total: "0", used: "0", remain: "0", unit: "MB" }
    let voiceVal = { total: "0", used: "0", remain: "0", unit: "分" }

    if (res.plan && res.plan.planRemianFlowListRes) {
      const flowRoot = res.plan.planRemianFlowListRes
      const list = flowRoot.planRemianFlowRes || []

      let buckets = {
        gen: { t: 0, u: 0, r: 0 },
        dir: { t: 0, u: 0, r: 0 },
      }

      for (let item of list) {
        let unitMult = 1

        let t = parseFloat(item.flowSumNum || 0) * unitMult
        let u = parseFloat(item.flowUsdNum || 0) * unitMult
        let r = parseFloat(item.flowRemainNum || 0) * unitMult

        if (u === 0 && t > r) u = t - r
        if (t === 0) t = u + r

        let type: "gen" | "dir" = item.flowtype == "1" ? "dir" : "gen"
        buckets[type].t += t
        buckets[type].u += u
        buckets[type].r += r
      }

      const fmt = (num: number) => {
        if (num > 1024) return { val: (num / 1024).toFixed(2), unit: "GB" }
        return { val: Math.floor(num).toString(), unit: "MB" }
      }

      let genFmt = fmt(buckets.gen.r)
      let div = genFmt.unit === "GB" ? 1024 : 1
      flowGen = {
        remain: genFmt.val,
        total: (buckets.gen.t / div).toFixed(div === 1 ? 0 : 2),
        used: (buckets.gen.u / div).toFixed(div === 1 ? 0 : 2),
        unit: genFmt.unit,
      }

      let dirFmt = fmt(buckets.dir.r)
      let dirDiv = dirFmt.unit === "GB" ? 1024 : 1
      flowDir = {
        remain: dirFmt.val,
        total: (buckets.dir.t / dirDiv).toFixed(dirDiv === 1 ? 0 : 2),
        used: (buckets.dir.u / dirDiv).toFixed(dirDiv === 1 ? 0 : 2),
        unit: dirFmt.unit,
      }
    }

    if (res.plan && res.plan.planRemianVoiceListRes) {
      const vList = res.plan.planRemianVoiceListRes.planRemianVoiceInfoRes || []
      let item =
        vList.find((i: any) => i.voicetype === "0") || (vList.length > 0 ? vList[0] : null)
      if (item) {
        let t = parseFloat(item.voiceSumNum || 0)
        let u = parseFloat(item.voiceUsdNum || 0)
        let r = parseFloat(item.voiceRemainNum || 0)

        if (u === 0 && t > r) u = t - r

        voiceVal = {
          total: Math.floor(t).toString(),
          used: Math.floor(u).toString(),
          remain: Math.floor(r).toString(),
          unit: "分",
        }
      }
    } else if (res.voice && res.voice.val) {
      voiceVal.remain = res.voice.val
    }

    const result = {
      ok: true,
      fee: { val: fee, unit: "元", plan: planFee },
      flowGen: flowGen,
      flowDir: flowDir,
      voice: voiceVal,
    }
    return result
  } catch (e) {
    console.error("[中国移动] 数据解析错误")
    return {
      ok: false,
      fee: { val: "0", unit: "元", plan: "0" },
      flowGen: { total: "0", used: "0", remain: "0", unit: "MB" },
      flowDir: { total: "0", used: "0", remain: "0", unit: "MB" },
      voice: { total: "0", used: "0", remain: "0", unit: "分" },
    }
  }
}

// 根据配置页 + 缓存获取刷新间隔（分钟）
function getRefreshInterval(): number {
  const DEFAULT = 60

  let settings: ChinaMobileSettings | null = null
  try {
    settings = Storage.get<ChinaMobileSettings>(SETTINGS_KEY) ?? null
  } catch (_) {
    // ignore
  }

  const cache = loadFromCache() || {}

  const fromSettings =
    settings && typeof settings.refreshInterval === "number"
      ? settings.refreshInterval
      : undefined
  const fromCache =
    cache && typeof cache.refreshInterval === "number"
      ? cache.refreshInterval
      : undefined

  let raw = fromSettings ?? fromCache ?? DEFAULT

  if (!isFinite(raw)) raw = DEFAULT
  raw = Math.round(raw)
  if (raw < 5) raw = 5
  if (raw > 360) raw = 360

  return raw
}

// ======= RingCard 暗色大图标/圆环卡片主题 =======
const darkCardBg: DynamicShapeStyle = {
  light: "rgba(0, 0, 0, 0.10)",
  dark: "rgba(0, 0, 0, 0.25)",
}

// 这里用移动版的 4 个主题
const ringCardThemes = {
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
  flowDir: {
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

function clamp01(x: number): number {
  if (!isFinite(x)) return 0
  if (x < 0) return 0
  if (x > 1) return 1
  return x
}

function percentText(r: number): string {
  return `${Math.round(clamp01(r) * 100)}%`
}

function nowHHMM(): string {
  const d = new Date()
  const h = d.getHours().toString().padStart(2, "0")
  const m = d.getMinutes().toString().padStart(2, "0")
  return `${h}:${m}`
}

// RingCard 组件
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
  theme: typeof ringCardThemes.fee
  ratio?: number
  logoPath?: string | null
  useLogo?: boolean
  showTime?: boolean
  noRing?: boolean
}) {
  const showGauge = ratio !== undefined && !noRing
  const r = showGauge ? clamp01(ratio!) : 1
  const isUrlLogo =
    !!logoPath && (logoPath.startsWith("http://") || logoPath.startsWith("https://"))

  const LogoImage = ({ size }: { size: number }) =>
    useLogo && logoPath ? (
      isUrlLogo ? (
        <Image imageUrl={logoPath} resizable frame={{ width: size, height: size }} />
      ) : (
        <Image filePath={logoPath} resizable frame={{ width: size, height: size }} />
      )
    ) : (
      <Image systemName={theme.icon} font={size} fontWeight="semibold" foregroundStyle={theme.tint} />
    )

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
      {noRing ? (
        // 首卡：只展示大 Logo，不画圆环
        <VStack alignment="center" frame={{ width: 48, height: 48 }}>
          <Spacer />
          <LogoImage size={30} />
          <Spacer />
        </VStack>
      ) : (
        // 其它卡：圆环 + 图标 + 百分比
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
            <LogoImage size={22} />
            <Spacer />
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

      {/* 时间（给话费卡显示） */}
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

// 主组件视图：使用 RingCard
function WidgetView({ data }: { data: MobileData }) {
  const logoPath = "https://raw.githubusercontent.com/anker1209/icon/main/zgyd.png"

  const voiceRatio =
    data.voice.total && data.voice.total > 0 && data.voice.used !== undefined
      ? data.voice.used / data.voice.total
      : undefined

  const flowRatio =
    data.flow.total && data.flow.total > 0 && data.flow.used !== undefined
      ? data.flow.used / data.flow.total
      : undefined

  const flowDirRatio =
    data.flowDir && data.flowDir.total && data.flowDir.total > 0 && data.flowDir.used !== undefined
      ? data.flowDir.used / data.flowDir.total
      : undefined

  // 小号：只展示话费大卡
  if (Widget.family === "systemSmall") {
    return (
      <RingCard
        title={data.fee.title}
        valueText={`${data.fee.balance}${data.fee.unit}`}
        theme={ringCardThemes.fee}
        logoPath={logoPath}
        useLogo={true}
        showTime={true}
        noRing={true}
      />
    )
  }

  // 中/大号：4 张 RingCard 一排
  return (
    <VStack
      alignment="center"
      padding={{ top: 10, leading: 10, bottom: 10, trailing: 10 }}
      spacing={8}
    >
      <HStack alignment="center" spacing={8}>
        {/* 话费卡：大 Logo + 时间 */}
        <RingCard
          title={data.fee.title}
          valueText={`${data.fee.balance}${data.fee.unit}`}
          theme={ringCardThemes.fee}
          logoPath={logoPath}
          useLogo={true}
          showTime={true}
          noRing={true}
        />

        {/* 通用流量 */}
        <RingCard
          title={data.flow.title}
          valueText={`${data.flow.balance}${data.flow.unit}`}
          theme={ringCardThemes.flow}
          ratio={flowRatio}
        />

        {/* 定向流量 */}
        {data.flowDir ? (
          <RingCard
            title={data.flowDir.title}
            valueText={`${data.flowDir.balance}${data.flowDir.unit}`}
            theme={ringCardThemes.flowDir}
            ratio={flowDirRatio}
          />
        ) : null}

        {/* 语音卡：已用占比 */}
        <RingCard
          title={data.voice.title}
          valueText={`${data.voice.balance}${data.voice.unit}`}
          theme={ringCardThemes.voice}
          ratio={voiceRatio}
        />
      </HStack>
    </VStack>
  )
}

// 渲染入口
async function render() {
  const oldCache = loadFromCache() || {}

  const refreshInterval = getRefreshInterval()

  const nextUpdate = new Date(Date.now() + refreshInterval * 60 * 1000)
  const reloadPolicy: WidgetReloadPolicy = {
    policy: "after",
    date: nextUpdate,
  }

  // 1. 优先尝试从 REWRITE_URL API 读取（通过 Quantumult X 重写规则）
  try {
    const apiData = await loadFromRewriteApi()

    if (apiData && apiData.fee) {
      const pData = parseData(apiData)

      if (pData && pData.ok) {
        pData.source = "API"
        pData.refreshInterval = refreshInterval
        // 保留缓存中的样式配置
        if (oldCache.small_style) pData.small_style = oldCache.small_style
        if (oldCache.medium_style) pData.medium_style = oldCache.medium_style

        saveToCache(pData)

        const mobileData = convertToMobileData(pData)
        Widget.present(<WidgetView data={mobileData} />, reloadPolicy)
        return
      }
    }
  } catch (e) {
    console.error("[中国移动] API 读取失败")
  }

  // 2. 如果 API 失败，尝试使用缓存
  const cache = loadFromCache()
  if (cache && cache.ok && cache.fee) {
    cache.usingCache = true
    cache.source = "Cache"
    const mobileData = convertToMobileData(cache)
    Widget.present(<WidgetView data={mobileData} />, reloadPolicy)
    return
  }

  // 3. 最后返回错误信息
  console.error("[中国移动] 获取数据失败")
  Widget.present(
    <VStack spacing={8} padding={16} alignment="center">
      <Text font="headline">获取数据失败</Text>
      <Text font="body" foregroundStyle="secondaryLabel">
        请确保已安装 Quantumult X 重写规则
      </Text>
      <Text font="caption" foregroundStyle="secondaryLabel">
        请在主应用中点击"安装重写规则"按钮
      </Text>
    </VStack>,
    reloadPolicy
  )
}

render()