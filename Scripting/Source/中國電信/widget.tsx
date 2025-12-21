// widget.tsx（中国电信 / CT）
// 模块分类 · Widget 渲染入口（业务层）
// 模块分类 · 设计要点
// - 职责：拉数据 + 转成统一 CarrierData，然后交给 WidgetRoot 渲染
// - 缓存：本地“固定单文件”存业务数据（ct_data.json），Storage 仅存 meta（updatedAt/keyFp/fileName/baseDir）
// - 隔离：cacheScopeKey -> fingerprint 绑定（支持 allowStaleOnKeyMismatch 复用）
// - 模式：auto / cache_only / network_only / cache_disabled（对齐 cacheSection）
// - 日志：启动 1 行 + 配置消费 1 行 + 缓存策略/决策 1~2 行 + Logo 1 行 + 渲染完成 1 行
// - 稳定性：meta 解析容错、错误信息可读、网络失败可兜底旧缓存（由 telecomApi 注入 __cacheMeta）

import { Widget, Text, WidgetReloadPolicy } from "scripting"

import { WidgetRoot, type CarrierData } from "./shared/carrier/widgetRoot"
import { nowHHMM } from "./shared/carrier/utils/carrierUtils"
import { pickUiSettings } from "./shared/carrier/ui"

import {
  SETTINGS_KEY,
  DATA_CACHE_KEY,
  LOGO_URL,
  LOGO_CACHE_KEY,
  loadChinaTelecomSettings,
  resolveRefreshInterval,
  type ChinaTelecomSettings,
} from "./settings"

import { safeGetObject, safeSetObject } from "./shared/utils/storage"
import { readJsonFromSingleFile, writeJsonToSingleFileAtomic, getCachedImagePath } from "./shared/utils/fileCache"
import { kv, errToString, srcLabel } from "./shared/utils/widgetKit"

import { queryImportantData } from "./telecomApi"

// =====================================================================
// 模块分类 · 单文件缓存（业务聚合数据）
// =====================================================================
type TelecomBoxMeta = {
  updatedAt: number
  keyFp: string
  dataFileName: string
  baseDir: "documents" | "library" | "temporary"
}

const CT_DATA_FILE = "ct_data.json"
const CT_DATA_BAK = "ct_data.bak.json"

function fingerprint(raw: string): string {
  const s = String(raw ?? "")
  let hash = 5381
  for (let i = 0; i < s.length; i++) hash = ((hash << 5) + hash) ^ s.charCodeAt(i)
  return `djb2:${(hash >>> 0).toString(36)}`
}

function toMin(ms: number) {
  return Math.round(ms / 60000)
}

function isWithin(ms: number, now: number, ts: number): boolean {
  return now - ts <= ms
}

function computeTtlMs(settings: ChinaTelecomSettings): number {
  const cfg = settings.cache
  const refreshMs = Math.max(5, settings.refreshInterval || 180) * 60 * 1000
  if (cfg.ttlPolicy === "fixed") return Math.max(1, Number(cfg.ttlMinutesFixed) || 0) * 60 * 1000
  return Math.max(4 * 60 * 60 * 1000, refreshMs)
}

function boundKeyFromSettings(settings: ChinaTelecomSettings): string {
  const k = String((settings as any)?.cacheScopeKey || "").trim()
  return k ? k : SETTINGS_KEY
}

function readTelecomCache(boundKey: string, allowKeyMismatch: boolean): { meta: TelecomBoxMeta; data: CarrierData; keyMatched: boolean } | null {
  const meta = safeGetObject<TelecomBoxMeta | null>(DATA_CACHE_KEY, null)
  if (!meta) return null

  if (typeof meta.updatedAt !== "number" || !Number.isFinite(meta.updatedAt)) return null
  if (typeof meta.dataFileName !== "string" || !meta.dataFileName) return null
  if (meta.baseDir !== "documents" && meta.baseDir !== "library" && meta.baseDir !== "temporary") return null
  if (typeof meta.keyFp !== "string" || !meta.keyFp) return null

  const wantFp = fingerprint(boundKey)
  const keyMatched = meta.keyFp === wantFp
  if (!keyMatched && !allowKeyMismatch) return null

  const hit = readJsonFromSingleFile<CarrierData>({
    dataFileName: meta.dataFileName,
    baseDir: meta.baseDir,
    backupFileName: CT_DATA_BAK,
  })

  if (!hit?.data) return null
  return { meta, data: hit.data, keyMatched }
}

