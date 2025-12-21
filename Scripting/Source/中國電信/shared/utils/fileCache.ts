// shared/utils/fileCache.ts
// 模块分类 · 通用文件缓存（Scripting 环境）
// 模块分类 · 能力概览
// A) URL -> File cache（统一单文件策略）
// - URL -> bytes -> FileManager 落盘
// - meta 也落盘（.meta.json），不依赖 Storage（避免桌面/预览隔离）
// - 失败回退：网络失败/超时/异常时优先回退旧主文件
//
// B) Local JSON file helpers（供 api.ts / widget.tsx 写缓存）
// - JSON 数据落盘读写（单文件）
// - 写入策略：写 tmp -> 原子替换 ->（可选）备份
//
// 模块分类 · 设计要点
// - 不依赖 Buffer/TextEncoder（避免运行时差异）
// - normalizePath 兼容旧数据/双斜杠
// - “软超时”语义：超时返回 null（不抛错、不取消请求）
// - 单文件策略：固定文件名 + tmp 原子替换 + 可选 bak
// - 不再依赖 Storage meta（避免桌面组件拿不到 meta 导致兜底失效）
import { fetch } from "scripting"

declare const FileManager: any

// =====================================================================
// 模块分类 · 默认常量（统一收口）
// =====================================================================
export type BaseDir = "documents" | "library" | "temporary"

const DEFAULT_BASE_DIR: BaseDir = "documents"

// 软超时默认值：0 表示不启用超时包装（直接 await）
const DEFAULT_TIMEOUT_MS = 0

// 日志总开关（函数参数可以覆盖）
// - false：默认不刷屏
// - true：打印关键日志（建议只在调试时打开）
const DEFAULT_DEBUG_LOG = false

// 日志前缀：内部调试用（低频）
// - 你对外输出更喜欢“🧹 清理缓存 | ...”那套，这里只做兜底
const LOG_PREFIX = "🗂️ fileCache"

// =====================================================================
// 模块分类 · 清理缓存（Legacy 多文件）
// =====================================================================
// 说明：这段是“旧多版本文件命名”清理工具：
// - 命名一般是：<prefix>_<ts>.<ext> 或 <prefix>-<ts>.<ext>
// - 新的“单文件策略”是：<prefix>.<ext>（固定名）
// - 因此清理时默认只匹配带时间戳的老文件，避免误删新主文件。
//
// ✅ 优化点：
// - 返回摘要结果（deleted / skipped / failed），widget 日志不再靠猜
// - 可选清理：.meta.json / .tmp.* / .bak（避免历史残留）
// - 日志按“摘要”输出，不再每个文件刷屏
export type CleanupLegacyCacheArgs = {
  filePrefix: string
  fileExt?: string
  baseDir?: BaseDir
  keepLatest?: number
  debugLog?: boolean

  // 是否同时清理这几类“伴生文件”
  // - meta：单文件策略的 <prefix>.meta.json（以及写入残留的 .tmp）
  // - tmp：写入过程可能残留的 <prefix>.tmp.<ext>（仅当提供 fileExt 时更安全）
  // - bak：writeJsonToSingleFileAtomic 可能用到的备份文件（需明确给出 backupFileName 才会删）
  includeMeta?: boolean
  includeTmp?: boolean
  includeBak?: boolean

  // 如果你希望精确清理备份文件，请显式传入（推荐）
  // - 例如：backupFileName = "xxx.bak.json"
  backupFileName?: string
}

export type CleanupLegacyCacheResult = {
  baseDir: BaseDir
  filePrefix: string
  fileExt?: string
  keepLatest: number
  matched: number
  kept: number
  deleted: number
  failed: number
  skipped: number
  // 伴生文件统计（可选）
  companion?: { deleted: number; failed: number; skipped: number }
  // 仅 debugLog 时可能附带少量样本（最多 3 条）
  samples?: { deleted?: string[]; failed?: string[] }
}

export type LegacyCleanupItem = CleanupLegacyCacheArgs & { title?: string }

function escRe(s: string) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}

function listDir(dir: string): string[] {
  try {
    if (!FileManager) return []
    if (typeof FileManager.listContentsSync === "function") return FileManager.listContentsSync(dir) || []
    if (typeof FileManager.listContents === "function") return FileManager.listContents(dir) || []
  } catch { }
  return []
}

function joinPath(dir: string, name: string) {
  return `${String(dir).replace(/\/+$/, "")}/${String(name).replace(/^\/+/, "")}`
}

// 统一判断 debugLog 开关
function logEnabled(debugLog?: boolean): boolean {
  return debugLog === true || (debugLog == null && DEFAULT_DEBUG_LOG)
}

// 低频调试日志（内部）
function dbg(debugLog: boolean, ...args: any[]) {
  if (!debugLog) return
  try {
    console.log(LOG_PREFIX, ...args)
  } catch { }
}

function warnAlways(...args: any[]) {
  try {
    console.warn(LOG_PREFIX, ...args)
  } catch { }
}

