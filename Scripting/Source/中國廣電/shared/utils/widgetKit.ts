// shared/utils/widgetKit.ts
// 模块分类 · Widget 通用工具集（交管/国网/运营商复用）
// 模块分类 · 能力概览
// - 基础：clamp / isObject / errToString / kv
// - Meta：pickMetaTime / srcLabel（统一渲染用字样）
// - 图片：makeImagePathResolver（复用 fileCache.getCachedImagePath）
// - 清理：makeLegacyCleanupLogger（复用 fileCache.cleanupLegacyCacheFiles）
//
// 模块分类 · 设计要点
// - 纯工具：不依赖业务 settings 类型
// - 低侵入：业务侧只需要传入配置对象
// - 日志统一：kv 输出一行，不刷屏

import type { BaseDir } from "./fileCache"
import { getCachedImagePath, cleanupLegacyCacheFiles } from "./fileCache"

// =====================================================================
// 模块分类 · 类型
// =====================================================================
export type RefreshLimits = { minMinutes: number; maxMinutes: number; fallbackMinutes: number }

export type ImageCacheSpec = {
  key: string
  prefix: string
  ext: "png" | "jpg" | "jpeg" | "webp"
  baseDir: BaseDir
}

export type ImageTimeoutSpec = {
  fetchTimeoutMs?: number
  bodyTimeoutMs?: number
  logOnTimeout?: boolean
  debugLog?: boolean
}

export type ResultMeta = { fetchedAt?: number; updatedAt?: number; decision?: string; via?: string } & Record<string, unknown>

// =====================================================================
// 模块分类 · 通用工具
// =====================================================================
export function clampRefreshMinutes(v: unknown, limits: RefreshLimits): number {
  const n = typeof v === "number" ? v : Number(v)
  if (!Number.isFinite(n) || n <= 0) return limits.fallbackMinutes
  return Math.min(limits.maxMinutes, Math.max(limits.minMinutes, Math.floor(n)))
}

export function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v)
}

export function errToString(e: unknown): string {
  if (e instanceof Error) return e.stack || e.message || String(e)
  if (typeof e === "string") return e
  try {
    return JSON.stringify(e)
  } catch {
    return String(e)
  }
}

export function kv(obj: Record<string, unknown>): string {
  try {
    return Object.entries(obj)
      .map(([k, v]) => `${k}=${String(v)}`)
      .join(" | ")
  } catch {
    return ""
  }
}

export function srcLabel(via?: string, fromCache?: boolean): string {
  if (via === "boxjs") return "BoxJS"
  if (via === "local") return "本地"
  if (via === "network") return "网络"
  if (via === "none") return "无"
  return fromCache ? "缓存" : "网络"
}

export function pickMetaTime(meta: unknown): number | null {
  if (!isObject(meta)) return null
  const fetchedAt = (meta as any).fetchedAt
  if (typeof fetchedAt === "number" && Number.isFinite(fetchedAt)) return fetchedAt
  const updatedAt = (meta as any).updatedAt
  if (typeof updatedAt === "number" && Number.isFinite(updatedAt)) return updatedAt
  return null
}

// =====================================================================
// 模块分类 · 图片缓存封装（交管风格）
// =====================================================================
export function makeImagePathResolver(cache: ImageCacheSpec, timeouts: ImageTimeoutSpec) {
  return async (imageUrl?: string): Promise<string | null> => {
    if (!imageUrl) return null

    const p = await getCachedImagePath({
      url: imageUrl,
      cacheKey: cache.key,
      filePrefix: cache.prefix,
      fileExt: cache.ext,
      baseDir: cache.baseDir,
      fetchTimeoutMs: timeouts.fetchTimeoutMs,
      bodyTimeoutMs: timeouts.bodyTimeoutMs,
      logOnTimeout: timeouts.logOnTimeout,
      debugLog: timeouts.debugLog,
    })

    return p || null
  }
}

// =====================================================================
// 模块分类 · Legacy 清理封装（交管风格）
// =====================================================================
export function makeLegacyCleanupLogger(opts?: { titlePrefix?: string }) {
  const titlePrefix = (opts?.titlePrefix || "清理缓存").trim()

  return (
    title: string,
    args: {
      filePrefix: string
      fileExt: string
      baseDir: BaseDir
      keepLatest: number
      debugLog?: boolean
      includeMeta?: boolean
      includeTmp?: boolean
      includeBak?: boolean
      backupFileName?: string
    },
  ) => {
    const fullTitle = `${titlePrefix} | ${title}`

    console.log(
      `🧹 清理缓存 | 开始 · ${fullTitle} · ${kv({
        prefix: args.filePrefix,
        ext: args.fileExt,
        dir: args.baseDir,
        keep: args.keepLatest,
        meta: args.includeMeta ? 1 : 0,
        tmp: args.includeTmp ? 1 : 0,
        bak: args.includeBak ? 1 : 0,
      })}`,
    )

    try {
      const r = cleanupLegacyCacheFiles({
        filePrefix: args.filePrefix,
        fileExt: args.fileExt,
        baseDir: args.baseDir,
        keepLatest: args.keepLatest,
        debugLog: args.debugLog === true,
        includeMeta: args.includeMeta === true,
        includeTmp: args.includeTmp === true,
        includeBak: args.includeBak === true,
        backupFileName: args.backupFileName,
      })

      if (r) {
        console.log(
          `🧹 清理缓存 | 摘要 · ${fullTitle} · matched=${r.matched} kept=${r.kept} deleted=${r.deleted} failed=${r.failed} skipped=${r.skipped}`,
        )
      } else {
        console.log(`🧹 清理缓存 | 摘要 · ${fullTitle} · skipped(FileManager/dir)`)
      }
    } catch (e) {
      console.warn(`🧹 清理缓存 | 异常 · ${fullTitle} · ${errToString(e)}`)
    }
  }
}