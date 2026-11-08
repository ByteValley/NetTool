// 歌词时间偏移量的统一存取层
// 语义：offset > 0 表示歌词「延迟」显示（歌词来早了）；
//       offset < 0 表示歌词「提早」显示（歌词来晚了）。
// 应用方式：adjustedTime = currentTime - offset，交由 findCurrentIndex 定位。

// Storage 持久化键（单位：秒，允许负数）
const OFFSET_KEY = "lyric_time_offset"
// 每次调整的步长（秒）
export const OFFSET_STEP = 0.5
// 限制范围，避免误调到离谱数值（±60 秒）
export const OFFSET_MAX = 60
export const OFFSET_MIN = -60

function clamp(v: number): number {
  if (v > OFFSET_MAX) return OFFSET_MAX
  if (v < OFFSET_MIN) return OFFSET_MIN
  return v
}

/** 读取当前偏移量（秒），无记录返回 0 */
export function getOffset(): number {
  const v = Storage.get<number>(OFFSET_KEY)
  return typeof v === "number" && Number.isFinite(v) ? clamp(v) : 0
}

/** 覆盖写入偏移量（秒，自动钳制到范围） */
export function setOffset(v: number): number {
  const c = clamp(v)
  Storage.set(OFFSET_KEY, c)
  return c
}

/**
 * 在当前偏移基础上叠加一个增量，返回调整后的新值。
 * delta > 0：增大延迟；delta < 0：提早（减小延迟）。
 */
export function adjustOffset(delta: number): number {
  return setOffset(getOffset() + delta)
}

/** 重置偏移量为 0 */
export function resetOffset(): number {
  Storage.set(OFFSET_KEY, 0)
  return 0
}

/**
 * 把实际播放时间转换为用于歌词定位的时间。
 * offset > 0（延迟）时 adjustedTime < currentTime，令高亮行延后切换；
 * offset < 0（提早）时 adjustedTime > currentTime，令高亮行提前切换。
 */
export function applyOffset(currentTime: number): number {
  return currentTime - getOffset()
}

/** 格式化偏移量为展示文本，如 +0.5s / -1.0s / 0.0s */
export function formatOffset(v: number): string {
  const sign = v > 0 ? "+" : v < 0 ? "" : ""
  return `${sign}${v.toFixed(1)}s`
}
