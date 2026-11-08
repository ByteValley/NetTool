// 主入口 —— 获取当前歌曲、拉取歌词、驱动实时活动、定时更新并缓存小组件快照
import {
  Script,
  Navigation,
  useState,
  useEffect,
  AppEvents,
  LiveActivity,
  LiveActivityState,
} from "scripting"
import { LyricsTabs } from "./pages/LyricsTabs"
import { LyricsLiveActivity } from "./live_activity"
import type { LyricData, LyricActivityState, LyricSnapshot } from "./types"
import { findCurrentIndex } from "./utils/lrc"
import { fetchLyrics } from "./api/lyrics"
// 歌词时间偏移——延迟/提早调整统一入口
import {
  applyOffset,
  getOffset,
  adjustOffset,
  OFFSET_STEP,
  formatOffset,
} from "./utils/offset"
import { fetchArtworkPath as resolveArtworkPath } from "./api/artwork"
import {
  authorizeSpotify,
  controlSpotify,
  disconnectSpotify,
  getSpotifyPlayback,
  isSpotifyConnected,
  type SpotifyControl,
  type SpotifyPlayback,
} from "./api/spotify"
import { getCacheStats, clearCache } from "./utils/cache"
import {
  startLocationKeepAlive,
  stopLocationKeepAlive,
  isLocationKeepAliveActive,
} from "./utils/locationKeepAlive"

const SNAPSHOT_KEY = "lyric_nowplaying"
// 500ms 太密容易被系统限流；歌词切行只需约 1 秒级检查
const TICK_MS = 800
// 设置项持久化键
const SETTING_OPEN_MUSIC = "setting_open_music"
// 后台定位保活（耗电更高，需「始终」定位权限）
const SETTING_LOCATION_KEEPALIVE = "setting_location_keepalive"
// 自适应保活：播放时启定位，暂停时停定位（实时活动保持显示）
const SETTING_ADAPTIVE_KEEPALIVE = "setting_adaptive_keepalive"
// 仅控制应用内歌词页是否应用已设置的时间偏移
const SETTING_LYRICS_PAGE_OFFSET = "setting_lyrics_page_offset"
// 进入后台或非活跃状态后的自动关闭时长（分钟，0 表示关闭）
const SETTING_AUTO_CLOSE_INACTIVE = "setting_auto_close_inactive"
const SETTING_SPOTIFY_ENABLED = "setting_spotify_enabled"
const SETTING_SPOTIFY_CLIENT_ID = "setting_spotify_client_id"
const DEFAULT_SPOTIFY_CLIENT_ID = "2c098c9020944ea480f992c3b09b8d9b"
const PREVIOUS_DEFAULT_SPOTIFY_CLIENT_ID = "16068a50fdd8468bb59c50aa7fbdf022"

function getSpotifyClientId(): string {
  const saved = Storage.get<string>(SETTING_SPOTIFY_CLIENT_ID)
  if (saved === PREVIOUS_DEFAULT_SPOTIFY_CLIENT_ID) {
    Storage.set(SETTING_SPOTIFY_CLIENT_ID, DEFAULT_SPOTIFY_CLIENT_ID)
    return DEFAULT_SPOTIFY_CLIENT_ID
  }
  return saved || DEFAULT_SPOTIFY_CLIENT_ID
}
const MUSIC_SCHEME = "music://"
const SPOTIFY_SCHEME = "spotify://"

/** 页面展示状态 */
type DispState = {
  title: string
  artist: string
  // 首页展示上三/上一/当前/下一/下三共七行
  prev3Text: string
  prev2Text: string
  prevText: string
  currentText: string
  nextText: string
  next2Text: string
  next3Text: string
  progress: number
  isPlaying: boolean
  hasLyric: boolean
  started: boolean
  status: string
}

// 模块级运行时上下文：保存跨渲染需要复用的可变状态
const ctx: {
  activity: any
  lyric: LyricData | null
  // 当前封面 JPEG 缓存路径（App Group）
  artworkPath: string
  songKey: string
  started: boolean
  starting: boolean
  timerId: number | null
  autoCloseTimerId: number | null
  // 首次看到「非活跃且暂停」的时间：条件不成立或重计时时清 0
  autoCloseStartAt: number
  // 上次推送到实时活动的状态键，仅在变化时才推送，避免系统限流
  lastPushKey: string
  // 节流：后台 keepAlive 续约间隔
  lastKeepAliveAt: number
  // 本脚本是否已持有 keepAlive 请求（避免重复入队）
  keepAliveHeld: boolean
  // 当前是否处于系统后台/非活跃
  isBackground: boolean
  // 实时活动 contentState 单调序号，强制系统识别状态变化
  seq: number
  // 串行 update 链，避免后台并发 update 乱序/被合并
  updateChain: Promise<void>
  // 上次播放状态，用于检测播放/暂停切换以启停定位保活
  lastPlayingState: boolean
  // 每次创建实时活动递增，防止旧更新或旧回调影响新实例
  activityGeneration: number
  spotifyPlayback: SpotifyPlayback | null
  spotifyPollAt: number
  spotifyPollInFlight: boolean
  spotifyError: string
} = {
  activity: null,
  lyric: null,
  artworkPath: "",
  songKey: "",
  started: false,
  starting: false,
  timerId: null,
  autoCloseTimerId: null,
  autoCloseStartAt: 0,
  lastPushKey: "",
  lastKeepAliveAt: 0,
  keepAliveHeld: false,
  isBackground: false,
  seq: 0,
  updateChain: Promise.resolve(),
  lastPlayingState: false,
  activityGeneration: 0,
  spotifyPlayback: null,
  spotifyPollAt: 0,
  spotifyPollInFlight: false,
  spotifyError: "",
}

