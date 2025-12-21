// shared/carrier/utils/telecomUtils.ts
// 共用工具函数：三网通用

// 0~1 限制
export function clamp01(n: number): number {
  if (!isFinite(n)) return 0
  if (n < 0) return 0
  if (n > 1) return 1
  return n
}

export function percentText(ratio: number): string {
  return (clamp01(ratio) * 100).toFixed(2)
}

// HH:mm
export function nowHHMM(): string {
  const d = new Date()
  const hh = String(d.getHours()).padStart(2, "0")
  const mm = String(d.getMinutes()).padStart(2, "0")
  return `${hh}:${mm}`
}

export function safeNum(v: unknown, fallback = 0): number {
  const n = typeof v === "number" ? v : parseFloat(String(v ?? ""))
  return Number.isFinite(n) ? n : fallback
}

// 根据开关计算比例：true = 剩余 / total；false = 已用 / total
export function calcRatio(
  total: number,
  remain: number,
  showRemainRatio: boolean,
): number {
  if (total <= 0) return 0
  const used = Math.max(0, Math.min(total, total - remain))
  const remainSafe = Math.max(0, Math.min(total, remain))
  const r = showRemainRatio ? remainSafe / total : used / total
  return clamp01(r)
}

// 统一构建用量统计
// showRemainRatio=false：ratio/显示按已用；true：按剩余
export function buildUsageStat(
  total: unknown,
  used: unknown,
  showRemainRatio: boolean,
) {
  const t = safeNum(total)
  const u = safeNum(used)
  const remain = Math.max(0, t - u)
  const ratio = calcRatio(t, remain, showRemainRatio)
  const display = showRemainRatio ? remain : u
  return { total: t, used: u, remain, ratio, display }
}

// 流量格式化：输入是 MB
export function formatFlowValue(
  value: number,
  unit: "MB" | "GB" = "MB",
): {
  balance: string
  unit: "MB" | "GB"
} {
  if (!isFinite(value)) {
    return { balance: "0.00", unit }
  }
  if (value >= 1024) {
    return {
      balance: (value / 1024).toFixed(2),
      unit: "GB",
    }
  }
  return {
    balance: value.toFixed(2),
    unit: "MB",
  }
}

// 有些场景（移动）希望直接给出“数值+单位”
export function formatFlowFromMB(valueMB: number): {
  valueText: string
  unit: "MB" | "GB"
} {
  const formatted = formatFlowValue(valueMB, "MB")
  return { valueText: formatted.balance, unit: formatted.unit }
}