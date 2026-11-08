import {
  Button,
  HStack,
  List,
  NavigationStack,
  Section,
  Spacer,
  Stepper,
  Text,
  TextField,
  Toggle,
  VStack,
} from "scripting"
import { CloseButton, CacheStats } from "./LyricsTabs"
import { SPOTIFY_REDIRECT_URI } from "../api/spotify"

type SettingsPageProps = {
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
  cache: CacheStats
  onClose: () => void
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

export function SettingsPage(props: SettingsPageProps) {
  const {
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
    cache,
    onClose,
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
    <NavigationStack>
      <List
        navigationTitle="设置"
        navigationBarTitleDisplayMode="inline"
        toolbar={{ cancellationAction: <CloseButton onClose={onClose} /> }}
      >
        <Section title="歌词同步">
          <HStack spacing={12} frame={{ maxWidth: Infinity, alignment: "center" }}>
            <VStack alignment="leading" spacing={3}>
              <Text font="body">时间偏移</Text>
              <Text font="caption" foregroundStyle="gray">正值延迟，负值提早</Text>
            </VStack>
            <Spacer minLength={0} />
            <Stepper onIncrement={onIncrementOffset} onDecrement={onDecrementOffset}>
              <Text font="body" fontWeight="semibold">{offsetText}</Text>
            </Stepper>
          </HStack>
          <Toggle
            title="歌词页应用偏移"
            value={lyricsPageOffsetEnabled}
            onChanged={onLyricsPageOffsetChanged}
          />
        </Section>

        <Section title="播放">
          <Toggle title={`开启后打开${spotifyEnabled ? " Spotify" : " Apple Music"}`} value={openMusic} onChanged={onOpenMusicChanged} />
        </Section>

        <Section title="Spotify">
          <TextField
            title="Client ID"
            value={spotifyClientId}
            onChanged={onSpotifyClientIdChanged}
            prompt="从 Spotify Developer Dashboard 复制"
          />
          <VStack alignment="leading" spacing={5} frame={{ maxWidth: Infinity, alignment: "topLeading" }}>
            <Text font="caption" foregroundStyle="gray">在 Spotify Developer Dashboard 的 Redirect URIs 中添加：</Text>
            <Text font={13} foregroundStyle="gray">{SPOTIFY_REDIRECT_URI}</Text>
            <Text font="caption" foregroundStyle="gray">
              使用 PKCE 授权；不需要填写 Client Secret。开发模式需要 Premium 账号，并将 Spotify 用户加入应用测试名单。
            </Text>
          </VStack>
          <Button
            title={spotifyConnected ? "重新连接 Spotify" : "连接 Spotify"}
            systemImage="link"
            action={onConnectSpotify}
          />
          {spotifyConnected ? (
            <Button title="断开 Spotify" systemImage="xmark.circle" tint="red" action={onDisconnectSpotify} />
          ) : null}
          <Toggle
            title="使用 Spotify 作为播放来源"
            value={spotifyEnabled}
            onChanged={onSpotifyEnabledChanged}
          />
          {spotifyStatus ? <Text font="caption" foregroundStyle="gray">{spotifyStatus}</Text> : null}
        </Section>

        <Section title="后台运行">
          <VStack alignment="leading" spacing={5} frame={{ maxWidth: Infinity, alignment: "topLeading" }}>
            <Toggle
              title="定位保活"
              value={locationKeepAlive}
              onChanged={onLocationKeepAliveChanged}
            />
            <Text font="caption" foregroundStyle="gray">
              需要将 Scripting 定位权限设为"始终"，开启后会增加耗电。
            </Text>
          </VStack>
          {locationKeepAlive ? (
            <VStack alignment="leading" spacing={5} frame={{ maxWidth: Infinity, alignment: "topLeading" }}>
              <Toggle
                title="自适应保活"
                value={adaptiveKeepAlive}
                onChanged={onAdaptiveKeepAliveChanged}
              />
              <Text font={13} foregroundStyle="gray">
                暂停时停止定位以节省电量，实时活动保持显示；恢复播放后再次启动定位。
              </Text>
            </VStack>
          ) : null}
          <VStack alignment="leading" spacing={5} frame={{ maxWidth: Infinity, alignment: "topLeading" }}>
            <HStack spacing={12} frame={{ maxWidth: Infinity, alignment: "center" }}>
              <Text font={16}>不活跃自动关闭</Text>
              <Spacer minLength={0} />
              <Stepper
                onIncrement={() => onAutoCloseInactiveMinutesChanged(autoCloseInactiveMinutes + 1)}
                onDecrement={() => onAutoCloseInactiveMinutesChanged(autoCloseInactiveMinutes - 1)}
              >
                <Text font={16} fontWeight="semibold">
                  {autoCloseInactiveMinutes > 0 ? `${autoCloseInactiveMinutes} 分钟` : "永不"}
                </Text>
              </Stepper>
            </HStack>
            <Text font={13} foregroundStyle="gray">
              只有在后台/最小化且歌曲已暂停时才计时；回到前台或恢复播放会取消计时。
            </Text>
          </VStack>
        </Section>

        <Section title="缓存">
          <HStack frame={{ maxWidth: Infinity, alignment: "center" }}>
            <Text>歌词</Text>
            <Spacer />
            <Text foregroundStyle="gray">{cache.lyrics} 条</Text>
          </HStack>
          <HStack frame={{ maxWidth: Infinity, alignment: "center" }}>
            <Text>封面</Text>
            <Spacer />
            <Text foregroundStyle="gray">{cache.artworks} 张</Text>
          </HStack>
          <HStack frame={{ maxWidth: Infinity, alignment: "center" }}>
            <Text>更新时间</Text>
            <Spacer />
            <Text font="caption" foregroundStyle="gray">
              {cache.updatedAt ? new Date(cache.updatedAt * 1000).toLocaleString() : "—"}
            </Text>
          </HStack>
          <Button title="清除缓存" systemImage="trash" tint="red" action={onClearCache} />
        </Section>
      </List>
    </NavigationStack>
  )
}