/** 按文档：后台事件后申请 keepAlive，前台时释放；同一脚本只持有一次请求 */
async function ensureKeepAlive(): Promise<boolean> {
  if (ctx.keepAliveHeld) {
    // 已持有时再确认系统是否仍 active
    try {
      if (await BackgroundKeeper.isActive) return true
    } catch {
      // 忽略
    }
    ctx.keepAliveHeld = false
  }
  try {
    const ok = await BackgroundKeeper.keepAlive()
    ctx.keepAliveHeld = !!ok
    return !!ok
  } catch {
    ctx.keepAliveHeld = false
    return false
  }
}

async function releaseKeepAlive(): Promise<void> {
  if (!ctx.keepAliveHeld) return
  ctx.keepAliveHeld = false
  try {
    await BackgroundKeeper.stopKeepAlive()
  } catch {
    // 忽略
  }
}

/** 根据歌词数据与当前时间，计算行索引与首页七行歌词文本 */
function computeLines(
  data: LyricData | null,
  currentTime: number,
): {
  index: number
  prev3: string
  prev2: string
  prev: string
  current: string
  next: string
  next2: string
  next3: string
} {
  if (!data || data.lines.length === 0) {
    return { index: -1, prev3: "", prev2: "", prev: "", current: "无可用歌词", next: "", next2: "", next3: "" }
  }
  if (!data.synced) {
    return {
      index: 0,
      prev3: "",
      prev2: "",
      prev: "",
      current: data.lines[0]?.text ?? "",
      next: "",
      next2: "",
      next3: "",
    }
  }
  const index = findCurrentIndex(data.lines, currentTime)
  return {
    index,
    prev3: data.lines[index - 3]?.text ?? "",
    prev2: data.lines[index - 2]?.text ?? "",
    prev: data.lines[index - 1]?.text ?? "",
    current: data.lines[index]?.text ?? "",
    next: data.lines[index + 1]?.text ?? "",
    next2: data.lines[index + 2]?.text ?? "",
    next3: data.lines[index + 3]?.text ?? "",
  }
}

/** 组装实时活动状态：只携带可见三行，并带 seq 强制变更身份 */
function buildActivityState(params: {
  title: string
  artist: string
  prev: string
  current: string
  next: string
  index: number
  progress: number
  isPlaying: boolean
  hasLyric: boolean
}): LyricActivityState {
  ctx.seq += 1
  return {
    title: params.title,
    artist: params.artist,
    prevText: params.prev,
    currentText: params.current,
    nextText: params.next,
    currentIndex: params.index,
    progress: params.progress,
    isPlaying: params.isPlaying,
    hasLyric: params.hasLyric,
    seq: ctx.seq,
    updatedAt: Date.now() / 1000,
  }
}

/** 当前是否正在播放 */
function isNowPlaying(): boolean {
  if (Storage.get<boolean>(SETTING_SPOTIFY_ENABLED) ?? false) {
    return !!ctx.spotifyPlayback?.is_playing
  }
  return SystemMusicPlayer.getPlaybackState() === "playing"
}

/** Normalize Spotify metadata to the shape used by the existing lyrics pipeline. */
function getSpotifyNowPlayingItem(): any | null {
  const item = ctx.spotifyPlayback?.item
  if (!item) return null
  return {
    title: item.name,
    artist: item.artists.map((artist) => artist.name).join(", "),
    albumTitle: item.album?.name,
    artworkUrl: item.album?.images?.[0]?.url,
    playbackDuration: Number(item.duration_ms || 0) / 1000,
    persistentID: item.id,
  }
}

function getCurrentPlayerItem(): any | null {
  return (Storage.get<boolean>(SETTING_SPOTIFY_ENABLED) ?? false)
    ? getSpotifyNowPlayingItem()
    : SystemMusicPlayer.getNowPlayingItem()
}

function getCurrentPlaybackTime(): number {
  if (!(Storage.get<boolean>(SETTING_SPOTIFY_ENABLED) ?? false)) {
    return SystemMusicPlayer.getCurrentPlaybackTime()
  }
  const playback = ctx.spotifyPlayback
  if (!playback) return 0
  const elapsed = playback.is_playing
    ? Math.min(Math.max(0, Date.now() - playback.sampledAt) / 1000, 15)
    : 0
  const duration = Number(playback.item?.duration_ms || 0) / 1000
  const time = playback.progress_ms / 1000 + elapsed
  return duration > 0 ? Math.min(time, duration) : time
}

/** 仅清除定时器（同步） */
function clearTimer() {
  if (ctx.timerId != null) {
    clearTimeout(ctx.timerId)
    ctx.timerId = null
  }
}

function clearAutoCloseTimer() {
  if (ctx.autoCloseTimerId != null) {
    clearTimeout(ctx.autoCloseTimerId)
    ctx.autoCloseTimerId = null
  }
}

/** 非活跃时的自动关闭：当切到后台、暂停、调整时长时同步计时的入口，由 Page 渲染时注入 */
let inactiveAutoCloseDidChange: (() => void) | null = null

/** 停止定时器与后台保活 */
async function stopTimer() {
  clearTimer()
  await releaseKeepAlive()
}

/** 组装用于 end 的最终 contentState */
function buildEndedState(): LyricActivityState {
  ctx.seq += 1
  return {
    title: "",
    artist: "",
    prevText: "",
    currentText: "",
    nextText: "",
    currentIndex: -1,
    progress: 0,
    isPlaying: false,
    hasLyric: false,
    seq: ctx.seq,
    updatedAt: Date.now() / 1000,
  }
}

