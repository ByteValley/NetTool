// shared/utils/time.ts
// 模块分类 · 时间/单位换算（Scripting 通用）
// 模块分类 · 约定与目标
// - Settings 存“秒”：refreshIntervalSeconds / requestTimeoutSeconds / imageTimeoutSeconds
// - 运行时常用“毫秒”：统一通过本文件换算
// - 提供：clamp + 友好格式化 + 秒/分/时互换 + 文本解析（"90s" / "5m" / "2h" / "01:20:30" / "2小时"）
//
// 模块分类 · 常用示例
// - const MIN_CACHE_MS = hoursToMs(4)
// - const DEFAULT_MAX_STALE_MS = daysToMs(1)
// - const timeoutMs = secondsToMs(settings.requestTimeoutSeconds, 15)

export const MS_PER_SECOND = 1000
export const SECONDS_PER_MINUTE = 60
export const MINUTES_PER_HOUR = 60
export const HOURS_PER_DAY = 24

export const SECONDS_PER_HOUR = SECONDS_PER_MINUTE * MINUTES_PER_HOUR // 3600
export const SECONDS_PER_DAY = SECONDS_PER_HOUR * HOURS_PER_DAY        // 86400

export const MS_PER_MINUTE = SECONDS_PER_MINUTE * MS_PER_SECOND        // 60000
export const MS_PER_HOUR = SECONDS_PER_HOUR * MS_PER_SECOND            // 3600000
export const MS_PER_DAY = SECONDS_PER_DAY * MS_PER_SECOND              // 86400000

export const MINUTES_PER_DAY = MINUTES_PER_HOUR * HOURS_PER_DAY        // 1440

function isFiniteNumber(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v)
}

function isAlmostInt(n: number) {
  return Math.abs(n - Math.round(n)) < 1e-9
}

// =====================================================================
// Clamp helpers
// =====================================================================
export function clampNumber(
  v: unknown,
  fallback: number,
  min = 0,
  max = Number.POSITIVE_INFINITY,
): number {
  const n = isFiniteNumber(v) ? v : fallback
  return Math.min(max, Math.max(min, n))
}

export function clampInt(
  v: unknown,
  fallback: number,
  min = 0,
  max = Number.POSITIVE_INFINITY,
): number {
  return Math.round(clampNumber(v, fallback, min, max))
}

export function clampFloat(
  v: unknown,
  fallback: number,
  min = 0,
  max = Number.POSITIVE_INFINITY,
): number {
  return clampNumber(v, fallback, min, max)
}

// =====================================================================
// “分钟”友好显示
// =====================================================================
export function formatDuration(minutes: number, opts?: { includeSeconds?: boolean }) {
  const includeSeconds = opts?.includeSeconds !== false
  const m = Number(minutes)
  if (!Number.isFinite(m) || m <= 0) return "0"

  if (m < 1 && includeSeconds) {
    const seconds = Math.max(1, Math.round(m * SECONDS_PER_MINUTE))
    return `${seconds} 秒`
  }

  if (m < MINUTES_PER_HOUR) {
    const mins = isAlmostInt(m) ? Math.round(m) : Number(m.toFixed(1))
    return `${mins} 分钟`
  }

  if (m >= MINUTES_PER_DAY) {
    const days = m / MINUTES_PER_DAY
    return isAlmostInt(days) ? `${Math.round(days)} 天` : `${days.toFixed(1)} 天`
  }

  const hours = m / MINUTES_PER_HOUR
  return isAlmostInt(hours) ? `${Math.round(hours)} 小时` : `${hours.toFixed(1)} 小时`
}

