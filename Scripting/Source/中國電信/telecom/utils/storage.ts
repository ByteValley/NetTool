// shared/utils/storage.ts
declare const Storage: any

export function safeSet(key: string, value: unknown) {
  try {
    Storage?.set?.(key, value)
  } catch { }
}

export function safeGetBoolean(key: string, fallback: boolean) {
  try {
    const v = Storage?.get?.(key)
    return typeof v === "boolean" ? v : fallback
  } catch {
    return fallback
  }
}

export function safeGetObject<T>(key: string, fallback: T): T {
  try {
    const raw = Storage?.get?.(key)
    if (!raw) return fallback

    if (typeof raw === "object") return raw as T

    if (typeof raw === "string") {
      try {
        const obj = JSON.parse(raw)
        if (obj && typeof obj === "object") return obj as T
      } catch { }
    }
  } catch { }
  return fallback
}