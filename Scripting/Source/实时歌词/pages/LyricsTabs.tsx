import { Button, Tab, TabView } from "scripting"
import { LyricsPage } from "./LyricsPage"
import { SettingsPage } from "./SettingsPage"

// 主题粉红
export const MUSIC_PINK = "#fc3c44"

export type LyricsDisplayState = {
  title: string
  artist: string
  // 首页可见七行：上三 / 上二 / 上一 / 当前 / 下一 / 下二 / 下三
  prev3Text: string
  prev2Text: string
  prevText: string
  currentText: string
  nextText: string
  next2Text: string
  next3Text: string
  progress: number
  isPlaying: boolean
  started: boolean
  status: string
}

export type CacheStats = {
  lyrics: number
  artworks: number
  updatedAt: number
}

type LyricsTabsProps = {
  disp: LyricsDisplayState
  artworkPath: string
  cache: CacheStats
  offsetText: string
  lyricsPageOffsetEnabled: boolean
  openMusic: boolean
  locationKeepAlive: boolean
  adaptiveKeepAlive: boolean
  autoCloseInactiveMinutes: number
  spotifyClientId: string
  spotifyConnected: boolean
  spotifyEnabled: boolean
  spotifyStatus: string
  supportsMinimization: boolean
  onClose: () => void
  onStart: () => void
  onStop: () => void
  onPreviousTrack: () => void
  onTogglePlayback: () => void
  onNextTrack: () => void
  onMinimize: () => void
  onIncrementOffset: () => void
  onDecrementOffset: () => void
  onLyricsPageOffsetChanged: (value: boolean) => void
  onOpenMusicChanged: (value: boolean) => void
  onLocationKeepAliveChanged: (value: boolean) => void
  onAdaptiveKeepAliveChanged: (value: boolean) => void
  onAutoCloseInactiveMinutesChanged: (value: number) => void
  onSpotifyClientIdChanged: (value: string) => void
  onSpotifyEnabledChanged: (value: boolean) => void
  onConnectSpotify: () => void
  onDisconnectSpotify: () => void
  onClearCache: () => void
}

// 导航栏关闭按钮，两个 Tab 共用
export function CloseButton({
  onClose,
  fontWeight,
}: {
  onClose: () => void
  fontWeight?: "regular" | "medium" | "semibold" | "bold"
}) {
  return (
    <Button
      title="关闭"
      systemImage="xmark"
      tint="red"
      fontWeight={fontWeight ?? "semibold"}
      action={onClose}
    />
  )
}

export function LyricsTabs(props: LyricsTabsProps) {
  const {
    disp,
    artworkPath,
    cache,
    offsetText,
    lyricsPageOffsetEnabled,
    openMusic,
    locationKeepAlive,
    adaptiveKeepAlive,
    autoCloseInactiveMinutes,
    spotifyClientId,
    spotifyConnected,
    spotifyEnabled,
    spotifyStatus,
    supportsMinimization,
    onClose,
    onStart,
    onStop,
    onPreviousTrack,
    onTogglePlayback,
    onNextTrack,
    onMinimize,
    onIncrementOffset,
    onDecrementOffset,
    onLyricsPageOffsetChanged,
    onOpenMusicChanged,
    onLocationKeepAliveChanged,
    onAdaptiveKeepAliveChanged,
    onAutoCloseInactiveMinutesChanged,
    onSpotifyClientIdChanged,
    onSpotifyEnabledChanged,
    onConnectSpotify,
    onDisconnectSpotify,
    onClearCache,
  } = props

  return (
    <TabView tint={MUSIC_PINK}>
      <Tab title="歌词" systemImage="music.note.list" value="lyrics">
        <LyricsPage
          disp={disp}
          artworkPath={artworkPath}
          supportsMinimization={supportsMinimization}
          onClose={onClose}
          onStart={onStart}
          onStop={onStop}
          onPreviousTrack={onPreviousTrack}
          onTogglePlayback={onTogglePlayback}
          onNextTrack={onNextTrack}
          onMinimize={onMinimize}
        />
      </Tab>

      <Tab title="设置" systemImage="gearshape.fill" value="settings">
        <SettingsPage
          offsetText={offsetText}
          lyricsPageOffsetEnabled={lyricsPageOffsetEnabled}
          openMusic={openMusic}
          locationKeepAlive={locationKeepAlive}
          adaptiveKeepAlive={adaptiveKeepAlive}
          autoCloseInactiveMinutes={autoCloseInactiveMinutes}
          spotifyClientId={spotifyClientId}
          spotifyConnected={spotifyConnected}
          spotifyEnabled={spotifyEnabled}
          spotifyStatus={spotifyStatus}
          cache={cache}
          onClose={onClose}
          onIncrementOffset={onIncrementOffset}
          onDecrementOffset={onDecrementOffset}
          onLyricsPageOffsetChanged={onLyricsPageOffsetChanged}
          onOpenMusicChanged={onOpenMusicChanged}
          onLocationKeepAliveChanged={onLocationKeepAliveChanged}
          onAdaptiveKeepAliveChanged={onAdaptiveKeepAliveChanged}
          onAutoCloseInactiveMinutesChanged={onAutoCloseInactiveMinutesChanged}
          onSpotifyClientIdChanged={onSpotifyClientIdChanged}
          onSpotifyEnabledChanged={onSpotifyEnabledChanged}
          onConnectSpotify={onConnectSpotify}
          onDisconnectSpotify={onDisconnectSpotify}
          onClearCache={onClearCache}
        />
      </Tab>
    </TabView>
  )
}