export function formatRefreshIntervalLabel(minutes?: number): string {
  if (minutes == null) return "自动刷新"
  if (!isFiniteNumber(minutes)) return "自动刷新"
  if (minutes <= 0) return "手动刷新"

  if (minutes < 1) {
    const seconds = Math.max(1, Math.round(minutes * SECONDS_PER_MINUTE))
    return `每 ${seconds} 秒`
  }

  if (minutes >= MINUTES_PER_DAY) {
    const days = minutes / MINUTES_PER_DAY
    return isAlmostInt(days) ? `每 ${Math.round(days)} 天` : `每 ${days.toFixed(1)} 天`
  }

  if (minutes >= MINUTES_PER_HOUR) {
    const hours = minutes / MINUTES_PER_HOUR
    return isAlmostInt(hours) ? `每 ${Math.round(hours)} 小时` : `每 ${hours.toFixed(1)} 小时`
  }

  const mins = isAlmostInt(minutes) ? Math.round(minutes) : Number(minutes.toFixed(1))
  return `每 ${mins} 分钟`
}

// =====================================================================
// 基础换算：Seconds/Minutes/Hours/Days <-> Ms
// =====================================================================
export function secondsToMs(sec: unknown, fallbackSec = 0, minSec = 0, maxSec = SECONDS_PER_DAY): number {
  const s = clampFloat(sec, fallbackSec, minSec, maxSec)
  return Math.round(s * MS_PER_SECOND)
}

export function msToSeconds(ms: unknown, fallbackSec = 0, minSec = 0, maxSec = SECONDS_PER_DAY): number {
  const m = clampFloat(ms, fallbackSec * MS_PER_SECOND, minSec * MS_PER_SECOND, maxSec * MS_PER_SECOND)
  return Math.round(m / MS_PER_SECOND)
}

export function minutesToMs(min: unknown, fallbackMin = 0, minMin = 0, maxMin = MINUTES_PER_DAY): number {
  const m = clampFloat(min, fallbackMin, minMin, maxMin)
  return Math.round(m * MS_PER_MINUTE)
}

export function msToMinutes(ms: unknown, fallbackMin = 0, minMin = 0, maxMin = MINUTES_PER_DAY): number {
  const m = clampFloat(ms, fallbackMin * MS_PER_MINUTE, minMin * MS_PER_MINUTE, maxMin * MS_PER_MINUTE)
  return Math.round(m / MS_PER_MINUTE)
}

export function minutesToSeconds(min: unknown, fallbackSec = 0, minMin = 0, maxMin = MINUTES_PER_DAY): number {
  const m = clampFloat(min, fallbackSec / SECONDS_PER_MINUTE, minMin, maxMin)
  return Math.round(m * SECONDS_PER_MINUTE)
}

export function secondsToMinutes(sec: unknown, fallbackMin = 0, minMin = 0, maxMin = MINUTES_PER_DAY): number {
  const s = clampFloat(sec, fallbackMin * SECONDS_PER_MINUTE, minMin * SECONDS_PER_MINUTE, maxMin * SECONDS_PER_MINUTE)
  return Math.round(s / SECONDS_PER_MINUTE)
}

export function hoursToSeconds(hours: unknown, fallbackSec = 0, minH = 0, maxH = 24 * 365): number {
  const h = clampFloat(hours, fallbackSec / SECONDS_PER_HOUR, minH, maxH)
  return Math.round(h * SECONDS_PER_HOUR)
}

export function secondsToHours(sec: unknown, fallbackH = 0, minH = 0, maxH = 24 * 365): number {
  const s = clampFloat(sec, fallbackH * SECONDS_PER_HOUR, minH * SECONDS_PER_HOUR, maxH * SECONDS_PER_HOUR)
  return s / SECONDS_PER_HOUR
}

export function hoursToMs(hours: unknown, fallbackH = 0, minH = 0, maxH = 24 * 365): number {
  const h = clampFloat(hours, fallbackH, minH, maxH)
  return Math.round(h * MS_PER_HOUR)
}

export function daysToMs(days: unknown, fallbackD = 0, minD = 0, maxD = 365): number {
  const d = clampFloat(days, fallbackD, minD, maxD)
  return Math.round(d * MS_PER_DAY)
}

// 模块分类 · WidgetReloadPolicy helpers（Scripting）
// - 让 widget 里避免出现一堆 "* 60 * 1000"
export function afterMs(ms: unknown) {
  const delayMs = clampInt(ms, 0, 0, 365 * MS_PER_DAY)
  return { policy: "after" as const, date: new Date(Date.now() + delayMs) }
}