// =====================================================================
// 模块分类 · FileManager 兼容层（sync/async 差异）
// =====================================================================
function fmExists(path: string): boolean {
  try {
    if (!FileManager) return false
    if (typeof FileManager.existsSync === "function") return !!FileManager.existsSync(path)
    if (typeof FileManager.exists === "function") return !!FileManager.exists(path)
  } catch { }
  return false
}

function fmRemove(path: string) {
  try {
    if (!FileManager) return
    if (typeof FileManager.removeSync === "function") return FileManager.removeSync(path)
    if (typeof FileManager.remove === "function") return FileManager.remove(path)
  } catch { }
}

function fmWriteBytes(path: string, bytes: Uint8Array) {
  if (!FileManager) throw new Error("FileManager unavailable")
  if (typeof FileManager.writeAsBytesSync === "function") return FileManager.writeAsBytesSync(path, bytes)
  if (typeof FileManager.writeAsBytes === "function") return FileManager.writeAsBytes(path, bytes)
  throw new Error("FileManager.writeAsBytes* unavailable")
}

function fmWriteString(path: string, txt: string) {
  if (!FileManager) throw new Error("FileManager unavailable")
  if (typeof FileManager.writeAsStringSync === "function") return FileManager.writeAsStringSync(path, txt)
  if (typeof FileManager.writeAsString === "function") return FileManager.writeAsString(path, txt)
  throw new Error("FileManager.writeAsString* unavailable")
}

function fmReadString(path: string): string {
  if (!FileManager) throw new Error("FileManager unavailable")
  if (typeof FileManager.readAsStringSync === "function") return String(FileManager.readAsStringSync(path) ?? "")
  if (typeof FileManager.readAsString === "function") return String(FileManager.readAsString(path) ?? "")
  throw new Error("FileManager.readAsString* unavailable")
}

type FMStat = { size?: number } & Record<string, unknown>
function fmStat(path: string): FMStat | null {
  try {
    if (!FileManager) return null
    if (typeof FileManager.statSync === "function") return FileManager.statSync(path) as FMStat
    if (typeof FileManager.stat === "function") return FileManager.stat(path) as FMStat
  } catch { }
  return null
}

function fmMove(from: string, to: string) {
  if (!FileManager) throw new Error("FileManager unavailable")
  if (typeof FileManager.moveSync === "function") return FileManager.moveSync(from, to)
  if (typeof FileManager.move === "function") return FileManager.move(from, to)
  throw new Error("FileManager.move* unavailable")
}

function fmCopy(from: string, to: string): boolean {
  try {
    if (!FileManager) return false
    if (typeof FileManager.copySync === "function") {
      FileManager.copySync(from, to)
      return true
    }
    if (typeof FileManager.copy === "function") {
      FileManager.copy(from, to)
      return true
    }
  } catch { }
  return false
}

// =====================================================================
// 模块分类 · Runtime guards + 目录解析（统一收口）
// =====================================================================
function normalizePath(p: string): string {
  return String(p || "").replace(/\/{2,}/g, "/")
}

function resolveDir(baseDir: BaseDir): string {
  if (!FileManager) return ""
  if (baseDir === "documents") return typeof FileManager.documentsDirectory === "string" ? FileManager.documentsDirectory : ""
  if (baseDir === "library") return typeof FileManager.libraryDirectory === "string" ? FileManager.libraryDirectory : ""
  return typeof FileManager.temporaryDirectory === "string" ? FileManager.temporaryDirectory : ""
}

function pickBaseDir(baseDir: BaseDir = DEFAULT_BASE_DIR): string {
  const chosen = resolveDir(baseDir)
  if (chosen) return chosen
  return resolveDir("documents") || resolveDir("library") || resolveDir("temporary")
}

function hasAnyDir(): boolean {
  return !!(resolveDir("documents") || resolveDir("library") || resolveDir("temporary"))
}

function hasFMBytes(): boolean {
  return (
    !!FileManager &&
    (typeof FileManager.existsSync === "function" || typeof FileManager.exists === "function") &&
    (typeof FileManager.writeAsBytesSync === "function" || typeof FileManager.writeAsBytes === "function") &&
    (typeof FileManager.removeSync === "function" || typeof FileManager.remove === "function") &&
    hasAnyDir()
  )
}

function hasFMString(): boolean {
  return (
    !!FileManager &&
    (typeof FileManager.existsSync === "function" || typeof FileManager.exists === "function") &&
    (typeof FileManager.writeAsStringSync === "function" || typeof FileManager.writeAsString === "function") &&
    (typeof FileManager.readAsStringSync === "function" || typeof FileManager.readAsString === "function") &&
    (typeof FileManager.removeSync === "function" || typeof FileManager.remove === "function") &&
    hasAnyDir()
  )
}

// =====================================================================
// 模块分类 · 删除（带可控日志）
// =====================================================================
// ✅ 约定：
// - debugLog=false：只在“异常/删除失败”时会有 warn（避免刷屏）
// - debugLog=true ：会打印 skip / ok / fail，适合你调试清理流程
type RemoveDetailedResult = {
  ok: boolean
  existed: boolean
  removed: boolean
  stillExists: boolean
  size: number
  costMs: number
}