/** 仅清理本项目残留的实时歌词活动，不影响 Scripting 中其他脚本的活动 */
async function endExistingLyricsActivities() {
  try {
    const activities = await LiveActivity.getAllActivities()
    await Promise.all(activities.map(async ({ id }) => {
      try {
        const activity = await LiveActivity.from<LyricActivityState>(id, "LyricsLiveActivity")
        if (activity) {
          await activity.end(buildEndedState(), { dismissTimeInterval: 0 })
        }
      } catch {
        // 不是本项目注册名或实例已结束，忽略
      }
    }))
  } catch {
    // 查询失败时忽略，由调用方决定是否继续
  }
}

/** 结束实时活动并释放全部资源（关闭脚本时必须同步结束锁屏活动） */
async function cleanup() {
  // 先停 ticker，再清空引用，避免后续 update 与 end 竞态
  await stopTimer()
  clearAutoCloseTimer()
  // 停止定位保活，避免脚本结束后仍占用定位
  stopLocationKeepAlive()
  ctx.started = false
  ctx.starting = false
  ctx.activityGeneration += 1
  ctx.lastPushKey = ""
  const activity = ctx.activity
  ctx.activity = null

  // 等串行 update 链排空，再 end，减少系统丢弃 end 的概率
  try {
    await ctx.updateChain
  } catch {
    // 忽略链上旧错误
  }
  ctx.updateChain = Promise.resolve()

  if (activity) {
    try {
      await activity.end(buildEndedState(), { dismissTimeInterval: 0 })
    } catch {
      // 忽略单实例 end 失败
    }
  }

  // 兜底清掉本项目残留实例（重启后 ctx 丢失时也有效）。
  await endExistingLyricsActivities()
}

/** 写入供小组件读取的快照 */
function writeSnapshot(snap: LyricSnapshot) {
  Storage.set(SNAPSHOT_KEY, snap)
}

/** 获取封面并写入 JPEG 缓存：优先缓存 → 网易云 → api.lrc.cx */
async function fetchArtworkPath(title: string, artist: string, preferredCoverUrl?: string): Promise<void> {
  try {
    const path = await resolveArtworkPath(title, artist, preferredCoverUrl)
    if (path) ctx.artworkPath = path
  } catch {
    // 封面获取失败，忽略
  }
}

