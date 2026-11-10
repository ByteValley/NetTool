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
    .normalize("NFKC")
    .toLocaleLowerCase()
    .replace(/[\s\-_.·・'’"“”()（）\[\]【】{}《》<>:：]/g, "")
}

function identity(value: string): string {
  return clean(value)
    .normalize("NFKC")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase()
    .replace(/[\s\p{P}\p{S}]/gu, "")
}

const ARTIST_ALIAS_GROUPS = [
  ['薛之谦', '薛之謙', 'Joker Xue', 'Xue Zhiqian', 'Zhiqian Xue'],
  ['邓紫棋', '鄧紫棋', 'G.E.M.', 'Gloria Tang', 'Deng Ziqi', 'Tang Tsz-kei'],
  ['周杰伦', '周杰倫', 'Jay Chou', 'Chou Chieh-lun'],
  ['林俊杰', '林俊傑', 'JJ Lin', 'Lin Junjie'],
  ['陈奕迅', '陳奕迅', 'Eason Chan'],
  ['王菲', 'Faye Wong'],
  ['张学友', '張學友', 'Jacky Cheung'],
  ['刘德华', '劉德華', 'Andy Lau'],
  ['郭富城', 'Aaron Kwok'],
  ['张惠妹', '張惠妹', 'A-Mei', 'Amei', 'Chang Hui-mei'],
  ['蔡依林', 'Jolin Tsai'],
  ['孙燕姿', '孫燕姿', 'Stefanie Sun'],
  ['张艺兴', '張藝興', 'Lay Zhang', 'Zhang Yixing'],
  ['王嘉尔', '王嘉爾', 'Jackson Wang', 'Wang Jiaer'],
  ['易烊千玺', '易烊千璽', 'Jackson Yee'],
  ['张韶涵', '張韶涵', 'Angela Chang'],
  ['周兴哲', '周興哲', 'Eric Chou'],
  ['黄丽玲', '黃麗玲', 'A-Lin', 'Huang Li-ling'],
  ['郑秀文', '鄭秀文', 'Sammi Cheng'],
  ['杨千嬅', '楊千嬅', 'Miriam Yeung'],
  ['邓丽君', '鄧麗君', 'Teresa Teng'],
  ['梅艳芳', '梅艷芳', 'Anita Mui'],
  ['五月天', 'Mayday'],
  ['许嵩', '許嵩', 'Vae'],
  ['张靓颖', '張靚穎', 'Jane Zhang'],
  ['周深', 'Charlie Zhou', 'Zhou Shen'],
  ['李荣浩', '李榮浩', 'Li Ronghao'],
  ['毛不易', 'Mao Buyi'],
  ['华晨宇', '華晨宇', 'Hua Chenyu'],
  ['赵雷', '趙雷', 'Zhao Lei'],
  ['朴树', '朴樹', 'Pu Shu'],
  ['陈粒', '陳粒', 'Chen Li'],
  ['李健', 'Li Jian'],
  ['许巍', '許巍', 'Xu Wei'],
  ['林宥嘉', 'Yoga Lin'],
  ['张敬轩', '張敬軒', 'Hins Cheung'],
  ['容祖儿', '容祖兒', 'Joey Yung'],
  ['莫文蔚', 'Karen Mok'],
  ['田馥甄', 'Hebe Tien'],
  ['王力宏', 'Wang Leehom', 'Leehom Wang'],
  ['陶喆', 'David Tao'],
  ['梁静茹', '梁靜茹', 'Fish Leong'],
  ['王心凌', 'Cyndi Wang'],
  ['杨丞琳', '楊丞琳', 'Rainie Yang'],
  ['萧亚轩', '蕭亞軒', 'Elva Hsiao'],
  ['张信哲', '張信哲', 'Jeff Chang'],
  ['刘若英', '劉若英', 'Rene Liu'],
  ['蔡健雅', 'Tanya Chua'],
  ['戴佩妮', 'Penny Tai'],
  ['陈绮贞', '陳綺貞', 'Cheer Chen'],
  ['林忆莲', '林憶蓮', 'Sandy Lam'],
  ['郭静', '郭靜', 'Claire Kuo'],
  ['徐佳莹', '徐佳瑩', 'Lala Hsu'],
  ['Taylor Swift', '泰勒斯威夫特'],
  ['Michael Jackson', '迈克尔杰克逊', '麥可傑克森'],
  ['Adele', '阿黛尔', '愛黛兒'],
  ['Ed Sheeran', '艾德希兰', '艾德·希兰'],
  ['Justin Bieber', '贾斯汀比伯', '小贾斯汀'],
  ['Bruno Mars', '布鲁诺马尔斯', '布魯諾·馬爾斯'],
  ['Billie Eilish', '比莉艾利什', '怪奇比莉'],
  ['Ariana Grande', '爱莉安娜格兰德', '亞莉安娜'],
  ['The Weeknd', 'Abel Tesfaye'],
  ['Lady Gaga', 'Stefani Germanotta'],
  ['Beyoncé', 'Beyonce', '碧昂丝', '碧昂絲'],
  ['Rihanna', '蕾哈娜'],
  ['Katy Perry', '凯蒂佩里', '凱蒂·佩芮'],
  ['Dua Lipa', '杜娃黎波'],
  ['Olivia Rodrigo', '奥利维亚罗德里戈', '奧莉維亞·羅德里戈'],
];

const ARTIST_ALIAS_INDEX = new Map<string, string[]>()
for (const group of ARTIST_ALIAS_GROUPS) {
  for (const name of group) ARTIST_ALIAS_INDEX.set(identity(name), group)
}

const TITLE_DECORATION_IN_BRACKETS = /^(?:(?:\d{4}\s+)?(?:official(?:\s+music)?\s+(?:video|audio|mv)|music\s+video|visuali[sz]er|lyrics?|mv|live|remix(?:ed)?|remaster(?:ed)?|instrumental|karaoke|acoustic|cover|demo|version|ver|feat(?:uring)?\.?|ft\.?|with\b|from\b|现场(?:版)?|演唱会(?:版)?|翻唱(?:版)?|完整版|无损(?:音质)?|高清(?:mv)?|纯音乐|伴奏|卡拉ok|电视剧原声|电影原声|原声带|字幕版|歌词版|加速版|慢速版))/i

function stripTitleDecorations(value: string): string {
  let title = clean(value).normalize("NFKC").trim()
  title = title.replace(/[\[【(（{]([^\]】)）}]*)[\]】)）}]/g, (_match, inner) =>
    TITLE_DECORATION_IN_BRACKETS.test(inner.trim()) ? " " : " " + inner + " ",
  )
  title = title.replace(
    /^(?:(?:official(?:\s+music)?\s+(?:video|audio|mv)|music\s+video|visuali[sz]er|mv|lyrics?|cover|remix|live|dj|现场(?:版)?|演唱会|翻唱|完整版|无损(?:音质)?|高清(?:mv)?|影视原声(?:带)?|电视剧(?:原声|主题曲)|电影(?:原声|主题曲)|网剧主题曲|动画主题曲|片尾曲|片头曲|插曲|主题曲|原声带)\s*[:：\-—|｜]+\s*)+/i,
    "",
  )
  title = title.replace(
    /\s*[-－—|｜:：]\s*(?:official(?:\s+music)?\s+(?:video|audio|mv)|music\s+video|visuali[sz]er|mv|lyrics?|cover|remix|live|dj|现场(?:版)?|演唱会|翻唱|完整版|无损(?:音质)?|高清(?:mv)?|影视原声(?:带)?|电视剧(?:原声|主题曲)|电影(?:原声|主题曲)|网剧主题曲|动画主题曲|片尾曲|片头曲|插曲|主题曲|原声带|粤语|粵語|国语|國語|普通话|普通話|中文|英文|日语|日文|韩语|韓語|方言|卡点节奏|卡點節奏|伴奏|纯音乐|纯享版|歌词版|歌詞版|加速版|慢速版).*$/i,
    "",
  )
  title = title.replace(
    /(?:粤语|粵語|国语|國語|普通话|普通話|中文|英文|日语|日文|韩语|韓語|方言|卡点节奏|卡點節奏|电视剧主题曲|电影主题曲|网剧主题曲|动画主题曲|片尾曲|片头曲|插曲|主题曲|现场版|演唱会版|翻唱版|伴奏版|纯音乐|纯享版|歌词版|歌詞版|完整版|无损音质|无损|高清|修复版|重制版|加速版|慢速版)(?:版|版本)?$/i,
    "",
  )
  title = title.replace(/\s*\b(?:live|remix(?:ed)?|remaster(?:ed)?|instrumental|karaoke|acoustic|cover|demo|version|ver|official|lyrics?|visuali[sz]er|audio|hd|4k)\b(?:\s+(?:version|ver))?$/i, "")
  return title.replace(/^[《〈「『]+|[》〉」』]+$/g, "").trim()
}

