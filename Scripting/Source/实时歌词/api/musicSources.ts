// 多平台音乐候选搜索与匹配

// 声明全局 fetch（运行时由 Scripting 提供，TS 类型库未内置 DOM）
declare const fetch: (input: string, init?: any) => Promise<any>
declare const atob: (input: string) => string

type MusicSource = "qq" | "kugou" | "netease" | "kuwo"

export type MusicCandidate = {
  source: MusicSource
  id: string
  title: string
  artist: string
  album?: string
  score: number
  coverUrl?: string
  mid?: string
  hash?: string
  duration?: number
}

const USER_AGENT =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.5.2 Mobile/15E148 Safari/604.1"

const HEADERS = {
  "User-Agent": USER_AGENT,
  Referer: "https://music.163.com/",
}
const SEARCH_LIMIT = 10

function clean(value: unknown): string {
  return String(value || "")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/\\+u0026/gi, "&")
    .trim()
}

function normalize(value: string): string {
  return clean(value)
    .toLocaleLowerCase()
    .replace(/[\s\-_.·・'’"“”()（）\[\]【】{}《》<>:：]/g, "")
}

function similarity(expected: string, actual: string): number {
  const left = normalize(expected)
  const right = normalize(actual)
  if (!left || !right) return 0
  if (left === right) return 1
  if (left.includes(right) || right.includes(left)) return 0.88
  const chars = new Set(left.split(""))
  const common = right.split("").filter((char) => chars.has(char)).length
  return common / Math.max(left.length, right.length)
}

export function candidateScore(title: string, artist: string, candidate: MusicCandidate): number {
  const titleScore = similarity(title, candidate.title)
  const artistScore = similarity(artist, candidate.artist)
  return titleScore * 0.65 + artistScore * 0.35
}

// 非录音室版本标记：这类版本时间轴与原版不一致，或干脆没有歌词，应排在原版之后。
const VERSION_MARKERS: Array<{ pattern: RegExp; penalty: number }> = [
  { pattern: /伴奏|instrumental|karaoke|纯音乐/i, penalty: 0.5 },
  { pattern: /\bdj\b|dj[^)\]]*版|remix|混音|慢摇|抖音版|加速版|减速版/i, penalty: 0.4 },
  { pattern: /\bcover\b|翻唱|女声版|男声版|童声版/i, penalty: 0.3 },
  { pattern: /live|演唱会|现场|音乐会|unplugged/i, penalty: 0.2 },
  { pattern: /remaster|重制|修复版/i, penalty: 0.05 },
]

/** 候选标题带有原查询不含的版本标记时的排序惩罚。 */
function versionPenalty(queryTitle: string, candidate: MusicCandidate): number {
  const target = `${candidate.title} ${candidate.album || ""}`
  let penalty = 0
  for (const marker of VERSION_MARKERS) {
    // 用户播放的本来就是 Live / DJ 版时不惩罚，避免把想要的版本排到后面。
    if (marker.pattern.test(queryTitle)) continue
    if (marker.pattern.test(target)) penalty += marker.penalty
  }
  return penalty
}

function rankCandidates(title: string, artist: string, list: MusicCandidate[]): MusicCandidate[] {
  return list
    .map((candidate) => ({ ...candidate, score: candidateScore(title, artist, candidate) }))
    .filter((candidate) => {
      const minimum = normalize(artist).length > 0 ? 0.72 : 0.58
      return candidate.score >= minimum && normalize(candidate.title).length > 0
    })
    .sort(
      (a, b) =>
        b.score - versionPenalty(title, b) - (a.score - versionPenalty(title, a)),
    )
}

async function json(url: string, headers: Record<string, string> = HEADERS): Promise<any | null> {
  try {
    const response: any = await fetch(url, { headers })
    if (!response.ok) return null
    return await response.json()
  } catch {
    return null
  }
}

