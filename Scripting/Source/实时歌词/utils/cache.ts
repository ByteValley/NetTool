// 歌词与封面的文件缓存层
// 歌词/封面持久化到 App Group 共享目录（小组件也可访问），避免整首歌词常驻 Storage；
// 封面保存为压缩 JPEG 文件（路径引用），不再使用 Base64，避免 Storage/小组件体积膨胀。
import type { LyricData } from "../types"

export type CacheStats = {
  lyrics: number
  artworks: number
  updatedAt: number
}

// 索引仅用于主页统计展示，仍保存在 Storage
type CacheIndex = {
  lyrics: string[]
  artworks: string[]
  updatedAt: number
}

const CACHE_INDEX_KEY = "lyric_cache_index"
// 小组件封面边长约 80pt，240px 足够清晰且体积可控
const ARTWORK_MAX_PX = 240
const ARTWORK_JPEG_QUALITY = 0.55

// 缓存根目录优先使用 App Group（小组件可访问），不可用时回退本地 Documents
function cacheRoot(): string {
  const base = FileManager.appGroupDocumentsDirectory ?? FileManager.documentsDirectory
  return `${base}/lyric_cache`
}

function lyricsDir(): string {
  return `${cacheRoot()}/lyrics`
}

function artworksDir(): string {
  return `${cacheRoot()}/artworks`
}

// 把 artist + title 转为安全文件名片段
function safeName(artist: string, title: string): string {
  return `${encodeURIComponent(artist)}__${encodeURIComponent(title)}`
}

// 同步判断文件是否存在（避免无谓的异步 IO）
function fileExists(path: string): boolean {
  try {
    return FileManager.existsSync(path)
  } catch {
    return false
  }
}

function readIndex(): CacheIndex {
  return (
    Storage.get<CacheIndex>(CACHE_INDEX_KEY) ?? {
      lyrics: [],
      artworks: [],
      updatedAt: 0,
    }
  )
}

function remember(kind: "lyrics" | "artworks", key: string) {
  const index = readIndex()
  if (!index[kind].includes(key)) index[kind].push(key)
  index.updatedAt = Date.now() / 1000
  Storage.set(CACHE_INDEX_KEY, index)
}

/** 生成封面 JPEG 文件路径（不检查是否存在） */
export function artworkFilePath(title: string, artist: string): string {
  return `${artworksDir()}/${safeName(artist, title)}.jpg`
}

export function lyricCacheKey(title: string, artist: string): string {
  return `${artist}::${title}`
}

export function artworkCacheKey(title: string, artist: string): string {
  return `${artist}::${title}`
}

/** 读取缓存的歌词文件；命中则反序列化返回，未命中返回 null（避免反复拉取） */
export async function getCachedLyrics(
  title: string,
  artist: string,
): Promise<LyricData | null> {
  const path = `${lyricsDir()}/${safeName(artist, title)}.json`
  if (!fileExists(path)) return null
  try {
    const text = await FileManager.readAsString(path)
    return JSON.parse(text) as LyricData
  } catch {
    return null
  }
}

/** 将一首歌词写入文件缓存并登记索引 */
export async function cacheLyrics(
  title: string,
  artist: string,
  data: LyricData,
): Promise<void> {
  const dir = lyricsDir()
  await FileManager.createDirectory(dir, true)
  const path = `${dir}/${safeName(artist, title)}.json`
  await FileManager.writeAsString(path, JSON.stringify(data))
  remember("lyrics", lyricCacheKey(title, artist))
}

/** 读取缓存封面 JPEG 路径；命中返回绝对路径，未命中返回 null */
export function getCachedArtworkPath(title: string, artist: string): string | null {
  const path = artworkFilePath(title, artist)
  return fileExists(path) ? path : null
}

/**
 * 将封面压缩为 JPEG 写入 App Group 缓存目录。
 * 先缩略到 ARTWORK_MAX_PX，再以 ARTWORK_JPEG_QUALITY 编码，显著减小体积。
 * @returns 成功时返回文件路径，失败返回 null
 */
export async function cacheArtworkImage(
  title: string,
  artist: string,
  image: UIImage,
): Promise<string | null> {
  const dir = artworksDir()
  await FileManager.createDirectory(dir, true)
  const path = artworkFilePath(title, artist)

  // 缩略 + JPEG 压缩，避免原图撑爆小组件刷新
  const thumb =
    image.preparingThumbnail({ width: ARTWORK_MAX_PX, height: ARTWORK_MAX_PX }) ?? image

  try {
    await ImageIO.writeImage({
      image: thumb,
      to: path,
      format: "jpeg",
      quality: ARTWORK_JPEG_QUALITY,
    })
    remember("artworks", artworkCacheKey(title, artist))
    return path
  } catch {
    // ImageIO 失败时回退 toJPEGData
  }

  try {
    const data = thumb.toJPEGData(ARTWORK_JPEG_QUALITY)
    if (!data) return null
    await FileManager.writeAsData(path, data)
    remember("artworks", artworkCacheKey(title, artist))
    return path
  } catch {
    return null
  }
}

/** 清空全部缓存（可选维护功能） */
export async function clearCache(): Promise<void> {
  try {
    await FileManager.remove(cacheRoot())
  } catch {
    // 忽略
  }
  Storage.set(CACHE_INDEX_KEY, { lyrics: [], artworks: [], updatedAt: 0 })
}

export function getCacheStats(): CacheStats {
  const index = readIndex()
  return {
    lyrics: index.lyrics.length,
    artworks: index.artworks.length,
    updatedAt: index.updatedAt,
  }
}