function Page() {
  const dismiss = Navigation.useDismiss()
  const [openMusic, setOpenMusic] = useState<boolean>(Storage.get<boolean>(SETTING_OPEN_MUSIC) ?? true)
  // 默认关闭；开启后用连续定位尽量维持后台刷新
  const [locationKeepAlive, setLocationKeepAlive] = useState<boolean>(
    Storage.get<boolean>(SETTING_LOCATION_KEEPALIVE) ?? false,
  )
  // 自适应保活：默认开启，暂停时自动停定位，恢复播放再启，节省电量
  const [adaptiveKeepAlive, setAdaptiveKeepAlive] = useState<boolean>(
    Storage.get<boolean>(SETTING_ADAPTIVE_KEEPALIVE) ?? true,
  )
  const [autoCloseInactiveMinutes, setAutoCloseInactiveMinutes] = useState<number>(
    Storage.get<number>(SETTING_AUTO_CLOSE_INACTIVE) ?? 0,
  )
  const [spotifyClientId, setSpotifyClientId] = useState<string>(
    getSpotifyClientId(),
  )
  const [spotifyConnected, setSpotifyConnected] = useState<boolean>(() => isSpotifyConnected())
  const [spotifyEnabled, setSpotifyEnabled] = useState<boolean>(
    Storage.get<boolean>(SETTING_SPOTIFY_ENABLED) ?? false,
  )
  const [spotifyStatus, setSpotifyStatus] = useState<string>("")
  const [disp, setDisp] = useState<DispState>({
    title: "",
    artist: "",
    prev3Text: "",
    prev2Text: "",
    prevText: "",
    currentText: "点击「开始」显示实时歌词",
    nextText: "",
    next2Text: "",
    next3Text: "",
    progress: 0,
    isPlaying: false,
    hasLyric: false,
    started: false,
    status: "",
  })
  const [cache, setCache] = useState({ lyrics: 0, artworks: 0, updatedAt: 0 })
  // 歌词时间偏移（秒，正=延迟 / 负=提早），页面初始读一次存储
  const [offset, setOffsetState] = useState<number>(() => getOffset())
  // 该开关仅影响应用内歌词页，实时活动与小组件始终应用偏移
  const [lyricsPageOffsetEnabled, setLyricsPageOffsetEnabled] = useState<boolean>(
    Storage.get<boolean>(SETTING_LYRICS_PAGE_OFFSET) ?? true,
  )

  // 调整后同步存储与页面，并立即刷一次歌词定位，让运行中可实时看到效果
  function changeOffset(delta: number) {
    const next = adjustOffset(delta)
    setOffsetState(next)
    try {
      pushUpdate()
    } catch {
      // 忽略单次刷新失败
    }
  }

  function scheduleAutoClose(minutes: number) {
    clearAutoCloseTimer()
    // 联合条件：非活跃（后台/最小化）且歌曲暂停；
    // 前台运行、播放中或未设置时长都不计时
    if (minutes <= 0 || !ctx.isBackground || isNowPlaying()) {
      ctx.autoCloseStartAt = 0
      return
    }
    if (ctx.autoCloseStartAt === 0) ctx.autoCloseStartAt = Date.now()
    const ms = minutes * 60 * 1000
    // 精确到截止时刻：重复调用不会重新计时，也不会覆盖首次起点
    const deadline = ctx.autoCloseStartAt + ms
    if (deadline <= Date.now()) {
      ctx.autoCloseStartAt = 0
      closeScript()
      return
    }
    ctx.autoCloseTimerId = setTimeout(() => {
      ctx.autoCloseTimerId = null
      ctx.autoCloseStartAt = 0
      closeScript()
    }, deadline - Date.now()) as unknown as number
  }

  // 进入页面时读取缓存统计，并判断是否由小组件/意图自动唤起启动。
  useEffect(() => {
    setCache(getCacheStats())
    if (Script.queryParameters?.autoStart === true || Script.queryParameters?.autoStart === "true") {
      if (!ctx.started && !ctx.starting) start()
    }

    // 按 BackgroundKeeper 文档——进入后台后 keepAlive，回前台 stopKeepAlive。
    // runInBackground 只是线程切换，不能防止 App 被挂起。
    const onPhase = (phase: string) => {
      if (phase === "background" || phase === "inactive") {
        ctx.isBackground = true
        scheduleAutoClose(Storage.get<number>(SETTING_AUTO_CLOSE_INACTIVE) ?? 0)
        if (ctx.started) {
          void ensureKeepAlive().then((ok) => {
            const loc = isLocationKeepAliveActive()
            setDisp((d) => ({
              ...d,
              status: loc
                ? "后台：定位保活 + keepAlive（仍可能被系统限流）"
                : ok
                  ? "后台保活中（系统仍可能限时挂起）"
                  : "后台保活失败，歌词可能停止更新",
            }))
          })
        }
      } else if (phase === "active") {
        ctx.isBackground = false
        clearAutoCloseTimer()
        ctx.autoCloseStartAt = 0
        // 前台定时器可正常运行，释放 keepAlive 请求
        void releaseKeepAlive()
        if (ctx.started) {
          if (Storage.get<boolean>(SETTING_SPOTIFY_ENABLED) ?? false) {
            void refreshSpotifyPlayback(true)
          }
          try {
            pushUpdate()
          } catch {
            // 忽略
          }
          if (ctx.timerId == null) startTicker()
          setDisp((d) => ({ ...d, status: "前台运行中" }))
        }
      }
    }
    const onPlaybackStateChanged = () => {
      // 播放/暂停会改变自动关闭条件，先同步计时
      scheduleAutoClose(Storage.get<number>(SETTING_AUTO_CLOSE_INACTIVE) ?? 0)
      if (!ctx.started) return
      try {
        pushUpdate()
      } catch {
        // 忽略单次播放状态事件失败，ticker 仍会兜底
      }
    }
    // 注册给 run() 的最小化/恢复事件：重算自动关闭计时
    const syncAutoCloseFromSetting = () => {
      scheduleAutoClose(Storage.get<number>(SETTING_AUTO_CLOSE_INACTIVE) ?? 0)
    }
    inactiveAutoCloseDidChange = syncAutoCloseFromSetting
    AppEvents.scenePhase.addListener(onPhase)
    SystemMusicPlayer.addEventListener("playbackStateDidChange", onPlaybackStateChanged)
    return () => {
      if (inactiveAutoCloseDidChange === syncAutoCloseFromSetting) {
        inactiveAutoCloseDidChange = null
      }
      AppEvents.scenePhase.removeListener(onPhase)
      SystemMusicPlayer.removeEventListener("playbackStateDidChange", onPlaybackStateChanged)
    }
  }, [])

  // 每次启动都创建新的实例：同一 LiveActivity 实例只能调用一次 start。
  function createActivity() {
    const ins = LyricsLiveActivity()
    ins.addUpdateListener((s: LiveActivityState) => {
      // 旧实例的迟到回调不得清掉恢复播放后创建的新实例。
      if (ctx.activity !== ins) return
      if (s === "dismissed" || s === "ended") {
        // 用户关闭当前实时活动时，才停止整个歌词会话。
        void stopTimer()
        stopLocationKeepAlive()
        ctx.started = false
        ctx.starting = false
        ctx.activity = null
        ctx.lastPushKey = ""
        setDisp((d) => ({
          ...d,
          started: false,
          status: "实时活动已关闭",
        }))
      } else if (s === "stale") {
        setDisp((d) => ({
          ...d,
          status: "实时活动已过期，系统期望更新",
        }))
      }
    })
    return ins
  }

  /** 串行推送到指定实例，防止旧更新落入恢复播放后创建的新活动 */
  function pushActivityUpdate(contentState: LyricActivityState, pushKey: string) {
    const activity = ctx.activity
    const generation = ctx.activityGeneration
    if (!activity) return
    ctx.updateChain = ctx.updateChain.then(async () => {
      if (ctx.activity !== activity || ctx.activityGeneration !== generation) return
      try {
        // staleDate + relevance 提高系统刷新优先级
        const ok = await activity.update(contentState, {
          staleDate: Date.now() + 15 * 60 * 1000,
          relevanceScore: 100,
        })
        if (ctx.activity !== activity || ctx.activityGeneration !== generation) return
        if (ok === false) {
          // 失败时清空，下一 tick 允许重试
          ctx.lastPushKey = ""
        } else {
          ctx.lastPushKey = pushKey
        }
      } catch {
        if (ctx.activity === activity && ctx.activityGeneration === generation) {
          ctx.lastPushKey = ""
        }
      }
    }).catch(() => {
      // 单次失败不中断后续串行链
    })
  }

  /** 重新为一个新歌曲加载歌词与封面（防重入：基于 songKey 比较） */
  async function reloadLyrics(
    title: string,
    artist: string,
    albumTitle: string | undefined,
    duration: number,
    persistentID?: string,
    artworkUrl?: string,
  ): Promise<void> {
    const key = `${artist}::${title}`
    if (key === ctx.songKey && ctx.lyric) return
    ctx.songKey = key
    ctx.artworkPath = ""
    setDisp((d) => ({ ...d, status: "获取歌词中…" }))

    // 异步下载并压缩封面到文件，不阻塞歌词加载
    if (title) void fetchArtworkPath(title, artist, artworkUrl)

    try {
      const data = await fetchLyrics({ title, artist, albumTitle, duration })
      ctx.lyric = data
    } catch {
      ctx.lyric = null
    }
    refreshCache()
  }

  /** Poll Spotify playback at a modest interval; the UI ticker interpolates progress locally. */
  async function refreshSpotifyPlayback(force = false): Promise<void> {
    if (!(Storage.get<boolean>(SETTING_SPOTIFY_ENABLED) ?? false) || ctx.spotifyPollInFlight) return
    const now = Date.now()
    if (!force && (now < ctx.spotifyPollAt || now - ctx.spotifyPollAt < 5000)) return
    ctx.spotifyPollAt = now
    ctx.spotifyPollInFlight = true
    try {
      const clientId = getSpotifyClientId()
      const playback = await getSpotifyPlayback(clientId)
      ctx.spotifyPlayback = playback
      if (playback?.item) {
        const item = getSpotifyNowPlayingItem()
        await reloadLyrics(
          item.title,
          item.artist || "未知歌手",
          item.albumTitle,
          item.playbackDuration,
          item.persistentID,
          item.artworkUrl,
        )
      } else {
        ctx.lyric = null
        ctx.songKey = ""
        ctx.artworkPath = ""
      }
      ctx.spotifyError = ""
      setSpotifyStatus("")
      if (ctx.started) pushUpdate()
    } catch (error: any) {
      const message = String(error?.message ?? error)
      ctx.spotifyError = message
      const retryAfter = message.match(/请\s+(\d+)\s+秒后重试/)
      if (retryAfter) {
        ctx.spotifyPollAt = Date.now() + Math.max(5000, Number(retryAfter[1]) * 1000)
      }
      if (/请先在设置中连接 Spotify|授权已过期|Client ID 已更改/.test(message)) {
        setSpotifyConnected(false)
        setSpotifyEnabled(false)
        Storage.set(SETTING_SPOTIFY_ENABLED, false)
        ctx.spotifyPlayback = null
      }
      setSpotifyStatus(message)
      if (ctx.started) {
        setDisp((d) => ({ ...d, status: `Spotify：${message}` }))
      }
    } finally {
      ctx.spotifyPollInFlight = false
    }
  }

  /** 推送一次更新：更新实时活动状态 + 写快照 + 刷新页面预览 */
  function pushUpdate() {
    const spotifySource = Storage.get<boolean>(SETTING_SPOTIFY_ENABLED) ?? false
    if (spotifySource) void refreshSpotifyPlayback()
    const currentTime = getCurrentPlaybackTime()
    const item = getCurrentPlayerItem()
    const playing = isNowPlaying()

    // 播放/暂停切换时启停定位保活；实时活动始终保留显示。
    const stateChanged = playing !== ctx.lastPlayingState
    ctx.lastPlayingState = playing
    const adaptiveOn = Storage.get<boolean>(SETTING_ADAPTIVE_KEEPALIVE) ?? true
    if (adaptiveOn && stateChanged) {
      const locEnabled = Storage.get<boolean>(SETTING_LOCATION_KEEPALIVE) ?? false
      const locActive = isLocationKeepAliveActive()
      if (playing && locEnabled && !locActive) {
        void startLocationKeepAlive(() => {
          try {
            pushUpdate()
          } catch {
            // 忽略单次 tick 失败
          }
        }).then((r) => {
          setDisp((d) => ({
            ...d,
            status: item ? `实时活动中 · ${r.message}` : r.message,
          }))
        })
      } else if (!playing && locActive) {
        stopLocationKeepAlive()
        setDisp((d) => ({ ...d, status: "已暂停，实时活动保留，定位保活已停止" }))
      }
    }

    // 歌曲切换检测
    if (item) {
      const newKey = `${item.artist ?? "未知歌手"}::${item.title}`
      if (newKey !== ctx.songKey) {
        // 异步重新加载歌词，本轮先用旧歌词占位
        reloadLyrics(
          item.title,
          item.artist ?? "未知歌手",
          item.albumTitle,
          item.playbackDuration,
          item.persistentID,
          item.artworkUrl,
        )
      }
    }

    const data = ctx.lyric
    // 实时活动与小组件始终应用偏移；歌词页由独立开关决定是否应用
    const activityLines = computeLines(data, applyOffset(currentTime))
    const pageOffsetEnabled = Storage.get<boolean>(SETTING_LYRICS_PAGE_OFFSET) ?? true
    const pageLines = computeLines(data, pageOffsetEnabled ? applyOffset(currentTime) : currentTime)
    const { index, prev, current, next } = activityLines
    const duration = item?.playbackDuration ?? 0
    const progress = duration > 0 ? Math.min(currentTime / duration, 1) : 0
    const title = item?.title ?? ""
    const artist = item?.artist ?? ""
    const hasLyric = !!(data && data.lines.length > 0)

    // 实时活动：仅推送可见三行 + 行索引，避免整本歌词造成更新被系统静默丢弃
    const contentState = buildActivityState({
      title,
      artist,
      prev,
      current,
      next,
      index,
      progress,
      isPlaying: playing,
      hasLyric,
    })
    if (ctx.activity) {
      // 只按行/歌词变化推送，不把 progress 算进 key，避免刷爆预算
      const pushKey = `${title}|${artist}|${index}|${playing}|${current}`
      if (pushKey !== ctx.lastPushKey) {
        // 先占位防重复入队；失败时 pushActivityUpdate 会清空 lastPushKey
        ctx.lastPushKey = pushKey
        pushActivityUpdate(contentState, pushKey)
      }
    }

    // 小组件快照：只存封面路径，不再带大 Base64
    writeSnapshot({
      title, artist,
      source: spotifySource ? "spotify" : "apple_music",
      persistentID: item?.persistentID,
      artworkPath: ctx.artworkPath || undefined,
      currentText: current, nextText: next,
      progress, isPlaying: playing, hasLyric, updatedAt: Date.now() / 1000,
    })

    // 后台不刷新页面预览，把资源留给 activity.update（锁屏刷新）
    if (!ctx.isBackground) {
      setDisp((d) => ({
        ...d,
        title,
        artist,
        prev3Text: pageLines.prev3,
        prev2Text: pageLines.prev2,
        prevText: pageLines.prev,
        currentText: pageLines.current,
        nextText: pageLines.next,
        next2Text: pageLines.next2,
        next3Text: pageLines.next3,
        progress,
        isPlaying: playing,
        hasLyric,
      }))
    }
  }

  /** 启动定时更新循环；后台依赖 BackgroundKeeper，不在此重复 keepAlive 入队 */
  function startTicker() {
    clearTimer()
    const tick = () => {
      try {
        pushUpdate()
      } catch {
        // 单次 tick 失败不中断循环
      }
      // 后台时若 keepAlive 被系统清掉，每约 8 秒尝试续约一次（避免每 tick 入队）
      if (ctx.started && ctx.isBackground) {
        const now = Date.now()
        if (now - ctx.lastKeepAliveAt > 8000 || !ctx.keepAliveHeld) {
          ctx.lastKeepAliveAt = now
          void ensureKeepAlive()
        }
      }
      ctx.timerId = setTimeout(tick, TICK_MS) as unknown as number
    }
    ctx.timerId = setTimeout(tick, TICK_MS) as unknown as number
  }

  // 每次刷新歌词后更新缓存统计。
  function refreshCache() {
    setCache(getCacheStats())
  }

  // 设置项变更时持久化
  function setAutoCloseInactive(minutes: number) {
    const value = Math.max(0, Math.round(minutes))
    setAutoCloseInactiveMinutes(value)
    Storage.set(SETTING_AUTO_CLOSE_INACTIVE, value)
    // 调整时长后从当前时刻重新计时，避免沿用旧的起始点
    ctx.autoCloseStartAt = 0
    scheduleAutoClose(value)
  }

  function toggleOpenMusic(v: boolean) {
    setOpenMusic(v)
    Storage.set(SETTING_OPEN_MUSIC, v)
  }

  function saveSpotifyClientId(value: string) {
    setSpotifyClientId(value)
    Storage.set(SETTING_SPOTIFY_CLIENT_ID, value.trim())
  }

  function toggleSpotifyEnabled(value: boolean) {
    if (value && !spotifyConnected) {
      setSpotifyStatus("请先填写 Client ID 并连接 Spotify")
      return
    }
    setSpotifyEnabled(value)
    Storage.set(SETTING_SPOTIFY_ENABLED, value)
    ctx.spotifyPlayback = null
    ctx.spotifyPollAt = 0
    ctx.spotifyError = ""
    ctx.songKey = ""
    ctx.lyric = null
    setSpotifyStatus(value ? "已切换到 Spotify 播放来源" : "已切换到 Apple Music 播放来源")
    if (ctx.started) {
      pushUpdate()
      if (value) void refreshSpotifyPlayback(true)
    }
  }

  function connectSpotify() {
    setSpotifyStatus("正在打开 Spotify 授权页面…")
    void authorizeSpotify(spotifyClientId)
      .then(() => {
        setSpotifyConnected(true)
        setSpotifyStatus("Spotify 已连接")
        if (spotifyEnabled) void refreshSpotifyPlayback(true)
      })
      .catch((error: any) => {
        setSpotifyStatus(String(error?.message ?? error))
      })
  }

  function disconnectSpotifyAccount() {
    disconnectSpotify()
    setSpotifyConnected(false)
    setSpotifyEnabled(false)
    Storage.set(SETTING_SPOTIFY_ENABLED, false)
    ctx.spotifyPlayback = null
    ctx.spotifyPollAt = 0
    ctx.spotifyError = ""
    ctx.songKey = ""
    ctx.lyric = null
    setSpotifyStatus("Spotify 已断开")
    if (ctx.started) pushUpdate()
  }

  function controlCurrentPlayer(action: SpotifyControl) {
    const perform = async () => {
      if (Storage.get<boolean>(SETTING_SPOTIFY_ENABLED) ?? false) {
        await controlSpotify(
          getSpotifyClientId(),
          action,
        )
        await new Promise<void>((resolve) => setTimeout(() => resolve(), 700))
        await refreshSpotifyPlayback(true)
      } else if (action === "play") {
        await SystemMusicPlayer.play()
      } else if (action === "pause") {
        await SystemMusicPlayer.pause()
      } else if (action === "next") {
        await SystemMusicPlayer.skipToNextItem()
      } else {
        await SystemMusicPlayer.skipToPreviousItem()
      }
      pushUpdate()
    }
    void perform().catch((error: any) => {
      setDisp((d) => ({ ...d, status: `播放控制失败：${error?.message ?? error}` }))
    })
  }

  function toggleLyricsPageOffset(v: boolean) {
    setLyricsPageOffsetEnabled(v)
    Storage.set(SETTING_LYRICS_PAGE_OFFSET, v)
    try {
      pushUpdate()
    } catch {
      // 忽略单次刷新失败
    }
  }

  function toggleLocationKeepAlive(v: boolean) {
    setLocationKeepAlive(v)
    Storage.set(SETTING_LOCATION_KEEPALIVE, v)
    // 运行中切换则立刻启停，避免必须重开实时活动
    if (!ctx.started) return
    if (v) {
      // 自适应开启且当前暂停：先不启动定位，实时活动继续保留。
      const adaptiveOn = Storage.get<boolean>(SETTING_ADAPTIVE_KEEPALIVE) ?? true
      if (adaptiveOn && !isNowPlaying()) {
        setDisp((d) => ({ ...d, status: "已暂停，实时活动保留；定位将在恢复播放时启动" }))
        return
      }
      void startLocationKeepAlive(() => {
        try {
          pushUpdate()
        } catch {
          // 忽略
        }
      }).then((r) => {
        setDisp((d) => ({ ...d, status: r.message }))
      })
    } else {
      stopLocationKeepAlive()
      setDisp((d) => ({ ...d, status: "已关闭定位保活" }))
    }
  }

  // 自适应开关：开启时暂停自动停定位；实时活动始终保持显示
  function toggleAdaptiveKeepAlive(v: boolean) {
    setAdaptiveKeepAlive(v)
    Storage.set(SETTING_ADAPTIVE_KEEPALIVE, v)
    if (!ctx.started) return
    const locEnabled = Storage.get<boolean>(SETTING_LOCATION_KEEPALIVE) ?? false
    if (!locEnabled) return
    const locActive = isLocationKeepAliveActive()
    if (v) {
      if (!isNowPlaying() && locActive) {
        stopLocationKeepAlive()
        setDisp((d) => ({ ...d, status: "已开启自适应保活，实时活动保留，暂停中已停定位" }))
      } else {
        setDisp((d) => ({ ...d, status: "已开启自适应保活" }))
      }
    } else {
      // 关闭自适应后定位恢复常驻；暂停期间不主动重建已隐藏的活动。
      if (!locActive) {
        void startLocationKeepAlive(() => {
          try {
            pushUpdate()
          } catch {
            // 忽略
          }
        }).then((r) => {
          setDisp((d) => ({ ...d, status: `已关闭自适应保活 · ${r.message}` }))
        })
      } else {
        setDisp((d) => ({ ...d, status: "已关闭自适应保活" }))
      }
    }
  }

  async function startImpl() {
    // 先结束本项目残留实例，再创建新的唯一活动。
    setDisp((d) => ({ ...d, status: "正在清理旧实时活动…" }))
    await endExistingLyricsActivities()
    const activity = createActivity()
    setDisp((d) => ({ ...d, status: "正在启动实时活动…" }))

    if (Storage.get<boolean>(SETTING_SPOTIFY_ENABLED) ?? false) {
      if (!isSpotifyConnected()) throw new Error("请先在设置中连接 Spotify")
      await refreshSpotifyPlayback(true)
      if (ctx.spotifyError) {
        throw new Error(ctx.spotifyError)
      }
    }
    const item = getCurrentPlayerItem()

    if (item) {
      await reloadLyrics(
        item.title,
        item.artist ?? "未知歌手",
        item.albumTitle,
        item.playbackDuration,
        item.persistentID,
        item.artworkUrl,
      )
    } else {
      ctx.lyric = null
    }

    const currentTime = item ? getCurrentPlaybackTime() : 0
    // 启动阶段同样应用偏移，保证首帧即与后续一致
    const { index, prev, current, next } = computeLines(ctx.lyric, applyOffset(currentTime))
    const duration = item?.playbackDuration ?? 0
    const progress = duration > 0 ? Math.min(currentTime / duration, 1) : 0
    const contentState = buildActivityState({
      title: item?.title ?? "",
      artist: item?.artist ?? "",
      prev,
      current,
      next,
      index,
      progress,
      isPlaying: isNowPlaying(),
      hasLyric: !!(ctx.lyric && ctx.lyric.lines.length > 0),
    })
    ctx.lastPushKey = ""

    try {
      // 启动阶段先占住 keepAlive，切后台后计时器才有机会继续
      const kept = await ensureKeepAlive()
      if (!kept) {
        setDisp((d) => ({ ...d, status: "警告：后台保活未成功，切后台后可能停更" }))
      }
      const ok = await activity.start(contentState, {
        staleDate: Date.now() + 15 * 60 * 1000,
        relevanceScore: 100,
      })
      if (!ok) {
        await releaseKeepAlive()
        setDisp((d) => ({ ...d, status: "无法启动实时活动，请在设置中开启" }))
        return
      }
    } catch (e: any) {
      await releaseKeepAlive()
      setDisp((d) => ({ ...d, status: `启动失败：${e?.message ?? e}` }))
      return
    }

    ctx.activityGeneration += 1
    ctx.activity = activity
    ctx.started = true
    ctx.lastKeepAliveAt = 0
    ctx.lastPlayingState = isNowPlaying()
    startTicker()

    // 可选定位保活：自适应开启时仅在播放中启动，暂停不影响实时活动显示。
    let statusText = item ? "实时活动中" : "等待播放音乐…"
    if (locationKeepAlive && (!adaptiveKeepAlive || ctx.lastPlayingState)) {
      const loc = await startLocationKeepAlive(() => {
        try {
          pushUpdate()
        } catch {
          // 忽略
        }
      })
      statusText = loc.ok
        ? (item ? `实时活动中 · ${loc.message}` : `等待播放音乐… · ${loc.message}`)
        : `${statusText}；${loc.message}`
    }
    setDisp((d) => ({
      ...d,
      started: true,
      status: statusText,
    }))

    // 打开音乐前再确认保活；不自动 minimize，避免关闭后仍残留最小化实例
    await ensureKeepAlive()

    if (openMusic) {
      try {
        const spotifySource = Storage.get<boolean>(SETTING_SPOTIFY_ENABLED) ?? false
        const opened = await Safari.openURL(spotifySource ? SPOTIFY_SCHEME : MUSIC_SCHEME)
        if (!opened) {
          setDisp((d) => ({ ...d, status: `实时活动已启动，但无法打开${spotifySource ? " Spotify" : " Apple Music"}` }))
        }
      } catch (e: any) {
        const spotifySource = Storage.get<boolean>(SETTING_SPOTIFY_ENABLED) ?? false
        setDisp((d) => ({ ...d, status: `实时活动已启动，打开${spotifySource ? " Spotify" : " Apple Music"}失败：${e?.message ?? e}` }))
      }
    }
  }

  // 同步包装：Button action 要求 () => void，内部异步错误捕获后呈现到状态
  function start() {
    if (ctx.starting || ctx.started) return
    ctx.starting = true
    startImpl()
      .catch((e: any) => {
        setDisp((d) => ({ ...d, status: `启动出错：${e?.message ?? e}` }))
      })
      .finally(() => {
        ctx.starting = false
      })
  }

  async function stopImpl() {
    await cleanup()
    setDisp((d) => ({ ...d, started: false, status: "已停止" }))
  }

  // 同步包装，适配 Button action
  function stop() {
    stopImpl().catch((e: any) => {
      setDisp((d) => ({ ...d, status: `停止出错：${e?.message ?? e}` }))
    })
  }

  // 关闭 = 结束实时活动 + 真正退出脚本（从最小化列表移除）
  function closeScript() {
    void cleanup()
      .catch(() => {
        // 忽略清理错误，仍要退出
      })
      .finally(() => {
        try {
          dismiss()
        } catch {
          // 忽略
        }
        // 必须 exit，仅 dismiss 时若实例曾 minimize 可能仍挂在运行列表
        Script.exit()
      })
  }

  return (
    <LyricsTabs
      disp={disp}
      artworkPath={ctx.artworkPath}
      cache={cache}
      offsetText={formatOffset(offset)}
      lyricsPageOffsetEnabled={lyricsPageOffsetEnabled}
      openMusic={openMusic}
      locationKeepAlive={locationKeepAlive}
      adaptiveKeepAlive={adaptiveKeepAlive}
      autoCloseInactiveMinutes={autoCloseInactiveMinutes}
      spotifyClientId={spotifyClientId}
      spotifyConnected={spotifyConnected}
      spotifyEnabled={spotifyEnabled}
      spotifyStatus={spotifyStatus}
      supportsMinimization={Script.supportsMinimization()}
      onClose={closeScript}
      onStart={start}
      onStop={stop}
      onPreviousTrack={() => controlCurrentPlayer("previous")}
      onTogglePlayback={() => {
        if (isNowPlaying()) {
          controlCurrentPlayer("pause")
          return
        }
        if (!ctx.started && !ctx.starting) {
          start()
        }
        controlCurrentPlayer("play")
      }}
      onNextTrack={() => controlCurrentPlayer("next")}
      onMinimize={() => {
        void ensureKeepAlive().then(() => Script.minimize())
      }}
      onIncrementOffset={() => changeOffset(OFFSET_STEP)}
      onDecrementOffset={() => changeOffset(-OFFSET_STEP)}
      onLyricsPageOffsetChanged={toggleLyricsPageOffset}
      onOpenMusicChanged={toggleOpenMusic}
      onLocationKeepAliveChanged={toggleLocationKeepAlive}
      onAdaptiveKeepAliveChanged={toggleAdaptiveKeepAlive}
      onAutoCloseInactiveMinutesChanged={setAutoCloseInactive}
      onSpotifyClientIdChanged={saveSpotifyClientId}
      onSpotifyEnabledChanged={toggleSpotifyEnabled}
      onConnectSpotify={connectSpotify}
      onDisconnectSpotify={disconnectSpotifyAccount}
      onClearCache={async () => {
        await clearCache()
        ctx.artworkPath = ""
        refreshCache()
        const item = getCurrentPlayerItem()
        if (item) {
          void fetchArtworkPath(item.title, item.artist ?? "", item.artworkUrl)
        }
      }}
    />
  )
}

async function run() {
  // 关闭（下滑/完成按钮）直接结束脚本；最小化只通过页面按钮触发
  if (Script.supportsMinimization()) {
    Script.enableMinimize(false)
  }

  // 仅在按钮主动 minimize 后继续 keepAlive；resume 时释放
  const removeMinimize = Script.onMinimize(() => {
    ctx.isBackground = true
    inactiveAutoCloseDidChange?.()
    if (ctx.started) {
      void ensureKeepAlive()
    }
  })
  const removeResume = Script.onResume(() => {
    ctx.isBackground = false
    inactiveAutoCloseDidChange?.()
    void releaseKeepAlive()
  })

  try {
    await Navigation.present(<Page />)
  } finally {
    removeMinimize()
    removeResume()
  }
  // 下滑关闭等路径也会到这里；再清理一次并强制退出，避免残留最小化实例
  await cleanup()
  Script.exit()
}

run()