async function searchQQ(title: string, artist: string): Promise<MusicCandidate[]> {
  const query = encodeURIComponent(`${title} ${artist}`.trim())
  const data = await json(
    `https://c.y.qq.com/soso/fcgi-bin/client_search_cp?w=${query}&format=json&p=1&n=${SEARCH_LIMIT}&cr=1&new_json=1`,
    { ...HEADERS, Referer: "https://y.qq.com/" },
  )
  const songs = data?.data?.song?.list
  if (!Array.isArray(songs)) return []
  return songs.map((song: any) => ({
    source: "qq",
    id: String(song.id || song.mid || ""),
    mid: song.mid,
    title: clean(song.name || song.title),
    artist: (song.singer || []).map((item: any) => clean(item.name)).join(" & "),
    album: clean(song.album?.name),
    coverUrl: song.album?.pmid
      ? `https://y.gtimg.cn/music/photo_new/T002R300x300M000${song.album.pmid}.jpg`
      : undefined,
    duration: Number(song.interval || 0),
    score: 0,
  }))
}

async function searchKugou(title: string, artist: string): Promise<MusicCandidate[]> {
  const query = encodeURIComponent(`${title} ${artist}`.trim())
  const data = await json(
    `https://songsearch.kugou.com/song_search_v2?keyword=${query}&page=1&pagesize=${SEARCH_LIMIT}`,
    { ...HEADERS, Referer: "https://www.kugou.com/" },
  )
  const songs = data?.data?.lists
  if (!Array.isArray(songs)) return []
  return songs.map((song: any) => ({
    source: "kugou",
    id: String(song.Audioid || song.SongID || song.ID || ""),
    hash: song.FileHash,
    title: clean(song.SongName || song.OriSongName),
    artist: clean(song.SingerName || (song.Singers || []).map((item: any) => item.name).join(" & ")),
    album: clean(song.AlbumName),
    coverUrl: clean(song.Image || song.AlbumImage).replace("{size}", "400"),
    duration: Number(song.Duration || 0),
    score: 0,
  }))
}

async function searchNetEase(title: string, artist: string): Promise<MusicCandidate[]> {
  const query = encodeURIComponent(`${title} ${artist}`.trim())
  const data = await json(
    `https://music.163.com/api/search/get/web?s=${query}&type=1&limit=${SEARCH_LIMIT}`,
  )
  const songs = data?.result?.songs
  if (!Array.isArray(songs)) return []
  return songs.map((song: any) => ({
    source: "netease",
    id: String(song.id || ""),
    title: clean(song.name),
    artist: (song.artists || []).map((item: any) => clean(item.name)).join(" & "),
    album: clean(song.album?.name),
    duration: Math.round(Number(song.duration || 0) / 1000),
    score: 0,
  }))
}

function parseKuwoLoose(text: string): MusicCandidate[] {
  const result: MusicCandidate[] = []
  const blocks = text.split("{'AARTIST'").slice(1)
  for (const block of blocks.slice(0, SEARCH_LIMIT)) {
    const name = block.match(/'NAME':'([^']*)'/)?.[1]
    const artist = block.match(/'ARTIST':'([^']*)'/)?.[1]
    const id = block.match(/'DC_TARGETID':'?(\d+)/)?.[1] || block.match(/'MUSICRID':'MUSIC_(\d+)/)?.[1]
    if (name && id) {
      result.push({
        source: "kuwo",
        id,
        title: clean(name),
        artist: clean(artist),
        score: 0,
      })
    }
  }
  return result
}

async function searchKuwo(title: string, artist: string): Promise<MusicCandidate[]> {
  const query = encodeURIComponent(`${title} ${artist}`.trim())
  try {
    const response: any = await fetch(
      `https://search.kuwo.cn/r.s?all=${query}&ft=music&itemset=web_2013&client=kt&pn=0&rn=${SEARCH_LIMIT}` +
        `&rformat=json&encoding=utf8&vermerge=1&mobi=1`,
      { headers: { ...HEADERS, Referer: "https://kuwo.cn/" } },
    )
    if (!response.ok) return []
    const text = await response.text()
    try {
      const data = JSON.parse(text)
      const songs = data?.abslist || []
      return songs.map((song: any) => ({
        source: "kuwo",
        id: String(song.DC_TARGETID || song.MUSICRID || "").replace("MUSIC_", ""),
        title: clean(song.NAME || song.SONGNAME),
        artist: clean(song.ARTIST),
        album: clean(song.ALBUM),
        score: 0,
      }))
    } catch {
      return parseKuwoLoose(text)
    }
  } catch {
    return []
  }
}

