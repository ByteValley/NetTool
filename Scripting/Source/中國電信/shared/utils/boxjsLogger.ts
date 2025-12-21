// shared/utils/boxjsLogger.ts
// 模块分类 · BoxJs Log Tap（把 console 输出缓冲写入 <Service>.Logs.log）
// - 一个生命周期内 hook，结束 restore（避免污染全局 console）
// - 默认 flush：overwrite（覆盖写最新 N 条）
// - 可选：append（追加写，最终保留最新 N 条）
//
// 模块分类 · 设计说明
// - “缓存写日志”：先写本地 buf，达到 flushEvery 或错误触发再 flush，减少请求次数
// - 时间戳采用 HH:mm:ss：更适合手机日志（比 ISO 更短）
// - overwriteStrategy=merge：在 overwrite 的基础上保留上一轮日志，体验更像连续日志
//   · replace：最快（不读旧 log）
//   · merge：更完整（读旧 log + 合并 tail），代价是多一次 get

import { boxjsClient, BOXJS_LOG_LIMITS } from "./boxjsClient"

type ConsoleLevel = "log" | "warn" | "error"
type FlushMode = "overwrite" | "append"
type OverwriteStrategy = "replace" | "merge"

export type BoxJsLoggerOptions = {
  serviceKey: string
  boxKey?: string

  // 模块分类 · flush 模式
  // - overwrite：覆盖写（写入最新 N 条）
  // - append：追加写（最终保留最新 N 条）
  mode?: FlushMode

  // 模块分类 · overwrite 模式：写入行数上限
  overwriteMaxLines?: number

  // 模块分类 · append 模式：最终保留行数上限
  appendMaxLines?: number

  // 模块分类 · overwrite 策略
  // - replace：每次 flush 只写本次 buf（省一次 get，最快）
  // - merge：flush 前读旧 Logs.log，再合并 tail（更像持续日志）
  overwriteStrategy?: OverwriteStrategy

  // 模块分类 · flush 触发
  // - flushEvery：buf 行数达到多少触发一次 flush
  // - flushOnError：console.error 时立刻触发 flush（降低崩溃丢日志概率）
  flushEvery?: number
  flushOnError?: boolean

  // 模块分类 · 行前缀（可选）
  // - 用于区分模块/服务，例如 "[12123]"
  prefix?: string
}

// =====================================================================
// 模块分类 · 全局默认配置收口
// =====================================================================
// - setBoxJsLoggerDefaults 用于“一处改，全局生效”
// - 注意：serviceKey 仍由每个模块单独传入
type BoxJsLoggerDefaults = Omit<BoxJsLoggerOptions, "serviceKey">

const DEFAULTS: Required<BoxJsLoggerDefaults> = {
  boxKey: "ComponentService",

  mode: "overwrite",
  overwriteMaxLines: BOXJS_LOG_LIMITS.overwriteDefault,
  appendMaxLines: BOXJS_LOG_LIMITS.appendDefault,

  overwriteStrategy: "replace",

  flushEvery: 20,
  flushOnError: true,
  prefix: "",
}

export function setBoxJsLoggerDefaults(partial: Partial<BoxJsLoggerDefaults>) {
  Object.assign(DEFAULTS, partial)
}

// =====================================================================
// 模块分类 · 小工具
// =====================================================================
function toLine(args: unknown[]): string {
  const parts = args.map((a) => {
    if (typeof a === "string") return a
    if (a instanceof Error) return a.stack || a.message || String(a)
    try {
      return JSON.stringify(a)
    } catch {
      return String(a)
    }
  })
  return parts.join(" ")
}

function pad2(n: number) {
  return String(n).padStart(2, "0")
}