function writeTelecomCache(boundKey: string, data: CarrierData): number {
  const ok = writeJsonToSingleFileAtomic({
    dataFileName: CT_DATA_FILE,
    backupFileName: CT_DATA_BAK,
    baseDir: "documents",
    data,
  })
  if (!ok) throw new Error("writeJsonToSingleFileAtomic failed")

  const now = Date.now()
  const meta: TelecomBoxMeta = {
    updatedAt: now,
    keyFp: fingerprint(boundKey),
    dataFileName: CT_DATA_FILE,
    baseDir: "documents",
  }
  safeSetObject(DATA_CACHE_KEY, meta)
  return now
}

// =====================================================================
// 模块分类 · 数值/格式工具
// =====================================================================
function safeN(v: any): number {
  const n = typeof v === "number" ? v : parseFloat(v ?? "0")
  return Number.isFinite(n) ? n : 0
}

function formatFlowMB(mb: number): { balance: string; unit: "MB" | "GB" } {
  if (!Number.isFinite(mb) || mb <= 0) return { balance: "0", unit: "MB" }
  if (mb >= 1024) return { balance: (mb / 1024).toFixed(2), unit: "GB" }
  return { balance: Math.floor(mb).toString(), unit: "MB" }
}

// =====================================================================
// 模块分类 · 转成统一 CarrierData
// =====================================================================
function convertToCarrierData(raw: any): CarrierData {
  // queryImportantData() 返回 data（并注入 __cacheMeta）；这里做一层兼容
  const d = raw?.responseData?.data ?? raw
  if (!d) throw new Error("电信：API 数据为空")

  // ===== 话费 =====
  const idx = d?.balanceInfo?.indexBalanceDataInfo
  const rawBalance = safeN(idx?.balance)
  const arrear = safeN(idx?.arrear)
  const remainFee = arrear > 0 ? rawBalance - arrear : rawBalance

  // ===== 语音 =====
  const v = d?.voiceInfo?.voiceDataInfo
  const voiceRemain = safeN(v?.balance)
  const voiceUsed = safeN(v?.used)
  const voiceTotalRaw = safeN(v?.total)
  const voiceTotal = voiceTotalRaw > 0 ? voiceTotalRaw : voiceRemain + voiceUsed

  // ===== 流量（通用/定向）=====
  // 注意：balance/used 多数是 KB，原逻辑 /1024 => MB
  const flowInfo = d?.flowInfo || {}
  const commonFlow = flowInfo?.commonFlow
  const specialAmount = flowInfo?.specialAmount

  let commonRemainMB = safeN(commonFlow?.balance) / 1024
  let commonUsedMB = safeN(commonFlow?.used) / 1024

  let dirRemainMB = safeN(specialAmount?.balance) / 1024
  let dirUsedMB = safeN(specialAmount?.used) / 1024

  const hasCommonFromBytes = commonRemainMB > 0 || commonUsedMB > 0
  const hasDirFromBytes = dirRemainMB > 0 || dirUsedMB > 0
  const flowList: any[] = Array.isArray(flowInfo?.flowList) ? flowInfo.flowList : []

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
  const DIR_KEYWORDS = ["专用", "定向", "专属"]

  if (flowList.length > 0) {
    for (const item of flowList) {
      const title = String(item?.title || "")
      const usedStr = String(item?.leftTitleHh || "")
      const remainStr = String(item?.rightTitleHh || "")

      const usedMB = parseFlowStrToMB(usedStr)
      const remainMB = parseFlowStrToMB(remainStr)
      if (usedMB <= 0 && remainMB <= 0) continue

      const isCommon = COMMON_KEYWORDS.some((k) => title.includes(k))
      const isDir = DIR_KEYWORDS.some((k) => title.includes(k))

      // 有 bytes 源（common/special）就不重复叠加
      if (isCommon && hasCommonFromBytes) continue
      if (isDir && hasDirFromBytes) continue

      if (isCommon && !hasCommonFromBytes) {
        commonUsedMB += usedMB
        commonRemainMB += remainMB
      } else {
        dirUsedMB += usedMB
        dirRemainMB += remainMB
      }
    }
  }

  // 只有“定向”没有“通用”：按原逻辑视作通用
  if (commonRemainMB === 0 && commonUsedMB === 0 && (dirRemainMB > 0 || dirUsedMB > 0)) {
    commonRemainMB = dirRemainMB
    commonUsedMB = dirUsedMB
    dirRemainMB = 0
    dirUsedMB = 0
  }

  const commonTotalMB = commonRemainMB + commonUsedMB
  const dirTotalMB = dirRemainMB + dirUsedMB

  const commonFmt = formatFlowMB(commonRemainMB)
  const dirFmt = formatFlowMB(dirRemainMB)

  return {
    fee: { title: arrear > 0 ? "账户余额" : "剩余话费", balance: remainFee.toFixed(2), unit: "元" },
    flow: {
      title: "通用流量",
      balance: commonFmt.balance,
      unit: commonFmt.unit,
      used: commonUsedMB,
      total: commonTotalMB,
    },
    otherFlow:
      dirTotalMB > 0
        ? { title: "定向流量", balance: dirFmt.balance, unit: dirFmt.unit, used: dirUsedMB, total: dirTotalMB }
        : undefined,
    voice: {
      title: "剩余语音",
      balance: voiceRemain.toFixed(0),
      unit: "分钟",
      used: voiceUsed,
      total: voiceTotal,
    },
    updateTime: nowHHMM(),
  }
}

