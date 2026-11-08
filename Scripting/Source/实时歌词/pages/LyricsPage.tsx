import {
  Button,
  Circle,
  HStack,
  Image,
  NavigationStack,
  ProgressView,
  RoundedRectangle,
  Spacer,
  Text,
  useColorScheme,
  VStack,
  ZStack,
  type ShapeStyle,
} from "scripting"
import { useEffect, useState } from "scripting"
import { MUSIC_PINK, CloseButton, LyricsDisplayState } from "./LyricsTabs"

// 状态色调：按文案归类为 错误 / 警告 / 运行 / 中性 四档
function statusTone(status: string): { fg: ShapeStyle; bg: ShapeStyle } {
  if (/失败|出错|无法/.test(status)) return { fg: "systemRed", bg: "rgba(255, 59, 48, 0.12)" }
  if (/警告|过期/.test(status)) return { fg: "systemOrange", bg: "rgba(255, 149, 0, 0.12)" }
  if (/实时活动中|前台运行中|已开启/.test(status)) return { fg: "systemGreen", bg: "rgba(52, 199, 89, 0.12)" }
  return { fg: "gray", bg: "rgba(120, 120, 128, 0.16)" }
}

// 单圈波纹：随 phase 在 true→false 间摆动，scale 1→2.6，opacity 0.5→0，形成向外扩散
function PulseRing({ color, delay, phase }: { color: ShapeStyle; delay: number; phase: boolean }) {
  return (
    <Circle
      fill={color}
      frame={{ width: 5, height: 5 }}
      scaleEffect={phase ? 2.6 : 1}
      opacity={phase ? 0 : 0.5}
      animation={{
        animation: Animation.easeOut(1.6).repeatForever().delay(delay),
        value: phase,
      }}
    />
  )
}

// 带波纹的圆点：两层错峰波纹 + 中心实心圆；仅活跃状态显示波纹
function PulseDot({ color, active }: { color: ShapeStyle; active: boolean }) {
  // mount 后切换一次 phase，动画 repeatForever 会无限往返播放
  const [phase, setPhase] = useState(false)
  useEffect(() => {
    if (active) setPhase(true)
  }, [active])
  return (
    <ZStack frame={{ width: 5, height: 5 }}>
      {active ? <PulseRing color={color} delay={0} phase={phase} /> : null}
      {active ? <PulseRing color={color} delay={0.8} phase={phase} /> : null}
      <Circle fill={color} frame={{ width: 5, height: 5 }} />
    </ZStack>
  )
}

// 状态指示胶囊：圆点 + 文字，胶囊底色随状态色调变化
function StatusCapsule({ status }: { status: string }) {
  const tone = statusTone(status)
  // 仅运行/警告/错误等活跃状态显示波纹，中性静态状态保持安静
  const active = !/已停止|等待播放|已关闭定位保活/.test(status)
  return (
    <HStack
      spacing={6}
      padding={{ horizontal: 12, vertical: 6 }}
      background={tone.bg}
      clipShape="capsule"
    >
      <PulseDot color={tone.fg} active={active} />
      <Text font="caption" foregroundStyle={tone.fg} lineLimit={2} multilineTextAlignment="center">
        {status}
      </Text>
    </HStack>
  )
}

// 加载封面图，失败时返回 null
function loadArtwork(path: string): UIImage | null {
  if (!path) return null
  try {
    return UIImage.fromFile(path)
  } catch {
    return null
  }
}

// 封面缩略图：有图显示图片，无图显示占位图标
function Artwork({ path }: { path: string }) {
  const image = loadArtwork(path)
  if (image) {
    return (
      <Image
        image={image}
        resizable
        scaleToFill
        frame={{ width: 64, height: 64 }}
        clipShape={{ type: "rect", cornerRadius: 8 }}
      />
    )
  }
  return (
    <VStack
      frame={{ width: 64, height: 64 }}
      // 未播放时浅粉占位，与卡片底色区分
      background={{ light: "#ffd8df", dark: "#3a1f22" }}
      clipShape={{ type: "rect", cornerRadius: 8 }}
    >
      <Image systemName="music.note" font={24} foregroundStyle={MUSIC_PINK} />
    </VStack>
  )
}

type LyricsPageProps = {
  disp: LyricsDisplayState
  artworkPath: string
  supportsMinimization: boolean
  onClose: () => void
  onStart: () => void
  onStop: () => void
  onPreviousTrack: () => void
  onTogglePlayback: () => void
  onNextTrack: () => void
  onMinimize: () => void
}