function safeRemoveFileDetailed(path: string, opts?: { debugLog?: boolean; reason?: string }): RemoveDetailedResult {
  const debugLog = logEnabled(opts?.debugLog)
  const p = normalizePath(path)

  const out: RemoveDetailedResult = {
    ok: false,
    existed: false,
    removed: false,
    stillExists: false,
    size: -1,
    costMs: 0,
  }

  if (!p) return out

  try {
    const existed = fmExists(p)
    out.existed = existed
    if (!existed) {
      out.ok = true
      if (debugLog) console.log(`🧹 清理缓存 | 跳过 · 不存在${opts?.reason ? ` · ${opts.reason}` : ""} · path=${p}`)
      return out
    }

    const before = fmStat(p)
    out.size = typeof before?.size === "number" ? before.size : -1

    const t0 = Date.now()
    fmRemove(p)
    out.costMs = Date.now() - t0

    const still = fmExists(p)
    out.stillExists = still
    out.removed = !still
    out.ok = !still

    if (still) {
      console.warn(`🧹 清理缓存 | 失败 · 仍存在${opts?.reason ? ` · ${opts.reason}` : ""} · path=${p}`)
    } else if (debugLog) {
      const sz = out.size >= 0 ? ` · size=${out.size}` : ""
      console.log(`🧹 清理缓存 | 删除 · 成功${opts?.reason ? ` · ${opts.reason}` : ""}${sz} · cost=${out.costMs}ms · path=${p}`)
    }

    return out
  } catch (e) {
    console.warn(`🧹 清理缓存 | 异常${opts?.reason ? ` · ${opts.reason}` : ""} · err=${e instanceof Error ? e.message : String(e)} · path=${p}`)
    out.stillExists = fmExists(p)
    out.ok = false
    return out
  }
}

export function safeRemoveFile(path: string, opts?: { debugLog?: boolean; reason?: string }) {
  void safeRemoveFileDetailed(path, opts)
}

// =====================================================================
// 模块分类 · Legacy 清理入口（可返回摘要）
// =====================================================================
type CompanionCleanupResult = { deleted: number; failed: number; skipped: number }

function cleanupCompanionFiles(args: {
  dir: string
  filePrefix: string
  fileExt?: string
  includeMeta: boolean
  includeTmp: boolean
  includeBak: boolean
  backupFileName?: string
  debugLog: boolean
}): CompanionCleanupResult {
  const { dir, filePrefix, fileExt, includeMeta, includeTmp, includeBak, backupFileName, debugLog } = args

  const r: CompanionCleanupResult = { deleted: 0, failed: 0, skipped: 0 }

  const count = (d: RemoveDetailedResult) => {
    if (!d.existed) { r.skipped++; return }
    if (d.ok && d.removed) { r.deleted++; return }
    r.failed++
  }

  // meta：<prefix>.meta.json + 写入残留 tmp
  if (includeMeta) {
    count(safeRemoveFileDetailed(joinPath(dir, `${filePrefix}.meta.json`), { debugLog, reason: "companion(meta)" }))
    count(safeRemoveFileDetailed(joinPath(dir, `${filePrefix}.meta.json.tmp`), { debugLog, reason: "companion(meta.tmp)" }))
  }

  // tmp：仅在 fileExt 明确时清理 <prefix>.tmp.<ext>（避免扫出误删）
  if (includeTmp && fileExt) {
    count(safeRemoveFileDetailed(joinPath(dir, `${filePrefix}.tmp.${fileExt}`), { debugLog, reason: "companion(tmp)" }))
  }

  // bak：建议业务侧明确传 backupFileName（否则不删，避免误伤）
  if (includeBak && backupFileName) {
    count(safeRemoveFileDetailed(joinPath(dir, backupFileName), { debugLog, reason: "companion(bak)" }))
  }

  return r
}

