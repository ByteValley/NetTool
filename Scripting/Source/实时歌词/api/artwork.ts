// 多源封面获取：候选必须通过歌名/歌手相似度校验后才允许缓存
import { cacheArtworkImage, getCachedArtworkPath } from "../utils/cache"
import { fetchCoverUrl, searchCandidates } from "./musicSources"

declare const UIImage: any
const COVER_PX = 240

function withCoverSize(url: string, px: number = COVER_PX): string {
  if (/param=\d+y\d+/i.test(url)) {
    return url.replace(/param=\d+y\d+/i, `param=${px}y${px}`)
  }
  return `${url}${url.includes("?") ? "&" : "?"}param=${px}y${px}`
}

async function fetchCoverFromSources(title: string, artist: string): Promise<UIImage | null> {
  const candidates = await searchCandidates(title, artist)
  for (const candidate of candidates) {
    // searchCandidates 已过滤低于最低匹配分的结果，避免缓存错图。
    const coverUrl = await fetchCoverUrl(candidate)
    if (!coverUrl) continue
    try {
      const image = await UIImage.fromURL(withCoverSize(coverUrl))
      if (image) return image
    } catch {
      // 当前候选图片失败时继续尝试下一个候选
    }
  }
  return null
}

async function fetchCoverFromLrcCx(title: string, artist: string): Promise<UIImage | null> {
  try {
    const url =
      `https://api.lrc.cx/cover?title=${encodeURIComponent(title)}` +
      (artist ? `&artist=${encodeURIComponent(artist)}` : "")
    return await UIImage.fromURL(url)
  } catch {
    return null
  }
}

/** 获取封面 JPEG 路径：Spotify 封面 → 多平台候选匹配 → api.lrc.cx。 */
export async function fetchArtworkPath(
  title: string,
  artist: string,
  preferredCoverUrl?: string,
): Promise<string | null> {
  if (!title) return null

  const cached = getCachedArtworkPath(title, artist)
  if (cached) return cached

  if (preferredCoverUrl) {
    try {
      const image = await UIImage.fromURL(preferredCoverUrl)
      if (image) {
        const path = await cacheArtworkImage(title, artist, image)
        if (path) return path
      }
    } catch {
      // Spotify cover URL can fail; continue through the existing fallbacks.
    }
  }

  const primary = await fetchCoverFromSources(title, artist)
  if (primary) {
    const path = await cacheArtworkImage(title, artist, primary)
    if (path) return path
  }

  const secondary = await fetchCoverFromLrcCx(title, artist)
  if (secondary) {
    const path = await cacheArtworkImage(title, artist, secondary)
    if (path) return path
  }

  return null
}