export function normalizeTitleForSearch(value: string): string {
  return stripTitleDecorations(value)
}

function titleSimilarity(expected: string, actual: string): number {
  const left = identity(stripTitleDecorations(expected))
  const right = identity(stripTitleDecorations(actual))
  if (!left || !right) return 0
  if (left === right) return 1
  const longest = Math.max(left.length, right.length)
  const shortest = Math.min(left.length, right.length)
  if (shortest >= 3 && (left.includes(right) || right.includes(left))) return shortest / longest

  let previous = Array.from({ length: right.length + 1 }, (_, index) => index)
  for (let i = 1; i <= left.length; i += 1) {
    const current = [i]
    for (let j = 1; j <= right.length; j += 1) {
      current[j] = Math.min(
        current[j - 1] + 1,
        previous[j] + 1,
        previous[j - 1] + (left[i - 1] === right[j - 1] ? 0 : 1),
      )
    }
    previous = current
  }
  return 1 - previous[right.length] / longest
}

function artistParts(value: string): string[] {
  const raw = clean(value).trim()
  return [raw, ...raw.split(/\s*(?:[,&\/、，＋+|·・;]|(?:feat(?:uring)?\.?)|(?:ft\.?)|(?:with))\s*/i)].filter(Boolean)
}

function artistVariants(value: string): Set<string> {
  const names = artistParts(value)
  for (const name of [...names]) names.push(...(ARTIST_ALIAS_INDEX.get(identity(name)) || []))
  return new Set(names.map(identity).filter(Boolean))
}

