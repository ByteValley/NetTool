// widget.tsx（中国移动）
// 业务逻辑层：只负责拉数据 + 解析 + 转成 TelecomData，然后交给 WidgetRoot 渲染。

import {
  Widget,
  VStack,
  Text,
  WidgetReloadPolicy,
  fetch,
} from "scripting"

declare const FileManager: any

import { WidgetRoot, TelecomData } from "./telecom/widgetRoot"
import { nowHHMM, safeNum } from "./telecom/utils/telecomUtils"
import { ensureImageFilePath } from "./telecom/utils/imageCache"
import {
  MOBILE_SETTINGS_KEY,
  loadChinaMobileSettings,
  resolveRefreshInterval,
} from "./telecom/settings"

// ================ 常量定义 ================

const SETTINGS_KEY = MOBILE_SETTINGS_KEY
const REWRITE_URL = "https://api.example.com/10086/query"
const CACHE_FILE = "cm_data_cache.json"

// 中国移动 Logo（用于话费卡大图标）
const MOBILE_LOGO_URL =
  "https://raw.githubusercontent.com/anker1209/icon/main/zgyd.png"

// ================ 重写返回的数据结构（解析用） ================

type ParsedData = {
  ok: boolean
  fee: { val: string; unit: string; plan: string }
  flowGen: { total: string; used: string; remain: string; unit: string }
  flowDir: { total: string; used: string; remain: string; unit: string }
  voice: { total: string; used: string; remain: string; unit: string }
  source?: string
  refreshInterval?: number
  small_style?: any
  medium_style?: any
  user_boxjs_url?: string
  updateTime?: string
}

// ================ 数据获取 & 缓存 ================

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

// ================ 原逻辑数据解析（保持不变） ================