export function cleanupLegacyCacheFiles(args: CleanupLegacyCacheArgs): CleanupLegacyCacheResult | void {
  const {
    filePrefix,
    fileExt,
    baseDir = "documents",
    keepLatest = 2,
    debugLog: debugArg,

    includeMeta = false,
    includeTmp = false,
    includeBak = false,
    backupFileName,
  } = args

  const debugLog = logEnabled(debugArg)

  if (!FileManager) return

  const dir = resolveDir(baseDir)
  if (!dir) return

  const names = listDir(dir)
  if (!names.length) {
    if (debugLog) console.log(`🧹 清理缓存 | 完成 · 无文件 · prefix=${filePrefix} · dir=${baseDir}`)
    return {
      baseDir,
      filePrefix,
      fileExt,
      keepLatest: Math.floor(keepLatest),
      matched: 0,
      kept: 0,
      deleted: 0,
      failed: 0,
      skipped: 0,
      companion: includeMeta || includeTmp || includeBak ? { deleted: 0, failed: 0, skipped: 0 } : undefined,
    }
  }

  // 只匹配“带时间戳的 legacy 文件”
  const p = escRe(filePrefix)
  const ext = fileExt ? escRe(fileExt) : "[a-z0-9]+"
  const reLegacy = new RegExp(`^${p}(?:[_-])?(\\d{10,13})\\.${ext}$`, "i")

  const hits: { name: string; ts: number }[] = []
  for (const name of names) {
    const m = reLegacy.exec(String(name))
    if (!m) continue
    const ts = Number(m[1])
    if (!Number.isFinite(ts)) continue
    hits.push({ name: String(name), ts })
  }

  const keep = Math.max(0, Math.floor(keepLatest))

  // 命中不足：legacy 不删，但可以清 companion（meta/tmp/bak）
  if (hits.length <= keep) {
    const companion = cleanupCompanionFiles({
      dir,
      filePrefix,
      fileExt,
      includeMeta,
      includeTmp,
      includeBak,
      backupFileName,
      debugLog,
    })

    const res: CleanupLegacyCacheResult = {
      baseDir,
      filePrefix,
      fileExt,
      keepLatest: keep,
      matched: hits.length,
      kept: hits.length,
      deleted: companion.deleted,
      failed: companion.failed,
      skipped: companion.skipped,
      companion: includeMeta || includeTmp || includeBak ? companion : undefined,
    }

    console.log(
      `🧹 清理缓存 | 完成 · legacy=${res.matched} keep=${res.kept}` +
      ` · deleted=${res.deleted} failed=${res.failed} skipped=${res.skipped}` +
      ` · prefix=${filePrefix} · ext=${fileExt ?? "*"} · dir=${baseDir}`,
    )
    return res
  }

  // 新到旧排序，保留 keep 条
  hits.sort((a, b) => b.ts - a.ts)
  const toDelete = hits.slice(keep)

  let deleted = 0
  let failed = 0
  let skipped = 0

  const deletedSamples: string[] = []
  const failedSamples: string[] = []

  for (const it of toDelete) {
    const path = joinPath(dir, it.name)
    const d = safeRemoveFileDetailed(path, { debugLog, reason: "legacy(ts)" })

    if (!d.existed) {
      skipped++
      continue
    }
    if (d.ok && d.removed) {
      deleted++
      if (debugLog && deletedSamples.length < 3) deletedSamples.push(it.name)
    } else {
      failed++
      if (debugLog && failedSamples.length < 3) failedSamples.push(it.name)
    }
  }

  const companion = cleanupCompanionFiles({
    dir,
    filePrefix,
    fileExt,
    includeMeta,
    includeTmp,
    includeBak,
    backupFileName,
    debugLog,
  })

  const res: CleanupLegacyCacheResult = {
    baseDir,
    filePrefix,
    fileExt,
    keepLatest: keep,
    matched: hits.length,
    kept: keep,
    deleted: deleted + companion.deleted,
    failed: failed + companion.failed,
    skipped: skipped + companion.skipped,
    companion: includeMeta || includeTmp || includeBak ? companion : undefined,
    samples: debugLog ? { deleted: deletedSamples, failed: failedSamples } : undefined,
  }

  console.log(
    `🧹 清理缓存 | 完成 · legacy=${res.matched} keep=${res.kept}` +
    ` · deleted=${res.deleted} failed=${res.failed} skipped=${res.skipped}` +
    ` · prefix=${filePrefix} · ext=${fileExt ?? "*"} · dir=${baseDir}`,
  )

  if (debugLog) {
    if (deletedSamples.length) console.log(`🧹 清理缓存 | 样本 · deleted=${deletedSamples.join(", ")}`)
    if (failedSamples.length) console.log(`🧹 清理缓存 | 样本 · failed=${failedSamples.join(", ")}`)
  }

  return res
}

// =====================================================================
// 模块分类 · 批量清理日志收口（建议 widget 里只调用这个一次）
// =====================================================================
// - 输出：开始 1 行 + 每条 1 行 + 完成 1 行
// - debugLog 才打印样本，避免刷屏
export function cleanupLegacyCacheFilesLogged(
  items: LegacyCleanupItem[],
  opts?: {
    title?: string
    keepLatest?: number
    includeMeta?: boolean
    includeTmp?: boolean
    includeBak?: boolean
    debugLog?: boolean
  },
) {
  const title = (opts?.title || "清理缓存").trim()
  const keepLatest = typeof opts?.keepLatest === "number" ? Math.floor(opts.keepLatest) : 0
  const includeMeta = opts?.includeMeta === true
  const includeTmp = opts?.includeTmp === true
  const includeBak = opts?.includeBak === true
  const debugLog = opts?.debugLog === true

  console.log(`🧹 ${title} | 开始 · keepLatest=${keepLatest} · meta=${includeMeta ? 1 : 0} tmp=${includeTmp ? 1 : 0} bak=${includeBak ? 1 : 0} · items=${items.length}`)

  let sumDeleted = 0
  let sumFailed = 0
  let sumSkipped = 0
  let sumMatched = 0

  for (const it of items) {
    const r = cleanupLegacyCacheFiles({
      filePrefix: it.filePrefix,
      fileExt: it.fileExt,
      baseDir: it.baseDir ?? "documents",
      keepLatest: typeof it.keepLatest === "number" ? it.keepLatest : keepLatest,
      debugLog: it.debugLog === true || debugLog,
      includeMeta: it.includeMeta ?? includeMeta,
      includeTmp: it.includeTmp ?? includeTmp,
      includeBak: it.includeBak ?? includeBak,
      backupFileName: it.backupFileName,
    })

    const itemTitle = (it.title || it.filePrefix).trim()
    if (!r) {
      console.log(`🧹 ${title} | 条目 · ${itemTitle} · skipped(FileManager/dir)`)
      continue
    }

    sumDeleted += r.deleted
    sumFailed += r.failed
    sumSkipped += r.skipped
    sumMatched += r.matched

    console.log(
      `🧹 ${title} | 条目 · ${itemTitle}` +
      ` · matched=${r.matched} keep=${r.kept}` +
      ` · deleted=${r.deleted} failed=${r.failed} skipped=${r.skipped}` +
      ` · dir=${r.baseDir} ext=${r.fileExt ?? "*"}`,
    )
  }

  console.log(
    `🧹 ${title} | 完成 · matched=${sumMatched}` +
    ` · deleted=${sumDeleted} failed=${sumFailed} skipped=${sumSkipped}`,
  )
}

