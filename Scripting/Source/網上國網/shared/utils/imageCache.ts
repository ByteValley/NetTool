// shared/utils/imageCache.ts（WSGW 版：safeGetObject/safeSet + FileManager）

import { fetch } from "scripting"
import { safeGetObject, safeSet } from "./storage"

declare const FileManager: any

type ImageCacheMeta = {
  url: string
  path: string
  updatedAt: number
}

type EnsureImageFilePathArgs = {
  url: string
  cacheKey: string
  filePrefix?: string
  fileExt?: "png" | "jpg" | "jpeg" | "webp"
  forceRefresh?: boolean
}

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
    const hasFM =
      !!FileManager &&
      typeof FileManager.existsSync === "function" &&
      typeof FileManager.writeAsBytesSync === "function" &&
      typeof FileManager.removeSync === "function" &&
      typeof FileManager.temporaryDirectory === "string"

    if (!hasFM) {
      console.warn("⚠️ imageCache：当前环境不支持 FileManager 所需方法")
      return null
    }

    const cached = safeGetObject<ImageCacheMeta | null>(cacheKey, null)

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

    // 清理旧文件
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

    const buf = await resp.arrayBuffer()
    const bytes = new Uint8Array(buf)

    const dir = FileManager.temporaryDirectory
    const fileName = `${filePrefix}_${Date.now()}.${fileExt}`
    const filePath = `${dir}/${fileName}`

    FileManager.writeAsBytesSync(filePath, bytes)

    safeSet(cacheKey, {
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