function parseData(res: any): ParsedData {
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
    let voiceVal = { total: "0", used: "0", remain: "0", unit: "分钟" }

    if (res.plan && res.plan.planRemianFlowListRes) {
      const flowRoot = res.plan.planRemianFlowListRes
      const list = flowRoot.planRemianFlowRes || []

      let buckets = {
        gen: { t: 0, u: 0, r: 0 },
        dir: { t: 0, u: 0, r: 0 },
      }

      for (let item of list) {
        let t = parseFloat(item.flowSumNum || 0)
        let u = parseFloat(item.flowUsdNum || 0)
        let r = parseFloat(item.flowRemainNum || 0)

        if (u === 0 && t > r) u = t - r
        if (t === 0) t = u + r

        // flowtype==1 这里原脚本视作「定向」，其余视作「通用」
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
      const vList =
        res.plan.planRemianVoiceListRes.planRemianVoiceInfoRes || []
      let item =
        vList.find((i: any) => i.voicetype === "0") ||
        (vList.length > 0 ? vList[0] : null)
      if (item) {
        let t = parseFloat(item.voiceSumNum || 0)
        let u = parseFloat(item.voiceUsdNum || 0)
        let r = parseFloat(item.voiceRemainNum || 0)

        if (u === 0 && t > r) u = t - r

        voiceVal = {
          total: Math.floor(t).toString(),
          used: Math.floor(u).toString(),
          remain: Math.floor(r).toString(),
          unit: "分钟",
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
    voice: { total: "0", used: "0", remain: "0", unit: "分钟" },
    updateTime: nowHHMM(),
  }
}

// ================ 核心：ParsedData -> TelecomData ================

function convertToTelecomData(parsed: ParsedData): TelecomData {
  // ===== 通用流量：转成 MB =====
  const gen = parsed.flowGen || {
    total: "0",
    used: "0",
    remain: "0",
    unit: "MB",
  }
  const genUnit = gen.unit || "MB"
  const genTotalRaw = safeNum(gen.total)
  const genUsedRaw = safeNum(gen.used)
  const genFactor = genUnit === "GB" ? 1024 : 1
  const genTotalMB = genTotalRaw * genFactor
  const genUsedMB = genUsedRaw * genFactor

  // ===== 定向流量：同样转成 MB =====
  const dir = parsed.flowDir || {
    total: "0",
    used: "0",
    remain: "0",
    unit: "MB",
  }
  const dirUnit = dir.unit || "MB"
  const dirTotalRaw = safeNum(dir.total)
  const dirUsedRaw = safeNum(dir.used)
  const dirFactor = dirUnit === "GB" ? 1024 : 1
  const dirTotalMB = dirTotalRaw * dirFactor
  const dirUsedMB = dirUsedRaw * dirFactor

  // ===== 语音：分钟 =====
  const voiceTotal = safeNum(parsed.voice.total)
  const voiceUsed = safeNum(parsed.voice.used)
  const voiceRemain = safeNum(parsed.voice.remain)

  return {
    fee: {
      title: "剩余话费",
      balance: parsed.fee.val,
      unit: parsed.fee.unit,
    },
    // balance/unit 只是信息保留，展示时由 UI 统一格式化
    flow: {
      title: "通用流量",
      balance: gen.remain,
      unit: gen.unit,
      used: genUsedMB,      // ✅ 统一用 MB
      total: genTotalMB,
    },
    otherFlow: {
      title: "定向流量",
      balance: dir.remain,
      unit: dir.unit,
      used: dirUsedMB,      // ✅ 统一用 MB
      total: dirTotalMB,
    },
    voice: {
      title: "剩余语音",
      balance: voiceRemain.toFixed(0),
      unit: parsed.voice.unit || "分钟",
      used: voiceUsed,
      total: voiceTotal,
    },
    updateTime:
      typeof parsed.updateTime === "string"
        ? parsed.updateTime
        : nowHHMM(),
  }
}

// ================ 主渲染入口 ================

async function render() {
  // 只读一遍缓存，用于：
  //  - 继承 small_style / medium_style
  //  - 如果设置里没有刷新间隔，可以用缓存里的 refreshInterval 兜底
  const oldCache = loadFromCache() || {}
  const settings = loadChinaMobileSettings()

  const rawIntervalCandidate =
    typeof settings?.refreshInterval === "number"
      ? settings.refreshInterval
      : typeof oldCache.refreshInterval === "number"
        ? oldCache.refreshInterval
        : undefined

  const refreshInterval = resolveRefreshInterval(rawIntervalCandidate, 180)

  const nextUpdate = new Date(Date.now() + refreshInterval * 60 * 1000)
  const reloadPolicy: WidgetReloadPolicy = {
    policy: "after",
    date: nextUpdate,
  }

  // ================== Logo 本地缓存（对齐联通：避免 imageUrl 直链） ==================
  let logoFilePath: string | null = null

  try {
    logoFilePath = await Promise.race([
      ensureImageFilePath({
        url: MOBILE_LOGO_URL,
        cacheKey: "telecom_mobile.logo.cache.v1",
        filePrefix: "mobile_logo",
        fileExt: "png",
        forceRefresh: false,
      }),
      new Promise<string | null>((r) => setTimeout(() => r(null), 800)),
    ])

    if (!logoFilePath) {
      console.log("🖼️ 移动 Logo：首帧跳过下载（避免阻塞渲染）")
    } else {
      console.log("🖼️ 移动 Logo：使用本地缓存路径", logoFilePath)
    }
  } catch (e) {
    console.warn("⚠️ 移动 Logo：缓存异常，跳过显示", e)
    logoFilePath = null
  }

  // ========== 优先走 API ==========
  try {
    const apiData = await loadFromRewriteApi()
    if (apiData && apiData.fee) {
      const pData = parseData(apiData)
      if (pData && pData.ok) {
        pData.source = "API"
        pData.refreshInterval = refreshInterval

        // 保留旧缓存里的样式配置
        if (oldCache.small_style) pData.small_style = oldCache.small_style
        if (oldCache.medium_style) pData.medium_style = oldCache.medium_style
        if (!pData.updateTime && oldCache.updateTime) {
          pData.updateTime = oldCache.updateTime
        }

        saveToCache(pData)

        const mobileTelecomData = convertToTelecomData(pData)
        Widget.present(
          <WidgetRoot
            data={mobileTelecomData}
            settingsKey={SETTINGS_KEY}
            logoPath={logoFilePath || ""}
          />,
          reloadPolicy,
        )
        return
      }
    }
  } catch (e) {
    console.error("[中国移动] API 读取失败", e)
  }

  // ========== 回退到缓存 ==========
  const cache = oldCache
  if (cache && cache.ok && cache.fee) {
    cache.usingCache = true
    cache.source = "Cache"
    const mobileTelecomData = convertToTelecomData(cache)
    Widget.present(
      <WidgetRoot
        data={mobileTelecomData}
        settingsKey={SETTINGS_KEY}
        logoPath={logoFilePath || ""}
      />,
      reloadPolicy,
    )
    return
  }

  // ========== 最终兜底：错误提示 ==========
  console.error("[中国移动] 获取数据失败")
  Widget.present(
    <VStack spacing={8} padding={16} alignment="center">
      <Text font="headline">获取数据失败</Text>
      <Text font="body" foregroundStyle="secondaryLabel">
        请确保已安装重写规则
      </Text>
      <Text font="caption" foregroundStyle="secondaryLabel">
        请在主应用中点击「安装重写规则」按钮
      </Text>
    </VStack>,
    reloadPolicy,
  )
}

render()