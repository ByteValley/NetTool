// shared/utils/storage.ts
// 模块分类 · 通用存储工具（Storage / BoxJS）
// 模块分类 · 设计要点
// - 只做“稳妥的兜底封装”：不抛错、不刷屏
// - 兼容 Storage.get 返回：object / string(JSON) / primitive
// - 提供成对的：safeGetX / safeSetX / safeRemove

declare const Storage: any

function hasStorage(): boolean {
  return !!Storage && typeof Storage.get === "function" && typeof Storage.set === "function"
}

export function safeRemove(key: string) {
  try {
    if (!Storage) return
    if (typeof Storage.remove === "function") Storage.remove(key)
    else if (typeof Storage.delete === "function") Storage.delete(key)
    else Storage.set?.(key, null)
  } catch { }
}

// =====================================================================
// 模块分类 · 基础 Set / Get
// =====================================================================
export function safeSet(key: string, value: unknown) {
  try {
    if (!hasStorage()) return
    Storage.set(key, value)
  } catch { }
}

export function safeGet(key: string): unknown {
  try {
    if (!hasStorage()) return undefined
    return Storage.get(key)
  } catch {
    return undefined
  }
}

// =====================================================================
// 模块分类 · String / Number / Boolean
// =====================================================================
export function safeGetString(key: string, fallback = ""): string {
  try {
    const v = safeGet(key)
    return typeof v === "string" ? v : fallback
  } catch {
    return fallback
  }
}

export function safeSetString(key: string, value: string) {
  safeSet(key, String(value ?? ""))
}

export function safeGetNumber(key: string, fallback = 0): number {
  try {
    const v = safeGet(key)
    if (typeof v === "number" && Number.isFinite(v)) return v
    if (typeof v === "string") {
      const n = Number(v)
      if (Number.isFinite(n)) return n
    }
  } catch { }
  return fallback
}

export function safeSetNumber(key: string, value: number) {
  const n = Number(value)
  safeSet(key, Number.isFinite(n) ? n : 0)
}

export function safeGetBoolean(key: string, fallback: boolean) {
  try {
    const v = safeGet(key)
    return typeof v === "boolean" ? v : fallback
  } catch {
    return fallback
  }
}

export function safeSetBoolean(key: string, value: boolean) {
  safeSet(key, value === true)
}

// =====================================================================
// 模块分类 · Object（JSON）
// - 约定：写入默认直接 set(object)，读出时兼容 string(JSON)
// =====================================================================
export function safeSetObject(key: string, value: unknown, opts?: { asString?: boolean }) {
  try {
    if (!hasStorage()) return
    if (opts?.asString === true) {
      Storage.set(key, JSON.stringify(value ?? null))
    } else {
      Storage.set(key, value ?? null)
    }
  } catch {
    // 最后一层兜底：尝试字符串化
    try {
      Storage?.set?.(key, JSON.stringify(value ?? null))
    } catch { }
  }
}

export function safeGetObject<T>(key: string, fallback: T): T {
  try {
    const raw = safeGet(key)
    if (raw == null) return fallback

    // 直接对象/数组
    if (typeof raw === "object") return raw as T

    // JSON 字符串
    if (typeof raw === "string") {
      const s = raw.trim()
      if (!s) return fallback
      try {
        const obj = JSON.parse(s)
        return (obj == null ? fallback : (obj as T))
      } catch {
        return fallback
      }
    }

    // primitive：不硬转，保持 fallback
    return fallback
  } catch {
    return fallback
  }
}