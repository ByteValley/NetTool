// 多源歌词 API 调用
// 优先级：QQ 音乐 → 酷狗 → 网易云 → 酷我 → api.lrc.cx
import type { LyricData } from "../types"
import { parseLrc } from "../utils/lrc"
import { cacheLyrics, getCachedLyrics } from "../utils/cache"
import {
  fetchCandidateLyric,
  searchCandidates,
} from "./musicSources"

declare const fetch: (input: string, init?: any) => Promise<any>
const LRCAPI_BASE = "https://api.lrc.cx/lyrics"

async function fetchFromLrcApi(
  title: string,
  artist: string,
  albumTitle: string | undefined,
): Promise<LyricData | null> {
  try {
    const url =
      `${LRCAPI_BASE}?title=${encodeURIComponent(title)}` +
      (artist ? `&artist=${encodeURIComponent(artist)}` : "")
    const response: any = await fetch(url)
    if (!response.ok) return null
    const text: string = await response.text()
    const lines = parseLrc(text)
    return lines.length > 0 ? { title, artist, albumTitle, lines, synced: true } : null
  } catch {
    return null
  }
}

async function fetchFromMusicSources(
  title: string,
  artist: string,
  albumTitle: string | undefined,
): Promise<LyricData | null> {
  const candidates = await searchCandidates(title, artist)
  for (const candidate of candidates) {
    const lrc = await fetchCandidateLyric(candidate)
    if (!lrc) continue
    const lines = parseLrc(lrc)
    if (lines.length > 0) {
      return {
        title,
        artist,
        albumTitle: albumTitle || candidate.album,
        lines,
        synced: true,
      }
    }
  }
  return null
}

/** 根据歌曲信息获取歌词，并按来源优先级及候选相似度逐条尝试。 */
export async function fetchLyrics(params: {
  title: string
  artist: string
  albumTitle?: string
  duration?: number
}): Promise<LyricData | null> {
  const { title, artist, albumTitle } = params
  if (!title) return null

  const cached = await getCachedLyrics(title, artist)
  if (cached) return cached

  const primary = await fetchFromMusicSources(title, artist, albumTitle)
  if (primary) {
    cacheLyrics(title, artist, primary)
    return primary
  }

  const secondary = await fetchFromLrcApi(title, artist, albumTitle)
  if (secondary) cacheLyrics(title, artist, secondary)
  return secondary
}