export async function searchCandidates(title: string, artist: string): Promise<MusicCandidate[]> {
  const sources: Array<(title: string, artist: string) => Promise<MusicCandidate[]>> = [
    searchQQ,
    searchKugou,
    searchNetEase,
    searchKuwo,
  ]
  const result: MusicCandidate[] = []
  for (const search of sources) {
    const ranked = rankCandidates(title, artist, await search(title, artist))
    result.push(...ranked)
  }
  return result
}

function decodeBase64Utf8(value: string): string {
  try {
    // 酷狗歌词接口返回 UTF-8 LRC 的 Base64 编码。
    const binary = atob(value)
    let escaped = ""
    for (let index = 0; index < binary.length; index += 1) {
      escaped += `%${binary.charCodeAt(index).toString(16).padStart(2, "0")}`
    }
    return decodeURIComponent(escaped)
  } catch {
    return ""
  }
}

export async function fetchCandidateLyric(candidate: MusicCandidate): Promise<string> {
  try {
    if (candidate.source === "qq" && candidate.mid) {
      const data = await json(
        `https://c.y.qq.com/lyric/fcgi-bin/fcg_query_lyric_new.fcg?songmid=${candidate.mid}&format=json&nobase64=1`,
        { ...HEADERS, Referer: "https://y.qq.com/" },
      )
      return clean(data?.lyric)
    }

    if (candidate.source === "kugou" && candidate.hash) {
      const searchUrl =
        `https://lyrics.kugou.com/search?ver=1&man=yes&client=pc` +
        `&keyword=${encodeURIComponent(candidate.artist + " - " + candidate.title)}` +
        `&duration=${Math.round((candidate.duration || 0) * 1000)}&hash=${candidate.hash}`
      const searchData = await json(searchUrl, { ...HEADERS, Referer: "https://www.kugou.com/" })
      const item = searchData?.candidates?.[0]
      if (!item) return ""
      const lyricData = await json(
        `https://lyrics.kugou.com/download?ver=1&client=pc&fmt=lrc&charset=utf8` +
          `&id=${item.id}&accesskey=${item.accesskey}&hash=${candidate.hash}`,
        { ...HEADERS, Referer: "https://www.kugou.com/" },
      )
      return decodeBase64Utf8(lyricData?.content || "")
    }

    if (candidate.source === "netease") {
      const data = await json(`https://music.163.com/api/song/lyric?id=${candidate.id}&lv=1&tv=-1`)
      return clean(data?.lrc?.lyric || data?.tlyric?.lyric)
    }

    if (candidate.source === "kuwo") {
      const data = await json(`https://m.kuwo.cn/newh5/singles/songinfoandlrc?musicId=${candidate.id}`, {
        ...HEADERS,
        Referer: "https://m.kuwo.cn/",
      })
      const list = data?.data?.lrclist
      if (Array.isArray(list)) {
        return list
          .map((line: any) => `[${formatTime(Number(line.time))}]${clean(line.lineLyric)}`)
          .join("\n")
      }
    }
  } catch {
    return ""
  }
  return ""
}

function formatTime(seconds: number): string {
  const safe = Number.isFinite(seconds) ? Math.max(0, seconds) : 0
  const minutes = Math.floor(safe / 60)
  const rest = (safe - minutes * 60).toFixed(2).padStart(5, "0")
  return `${String(minutes).padStart(2, "0")}:${rest}`
}

export async function fetchCoverUrl(candidate: MusicCandidate): Promise<string | null> {
  if (candidate.coverUrl) return candidate.coverUrl
  if (candidate.source !== "netease") return null
  const data = await json(`https://music.163.com/api/song/detail?ids=[${candidate.id}]`)
  const song = data?.songs?.[0]
  return song?.album?.picUrl || song?.album?.blurPicUrl || null
}
