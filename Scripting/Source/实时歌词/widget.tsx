// 桌面小组件 —— Apple Music 风格控制器（封面+歌名+歌手+图标按钮）
import { VStack, HStack, Text, Image, Button, ProgressView, Spacer, Widget } from "scripting"
import type { LyricSnapshot } from "./types"
import { TogglePlayIntent, PreviousTrackIntent, NextTrackIntent } from "./app_intents"
import { fetchArtworkPath } from "./api/artwork"

const SNAPSHOT_KEY = "lyric_nowplaying"
const MUSIC_PINK = "#fc3c44"

/** 优先读 JPEG 文件缓存，再网易云，最后回退 lrc.cx */
async function loadArtworkPath(
  title?: string,
  artist?: string,
): Promise<string | null> {
  if (!title) return null
  try {
    return await fetchArtworkPath(title, artist ?? "")
  } catch {
    return null
  }
}

/** 从文件路径加载 UIImage，失败返回 null */
function loadImageFromPath(path?: string): UIImage | null {
  if (!path) return null
  try {
    return UIImage.fromFile(path)
  } catch {
    return null
  }
}

/** 封面图视图：有图显示封面，无图显示占位图标 */
function ArtworkView({ image, size }: { image: UIImage | null; size: number }) {
  if (image) {
    return (
      <Image
        image={image}
        resizable
        scaleToFit
        frame={{ width: size, height: size }}
        clipShape={{ type: "rect", cornerRadius: 8 }}
      />
    )
  }
  return (
    <VStack
      frame={{ width: size, height: size }}
      clipShape={{ type: "rect", cornerRadius: 8 }}
      background={{ light: "#fff0f2", dark: "#2a1a1c" }}
    >
      <Image systemName="music.note" foregroundStyle={MUSIC_PINK} font={size * 0.4} />
    </VStack>
  )
}

/** Apple Music 风格播放控制：中央播放键更醒目，左右切歌键保持克制 */
function ControlButtons({
  isPlaying,
  spacing = 24,
  compact = false,
}: {
  isPlaying: boolean
  spacing?: number
  compact?: boolean
}) {
  // 小号组件使用更大尺寸的控件，便于点按
  const side = compact ? 18 : 16
  // 播放/暂停图标统一 36
  const center = 36
  return (
    <HStack spacing={spacing} frame={{ maxWidth: Infinity, alignment: "center" }}>
      <Button buttonStyle="plain" intent={PreviousTrackIntent(undefined)}>
        <Image systemName="backward.fill" font={side} foregroundStyle={MUSIC_PINK} />
      </Button>
      <Button buttonStyle="plain" intent={TogglePlayIntent(undefined)}>
        <Image
          systemName={isPlaying ? "pause.fill" : "play.fill"}
          font={center}
          foregroundStyle={MUSIC_PINK}
        />
      </Button>
      <Button buttonStyle="plain" intent={NextTrackIntent(undefined)}>
        <Image systemName="forward.fill" font={side} foregroundStyle={MUSIC_PINK} />
      </Button>
    </HStack>
  )
}

/** 小尺寸：曲目信息、进度条、控制区三者用 Spacer 均分底部空位 */
function SmallWidget({ snap, artwork }: { snap: LyricSnapshot; artwork: UIImage | null }) {
  return (
    <VStack
      alignment="leading"
      spacing={0}
      frame={{ maxWidth: Infinity, maxHeight: Infinity, alignment: "topLeading" }}
      padding={12}
      widgetBackground={{ light: "white", dark: "#1c1c1e" }}
    >
      <HStack spacing={10} frame={{ maxWidth: Infinity, alignment: "topLeading" }}>
        <ArtworkView image={artwork} size={56} />
        <VStack alignment="leading" spacing={3} frame={{ maxWidth: Infinity, alignment: "topLeading" }}>
          <Text font={10} fontWeight="semibold" foregroundStyle={MUSIC_PINK}>
            正在播放
          </Text>
          <Text
            font={16}
            fontWeight="semibold"
            lineLimit={2}
            minScaleFactor={0.5}
            foregroundStyle="label"
          >
            {snap.title || "—"}
          </Text>
          <Text
            font={12}
            lineLimit={1}
            minScaleFactor={0.5}
            foregroundStyle="secondaryLabel"
          >
            {snap.artist}
          </Text>
        </VStack>
      </HStack>

      <Spacer minLength={0} />
      <ProgressView value={snap.progress} progressViewStyle="linear" tint={MUSIC_PINK} />
      <Spacer minLength={0} />
      <ControlButtons isPlaying={snap.isPlaying} spacing={20} compact />
    </VStack>
  )
}

