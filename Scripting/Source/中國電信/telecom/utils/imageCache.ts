// telecom/utils/imageCache.ts
import { fetch } from "scripting"

declare const FileManager: any
declare const Storage: any

type ImageCacheMeta = {
  url: string
  path: string
  updatedAt: number
}

type EnsureImageFilePathArgs = {
  url: string
  cacheKey: string            // Storage key（每个图片一个独立 key）
  filePrefix?: string         // 临时文件名前缀
  fileExt?: "png" | "jpg" | "jpeg" | "webp"
  forceRefresh?: boolean
}

/**
 * 按 FileManager 能力实现：
 * - FileManager.temporaryDirectory
 * - FileManager.existsSync(path)
 * - FileManager.writeAsBytesSync(path, bytes)
 * - FileManager.removeSync(path)
 *
 * 成功返回：本地 filePath（可直接喂给 <Image filePath="...">）
 * 失败返回：null（上层自行决定怎么兜底；一般是直接不显示 logo）
 */
export async function ensureImageFilePath(
  args: EnsureImageFilePathArgs,
): Promise<string | null> {
  const {
    url,
    cacheKey,
    filePrefix = "telecom_img",
    fileExt = "png",
    forceRefresh = false,
  } = args

  if (!url) return null

  try {
    // ---- 运行时能力检查（按你现在的环境）----
    const hasFM =
      !!FileManager &&
      typeof FileManager.existsSync === "function" &&
      typeof FileManager.writeAsBytesSync === "function" &&
      typeof FileManager.removeSync === "function" &&
      typeof FileManager.temporaryDirectory === "string"

    if (!hasFM || !Storage?.get || !Storage?.set) {
      console.warn("⚠️ imageCache：当前环境不支持 FileManager/Storage 所需方法")
      return null
    }

    const cached = (Storage.get(cacheKey) ?? null) as ImageCacheMeta | null

    // ✅ 命中缓存（url 一致 + 文件存在）
    if (
      !forceRefresh &&
      cached &&
      cached.url === url &&
      cached.path &&
      FileManager.existsSync(cached.path)
    ) {
      console.log("🖼️ imageCache：命中缓存", cacheKey)
      return cached.path
    }

    // 清理旧缓存文件（如果存在）
    if (cached?.path && FileManager.existsSync(cached.path)) {
      try {
        FileManager.removeSync(cached.path)
      } catch { }
    }

    // 下载
    console.log("🖼️ imageCache：下载更新…", url)
    const resp = await fetch(url)
    if (!resp.ok) {
      console.warn("⚠️ imageCache：下载失败 status=", resp.status)
      return null
    }

    // 二进制
    const buf = await resp.arrayBuffer()
    const bytes = new Uint8Array(buf)

    // 写入 temp
    const dir = FileManager.temporaryDirectory
    const fileName = `${filePrefix}_${Date.now()}.${fileExt}`
    const filePath = `${dir}/${fileName}`

    FileManager.writeAsBytesSync(filePath, bytes)

    // 写入 meta
    Storage.set(cacheKey, {
      url,
      path: filePath,
      updatedAt: Date.now(),
    } as ImageCacheMeta)

    console.log("✅ imageCache：已写入缓存", filePath)
    return filePath
  } catch (e) {
    console.warn("⚠️ imageCache：缓存异常:", e)
    return null
  }
}