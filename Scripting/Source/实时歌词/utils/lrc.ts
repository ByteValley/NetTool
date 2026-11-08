// LRC 歌词解析与定位工具
import type { LyricLine } from "../types"

// 匹配 [mm:ss.xx] 形式的时间戳
const TIMESTAMP_REGEX = /\[(\d{1,3}):(\d{1,2}(?:\.\d{1,3})?)\]/g

/**
 * 解析 LRC 同步歌词文本，返回按时间升序排列的歌词行。
 * 支持同一行多时间戳（如 [00:12.34][00:30.00]歌词）。
 * 忽略 [ti:] [ar:] 等元数据标签。
 */
export function parseLrc(lrc: string): LyricLine[] {
  if (!lrc) return []
  const result: LyricLine[] = []

  for (const rawLine of lrc.split(/\r?\n/)) {
    const matches = [...rawLine.matchAll(TIMESTAMP_REGEX)]
    if (matches.length === 0) continue

    // 去掉所有时间戳后剩余的部分即为歌词文本
    const text = rawLine.replace(TIMESTAMP_REGEX, "").trim()
    for (const m of matches) {
      const minutes = parseInt(m[1], 10)
      const seconds = parseFloat(m[2])
      result.push({ time: minutes * 60 + seconds, text })
    }
  }

  // 按时间升序排序，便于二分定位
  result.sort((a, b) => a.time - b.time)
  return result
}

/**
 * 给定当前播放时间（秒），返回应高亮的歌词行索引。
 * 规则：最后一个 time <= currentTime 的行；若没有则返回 -1。
 */
export function findCurrentIndex(lines: LyricLine[], currentTime: number): number {
  if (lines.length === 0) return -1

  let lo = 0
  let hi = lines.length - 1
  let ans = -1

  // 二分查找：最大的满足 time <= currentTime 的索引
  while (lo <= hi) {
    const mid = (lo + hi) >> 1
    if (lines[mid].time <= currentTime) {
      ans = mid
      lo = mid + 1
    } else {
      hi = mid - 1
    }
  }
  return ans
}