// widget.tsx
// 业务逻辑层：只负责拉数据 + 解析 + 转成 TelecomData，然后交给 TelecomWidgetRoot 渲染。

import {
  Widget,
  Text,
  WidgetReloadPolicy,
  fetch,
} from "scripting"

import { TelecomWidgetRoot, TelecomData } from "./telecom/widgetRoot"
import { nowHHMM, formatFlowValue } from "./telecom/utils/telecomUtils"
import { ensureImageFilePath } from "./telecom/utils/imageCache"
import {
  UNICOM_SETTINGS_KEY,
  ChinaUnicomSettings,
  loadChinaUnicomSettings,
  resolveRefreshInterval,
} from "./telecom/settings"

// ================== 设置 Key ==================

const SETTINGS_KEY = UNICOM_SETTINGS_KEY

// ================== 接口 & 资源常量 ==================

// 话费 / 概览
const API_URL =
  "https://m.client.10010.com/mobileserviceimportant/home/queryUserInfoSeven?version=iphone_c@10.0100&desmobiel=13232135179&showType=0"

// 流量详情
const API_DETAIL_URL =
  "https://m.client.10010.com/servicequerybusiness/operationservice/queryOcsPackageFlowLeftContentRevisedInJune"

// 联通 Logo（用于话费卡大图标）
const UNICOM_LOGO_URL =
  "https://raw.githubusercontent.com/Nanako718/Scripting/refs/heads/main/images/10010.png"

// ================== 业务数据结构 ==================

type FeeData = {
  title: string
  balance: string
  unit: string
}

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

// ================== BoxJs / Cookie 读取 ==================

// 从 BoxJs 读取 Cookie（ComponentService -> ChinaUnicom.Settings.Cookie）
async function fetchCookieFromBoxJs(boxJsUrl: string): Promise<string | null> {
  const boxKey = "ComponentService"

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
      console.error("❌ 解析 BoxJs ComponentService JSON 失败:", e, "原始 val:", rawVal)
      return null
    }

    const cookie = root?.ChinaUnicom?.Settings?.Cookie
    if (cookie && typeof cookie === "string" && cookie.trim()) {
      console.log("✅ 从 BoxJs 成功读取联通 Cookie")
      return cookie.trim()
    } else {
      console.warn(
        "⚠️ ComponentService.ChinaUnicom.Settings.Cookie 不存在或格式不正确:",
        root,
      )
      return null
    }
  } catch (error) {
    console.error("🚨 从 BoxJs 读取 Cookie 异常:", error)
    return null
  }
}

// ================== API 请求 ==================

// 获取话费数据（仅从第一个 API）
async function fetchFeeData(cookie: string): Promise<FeeData | null> {
  try {
    console.log("📡 请求联通话费接口:", API_URL)
    const response = await fetch(API_URL, {
      headers: {
        Host: "m.client.10010.com",
        "User-Agent":
          "ChinaUnicom.x CFNetwork iOS/16.3 unicom{version:iphone_c@10.0100}",
        cookie: cookie,
      },
    })

    if (response.ok) {
      const data = await response.json()
      console.log("📦 话费接口返回 code:", data.code)

      if (data.code === "Y") {
        const { feeResource } = data
        const feeData: FeeData = {
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
        "User-Agent":
          "ChinaUnicom.x CFNetwork iOS/16.3 unicom{version:iphone_c@10.0100}",
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

// ================== 解析语音 & 通用流量 ==================

function extractVoiceAndFlowData(detailData: DetailApiResponse): {
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
} | null {
  try {
    // 语音
    const voiceResource = detailData.resources?.find((r) => r.type === "Voice")
    const voiceRemain = voiceResource?.remainResource || "0"
    const voiceUsed = voiceResource?.userResource || "0"
    const voiceTotal = parseFloat(voiceRemain) + parseFloat(voiceUsed)
    const voiceUnit = "分钟"

    // 通用流量：优先 flowSumList flowtype = "1"
    const generalFlow = detailData.flowSumList?.find(
      (item) => item.flowtype === "1",
    )
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
      `已用${formatFlowValue(flowUsedMB, "MB").balance}${formatFlowValue(
        flowUsedMB,
        "MB",
      ).unit} ` +
      `剩余${flowFormatted.balance}${flowFormatted.unit} ` +
      `总计${formatFlowValue(flowTotalMB, "MB").balance}${formatFlowValue(
        flowTotalMB,
        "MB",
      ).unit}`,
    )

    return result
  } catch (error) {
    console.error("❌ 提取语音/通用流量失败:", error)
    return null
  }
}

// ================== 主渲染入口 ==================

async function render() {
  const settings = loadChinaUnicomSettings() as ChinaUnicomSettings | null

  const refreshInterval = resolveRefreshInterval(settings?.refreshInterval, 180)
  const nextUpdate = new Date(Date.now() + refreshInterval * 60 * 1000)
  const reloadPolicy: WidgetReloadPolicy = {
    policy: "after",
    date: nextUpdate,
  }

  // 确定使用的 Cookie：如果开启了 BoxJs，优先从 BoxJs 读取
  let cookie = settings?.cookie || ""

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

  // ===== 封装为统一 TelecomData =====
  const mergedData: TelecomData = {
    fee: feeData,
    voice: voiceAndFlowData.voice,
    flow: voiceAndFlowData.flow,
    otherFlow: otherFlowData,
    updateTime: nowHHMM(),
  }

  // ================== Logo 本地缓存 ==================
  let logoFilePath: string | null = null

  try {
    // 给 logo 下载一个很短的预算：避免阻塞首帧（可选）
    logoFilePath = await Promise.race([
      ensureImageFilePath({
        url: UNICOM_LOGO_URL,
        cacheKey: "telecom_unicom.logo.cache.v1",
        filePrefix: "unicom_logo",
        fileExt: "png",
        forceRefresh: false,
      }),
      new Promise<string | null>((r) => setTimeout(() => r(null), 800)),
    ])

    if (!logoFilePath) {
      console.log("🖼️ 联通 Logo：首帧跳过下载（避免阻塞渲染）")
    } else {
      console.log("🖼️ 联通 Logo：使用本地缓存路径", logoFilePath)
    }
  } catch (e) {
    console.warn("⚠️ 联通 Logo：缓存异常，跳过显示", e)
    logoFilePath = null
  }

  Widget.present(
    <TelecomWidgetRoot
      data={mergedData}
      settingsKey={SETTINGS_KEY}
      logoPath={logoFilePath || ""}
    />,
    reloadPolicy,
  )
}

render()