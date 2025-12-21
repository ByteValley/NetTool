// shared/utils/cacheDecisionLog.ts
// 模块分类 · 缓存决策日志（通用）
// 模块分类 · 设计目标
// - 复用交管“策略/决策/兜底命中”日志格式
// - 单行、强语义、可快速定位问题（TTL/缓存年龄/兜底来源/是否强刷）
// - 默认不刷屏：debugLog=true 才输出“细节”，info 只输出关键三行

import { kv } from "./widgetKit"

export type CacheDecisionVia = "boxjs" | "local" | "network" | "none"

export type CacheDecisionContext = {
  tag: string // e.g. "WSGW" / "12123"
  enabled: boolean
  mode: string // auto/cache_only/network_only/...
  ttlMin: number
  allowStale: boolean
  maxStaleMin: number
  refreshMin: number
  force: boolean
  cacheAgeMin?: number
  via?: CacheDecisionVia
}

function yn(b: boolean) {
  return b ? "是" : "否"
}

function viaLabel(v?: CacheDecisionVia) {
  if (v === "boxjs") return "BoxJS"
  if (v === "local") return "本地"
  if (v === "network") return "网络"
  if (v === "none") return "无"
  return "-"
}

export function logCachePolicy(ctx: CacheDecisionContext, opts?: { debugLog?: boolean }) {
  // 交管风格：策略一行（info）
  console.log(
    `🧠 ${ctx.tag} 缓存策略：` +
    `启用｜模式=${ctx.mode}` +
    `｜TTL=${ctx.ttlMin}分钟` +
    `｜兜底=${ctx.allowStale ? "允许" : "不允许"}` +
    `｜最大陈旧=${ctx.maxStaleMin}分钟` +
    `｜刷新间隔=${ctx.refreshMin}分钟` +
    `｜强制刷新=${yn(ctx.force)}` +
    `｜当前缓存=${ctx.cacheAgeMin == null ? "-" : `${ctx.cacheAgeMin}分钟（${viaLabel(ctx.via)}）`}`,
  )

  // debug：再补一行结构化 kv（便于你 grep/对比）
  if (opts?.debugLog) {
    console.log(`🧩 ${ctx.tag} 缓存策略(debug)：${kv({
      enabled: ctx.enabled ? "Y" : "N",
      mode: ctx.mode,
      ttlMin: ctx.ttlMin,
      allowStale: ctx.allowStale ? "Y" : "N",
      maxStaleMin: ctx.maxStaleMin,
      refreshMin: ctx.refreshMin,
      force: ctx.force ? "Y" : "N",
      cacheAgeMin: ctx.cacheAgeMin ?? "-",
      via: viaLabel(ctx.via),
    })}`)
  }
}

export function logCacheDecision(
  tag: string,
  msg: string,
  extra?: Record<string, unknown>,
) {
  // 决策一行（info）
  console.log(`🧠 ${tag} 缓存决策：${msg}${extra ? ` · ${kv(extra)}` : ""}`)
}

export function logStaleHit(
  tag: string,
  args: {
    cacheAgeMin: number
    maxStaleMin: number
    via?: CacheDecisionVia
  },
) {
  console.log(
    `🧠 ${tag} 兜底命中：缓存年龄=${args.cacheAgeMin}分钟｜最大陈旧=${args.maxStaleMin}分钟｜来源=${viaLabel(args.via)}`,
  )
}