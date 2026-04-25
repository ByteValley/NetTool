// shared/utils/boxjsClient.ts
// 模块分类 · BoxJs Bridge Client（Scripting）
// - baseUrl 内置，不在业务侧暴露（避免业务脚本到处散落 URL）
// - 默认 boxKey：ComponentService（BoxJS 存储根）
// - 提供：get / set / appendLog / batch + service() 前缀封装（Caches / Logs）
//
// 模块分类 · Logs 策略
// - overwrite：覆盖写 Logs.log（写入“最新 N 条”，不会无限增长）
// - append：追加写 Logs.log（bridge 内部裁剪，最终保留“最新 maxLines 条”）
//
// 模块分类 · 设计说明
// - 本 Client 是“bridge API”的薄封装：只负责协议与容错，不掺业务逻辑
// - shouldPost：payload 过长或 batch 时改 POST，避免 URL 过长导致请求失败
// - success 判定：兼容不同 bridge 返回字段（ok / wrote / success）

import { fetch } from "scripting"

type BoxJsBridgeAction = "set" | "appendLog" | "get" | "batch"

export type BoxJsBatchOp =
  | { op: "set"; path: string; value: any; create?: boolean }
  | { op: "appendLog"; path: string; line: string; maxLines?: number }
  | { op: "get"; path: string }

type BoxJsBridgeJson<T = any> = {
  ok?: boolean
  wrote?: boolean
  success?: boolean
  value?: T
  results?: any[]
}

export type BoxJsBridgeResponse<T = any> = {
  success: boolean
  status: number
  text: string
  json?: BoxJsBridgeJson<T>
}

type FetchLikeResponse = {
  ok: boolean
  status: number
  text(): Promise<string>
}

// =====================================================================
// 模块分类 · 常量收口（Logs）
// =====================================================================
// - min/max：限制“最终写入 BoxJS 的日志行数”范围，防止配置异常导致爆量写入
// - overwriteDefault：overwrite 模式默认保留最新多少行（更像“本轮日志快照”）
// - appendDefault：append 模式默认最终保留最新多少行（更像“持续滚动日志”）
export const BOXJS_LOG_LIMITS: {
  min: number
  max: number
  overwriteDefault: number
  appendDefault: number
} = {
    min: 1,
    max: 120,
    overwriteDefault: 20,
    appendDefault: 50,
  }

// =====================================================================
// 模块分类 · 工具函数（内部）
// =====================================================================
function cleanBase(base: string) {
  return String(base || "").replace(/\/+$/, "")
}

function safeJsonParse<T = any>(s: string): T | undefined {
  try {
    return JSON.parse(s) as T
  } catch {
    return undefined
  }
}

function pickOk(json: any) {
  return json?.ok === true || json?.wrote === true || json?.success === true
}

function encodePayload(payload: any) {
  return encodeURIComponent(JSON.stringify(payload))
}

// 模块分类 · 行数裁剪（统一入口）
// - 所有外部可配的 maxLines 最终都要过这里，避免出现 0/负数/NaN/超大值
function clampLines(n: unknown, fallback: number) {
  const v = typeof n === "number" ? n : Number(n)
  if (!Number.isFinite(v) || v <= 0) return fallback
  return Math.max(BOXJS_LOG_LIMITS.min, Math.min(BOXJS_LOG_LIMITS.max, Math.floor(v)))
}

// 模块分类 · 取尾部 N 行
// - 用于 overwrite：把“写入内容”裁剪为最新 N 条
function tailLines(lines: string[], maxLines: number) {
  const n = clampLines(maxLines, BOXJS_LOG_LIMITS.appendDefault)
  if (!Array.isArray(lines)) return []
  if (lines.length <= n) return lines
  return lines.slice(lines.length - n)
}

export class BoxJsClient {
  // 模块分类 · 常量（内置，不暴露业务）
  private static readonly BASE_URL = cleanBase("https://api.boxjs-bridge.com")
  private static readonly DEFAULT_BOX_KEY = "ComponentService"
  private static readonly DEFAULT_TIMEOUT_MS = 12000

  private timeoutMs: number
  private defaultBoxKey: string

  constructor(opts?: { defaultBoxKey?: string; timeoutMs?: number }) {
    this.defaultBoxKey = opts?.defaultBoxKey?.trim()
      ? String(opts.defaultBoxKey).trim()
      : BoxJsClient.DEFAULT_BOX_KEY

    this.timeoutMs =
      typeof opts?.timeoutMs === "number" && opts.timeoutMs > 0
        ? opts.timeoutMs
        : BoxJsClient.DEFAULT_TIMEOUT_MS
  }

  // 模块分类 · GET URL 构建（短 payload）
  private buildUrl(action: BoxJsBridgeAction, boxKey: string, payload: any) {
    return `${BoxJsClient.BASE_URL}/${action}?boxKey=${encodeURIComponent(boxKey)}&payload=${encodePayload(payload)}`
  }

  // 模块分类 · 统一调用入口
  // - 选择 GET/POST
  // - 解析文本/JSON
  // - 统一 success 判定与错误收敛
  private async call<T = any>(
    action: BoxJsBridgeAction,
    payload: any,
    boxKey?: string,
  ): Promise<BoxJsBridgeResponse<T>> {
    const useBoxKey = boxKey?.trim() ? String(boxKey).trim() : this.defaultBoxKey

    // payload 过长：改 POST，防止 URL 超长（尤其是 batch / 多行 log）
    const payloadStr = JSON.stringify(payload ?? {})
    const shouldPost = payloadStr.length > 1200 || action === "batch"

    try {
      let r: FetchLikeResponse

      if (shouldPost) {
        const url = `${BoxJsClient.BASE_URL}/${action}?boxKey=${encodeURIComponent(useBoxKey)}`
        r = (await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json", Accept: "application/json" },
          body: JSON.stringify({ payload }),
          timeoutInterval: this.timeoutMs / 1000,
        } as any)) as any as FetchLikeResponse
      } else {
        const url = this.buildUrl(action, useBoxKey, payload)
        r = (await fetch(url, {
          method: "GET",
          headers: { Accept: "application/json" },
          timeoutInterval: this.timeoutMs / 1000,
        } as any)) as any as FetchLikeResponse
      }