// =====================================================================
// 模块分类 · UTF-8 编码（纯 TS）
// - 用于 bytes 写入兜底，不依赖 TextEncoder/Buffer
// =====================================================================
function utf8ToBytes(str: string): Uint8Array {
  const bytes: number[] = []
  for (let i = 0; i < str.length; i++) {
    let codePoint = str.charCodeAt(i)

    if (codePoint >= 0xd800 && codePoint <= 0xdbff && i + 1 < str.length) {
      const next = str.charCodeAt(i + 1)
      if (next >= 0xdc00 && next <= 0xdfff) {
        codePoint = 0x10000 + ((codePoint - 0xd800) << 10) + (next - 0xdc00)
        i++
      }
    }

    if (codePoint <= 0x7f) {
      bytes.push(codePoint)
    } else if (codePoint <= 0x7ff) {
      bytes.push(0xc0 | (codePoint >> 6))
      bytes.push(0x80 | (codePoint & 0x3f))
    } else if (codePoint <= 0xffff) {
      bytes.push(0xe0 | (codePoint >> 12))
      bytes.push(0x80 | ((codePoint >> 6) & 0x3f))
      bytes.push(0x80 | (codePoint & 0x3f))
    } else {
      bytes.push(0xf0 | (codePoint >> 18))
      bytes.push(0x80 | ((codePoint >> 12) & 0x3f))
      bytes.push(0x80 | ((codePoint >> 6) & 0x3f))
      bytes.push(0x80 | (codePoint & 0x3f))
    }
  }
  return new Uint8Array(bytes)
}

// =====================================================================
// 模块分类 · Timeout helper（软超时）
// - 超时：返回 null（不抛错，不取消请求）
// - 适合“缓存兜底”语义：超时就用旧文件
// =====================================================================
async function withTimeout<T>(p: Promise<T>, timeoutMs: number, onTimeout?: () => void): Promise<T | null> {
  const ms = Math.max(0, Math.floor(timeoutMs))
  if (ms <= 0) {
    try {
      return await p
    } catch {
      return null
    }
  }

  return await new Promise<T | null>((resolve) => {
    const timer = setTimeout(() => {
      try {
        onTimeout?.()
      } catch { }
      resolve(null)
    }, ms)

    p.then(
      (v) => {
        clearTimeout(timer)
        resolve(v)
      },
      () => {
        clearTimeout(timer)
        resolve(null)
      },
    )
  })
}

// =====================================================================
// 模块分类 · A) URL -> File cache（单文件策略）
// =====================================================================
type FileCacheMetaOnDisk = {
  url: string
  updatedAt: number
}

function metaPathFor(filePrefix: string, dir: string) {
  return normalizePath(`${dir}/${filePrefix}.meta.json`)
}

function mainPathFor(filePrefix: string, fileExt: string, dir: string) {
  return normalizePath(`${dir}/${filePrefix}.${fileExt}`)
}

function tmpPathFor(filePrefix: string, fileExt: string, dir: string) {
  return normalizePath(`${dir}/${filePrefix}.tmp.${fileExt}`)
}

function readMetaFile(path: string, debugLog: boolean): FileCacheMetaOnDisk | null {
  try {
    if (!hasFMString()) return null
    if (!fmExists(path)) return null
    const txt = fmReadString(path)
    if (!txt) return null
    const obj = JSON.parse(txt) as any
    if (!obj || typeof obj !== "object") return null
    if (typeof obj.url !== "string") return null
    if (typeof obj.updatedAt !== "number") return null
    return { url: obj.url, updatedAt: obj.updatedAt }
  } catch (e) {
    // meta 读取失败不应该打太多日志：它只是“缓存命中”的辅助信息
    dbg(debugLog, "meta read error", e instanceof Error ? e.message : String(e))
    return null
  }
}

