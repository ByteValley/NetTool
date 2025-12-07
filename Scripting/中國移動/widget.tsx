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

// ================= 基础设置 =================

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
  updateTime: string
}

// ================= 工具函数 =================

function clamp01(x: number): number {
  if (!isFinite(x)) return 0
  if (x < 0) return 0
  if (x > 1) return 1
  return x
}

function percentText(r: number): string {
  return (clamp01(r) * 100).toFixed(2)
}

function nowHHMM(): string {
  const d = new Date()
  const h = d.getHours().toString().padStart(2, "0")
  const m = d.getMinutes().toString().padStart(2, "0")
  return `${h}:${m}`
}

// ================= 数据转换 =================

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
    updateTime: typeof parsed.updateTime === "string" ? parsed.updateTime : nowHHMM(),
  }
}

// ================= 数据获取 & 缓存 =================

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
      if (res && res.fee) return res
    }
  } catch (error) {
    console.error("[中国移动] API 请求失败:", error)
  }
  return null
}

function loadFromCache(): any {
  try {
    const path = FileManager.appGroupDocumentsDirectory + "/" + CACHE_FILE
    if (FileManager.existsSync(path)) {
      const data = FileManager.readAsStringSync(path)
      return JSON.parse(data)
    }
  } catch (e) {
    console.error("[中国移动] 读取/解析缓存失败")
  }
  return null
}

function saveToCache(data: any) {
  try {
    const path = FileManager.appGroupDocumentsDirectory + "/" + CACHE_FILE
    if (!data.updateTime) {
      data.updateTime = nowHHMM()
    }
    FileManager.writeAsStringSync(path, JSON.stringify(data))
  } catch (e) {
    console.error("[中国移动] 保存缓存失败")
  }
}

// ================= 原逻辑数据解析 =================

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
  updateTime?: string
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
    let voiceVal = { total: "0", used: "0", remain: "0", unit: "MIN" }

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

    return {
      ok: true,
      fee: { val: fee, unit: "元", plan: planFee },
      flowGen,
      flowDir,
      voice: voiceVal,
      updateTime: nowHHMM(),
    }
  } catch (e) {
    console.error("[中国移动] 数据解析错误")
  }

  return {
    ok: false,
    fee: { val: "0", unit: "元", plan: "0" },
    flowGen: { total: "0", used: "0", remain: "0", unit: "MB" },
    flowDir: { total: "0", used: "0", remain: "0", unit: "MB" },
    voice: { total: "0", used: "0", remain: "0", unit: "分" },
    updateTime: nowHHMM(),
  }
}

// ================= 刷新间隔 =================

