// shared/utils/time.ts

const MINUTES_PER_HOUR = 60
const MINUTES_PER_DAY = 1440

function isFiniteNumber(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v)
}

function isAlmostInt(n: number) {
  return Math.abs(n - Math.round(n)) < 1e-9
}

/**
 * 将“分钟”格式化为更友好的文本：
 * - < 1 分钟：按秒显示
 * - < 60 分钟：按分钟显示
 * - < 24 小时：按小时显示（尽量整点）
 * - >= 24 小时：按天显示（尽量整天）
 *
 * 适合：缓存 TTL、兜底窗口、耗时/间隔展示等
 */
export function formatDuration(minutes: number, opts?: { includeSeconds?: boolean }) {
  const includeSeconds = opts?.includeSeconds !== false // 默认 true
  const m = Number(minutes)
  if (!Number.isFinite(m) || m <= 0) return "0"

  // < 1 分钟：可选按秒
  if (m < 1 && includeSeconds) {
    const seconds = Math.max(1, Math.round(m * 60))
    return `${seconds} 秒`
  }

  // < 60 分钟
  if (m < MINUTES_PER_HOUR) {
    const mins = isAlmostInt(m) ? Math.round(m) : Number(m.toFixed(1))
    return `${mins} 分钟`
  }

  // >= 24 小时：按天
  if (m >= MINUTES_PER_DAY) {
    const days = m / MINUTES_PER_DAY
    return isAlmostInt(days) ? `${Math.round(days)} 天` : `${days.toFixed(1)} 天`
  }

  // 1h ~ <24h：按小时
  const hours = m / MINUTES_PER_HOUR
  return isAlmostInt(hours) ? `${Math.round(hours)} 小时` : `${hours.toFixed(1)} 小时`
}

/**
 * 专用于“刷新间隔”的标签：
 * - undefined/null：自动刷新
 * - <=0：手动刷新
 * - <1：按秒
 * - 整小时：按小时
 * - 其他：按分钟
 *
 * 适合：widget 顶部/设置页“刷新间隔”显示
 */
export function formatRefreshIntervalLabel(minutes?: number): string {
  if (minutes == null) return "自动刷新"
  if (!isFiniteNumber(minutes)) return "自动刷新"
  if (minutes <= 0) return "手动刷新"

  // < 1 分钟：按秒
  if (minutes < 1) {
    const seconds = Math.max(1, Math.round(minutes * 60))
    return `每 ${seconds} 秒`
  }

  // >= 24 小时：按天（尽量整天）
  if (minutes >= MINUTES_PER_DAY) {
    const days = minutes / MINUTES_PER_DAY
    return isAlmostInt(days) ? `每 ${Math.round(days)} 天` : `每 ${days.toFixed(1)} 天`
  }

  // 1h ~ <24h：按小时（尽量整点）
  if (minutes >= MINUTES_PER_HOUR) {
    const hours = minutes / MINUTES_PER_HOUR
    return isAlmostInt(hours) ? `每 ${Math.round(hours)} 小时` : `每 ${hours.toFixed(1)} 小时`
  }

  // < 60 分钟：按分钟（尽量整数）
  const mins = isAlmostInt(minutes) ? Math.round(minutes) : Number(minutes.toFixed(1))
  return `每 ${mins} 分钟`
}

/** 工具：天 -> 分钟 */
export function minutesFromDays(days: number) {
  const d = Number(days)
  return Number.isFinite(d) ? Math.round(d * MINUTES_PER_DAY) : 0
}

/** 工具：小时 -> 分钟 */
export function minutesFromHours(hours: number) {
  const h = Number(hours)
  return Number.isFinite(h) ? Math.round(h * MINUTES_PER_HOUR) : 0
}