// =====================================================================
// 模块分类 · 主渲染入口
// =====================================================================
async function render() {
  const t0 = Date.now()

  const settings = loadChinaTelecomSettings()
  const ui = pickUiSettings(settings)

  const refreshInterval = resolveRefreshInterval((settings as any)?.refreshInterval, 180)
  const nextUpdate = new Date(Date.now() + refreshInterval * 60 * 1000)
  const reloadPolicy: WidgetReloadPolicy = { policy: "after", date: nextUpdate }

  const forceRefresh = settings.cache?.mode === "network_only"
  const ttlMs = computeTtlMs(settings)

  const boundKey = boundKeyFromSettings(settings)
  const boundKeyShort = fingerprint(boundKey).slice(0, 12)

  const allowKeyMismatch = settings.cache.allowStaleOnKeyMismatch !== false

  console.log(`🚀 组件启动 | carrier=CT | refresh=${refreshInterval}m`)
  console.log(
    `⚙️ 配置读取 | ${kv({
      cacheEnabled: settings.cache.enabled ? "Y" : "N",
      cacheMode: settings.cache.mode,
      ttlPolicy: settings.cache.ttlPolicy,
      ttlFixed: settings.cache.ttlMinutesFixed,
      allowStale: settings.cache.allowStaleOnError ? "Y" : "N",
      maxStale: settings.cache.maxStaleMinutes,
      allowKeyMismatch: allowKeyMismatch ? "Y" : "N",
      force: forceRefresh ? "Y" : "N",
      boundKey: boundKeyShort,
    })}`,
  )

  // ===================================================================
  // 模块分类 · 读取单文件缓存（仅用于 Widget 聚合数据）
  // ===================================================================
  const hit = settings.cache.enabled ? readTelecomCache(boundKey, allowKeyMismatch) : null
  const meta = hit?.meta ?? null
  const cached = hit?.data ?? null

  const cacheAgeMin = meta?.updatedAt ? toMin(Date.now() - meta.updatedAt) : undefined
  const keyMatched = hit ? hit.keyMatched : undefined
  const fresh = !!meta?.updatedAt && isWithin(ttlMs, Date.now(), meta.updatedAt)

  console.log(
    `🧠 缓存策略：` +
    `启用=${settings.cache.enabled ? "Y" : "N"}` +
    `｜模式=${settings.cache.mode}` +
    `｜TTL=${toMin(ttlMs)}分钟` +
    `｜兜底=${settings.cache.allowStaleOnError ? "允许" : "禁止"}` +
    `｜最大陈旧=${Math.max(1, settings.cache.maxStaleMinutes)}分钟` +
    `｜刷新=${refreshInterval}分钟` +
    `｜强制刷新=${forceRefresh ? "是" : "否"}` +
    `｜当前缓存=${cacheAgeMin == null ? "-" : `${cacheAgeMin}分钟`}` +
    `｜keyMatched=${keyMatched === undefined ? "-" : keyMatched ? "Y" : "N"}` +
    `｜boundKey=${boundKeyShort}`,
  )

  let cachedData: CarrierData | null = null
  let decision = "none"

  if (settings.cache.enabled === false) {
    decision = "cache_disabled(read_off)"
  } else if (settings.cache.mode === "cache_only") {
    if (cached) {
      cachedData = cached
      decision = keyMatched ? "cache_only -> hit" : "cache_only -> hit(key_mismatch_reuse)"
    } else {
      decision = "cache_only -> miss"
    }
  } else if (settings.cache.mode !== "network_only") {
    if (cached && fresh && !forceRefresh) {
      cachedData = cached
      decision = keyMatched ? "auto -> cache_fresh" : "auto -> cache_fresh(key_mismatch_reuse)"
    } else {
      decision = forceRefresh ? "auto -> force_refresh" : "auto -> need_network"
    }
  } else {
    decision = "network_only -> need_network"
  }

  // ===================================================================
  // 模块分类 · Logo（图片仍走 fileCache 图片缓存）
  // ===================================================================
  const logoPath = await getCachedImagePath({
    url: LOGO_URL,
    cacheKey: LOGO_CACHE_KEY,
    filePrefix: "ct_logo",
    fileExt: "png",
    baseDir: "documents",
  })

  console.log(
    logoPath
      ? `🖼️ Logo：local_ok · path=${logoPath}`
      : `🖼️ Logo：miss/timeout · continue_render`,
  )

  // ===================================================================
  // 模块分类 · 命中缓存直接渲染
  // ===================================================================
  if (cachedData) {
    console.log(`🧠 缓存决策：${decision} | age=${cacheAgeMin ?? "-"}min`)
    const tag = fresh ? "缓存" : "缓存(旧)"
    const dataForRender: CarrierData = { ...cachedData, updateTime: `${nowHHMM()}·${tag}` }

    console.log(
      `✅ 渲染完成 | run=${nowHHMM()} | src=${srcLabel("local", true)} | cost=${Date.now() - t0}ms | decision=${decision}`,
    )

    Widget.present(<WidgetRoot data={dataForRender} ui={ui} logoPath={logoPath} />, reloadPolicy)
    return
  }

  // cache_only miss：直接失败
  if (settings.cache.enabled !== false && settings.cache.mode === "cache_only") {
    console.warn("⚠️ 缓存决策：cache_only -> miss（无可用缓存）")
    Widget.present(<Text>⚠️ 无可用缓存（cache_only）</Text>, reloadPolicy)
    return
  }

  // ===================================================================
  // 模块分类 · 网络请求（由 telecomApi 内部做缓存/重登/超时/注入 __cacheMeta）
  // ===================================================================
  try {
    const raw = await queryImportantData(forceRefresh)

    if (!raw) {
      // 这里已经代表 telecomApi 认为网络失败（或鉴权失败）且无数据
      // Widget 侧再兜底一次“聚合缓存”（与移动/联通一致）
      if (settings.cache.enabled && settings.cache.allowStaleOnError && cached && meta?.updatedAt) {
        const maxStaleMs = Math.max(1, settings.cache.maxStaleMinutes) * 60 * 1000
        const within = isWithin(maxStaleMs, Date.now(), meta.updatedAt)

        console.warn(
          `🧠 缓存决策：网络失败 → ${within ? "启用兜底缓存" : "兜底失败(过期)"} | age=${cacheAgeMin ?? "-"}min | maxStale=${toMin(maxStaleMs)}min`,
        )

        if (within) {
          const dataForRender: CarrierData = { ...cached, updateTime: `${nowHHMM()}·兜底缓存` }
          console.log(
            `✅ 渲染完成 | run=${nowHHMM()} | src=${srcLabel("local", true)} | cost=${Date.now() - t0}ms | decision=stale_fallback`,
          )
          Widget.present(<WidgetRoot data={dataForRender} ui={ui} logoPath={logoPath} />, reloadPolicy)
          return
        }
      }

      Widget.present(<Text>获取数据失败，请检查账号/密码或网络。</Text>, reloadPolicy)
      return
    }

    // raw 已包含 __cacheMeta（telecomApi 注入），这里可用于排障日志
    const meta2 = (raw as any)?.__cacheMeta
    if (meta2) {
      console.log(
        `🧠 CT API meta：${kv({
          fromCache: meta2.fromCache ? "Y" : "N",
          mode: meta2.mode ?? "-",
          fetchedAt: typeof meta2.fetchedAt === "number" ? meta2.fetchedAt : "-",
          cacheUpdatedAt: typeof meta2.cacheUpdatedAt === "number" ? meta2.cacheUpdatedAt : "-",
          decision: meta2.decision ?? "-",
        })}`,
      )
    }

    const mergedData = convertToCarrierData(raw)

    // cache.enabled=false：语义是不“读”缓存，但网络成功仍写缓存（方便你以后打开缓存秒命中）
    try {
      const cacheUpdatedAt = writeTelecomCache(boundKey, mergedData)
      console.log(
        `💾 写缓存成功 | updatedAt=${cacheUpdatedAt} | boundKey=${fingerprint(boundKey).slice(0, 12)}`,
      )
    } catch (e) {
      console.warn(`⚠️ 写缓存异常 | ${errToString(e)}`)
    }

    console.log(
      `✅ 渲染完成 | run=${nowHHMM()} | src=${srcLabel(meta2?.fromCache ? "local" : "network", !!meta2?.fromCache)} | cost=${Date.now() - t0}ms | decision=network_ok`,
    )

    Widget.present(<WidgetRoot data={mergedData} ui={ui} logoPath={logoPath} />, reloadPolicy)
  } catch (e) {
    const msg = errToString(e)
    console.warn(`⛔️ 电信渲染异常 | ${msg}`)
    Widget.present(<Text>⚠️ {msg}</Text>, reloadPolicy)
  }
}

render()