function artistsMatch(expected: string, actual: string): boolean {
  const left = artistVariants(expected)
  const right = artistVariants(actual)
  for (const a of left) {
    for (const b of right) {
      if (a === b) return true
    }
  }
  return false
}

function artistSearchAlias(value: string): string {
  const parts = artistParts(value)
  const group = parts.map((name) => ARTIST_ALIAS_INDEX.get(identity(name))).find(Boolean)
  if (!group) return ""
  const raw = clean(value)
  const preferred = /[\u3400-\u9fff]/.test(raw)
    ? group.find((name) => /[A-Za-z]/.test(name) && identity(name) !== identity(raw))
    : group.find((name) => /[\u3400-\u9fff]/.test(name))
  return preferred || ""
}

export function candidateScore(title: string, artist: string, candidate: MusicCandidate): number {
  const titleScore = titleSimilarity(title, candidate.title)
  const artistProvided = normalize(artist).length > 0
  const artistMatch = artistsMatch(artist, candidate.artist)
  if (titleScore < 0.72 || (artistProvided && !artistMatch)) return 0
  return artistProvided ? titleScore * 0.45 + (artistMatch ? 0.55 : 0) : titleScore
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
  const searchTitle = stripTitleDecorations(title) || title
  const sources: Array<(title: string, artist: string) => Promise<MusicCandidate[]>> = [
    searchQQ,
    searchKugou,
    searchNetEase,
    searchKuwo,
  ]
  const result: MusicCandidate[] = []
  const alias = artistSearchAlias(artist)
  for (const search of sources) {
    let ranked = rankCandidates(title, artist, await search(searchTitle, artist))
    if (!ranked.length && alias) {
      ranked = rankCandidates(title, artist, await search(searchTitle, alias))
    }
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
