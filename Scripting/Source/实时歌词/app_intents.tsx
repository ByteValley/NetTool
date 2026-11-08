// AppIntents —— 供小组件与实时活动按钮使用的播放控制意图
import { AppIntentManager, AppIntentProtocol, Script, Widget } from "scripting"
import { getCachedLyrics, getCachedArtworkPath } from "./utils/cache"
import { fetchLyrics } from "./api/lyrics"
import { controlSpotify, getSpotifyPlayback, type SpotifyControl } from "./api/spotify"
// 偏移量调整复用统一存取层
import { adjustOffset, resetOffset, OFFSET_STEP } from "./utils/offset"

const SCRIPT_NAME = "实时歌词"
const SNAPSHOT_KEY = "lyric_nowplaying"
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

/** 写入供小组件读取的快照 */
function writeSnapshot(snap: Record<string, unknown>) {
  Storage.set(SNAPSHOT_KEY, snap)
}

/** 写入当前播放快照，便于主脚本被唤起后快速启动 */
async function prepareSnapshot() {
  const spotifyEnabled = Storage.get<boolean>(SETTING_SPOTIFY_ENABLED) ?? false
  const spotifyClientId = getSpotifyClientId()
  const spotifyPlayback = spotifyEnabled ? await getSpotifyPlayback(spotifyClientId) : null
  const nativeItem = spotifyEnabled ? null : SystemMusicPlayer.getNowPlayingItem()
  const item = spotifyPlayback?.item
  const title = item?.name ?? nativeItem?.title
  const artist = item?.artists?.map((entry) => entry.name).join(", ") ?? nativeItem?.artist ?? "未知歌手"
  if (!title) {
    if (spotifyEnabled) {
      writeSnapshot({
        title: "",
        artist: "",
        source: "spotify",
        artworkPath: undefined,
        currentText: "",
        nextText: "",
        progress: 0,
        isPlaying: false,
        hasLyric: false,
        updatedAt: Date.now() / 1000,
      })
    }
    return
  }
  const currentTime = spotifyPlayback
    ? spotifyPlayback.progress_ms / 1000
    : SystemMusicPlayer.getCurrentPlaybackTime()
  const playbackDuration = item
    ? Number(item.duration_ms || 0) / 1000
    : nativeItem?.playbackDuration ?? 0
  const isPlaying = spotifyPlayback
    ? spotifyPlayback.is_playing
    : SystemMusicPlayer.getPlaybackState() === "playing"
  const progress = playbackDuration > 0 ? Math.min(currentTime / playbackDuration, 1) : 0

  let lyric = await getCachedLyrics(title, artist)
  if (!lyric) {
    lyric = await fetchLyrics({
      title,
      artist,
      albumTitle: item?.album?.name ?? nativeItem?.albumTitle,
      duration: playbackDuration,
    })
  }

  writeSnapshot({
    title,
    artist,
    source: spotifyEnabled ? "spotify" : "apple_music",
    persistentID: item?.id ?? nativeItem?.persistentID,
    artworkPath: getCachedArtworkPath(title, artist) ?? undefined,
    currentText: lyric?.lines[0]?.text ?? "",
    nextText: lyric?.lines[1]?.text ?? "",
    progress,
    isPlaying,
    hasLyric: !!(lyric && lyric.lines.length > 0),
    updatedAt: Date.now() / 1000,
  })
}

async function controlSelectedPlayer(action: SpotifyControl) {
  if (Storage.get<boolean>(SETTING_SPOTIFY_ENABLED) ?? false) {
    const clientId = getSpotifyClientId()
    await controlSpotify(clientId, action)
    await new Promise<void>((resolve) => setTimeout(() => resolve(), 700))
    return
  }
  if (action === "play") await SystemMusicPlayer.play()
  else if (action === "pause") await SystemMusicPlayer.pause()
  else if (action === "next") await SystemMusicPlayer.skipToNextItem()
  else await SystemMusicPlayer.skipToPreviousItem()
}

/** 唤起主脚本并请求自动启动实时歌词 */
async function resumeMainApp() {
  const runURL = Script.createRunURLScheme(SCRIPT_NAME, { autoStart: "true" })
  try {
    const opened = await Safari.openURL(runURL)
    if (opened) return
  } catch {
    // 继续尝试 Script.run
  }
  try {
    await Script.run({
      name: SCRIPT_NAME,
      queryParameters: { autoStart: true },
      singleMode: true,
    })
  } catch {
    // 忽略唤起失败
  }
}

/** 切换播放/暂停；开始播放时顺便开启实时歌词 */
export const TogglePlayIntent = AppIntentManager.register<void>({
  name: "TogglePlay",
  protocol: AppIntentProtocol.AudioPlaybackIntent,
  perform: async () => {
    const spotifyEnabled = Storage.get<boolean>(SETTING_SPOTIFY_ENABLED) ?? false
    const snapshot = Storage.get<Record<string, any>>(SNAPSHOT_KEY)
    const playing = spotifyEnabled
      ? !!snapshot?.isPlaying
      : SystemMusicPlayer.getPlaybackState() === "playing"
    if (playing) {
      await controlSelectedPlayer("pause")
    } else {
      await controlSelectedPlayer("play")
    }
    await prepareSnapshot()
    if (!playing) await resumeMainApp()
    Widget.reloadAll()
  },
})

/** 上一首 */
export const PreviousTrackIntent = AppIntentManager.register<void>({
  name: "PreviousTrack",
  protocol: AppIntentProtocol.AppIntent,
  perform: async () => {
    await controlSelectedPlayer("previous")
    await prepareSnapshot()
    Widget.reloadAll()
  },
})

/** 下一首 */
export const NextTrackIntent = AppIntentManager.register<void>({
  name: "NextTrack",
  protocol: AppIntentProtocol.AppIntent,
  perform: async () => {
    await controlSelectedPlayer("next")
    await prepareSnapshot()
    Widget.reloadAll()
  },
})

/**
 * 调整歌词时间偏移量。
 * delta 取值：-0.5 表示提早 0.5s（歌词来晚了），+0.5 表示延迟 0.5s（歌词来早了）。
 * @param params.delta 调整增量（秒），由调用方按步长传入
 */
export const AdjustOffsetIntent = AppIntentManager.register<{ delta: number }>({
  name: "AdjustOffset",
  protocol: AppIntentProtocol.AppIntent,
  perform: async (params) => {
    const delta = typeof params?.delta === "number" ? params.delta : OFFSET_STEP
    adjustOffset(delta)
    // 若主脚本在运行，唤起其重读偏移并刷新；否则仅刷新小组件
    try {
      await resumeMainApp()
    } catch {
      // 忽略唤起失败
    }
    Widget.reloadAll()
  },
})

/** 重置歌词时间偏移量为 0 */
export const ResetOffsetIntent = AppIntentManager.register<void>({
  name: "ResetOffset",
  protocol: AppIntentProtocol.AppIntent,
  perform: async () => {
    resetOffset()
    try {
      await resumeMainApp()
    } catch {
      // 忽略唤起失败
    }
    Widget.reloadAll()
  },
})
