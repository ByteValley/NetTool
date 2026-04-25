// shared/utils/cacheToolkit.ts
// 模块分类 · 通用缓存决策工具（交管/国网通用）
// 模块分类 · 能力概览
// - cacheScopeKey 指纹：绑定“账号/地区/配置”等作用域
// - TTL 计算：auto/fixed，且最小 TTL 下限保护
// - 模式决策：auto / cache_only / network_only / cache_disabled
// - 兜底规则：allowStaleOnError + maxStaleMinutes；allowStaleOnKeyMismatch
// - 统一日志：一条设置消费 + 一条决策输出（避免刷屏）
//
// 模块分类 · 注意事项
// - 本工具不依赖 Storage 具体实现；读写 meta 由业务侧负责
// - 只提供“决策/计算/格式化”，保持纯函数好复用

import type { CacheConfig, CacheMode } from "../ui-kit/cacheSection"

export type CacheDecisionMode =
  | "cache_fresh"
  | "network_fresh"
  | "cache_stale_fallback"
  | "none"
  | "cache_only_hit"
  | "cache_only_miss"
  | "network_only"
  | "cache_disabled"

export type CacheDecisionMeta = {
  cacheEnabled: boolean
  cacheMode: CacheMode
  ttlPolicy: "auto" | "fixed"
  ttlMinutes: number
  allowStaleOnError: boolean
  maxStaleMinutes: number
  allowStaleOnKeyMismatch: boolean

  keyMatched?: boolean
  cacheAgeMinutes?: number
  forceRefresh: boolean
  decision: string
}

export type CacheDecisionInput = {
  // 业务配置
  cache: CacheConfig
  refreshIntervalMinutes: number
  forceRefresh: boolean

  // 约束
  minCacheMs: number
  defaultMaxStaleMs: number
}

export type CacheDecisionState = {
  ttlMs: number
  maxStaleMs: number
  cacheEnabled: boolean
  cacheMode: CacheMode
  allowStaleOnError: boolean
  allowKeyMismatch: boolean
}

export type CacheDecisionResult = {
  ttlMs: number
  maxStaleMs: number
  cacheEnabled: boolean
  cacheMode: CacheMode
  allowStaleOnError: boolean
  allowKeyMismatch: boolean
}

// 模块分类 · 指纹（djb2）
// - 用于 cacheScopeKey 绑定，避免明文泄露
export function fingerprint(raw: string): string {
  const s = String(raw ?? "")
  let hash = 5381
  for (let i = 0; i < s.length; i++) hash = ((hash << 5) + hash) ^ s.charCodeAt(i)
  return `djb2:${(hash >>> 0).toString(36)}`
}

export function toMin(ms: number) {
  return Math.round(ms / 60000)
}

export function isFresh(updatedAt: number, ttlMs: number) {
  return Date.now() - updatedAt <= ttlMs
}

export function isWithinStale(updatedAt: number, maxStaleMs: number) {
  return Date.now() - updatedAt <= maxStaleMs
}

// 模块分类 · TTL 计算
export function ttlFromCacheSettings(input: CacheDecisionInput): { ttlMs: number; maxStaleMs: number } {
  const { cache, refreshIntervalMinutes, minCacheMs, defaultMaxStaleMs } = input

  const refreshMs = Math.max(0, Math.floor(refreshIntervalMinutes)) * 60 * 1000
  const fixedMs = Math.max(0, Math.floor(cache.ttlMinutesFixed)) * 60 * 1000

  const base = cache.ttlPolicy === "fixed" ? fixedMs : refreshMs
  const ttlMs = Math.max(minCacheMs, base)

  const maxStaleMs =
    Math.max(0, Math.floor(cache.maxStaleMinutes)) * 60 * 1000 || defaultMaxStaleMs

  return { ttlMs, maxStaleMs }
}

// 模块分类 · 决策输入收口（统一 “设置消费” 口径）
export function buildCacheDecisionState(input: CacheDecisionInput): CacheDecisionState {
  const cacheSettings = input.cache
  const cacheEnabled = cacheSettings.enabled !== false
  const cacheMode: CacheMode = cacheSettings.mode
  const allowStaleOnError = cacheSettings.allowStaleOnError !== false
  const allowKeyMismatch = cacheSettings.allowStaleOnKeyMismatch !== false

  const { ttlMs, maxStaleMs } = ttlFromCacheSettings(input)

  return {
    ttlMs,
    maxStaleMs,
    cacheEnabled,
    cacheMode,
    allowStaleOnError,
    allowKeyMismatch,
  }
}

// 模块分类 · 统一日志（设置消费）
// - 只负责拼字串：业务侧决定是否 console.log
export function formatCacheSettingsLog(args: {
  prefix: string
  cacheEnabled: boolean
  cacheMode: CacheMode
  ttlPolicy: "auto" | "fixed"
  ttlMs: number
  allowStaleOnError: boolean
  maxStaleMs: number
  allowKeyMismatch: boolean
  refreshMinutes: number
  forceRefresh: boolean
  keyMatched?: boolean
  boundKeyShort: string
  timeoutText?: string
}) {
  const {
    prefix,
    cacheEnabled,
    cacheMode,
    ttlPolicy,
    ttlMs,
    allowStaleOnError,
    maxStaleMs,
    allowKeyMismatch,
    refreshMinutes,
    forceRefresh,
    keyMatched,
    boundKeyShort,
    timeoutText,
  } = args

  return (
    `🧠 ${prefix} Cache 设置消费：` +
    `enabled=${cacheEnabled ? "Y" : "N"} | mode=${cacheMode}` +
    ` | ttlPolicy=${ttlPolicy} | ttl=${toMin(ttlMs)}min` +
    ` | allowStale=${allowStaleOnError ? "Y" : "N"} | maxStale=${toMin(maxStaleMs)}min` +
    ` | allowKeyMismatch=${allowKeyMismatch ? "Y" : "N"}` +
    ` | refresh=${refreshMinutes}min | force=${forceRefresh ? "Y" : "N"}` +
    ` | keyMatched=${keyMatched === undefined ? "-" : keyMatched ? "Y" : "N"}` +
    ` | boundKey=${boundKeyShort}` +
    (timeoutText ? ` | ${timeoutText}` : "")
  )
}