export function afterSeconds(sec: unknown) {
  return afterMs(secondsToMs(sec, 0, 0, 365 * SECONDS_PER_DAY))
}

export function afterMinutes(min: unknown) {
  return afterMs(minutesToMs(min, 0, 0, MINUTES_PER_DAY * 365))
}

// =====================================================================
// 文本解析：输入 -> 秒（用于 Settings/日志/调参）
// - number: 90
// - "90" / "90s" / "5m" / "2h" / "1.5h" / "1d"
// - "1:30" (mm:ss) / "01:20:30" (hh:mm:ss)
// - "2小时" "5分钟" "30秒"（简单中文单位）
// 设计：默认“纯数字字符串”按秒
// =====================================================================
export function parseDurationToSeconds(
  input: unknown,
  fallbackSec = 0,
  minSec = 0,
  maxSec = 365 * SECONDS_PER_DAY,
): number {
  if (isFiniteNumber(input)) {
    return clampInt(input, fallbackSec, minSec, maxSec)
  }

  const raw = String(input ?? "").trim()
  if (!raw) return clampInt(fallbackSec, fallbackSec, minSec, maxSec)

  // 1) hh:mm:ss 或 mm:ss
  if (/^\d{1,3}:\d{1,2}(:\d{1,2})?$/.test(raw)) {
    const parts = raw.split(":").map((x) => parseInt(x, 10))
    if (parts.some((n) => !Number.isFinite(n))) return clampInt(fallbackSec, fallbackSec, minSec, maxSec)

    let sec = 0
    if (parts.length === 2) {
      sec = parts[0] * SECONDS_PER_MINUTE + parts[1]
    } else {
      sec = parts[0] * SECONDS_PER_HOUR + parts[1] * SECONDS_PER_MINUTE + parts[2]
    }
    return clampInt(sec, fallbackSec, minSec, maxSec)
  }

  const s = raw
    .toLowerCase()
    .replace(/\s+/g, "")
    .replace(/秒钟|秒/g, "s")
    .replace(/分钟|分/g, "m")
    .replace(/小时|时/g, "h")
    .replace(/天/g, "d")

  // 2) 纯数字：按“秒”
  if (/^\d+(\.\d+)?$/.test(s)) {
    const n = Number(s)
    if (!Number.isFinite(n)) return clampInt(fallbackSec, fallbackSec, minSec, maxSec)
    return clampInt(n, fallbackSec, minSec, maxSec)
  }

  // 3) 单位后缀：1.5h / 90s / 2m / 1d
  const m = s.match(/^(\d+(\.\d+)?)([smhd])$/)
  if (m) {
    const num = Number(m[1])
    const unit = m[3]
    if (!Number.isFinite(num)) return clampInt(fallbackSec, fallbackSec, minSec, maxSec)

    let sec = num
    if (unit === "m") sec = num * SECONDS_PER_MINUTE
    if (unit === "h") sec = num * SECONDS_PER_HOUR
    if (unit === "d") sec = num * SECONDS_PER_DAY

    return clampInt(sec, fallbackSec, minSec, maxSec)
  }

  return clampInt(fallbackSec, fallbackSec, minSec, maxSec)
}

export function parseDurationToMs(
  input: unknown,
  fallbackMs = 0,
  minMs = 0,
  maxMs = 365 * MS_PER_DAY,
): number {
  const sec = parseDurationToSeconds(input, 0, 0, Math.floor(maxMs / MS_PER_SECOND))
  const ms = sec * MS_PER_SECOND
  return clampInt(ms, fallbackMs, minMs, maxMs)
}