function getRefreshInterval(): number {
  const DEFAULT = 60

  let settings: ChinaMobileSettings | null = null
  try {
    settings = Storage.get<ChinaMobileSettings>(SETTINGS_KEY) ?? null
  } catch (_) { }

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

// ================= 样式定义 =================

// 外层白色卡片
const outerCardBg: DynamicShapeStyle = {
  light: "rgba(255,255,255,0.98)",
  dark: "rgba(0,0,0,0.65)",
}

// 每格浅色背景 + 主题色
const ringCardThemes = {
  fee: {
    tint: { light: "#0080CB", dark: "#66adff" } as DynamicShapeStyle,
    icon: "bolt.horizontal.circle.fill",
    bg: {
      light: "rgba(0,128,203,0.06)",
      dark: "rgba(8, 24, 40, 0.95)",
    } as DynamicShapeStyle,
  },
  flow: {
    tint: { light: "#32CD32", dark: "#63e08f" } as DynamicShapeStyle,
    icon: "antenna.radiowaves.left.and.right",
    bg: {
      light: "rgba(50,205,50,0.08)",
      dark: "rgba(6, 24, 10, 0.95)",
    } as DynamicShapeStyle,
  },
  flowDir: {
    tint: { light: "#8A6EFF", dark: "#c59bff" } as DynamicShapeStyle,
    icon: "wifi",
    bg: {
      light: "rgba(138,110,255,0.10)",
      dark: "rgba(13, 9, 30, 0.95)",
    } as DynamicShapeStyle,
  },
  voice: {
    tint: { light: "#F86527", dark: "#ffb07a" } as DynamicShapeStyle,
    icon: "phone.badge.waveform.fill",
    bg: {
      light: "rgba(248,101,39,0.10)",
      dark: "rgba(32, 16, 6, 0.95)",
    } as DynamicShapeStyle,
  },
}

const labelStyle: DynamicShapeStyle = {
  light: "rgba(0, 0, 0, 0.55)",
  dark: "rgba(255,255,255,0.65)", // 0.75 -> 0.65
}

const valueStyle: DynamicShapeStyle = {
  light: "rgba(0, 0, 0, 0.92)",
  dark: "rgba(255,255,255,0.96)",
}

const timeStyle: DynamicShapeStyle = {
  light: "rgba(0, 0, 0, 0.55)",
  dark: "rgba(255,255,255,0.65)", // 同步
}

// ================= UI 组件 =================

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
          systemName="arrow.2.circlepath"
          font={4}
          foregroundStyle={timeStyle}
        />
        <Text
          font={15}
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
function WidgetView({ data }: { data: MobileData }) {
  const logoPath = "https://raw.githubusercontent.com/anker1209/icon/main/zgyd.png"

  // 剩余百分比：remain / total
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

  let flowDirRatio = 0
  if (data.flowDir) {
    const flowDirTotal =
      typeof data.flowDir.total === "number"
        ? data.flowDir.total
        : parseFloat(String(data.flowDir.total ?? "0"))
    const flowDirRemain = parseFloat(String(data.flowDir.balance ?? "0"))
    flowDirRatio = flowDirTotal > 0 ? flowDirRemain / flowDirTotal : 0
  }

  // 小号组件
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

  // 中 / 大号组件
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

        {data.flowDir ? (
          <RingStatCard
            title={data.flowDir.title}
            valueText={`${data.flowDir.balance}${data.flowDir.unit}`}
            theme={ringCardThemes.flowDir}
            ratio={flowDirRatio}
          />
        ) : null}

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
  const oldCache = loadFromCache() || {}
  const refreshInterval = getRefreshInterval()

  const nextUpdate = new Date(Date.now() + refreshInterval * 60 * 1000)
  const reloadPolicy: WidgetReloadPolicy = {
    policy: "after",
    date: nextUpdate,
  }

  try {
    const apiData = await loadFromRewriteApi()
    if (apiData && apiData.fee) {
      const pData = parseData(apiData)
      if (pData && pData.ok) {
        pData.source = "API"
        pData.refreshInterval = refreshInterval
        if (oldCache.small_style) pData.small_style = oldCache.small_style
        if (oldCache.medium_style) pData.medium_style = oldCache.medium_style
        if (!pData.updateTime && oldCache.updateTime) {
          pData.updateTime = oldCache.updateTime
        }

        saveToCache(pData)

        const mobileData = convertToMobileData(pData)
        Widget.present(<WidgetView data={mobileData} />, reloadPolicy)
        return
      }
    }
  } catch (e) {
    console.error("[中国移动] API 读取失败")
  }

  const cache = loadFromCache()
  if (cache && cache.ok && cache.fee) {
    cache.usingCache = true
    cache.source = "Cache"
    const mobileData = convertToMobileData(cache)
    Widget.present(<WidgetView data={mobileData} />, reloadPolicy)
    return
  }

  console.error("[中国移动] 获取数据失败")
  Widget.present(
    <VStack spacing={8} padding={16} alignment="center">
      <Text font="headline">获取数据失败</Text>
      <Text font="body" foregroundStyle="secondaryLabel">
        请确保已安装重写规则
      </Text>
      <Text font="caption" foregroundStyle="secondaryLabel">
        请在主应用中点击“安装重写规则”按钮
      </Text>
    </VStack>,
    reloadPolicy
  )
}

render()