function nowHMS() {
  const d = new Date()
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}`
}

// 模块分类 · 行数裁剪（与 boxjsClient 的 limits 一致）
// - 统一 clamp：flushEvery / overwriteMaxLines / appendMaxLines 都走这
function clampLines(n: unknown, fallback: number) {
  const v = typeof n === "number" ? n : Number(n)
  if (!Number.isFinite(v) || v <= 0) return fallback
  return Math.max(BOXJS_LOG_LIMITS.min, Math.min(BOXJS_LOG_LIMITS.max, Math.floor(v)))
}

function tailLines(lines: string[], maxLines: number) {
  const n = clampLines(maxLines, BOXJS_LOG_LIMITS.appendDefault)
  if (!Array.isArray(lines)) return []
  if (lines.length <= n) return lines
  return lines.slice(lines.length - n)
}

// 模块分类 · 规范化旧日志
// - BoxJS Logs.log 预期是 string[]；但也可能被误写为其它类型
// - 这里做宽容处理：只保留非空字符串行
function normalizeLines(lines: unknown): string[] {
  return (Array.isArray(lines) ? lines : [])
    .map((s) => String(s ?? ""))
    .filter((s) => s.trim())
}

export function createBoxJsConsoleTap(opts: BoxJsLoggerOptions) {
  // 模块分类 · 合并全局默认
  // - opts 优先级 > DEFAULTS
  // - 所有数值项都 clamp，避免异常配置导致无限增长或频繁 flush
  const merged: Required<BoxJsLoggerOptions> = {
    serviceKey: opts.serviceKey,
    boxKey: (opts.boxKey ?? DEFAULTS.boxKey) as any,

    mode: (opts.mode ?? DEFAULTS.mode) as any,
    overwriteMaxLines: clampLines(opts.overwriteMaxLines ?? DEFAULTS.overwriteMaxLines, DEFAULTS.overwriteMaxLines),
    appendMaxLines: clampLines(opts.appendMaxLines ?? DEFAULTS.appendMaxLines, DEFAULTS.appendMaxLines),

    overwriteStrategy: (opts.overwriteStrategy ?? DEFAULTS.overwriteStrategy) as any,

    flushEvery: clampLines(opts.flushEvery ?? DEFAULTS.flushEvery, DEFAULTS.flushEvery),
    flushOnError: (opts.flushOnError ?? DEFAULTS.flushOnError) as any,
    prefix: (opts.prefix ?? DEFAULTS.prefix) as any,
  }

  const {
    serviceKey,
    boxKey,

    mode,
    overwriteMaxLines,
    appendMaxLines,
    overwriteStrategy,

    flushEvery,
    flushOnError,
    prefix,
  } = merged

  const svc = boxjsClient.service(serviceKey, boxKey)

  // 模块分类 · 内存缓冲（本轮生命周期）
  const buf: string[] = []
  let flushing = false

  // 模块分类 · 备份原始 console（bind 避免丢 this）
  const original = {
    log: typeof console.log === "function" ? console.log.bind(console) : (..._args: unknown[]) => { },
    warn: typeof console.warn === "function" ? console.warn.bind(console) : (..._args: unknown[]) => { },
    error: typeof console.error === "function" ? console.error.bind(console) : (..._args: unknown[]) => { },
  }

  // 模块分类 · 写入 buf（不直接写 BoxJS，避免频繁请求）
  function push(level: ConsoleLevel, args: unknown[]) {
    const pre = prefix ? `${prefix} ` : ""
    const line = `${pre}${level.toUpperCase()}: ${toLine(args)}`
    buf.push(`${nowHMS()} ${line}`)

    // 达到阈值自动 flush
    if (buf.length >= flushEvery) {
      flush(`auto@${flushEvery}`).catch(() => { })
    }
  }

  // 模块分类 · flush：把 buf 写入 BoxJS
  // - append：batch appendLog（bridge 内部裁剪）
  // - overwrite：
  //   · replace：只写本次 lines（最快）
  //   · merge：读旧 log + 合并 tail（更像连续日志）
  async function flush(reason?: string) {
    if (!buf.length) return
    if (flushing) return
    flushing = true

    try {
      const lines = buf.splice(0, buf.length)
      if (reason) lines.push(`${nowHMS()} (flush) ${reason}`)

      if (mode === "append") {
        await svc.logAppendMany(lines, appendMaxLines)
        return
      }

      // overwrite
      if (overwriteStrategy === "merge") {
        const old = await svc.getLogs<any[]>()
        const prev = normalizeLines(old.json?.value)
        const out = tailLines([...prev, ...lines], overwriteMaxLines)
        await svc.logOverwrite(out, overwriteMaxLines)
      } else {
        await svc.logOverwrite(lines, overwriteMaxLines)
      }
    } finally {
      flushing = false
    }
  }

  // 模块分类 · hook console（写入原始 console + buf）
  function hook() {
    console.log = (...args: unknown[]) => {
      original.log(...args)
      push("log", args)
    }
    console.warn = (...args: unknown[]) => {
      original.warn(...args)
      push("warn", args)
    }
    console.error = (...args: unknown[]) => {
      original.error(...args)
      push("error", args)
      if (flushOnError) flush("onError").catch(() => { })
    }
  }

  // 模块分类 · restore console（避免影响后续脚本/预览）
  function restore() {
    console.log = original.log as any
    console.warn = original.warn as any
    console.error = original.error as any
  }

  // 模块分类 · 生命周期运行器
  // - hook -> 执行业务 -> finally flush + restore
  async function run<T>(fn: () => Promise<T>) {
    hook()
    try {
      return await fn()
    } finally {
      await flush("finally").catch(() => { })
      restore()
    }
  }

  return { hook, restore, flush, run }
}