// =====================================================================
// 自动格式化：输入秒 -> “x秒/x分钟/x小时/x天”
// =====================================================================
export function formatDurationAutoFromSeconds(sec: unknown, opts?: { decimals?: 0 | 1 | 2 }): string {
  const decimals = opts?.decimals ?? 1
  const s = clampFloat(parseDurationToSeconds(sec, 0, 0, 365 * SECONDS_PER_DAY), 0, 0, 365 * SECONDS_PER_DAY)

  if (s < SECONDS_PER_MINUTE) return `${Math.max(1, Math.round(s))} 秒`

  if (s < SECONDS_PER_HOUR) {
    const m = s / SECONDS_PER_MINUTE
    const v = isAlmostInt(m) ? Math.round(m) : Number(m.toFixed(decimals))
    return `${v} 分钟`
  }

  if (s < SECONDS_PER_DAY) {
    const h = s / SECONDS_PER_HOUR
    const v = isAlmostInt(h) ? Math.round(h) : Number(h.toFixed(decimals))
    return `${v} 小时`
  }

  const d = s / SECONDS_PER_DAY
  const v = isAlmostInt(d) ? Math.round(d) : Number(d.toFixed(decimals))
  return `${v} 天`
}

// 短格式：90s / 10min / 3h / 3h20m
export function formatDurationSeconds(sec: unknown): string {
  const s = parseDurationToSeconds(sec, 0, 0, 365 * SECONDS_PER_DAY)
  if (s < SECONDS_PER_MINUTE) return `${s}s`

  const m = Math.floor(s / SECONDS_PER_MINUTE)
  if (m < MINUTES_PER_HOUR) return `${m}min`

  const h = Math.floor(m / MINUTES_PER_HOUR)
  const rm = m % MINUTES_PER_HOUR
  return rm === 0 ? `${h}h` : `${h}h${rm}m`
}

// 用于日志：refresh=180min（每 3 小时）
// - <60s：按秒
// - >=60s：按 min + 解释性括号
export function formatRefreshIntervalLabelFromSeconds(sec: unknown): string {
  const s = parseDurationToSeconds(sec, 0, 0, 365 * SECONDS_PER_DAY)
  if (s <= 0) return "0min"
  if (s < SECONDS_PER_MINUTE) return `${s}s`

  const m = Math.round(s / SECONDS_PER_MINUTE)
  const h = s / SECONDS_PER_HOUR

  if (h >= 1 && isAlmostInt(h)) return `${m}min（每 ${Math.round(h)} 小时）`

  if (m >= MINUTES_PER_HOUR) {
    const hh = Math.floor(m / MINUTES_PER_HOUR)
    const mm = m % MINUTES_PER_HOUR
    return mm === 0 ? `${m}min（每 ${hh} 小时）` : `${m}min（约 ${hh}小时${mm}分）`
  }

  return `${m}min`
}

// =====================================================================
// 时间格式化：常用 UI/日志
// =====================================================================
export function pad2(n: number): string {
  return String(n).padStart(2, "0")
}

export function formatTimeHM(d: Date): string {
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`
}

export function formatDateMDHM(tsMs: unknown): string {
  const t = isFiniteNumber(tsMs) ? tsMs : Date.now()
  const d = new Date(t)
  const mm = pad2(d.getMonth() + 1)
  const dd = pad2(d.getDate())
  const hh = pad2(d.getHours())
  const mi = pad2(d.getMinutes())
  return `${mm}-${dd} ${hh}:${mi}`
}

// HH:mm
export function formatHM(d: Date | number): string {
  const date = typeof d === "number" ? new Date(d) : d
  return `${pad2(date.getHours())}:${pad2(date.getMinutes())}`
}

// MM-DD HH:mm（无年份）
export function formatMDHMNoYear(d: Date | number): string {
  const date = typeof d === "number" ? new Date(d) : d
  return `${pad2(date.getMonth() + 1)}-${pad2(date.getDate())} ${formatHM(date)}`
}

// YYYY-MM-DD HH:mm（如果你以后要带年，这个就很香）
export function formatYMDHM(d: Date | number): string {
  const date = typeof d === "number" ? new Date(d) : d
  const y = date.getFullYear()
  return `${y}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())} ${formatHM(date)}`
}
// =====================================================================
// 超时预算拆分：给 fetch/json 之类的“两段式”请求用
// =====================================================================
export function splitTimeoutBudgetMs(totalMs: number, ratioHead = 0.6, minEachMs = 2000) {
  const total = Math.max(minEachMs * 2, Math.floor(totalMs))
  const head = Math.max(minEachMs, Math.floor(total * ratioHead))
  const tail = Math.max(minEachMs, total - head)
  return { total, head, tail }
}