function writeMetaFileAtomic(path: string, meta: FileCacheMetaOnDisk, debugLog: boolean) {
  try {
    const dir = path.replace(/\/[^/]+$/, "")
    const name = path.replace(/^.*\//, "")
    const tmp = normalizePath(`${dir}/${name}.tmp`)

    const txt = JSON.stringify(meta)
    if (hasFMString()) fmWriteString(tmp, txt)
    else fmWriteBytes(tmp, utf8ToBytes(txt))

    try { fmRemove(path) } catch { }

    try {
      fmMove(tmp, path)
    } catch {
      // move 不可用/失败：降级直写
      if (hasFMString()) fmWriteString(path, txt)
      else fmWriteBytes(path, utf8ToBytes(txt))
      try { fmRemove(tmp) } catch { }
    }

    dbg(debugLog, "meta write ok", path)
  } catch (e) {
    dbg(debugLog, "meta write error", e instanceof Error ? e.message : String(e))
  }
}

export type EnsureCachedFilePathArgs = {
  url: string
  cacheKey: string
  filePrefix?: string
  fileExt?: string
  forceRefresh?: boolean
  baseDir?: BaseDir

  // 兼容旧字段：一个值同时作用于 fetch + body
  timeoutMs?: number

  // 两阶段超时（优先级更高）
  fetchTimeoutMs?: number
  bodyTimeoutMs?: number

  // 日志控制
  logOnTimeout?: boolean
  debugLog?: boolean
}

export type EnsureCachedJsonArgs = {
  url: string
  cacheKey: string
  filePrefix?: string
  forceRefresh?: boolean
  baseDir?: BaseDir

  timeoutMs?: number
  fetchTimeoutMs?: number
  bodyTimeoutMs?: number

  logOnTimeout?: boolean
  debugLog?: boolean
}

export async function ensureCachedFilePath(args: EnsureCachedFilePathArgs): Promise<string | null> {
  const {
    url,
    cacheKey, // ✅ 保留入参，兼容旧调用；单文件策略不再依赖 Storage
    filePrefix = "cache_file",
    fileExt = "bin",
    forceRefresh = false,
    baseDir = DEFAULT_BASE_DIR,

    timeoutMs = DEFAULT_TIMEOUT_MS,
    fetchTimeoutMs,
    bodyTimeoutMs,

    logOnTimeout = false,
    debugLog: debugArg,
  } = args

  void cacheKey

  const debugLog = logEnabled(debugArg)
  const tFetch = typeof fetchTimeoutMs === "number" ? fetchTimeoutMs : timeoutMs
  const tBody = typeof bodyTimeoutMs === "number" ? bodyTimeoutMs : timeoutMs

  if (!url) return null
  if (!hasFMBytes()) {
    warnAlways("当前环境不支持 FileManager bytes 方法")
    return null
  }

  try {
    const dir = pickBaseDir(baseDir)
    if (!dir) return null

    const mainPath = mainPathFor(filePrefix, fileExt, dir)
    const tmpPath = tmpPathFor(filePrefix, fileExt, dir)
    const metaPath = metaPathFor(filePrefix, dir)

    // 兜底候选：只要主文件存在，就允许回退
    const staleCandidate = fmExists(mainPath) ? mainPath : null

    const meta = readMetaFile(metaPath, debugLog)
    const metaHit = !!meta && meta.url === url

    // 命中缓存：meta.url 一致 + 主文件存在（且不是强刷）
    if (!forceRefresh && metaHit && staleCandidate) {
      dbg(debugLog, "hit(single)", filePrefix, mainPath)
      return mainPath
    }

    // 下载（软超时）
    const resp = await withTimeout(
      fetch(url),
      tFetch,
      logOnTimeout ? () => console.log(`⏱️ 请求超时 | fetch=${tFetch}ms | prefix=${filePrefix}`) : undefined,
    )
    if (!resp) return staleCandidate
    if (!resp.ok) {
      if (debugLog) console.warn(`⚠️ 下载失败 | status=${resp.status} | prefix=${filePrefix}`)
      return staleCandidate
    }

    const buf = await withTimeout(
      resp.arrayBuffer(),
      tBody,
      logOnTimeout ? () => console.log(`⏱️ 读取超时 | body=${tBody}ms | prefix=${filePrefix}`) : undefined,
    )
    if (!buf) return staleCandidate

    const bytes = new Uint8Array(buf)

    // 写 tmp
    fmWriteBytes(tmpPath, bytes)

    // 轻量校验：tmp size 必须 > 0
    const stat = fmStat(tmpPath)
    const size = typeof stat?.size === "number" ? stat.size : -1
    if (!Number.isFinite(size) || size <= 0) {
      safeRemoveFile(tmpPath, { debugLog, reason: `single(tmp bad) ${filePrefix}` })
      return staleCandidate
    }

    // 原子替换：tmp -> main
    try { fmRemove(mainPath) } catch { }
    try {
      fmMove(tmpPath, mainPath)
    } catch {
      fmWriteBytes(mainPath, bytes)
      try { fmRemove(tmpPath) } catch { }
    }

    // 写 meta（落盘，不用 Storage）
    writeMetaFileAtomic(metaPath, { url, updatedAt: Date.now() }, debugLog)

    dbg(debugLog, "write ok(single)", filePrefix, mainPath, `bytes=${bytes.length}`)
    return mainPath
  } catch (e) {
    if (debugLog) console.warn(`⚠️ ensureCachedFilePath 异常 | prefix=${args.filePrefix ?? "cache_file"} | err=${e instanceof Error ? e.message : String(e)}`)
    try {
      const dir = pickBaseDir(baseDir)
      const mainPath = mainPathFor(args.filePrefix ?? "cache_file", args.fileExt ?? "bin", dir)
      return fmExists(mainPath) ? mainPath : null
    } catch { }
    return null
  }
}

export async function ensureCachedJson<T = unknown>(args: EnsureCachedJsonArgs): Promise<T | null> {
  const {
    url,
    cacheKey,
    filePrefix = "cache_json",
    forceRefresh = false,
    baseDir = DEFAULT_BASE_DIR,

    timeoutMs = DEFAULT_TIMEOUT_MS,
    fetchTimeoutMs,
    bodyTimeoutMs,

    logOnTimeout = false,
    debugLog,
  } = args

  const filePath = await ensureCachedFilePath({
    url,
    cacheKey,
    filePrefix,
    fileExt: "json",
    forceRefresh,
    baseDir,
    timeoutMs,
    fetchTimeoutMs,
    bodyTimeoutMs,
    logOnTimeout,
    debugLog,
  })
  if (!filePath) return null

  const dbgOn = logEnabled(debugLog)

  try {
    if (!hasFMString()) {
      warnAlways("当前环境不支持 readAsString*")
      return null
    }
    const txt = fmReadString(filePath)
    return txt ? (JSON.parse(txt) as T) : null
  } catch (e) {
    console.warn(`🧹 清理缓存 | JSON 解析失败 · prefix=${filePrefix} · err=${e instanceof Error ? e.message : String(e)}`)
    safeRemoveFile(filePath, { debugLog: dbgOn, reason: `bad-json(${filePrefix})` })
    return null
  }
}

// =====================================================================
// 模块分类 · B) Local JSON single-file helpers（供 api.ts / widget.tsx）
// =====================================================================
export type SingleJsonCacheArgs<T = unknown> = {
  dataFileName: string
  data: T
  baseDir?: BaseDir
  backupFileName?: string
  tmpFileName?: string
  debugLog?: boolean
}

export function readJsonFromSingleFile<T = unknown>(args: {
  dataFileName: string
  baseDir?: BaseDir
  backupFileName?: string
  debugLog?: boolean
}): { data: T; path: string } | null {
  const { dataFileName, baseDir = DEFAULT_BASE_DIR, backupFileName, debugLog: debugArg } = args
  const debugLog = logEnabled(debugArg)

  try {
    if (!hasFMString()) return null
    const dir = pickBaseDir(baseDir)
    const p = normalizePath(`${dir}/${dataFileName}`)

    if (fmExists(p)) {
      const txt = fmReadString(p)
      if (txt) return { data: JSON.parse(txt) as T, path: p }
    }

    if (backupFileName) {
      const b = normalizePath(`${dir}/${backupFileName}`)
      if (fmExists(b)) {
        const txt2 = fmReadString(b)
        if (txt2) {
          dbg(debugLog, "single hit(backup)", b)
          return { data: JSON.parse(txt2) as T, path: b }
        }
      }
    }

    return null
  } catch (e) {
    if (debugLog) console.warn(`⚠️ readJsonFromSingleFile 异常 · file=${dataFileName} · err=${e instanceof Error ? e.message : String(e)}`)
    return null
  }
}

export function writeJsonToSingleFileAtomic<T = unknown>(args: SingleJsonCacheArgs<T>): {
  path: string
  updatedAt: number
} | null {
  const {
    dataFileName,
    data,
    baseDir = DEFAULT_BASE_DIR,
    backupFileName,
    tmpFileName,
    debugLog: debugArg,
  } = args

  const debugLog = logEnabled(debugArg)
  if (!FileManager) return null
  if (!hasFMString() && !hasFMBytes()) return null

  try {
    const dir = pickBaseDir(baseDir)
    const now = Date.now()

    const primaryPath = normalizePath(`${dir}/${dataFileName}`)
    const tmpName = tmpFileName || `${dataFileName}.tmp`
    const tmpPath = normalizePath(`${dir}/${tmpName}`)

    const txt = JSON.stringify(data ?? null)

    // 1) 写 tmp（优先 string，否则 bytes 兜底）
    if (hasFMString()) fmWriteString(tmpPath, txt)
    else fmWriteBytes(tmpPath, utf8ToBytes(txt))

    // 2) 可选：备份旧 primary（用于“写坏了还能回滚”）
    if (backupFileName && fmExists(primaryPath)) {
      const bakPath = normalizePath(`${dir}/${backupFileName}`)
      try { fmRemove(bakPath) } catch { }
      fmCopy(primaryPath, bakPath)
    }

    // 3) 原子替换：tmp -> primary
    try { fmRemove(primaryPath) } catch { }
    try {
      fmMove(tmpPath, primaryPath)
    } catch {
      if (hasFMString()) fmWriteString(primaryPath, txt)
      else fmWriteBytes(primaryPath, utf8ToBytes(txt))
      try { fmRemove(tmpPath) } catch { }
    }

    dbg(debugLog, "single write ok", primaryPath)
    return { path: primaryPath, updatedAt: now }
  } catch (e) {
    console.warn(`⚠️ writeJsonToSingleFileAtomic 异常 · file=${dataFileName} · err=${e instanceof Error ? e.message : String(e)}`)
    return null
  }
}

export function clearSingleJsonCache(args: {
  dataFileName: string
  baseDir?: BaseDir
  backupFileName?: string
  tmpFileName?: string
  debugLog?: boolean
}) {
  const { dataFileName, baseDir = DEFAULT_BASE_DIR, backupFileName, tmpFileName, debugLog: debugArg } = args
  const debugLog = logEnabled(debugArg)

  try {
    const dir = pickBaseDir(baseDir)
    const p = normalizePath(`${dir}/${dataFileName}`)
    safeRemoveFile(p, { debugLog, reason: "single-clear(primary)" })

    if (backupFileName) {
      const b = normalizePath(`${dir}/${backupFileName}`)
      safeRemoveFile(b, { debugLog, reason: "single-clear(backup)" })
    }

    const t = normalizePath(`${dir}/${tmpFileName || `${dataFileName}.tmp`}`)
    safeRemoveFile(t, { debugLog, reason: "single-clear(tmp)" })
  } catch (e) {
    console.warn(`⚠️ clearSingleJsonCache 异常 · file=${dataFileName} · err=${e instanceof Error ? e.message : String(e)}`)
  }
}

// =====================================================================
// 模块分类 · C) 兼容：多版本 JSON 文件工具（旧接口，主链路不再使用）
// =====================================================================
export type WriteJsonToCachedFileArgs<T = unknown> = {
  data: T
  filePrefix?: string
  fileExt?: string
  baseDir?: BaseDir
}

export function writeJsonToCachedFile<T = unknown>(
  args: WriteJsonToCachedFileArgs<T>,
): { path: string; updatedAt: number } | null {
  const { data, filePrefix = "cache_json", fileExt = "json", baseDir = DEFAULT_BASE_DIR } = args

  if (!FileManager || (typeof FileManager.writeAsStringSync !== "function" && !hasFMBytes())) {
    console.warn(LOG_PREFIX, "writeJsonToCachedFile：当前环境不支持写文件")
    return null
  }

  try {
    const now = Date.now()
    const dir = pickBaseDir(baseDir)
    const fileName = `${filePrefix}_${now}.${fileExt}`
    const filePath = normalizePath(`${dir}/${fileName}`)
    const txt = JSON.stringify(data ?? null)

    if (typeof FileManager.writeAsStringSync === "function" || typeof FileManager.writeAsString === "function") {
      fmWriteString(filePath, txt)
    } else {
      fmWriteBytes(filePath, utf8ToBytes(txt))
    }

    return { path: filePath, updatedAt: now }
  } catch (e) {
    console.warn(LOG_PREFIX, "writeJsonToCachedFile：异常", e instanceof Error ? e.message : String(e))
    return null
  }
}

export function readJsonFromCachedFile<T = unknown>(path: string): T | null {
  const p = normalizePath(path)
  if (!p) return null
  if (!fmExists(p)) return null
  if (!hasFMString()) {
    console.warn(LOG_PREFIX, "readJsonFromCachedFile：当前环境不支持 readAsString*")
    return null
  }

  try {
    const txt = fmReadString(p)
    return txt ? (JSON.parse(txt) as T) : null
  } catch (e) {
    console.warn(LOG_PREFIX, "readJsonFromCachedFile：异常", e instanceof Error ? e.message : String(e))
    return null
  }
}

// =====================================================================
// 模块分类 · D) Widget image helper（单文件策略）
// =====================================================================
export async function getCachedImagePath(opts: {
  url?: string
  cacheKey: string
  filePrefix: string
  fileExt: "png" | "jpg" | "jpeg" | "webp"
  baseDir?: BaseDir
  forceRefresh?: boolean

  timeoutMs?: number
  fetchTimeoutMs?: number
  bodyTimeoutMs?: number

  logOnTimeout?: boolean
  debugLog?: boolean
}): Promise<string> {
  const {
    url,
    cacheKey,
    filePrefix,
    fileExt,
    baseDir = DEFAULT_BASE_DIR,
    forceRefresh = false,

    timeoutMs = 2500,
    fetchTimeoutMs,
    bodyTimeoutMs,

    logOnTimeout = false,
    debugLog,
  } = opts

  const dbgOn = logEnabled(debugLog)

  if (!url) return ""

  const raw = await ensureCachedFilePath({
    url,
    cacheKey,
    filePrefix,
    fileExt,
    baseDir,
    forceRefresh,
    timeoutMs,
    fetchTimeoutMs,
    bodyTimeoutMs,
    logOnTimeout,
    debugLog: dbgOn,
  })

  if (typeof raw !== "string" || !raw) return ""

  const path = normalizePath(raw)

  // 轻量校验：存在 + size>0
  const exists = fmExists(path)
  const stat = exists ? fmStat(path) : null
  const size = typeof stat?.size === "number" ? stat.size : -1
  if (!exists || !Number.isFinite(size) || size <= 0) {
    if (dbgOn) console.log(`🧹 清理缓存 | bad file · prefix=${filePrefix} · size=${size} · path=${path}`)
    return ""
  }

  return path
}