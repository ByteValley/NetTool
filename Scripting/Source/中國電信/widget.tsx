// widget.tsx
// 电信小组件入口：只负责拉数据 + 解析 + 转成 TelecomData，然后交给 TelecomWidgetRoot 渲染。

import {
  Widget,
  Text,
  WidgetReloadPolicy,
  fetch,
} from "scripting"

declare const Storage: any
declare const FileManager: any

import { TelecomWidgetRoot, TelecomData } from "./telecom/widgetRoot"
import { nowHHMM, safeNum, formatFlowValue } from "./telecom/utils/telecomUtils"
import {
  TELECOM_SETTINGS_KEY,
  loadChinaTelecomSettings,
  resolveRefreshInterval,
} from "./telecom/settings"
import { queryImportantData } from "./telecomApi"

// ================== 常量 ==================

const SETTINGS_KEY = TELECOM_SETTINGS_KEY

// 中国电信 Logo（可 filePath / URL）
// 这里保留你原来的「下载并缓存到本地」逻辑
const LOGO_URL =
  "https://raw.githubusercontent.com/Nanako718/Scripting/refs/heads/main/images/10000.png"
const LOGO_CACHE_KEY = "chinaTelecom_logo_path"

// ================== Logo 缓存 ==================

async function getLogoPath(): Promise<string> {
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
      console.error("[ChinaTelecom] 下载 Logo 失败:", response.status)
      return LOGO_URL // 退化为直接使用 URL
    }

    const imageData = await response.arrayBuffer()
    const fileName = "chinaTelecom_logo.png"
    const tempDir = FileManager?.temporaryDirectory
    if (!tempDir) return LOGO_URL

    const filePath = `${tempDir}/${fileName}`
    const uint8Array = new Uint8Array(imageData)
    FileManager?.writeAsBytesSync?.(filePath, uint8Array)
    Storage?.set?.(LOGO_CACHE_KEY, filePath)

    return filePath
  } catch (error) {
    console.error("[ChinaTelecom] 获取 Logo 失败:", error)
    return LOGO_URL
  }
}

// ================== API 响应 -> TelecomData ==================