/** 中/大尺寸：大封面、层级化曲目信息、进度条与居中播放控制 */
function MediumWidget({ snap, artwork }: { snap: LyricSnapshot; artwork: UIImage | null }) {
  return (
    <VStack
      alignment="leading"
      spacing={12}
      frame={{ maxWidth: Infinity, maxHeight: Infinity, alignment: "topLeading" }}
      padding={16}
      widgetBackground={{ light: "white", dark: "#1c1c1e" }}
    >
      <HStack spacing={14}>
        <ArtworkView image={artwork} size={80} />
        <VStack alignment="leading" spacing={4} frame={{ maxWidth: Infinity, alignment: "topLeading" }}>
          <Text font="caption" fontWeight="semibold" foregroundStyle={MUSIC_PINK}>
            正在播放
          </Text>
          <Text font={20} fontWeight="semibold" lineLimit={1} foregroundStyle="label">
            {snap.title || "—"}
          </Text>
          <Text font={16} lineLimit={1} foregroundStyle="secondaryLabel">
            {snap.artist}
          </Text>
        </VStack>
      </HStack>
      <ProgressView value={snap.progress} progressViewStyle="linear" tint={MUSIC_PINK} />
      <ControlButtons isPlaying={snap.isPlaying} spacing={40} compact />
    </VStack>
  )
}

/** 当主驱动未运行 / 快照缺失时，自行根据当前播放计算 */
async function computeFresh(): Promise<{ snap: LyricSnapshot; artwork: UIImage | null } | null> {
  const item = SystemMusicPlayer.getNowPlayingItem()
  if (!item) return null

  const title = item.title
  const artist = item.artist ?? "未知歌手"
  const persistentID = item.persistentID
  const currentTime = SystemMusicPlayer.getCurrentPlaybackTime()
  const playbackDuration = item.playbackDuration
  const isPlaying = SystemMusicPlayer.getPlaybackState() === "playing"
  const progress = playbackDuration > 0 ? Math.min(currentTime / playbackDuration, 1) : 0

  const artworkPath = (await loadArtworkPath(title, artist)) ?? undefined
  return {
    snap: {
      title,
      artist,
      persistentID,
      artworkPath,
      currentText: "",
      nextText: "",
      progress,
      isPlaying,
      hasLyric: false,
      updatedAt: Date.now() / 1000,
    },
    artwork: loadImageFromPath(artworkPath),
  }
}

async function run() {
  // 优先读取主驱动写入的实时快照
  let snapshot = Storage.get<LyricSnapshot>(SNAPSHOT_KEY)
  let artworkUIImage: UIImage | null = null

  if (!snapshot || Date.now() / 1000 - snapshot.updatedAt > 30) {
    // 快照缺失或过旧，自行根据当前播放计算
    const fresh = await computeFresh()
    if (fresh) {
      snapshot = fresh.snap
      artworkUIImage = fresh.artwork
    }
  } else {
    // 优先使用快照中的路径；缺失时再下载并压缩缓存
    let path = snapshot.artworkPath
    if (!path || !FileManager.existsSync(path)) {
      path = (await loadArtworkPath(snapshot.title, snapshot.artist)) ?? undefined
      if (path) snapshot.artworkPath = path
    }
    artworkUIImage = loadImageFromPath(path)
  }

  if (!snapshot) {
    Widget.present(
      <VStack alignment="center" spacing={6}>
        <Image systemName="music.note.list" foregroundStyle="gray" />
        <Text font="caption" foregroundStyle="gray">未在播放</Text>
      </VStack>,
    )
    return
  }

  const family = Widget.family
  const view = family === "systemSmall"
    ? <SmallWidget snap={snapshot} artwork={artworkUIImage} />
    : <MediumWidget snap={snapshot} artwork={artworkUIImage} />

  Widget.present(view)
}

run()