      const text = await r.text().catch(() => "")
      const json = safeJsonParse<BoxJsBridgeJson<T>>(text)

      return {
        success: r.ok && pickOk(json),
        status: r.status,
        text,
        json,
      }
    } catch (e: unknown) {
      return {
        success: false,
        status: 0,
        text: `BoxJsClient error: ${e instanceof Error ? e.message : String(e)}`,
      }
    }
  }

  // 模块分类 · 读指定路径（path：例如 "12123.Caches.cacheMeta"）
  get<T = any>(path: string, boxKey?: string) {
    return this.call<T>("get", { path }, boxKey)
  }

  // 模块分类 · 写指定路径
  // - create 默认 true：不存在则创建（更符合配置/日志场景）
  set(path: string, value: any, opts?: { boxKey?: string; create?: boolean }) {
    return this.call("set", { path, value, create: opts?.create !== false }, opts?.boxKey)
  }

  // 模块分类 · 追加日志（bridge 内部会裁剪）
  appendLog(path: string, line: string, opts?: { boxKey?: string; maxLines?: number }) {
    return this.call(
      "appendLog",
      { path, line, maxLines: clampLines(opts?.maxLines, BOXJS_LOG_LIMITS.appendDefault) },
      opts?.boxKey,
    )
  }

  // 模块分类 · 批处理（一次性提交多个 set/appendLog/get）
  batch(ops: BoxJsBatchOp[], opts?: { boxKey?: string }) {
    return this.call("batch", { ops }, opts?.boxKey)
  }

  // 模块分类 · service 封装：自动拼 Service 前缀
  // - 业务侧只关心 serviceKey（如 "12123"），不用手写路径字符串
  service(serviceKey: string, boxKey?: string) {
    const svc = String(serviceKey || "").trim()
    const rootKey = boxKey
    const p = (subPath: string) => `${svc}.${subPath}`

    return {
      // 模块分类 · Cache meta（12123.Caches.cacheMeta）
      setCacheMeta: (value: any) => this.set(p("Caches.cacheMeta"), value, { boxKey: rootKey }),
      getCacheMeta: <T = any>() => this.get<T>(p("Caches.cacheMeta"), rootKey),

      // 模块分类 · Cache data（12123.Caches.cacheData）
      setCacheData: (value: any) => this.set(p("Caches.cacheData"), value, { boxKey: rootKey }),
      getCacheData: <T = any>() => this.get<T>(p("Caches.cacheData"), rootKey),

      // 模块分类 · 任意 cache key（12123.Caches.<cacheKey>）
      setCache: (cacheKey: string, value: any) => this.set(p(`Caches.${cacheKey}`), value, { boxKey: rootKey }),
      getCache: <T = any>(cacheKey: string) => this.get<T>(p(`Caches.${cacheKey}`), rootKey),

      // 模块分类 · Logs 读取（12123.Logs.log）
      getLogs: <T = any>() => this.get<T>(p("Logs.log"), rootKey),

      // 模块分类 · Logs 覆盖写（写入“最新 N 条”）
      // - 用于 overwrite 模式：写入一个数组，BoxJS 侧展示时按数组行显示
      logOverwrite: (lines: string[], maxLines = BOXJS_LOG_LIMITS.overwriteDefault) => {
        const clean = (Array.isArray(lines) ? lines : [])
          .map((s) => String(s ?? ""))
          .filter((s) => s.trim())
        const out = tailLines(clean, maxLines)
        return this.set(p("Logs.log"), out, { boxKey: rootKey, create: true })
      },

      // 模块分类 · Logs 追加（最终保留“最新 maxLines 条”）
      logAppend: (line: string, maxLines = BOXJS_LOG_LIMITS.appendDefault) =>
        this.appendLog(p("Logs.log"), line, { boxKey: rootKey, maxLines }),

      // 模块分类 · Logs 批量追加（一次请求；最终保留最新 maxLines 条）
      // - 内部用 batch appendLog，减少网络往返次数
      logAppendMany: (lines: string[], maxLines = BOXJS_LOG_LIMITS.appendDefault) => {
        const ml = clampLines(maxLines, BOXJS_LOG_LIMITS.appendDefault)
        const ops: BoxJsBatchOp[] = (Array.isArray(lines) ? lines : [])
          .map((s) => String(s ?? ""))
          .filter((s) => s.trim())
          .map((line) => ({ op: "appendLog", path: p("Logs.log"), line, maxLines: ml }))

        if (!ops.length) {
          return Promise.resolve({ success: true, status: 200, text: "noop" } as BoxJsBridgeResponse)
        }
        return this.batch(ops, { boxKey: rootKey })
      },

      // 模块分类 · 任意路径（service 内部相对路径）
      setPath: (path: string, value: any, create = true) => this.set(p(path), value, { boxKey: rootKey, create }),
      getPath: <T = any>(path: string) => this.get<T>(p(path), rootKey),
    }
  }
}

export const boxjsClient = new BoxJsClient()