export function LyricsPage(props: LyricsPageProps) {
  const {
    disp,
    artworkPath,
    supportsMinimization,
    onClose,
    onStart,
    onStop,
    onPreviousTrack,
    onTogglePlayback,
    onNextTrack,
    onMinimize,
  } = props

  const scheme = useColorScheme()
  // 控制栏使用低饱和粉色边缘和柔和阴影，避免黑白投影过重
  const border = scheme === "dark"
    ? { stroke: "rgba(255, 255, 255, 0.16)" as const, shadow: { color: "rgba(255, 255, 255, 0.12)" as const, radius: 10, x: 0, y: 0 } }
    : { stroke: "rgba(252, 60, 68, 0.1)" as const, shadow: { color: "rgba(252, 60, 68, 0.1)" as const, radius: 10, x: 0, y: 0 } }
  // 卡片圆角半径，连续曲率；边框描边与裁剪共用同一值保证贴合
  const CARD_RADIUS = 22

  return (
    <NavigationStack>
      <VStack
        navigationTitle="实时歌词"
        navigationBarTitleDisplayMode="inline"
        toolbar={{
          cancellationAction: <CloseButton fontWeight="semibold" onClose={onClose} />,
          topBarTrailing:
            disp.started && supportsMinimization ? (
              <Button
                title="后台运行"
                foregroundStyle="systemBlue"
                fontWeight="semibold"
                action={onMinimize}
              />
            ) : undefined,
        }}
        alignment="leading"
        spacing={0}
        padding={16}
      >
        <VStack alignment="center" spacing={10} frame={{ maxWidth: Infinity, alignment: "top" }}>
          <HStack frame={{ maxWidth: Infinity, alignment: "center" }}>
            <Spacer minLength={0} />
            {disp.started ? (
              <Button
                title="停止实时活动"
                systemImage="stop.fill"
                buttonStyle="borderedProminent"
                buttonBorderShape="capsule"
                controlSize="large"
                tint="red"
                action={onStop}
              />
            ) : (
              <Button
                title="开启实时活动"
                systemImage="platter.filled.top.iphone"
                buttonStyle="borderedProminent"
                buttonBorderShape="capsule"
                controlSize="large"
                tint={MUSIC_PINK}
                action={onStart}
              />
            )}
            <Spacer minLength={0} />
          </HStack>
          {disp.status ? <StatusCapsule status={disp.status} /> : null}
        </VStack>

        <Spacer minLength={20} />

        <VStack
          alignment="center"
          spacing={12}
          frame={{ maxWidth: Infinity, minHeight: 300, alignment: "center" }}
        >
          {disp.prev3Text ? (
            <Text font="callout" lineLimit={2} foregroundStyle="quaternaryLabel" multilineTextAlignment="center">
              {disp.prev3Text}
            </Text>
          ) : null}
          {disp.prev2Text ? (
            <Text font="body" lineLimit={2} foregroundStyle="tertiaryLabel" multilineTextAlignment="center">
              {disp.prev2Text}
            </Text>
          ) : null}
          {disp.prevText ? (
            <Text font="title3" lineLimit={2} foregroundStyle="gray" multilineTextAlignment="center">
              {disp.prevText}
            </Text>
          ) : null}
          <Text font="title" fontWeight="bold" lineLimit={3} multilineTextAlignment="center">
            {disp.currentText}
          </Text>
          {disp.nextText ? (
            <Text font="title3" lineLimit={2} foregroundStyle="gray" multilineTextAlignment="center">
              {disp.nextText}
            </Text>
          ) : null}
          {disp.next2Text ? (
            <Text font="body" lineLimit={2} foregroundStyle="tertiaryLabel" multilineTextAlignment="center">
              {disp.next2Text}
            </Text>
          ) : null}
          {disp.next3Text ? (
            <Text font="callout" lineLimit={2} foregroundStyle="quaternaryLabel" multilineTextAlignment="center">
              {disp.next3Text}
            </Text>
          ) : null}
        </VStack>

        <Spacer minLength={20} />

        {/* 底部控制栏悬浮卡片：封面 + 进度 + 播放控制 */}
        <VStack
          alignment="leading"
          spacing={10}
          padding={16}
          frame={{ maxWidth: Infinity, alignment: "bottomLeading" }}
          // 使用更克制的粉色底，保留卡片层次同时呼应音乐主题色
          background={{
            light: "white",
            dark: "secondarySystemBackground",
          }}
          clipShape={{ type: "rect", cornerRadius: CARD_RADIUS, style: "continuous" }}
          // 柔和阴影放在卡片本体，保证溢出可见
          shadow={border.shadow}
          overlay={
            <RoundedRectangle
              cornerRadius={CARD_RADIUS}
              style="continuous"
              stroke={{
                shapeStyle: border.stroke,
                strokeStyle: { lineWidth: 1 },
              }}
            />
          }
        >
          <HStack spacing={12} frame={{ maxWidth: Infinity, alignment: "center" }}>
            <Artwork path={artworkPath} />
            <VStack alignment="leading" spacing={4} frame={{ maxWidth: Infinity, alignment: "leading" }}>
              <Text font="caption" fontWeight="semibold" foregroundStyle={MUSIC_PINK}>
                正在播放
              </Text>
              <Text font={18} fontWeight="semibold" lineLimit={1}>{disp.title || "暂无播放"}</Text>
              <Text font="subheadline" lineLimit={1} foregroundStyle="gray">
                {disp.artist || "当前曲目"}
              </Text>
            </VStack>
          </HStack>
          <ProgressView value={disp.progress} progressViewStyle="linear" tint={MUSIC_PINK} />
          <HStack spacing={40} frame={{ maxWidth: Infinity, alignment: "center" }}>
            <Button buttonStyle="plain" action={onPreviousTrack}>
              <Image systemName="backward.fill" font={18} foregroundStyle={MUSIC_PINK} />
            </Button>
            <Button buttonStyle="plain" action={onTogglePlayback}>
              <Image
                systemName={disp.isPlaying ? "pause.fill" : "play.fill"}
                font={36}
                foregroundStyle={MUSIC_PINK}
              />
            </Button>
            <Button buttonStyle="plain" action={onNextTrack}>
              <Image systemName="forward.fill" font={18} foregroundStyle={MUSIC_PINK} />
            </Button>
          </HStack>
        </VStack>
      </VStack>
    </NavigationStack>
  )
}