function convertToTelecomData(apiData: any): TelecomData {
  console.log("📦 [Telecom] 原始 apiData =", JSON.stringify(apiData))

  const responseData = apiData?.responseData?.data
  if (!responseData) {
    console.error("❌ [Telecom] API 响应数据格式不正确，无 responseData.data")
    throw new Error("API 响应数据格式不正确")
  }

  // ===== 话费 =====
  const balanceInfo = responseData.balanceInfo
  const indexBalanceDataInfo = balanceInfo?.indexBalanceDataInfo
  const phoneBillRegion = balanceInfo?.phoneBillRegion

  const rawBalance = safeNum(indexBalanceDataInfo?.balance)
  const arrear = safeNum(indexBalanceDataInfo?.arrear)

  // 「账户余额」= 余额 - 欠费
  let remainFee = rawBalance
  if (arrear > 0) remainFee = rawBalance - arrear

  // 实时费用（目前只用于日志，UI 统一展示余额）
  let realTimeFee = 0
  if (phoneBillRegion?.subTitleHh) {
    realTimeFee = safeNum(
      String(phoneBillRegion.subTitleHh).replace("元", ""),
    )
  }

  console.log(
    "💰 [Telecom] 话费：rawBalance=",
    rawBalance,
    "arrear=",
    arrear,
    "remainFee=",
    remainFee,
    "realTimeFee=",
    realTimeFee,
  )

  const feeTitle = arrear > 0 ? "账户余额" : "剩余话费"
  const feeData: TelecomData["fee"] = {
    title: feeTitle,
    balance: remainFee.toFixed(2),
    unit: "元",
  }

  // ===== 语音 =====
  const voiceInfo = responseData.voiceInfo
  const voiceDataInfo = voiceInfo?.voiceDataInfo

  const voiceBalance = safeNum(voiceDataInfo?.balance)
  const voiceUsed = safeNum(voiceDataInfo?.used)
  const voiceTotalRaw = safeNum(voiceDataInfo?.total)
  const voiceTotal =
    voiceTotalRaw > 0 ? voiceTotalRaw : voiceUsed + voiceBalance

  console.log(
    "📞 [Telecom] 语音：balance=",
    voiceBalance,
    "used=",
    voiceUsed,
    "total=",
    voiceTotal,
  )

  const voiceData: TelecomData["voice"] = {
    title: "剩余语音",
    balance: voiceBalance.toFixed(0),
    unit: "分钟",
    used: voiceUsed,
    total: voiceTotal,
  }

  // ===== 流量（通用 + 定向） =====
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
    "📶 [Telecom] 通用流量(KB): remain=",
    commonRemainKB,
    "used=",
    commonUsedKB,
  )
  console.log(
    "🌐 [Telecom] 定向流量(KB): remain=",
    specialRemainKB,
    "used=",
    specialUsedKB,
  )

  let commonRemainMB = commonRemainKB / 1024
  let commonUsedMB = commonUsedKB / 1024
  let specialRemainMB = specialRemainKB / 1024
  let specialUsedMB = specialUsedKB / 1024

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
    console.log("📶 [Telecom] flowList 条数:", flowList.length)

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
        "| used=",
        usedStr,
        "=>",
        usedMB,
        "MB; remain=",
        remainStr,
        "=>",
        remainMB,
        "MB",
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

  // 如果仅有「其他」没有通用，则视作通用
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
    "📶 [Telecom] 通用流量 MB: remain=",
    commonRemainMB,
    "used=",
    commonUsedMB,
    "total=",
    commonTotalMB,
  )
  console.log(
    "🌐 [Telecom] 定向流量 MB: remain=",
    specialRemainMB,
    "used=",
    specialUsedMB,
    "total=",
    specialTotalMB,
  )

  // TelecomWidgetRoot 期望：balance/unit 只是「展示用」，used/total 统一使用 MB 数值
  const flowRemainFormatted = formatFlowValue(commonRemainMB, "MB")
  const flowData: TelecomData["flow"] = {
    title: "通用流量",
    balance: flowRemainFormatted.balance,
    unit: flowRemainFormatted.unit,
    used: commonUsedMB,
    total: commonTotalMB,
  }

  let otherFlowData: TelecomData["otherFlow"] | undefined
  if (specialRemainMB > 0 || specialUsedMB > 0) {
    const otherRemainFormatted = formatFlowValue(specialRemainMB, "MB")
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
    flow: flowData,
    otherFlow: otherFlowData,
    updateTime: nowHHMM(),
  }

  console.log("✅ [Telecom] 最终 TelecomData =", JSON.stringify(result))
  return result
}

// ================== 主渲染入口 ==================

async function render() {
  const settings = loadChinaTelecomSettings()

  // 没有配置手机号 / 密码，直接提示
  if (!settings || !settings.mobile || !settings.password) {
    const reloadPolicy: WidgetReloadPolicy = {
      policy: "after",
      date: new Date(Date.now() + 30 * 60 * 1000),
    }
    Widget.present(<Text>请先在主应用中设置电信手机号和密码</Text>, reloadPolicy)
    return
  }

  const refreshInterval = resolveRefreshInterval(settings.refreshInterval, 180)
  const nextUpdate = new Date(Date.now() + refreshInterval * 60 * 1000)
  const reloadPolicy: WidgetReloadPolicy = {
    policy: "after",
    date: nextUpdate,
  }

  try {
    const logoPath = await getLogoPath()
    const apiData = await queryImportantData()
    const telecomData = convertToTelecomData(apiData)

    Widget.present(
      <TelecomWidgetRoot
        data={telecomData}
        settingsKey={SETTINGS_KEY}
        logoPath={logoPath}
      />,
      reloadPolicy,
    )
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    console.error("[ChinaTelecom] 渲染失败:", errorMessage)
    Widget.present(<Text>发生错误: {errorMessage}</Text>, reloadPolicy)
  }
}

render()