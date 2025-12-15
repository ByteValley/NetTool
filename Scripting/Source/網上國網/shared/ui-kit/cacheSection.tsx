// shared/ui-kit/cacheSection.tsx（通用缓存 Section，适配 scripting，实时生效）

import { Section, Toggle, Picker, Text, VStack, useState } from "scripting"

import { formatDuration } from "../utils/time"

export type CacheMode = "auto" | "network_only" | "cache_only"

export type CacheConfig = {
  enabled: boolean
  mode: CacheMode
  ttlPolicy: "auto" | "fixed"
  ttlMinutesFixed: number
  allowStaleOnError: boolean
  maxStaleMinutes: number
}

export type CacheStore<TSettings> = {
  load: () => TSettings
  save: (next: TSettings) => void
  getCache: (s: TSettings) => CacheConfig
  setCache: (s: TSettings, cache: CacheConfig) => TSettings
  title?: string
}

const MIN_TTL_MINUTES = 240 // 4h

const TTL_FIXED_OPTIONS: Array<{ label: string; value: number }> = [
  { label: "4 小时", value: 240 },
  { label: "6 小时", value: 360 },
  { label: "12 小时", value: 720 },
  { label: "1 天", value: 1440 },
]

const STALE_OPTIONS: Array<{ label: string; value: number }> = [
  { label: "4 小时", value: 240 },
  { label: "6 小时", value: 360 },
  { label: "12 小时", value: 720 },
  { label: "1 天", value: 1440 },
  { label: "2 天", value: 2880 },
  { label: "3 天", value: 4320 },
  { label: "5 天", value: 7200 },
  { label: "7 天", value: 10080 },
]

const STALE_MINUTES_SORTED = STALE_OPTIONS.map((x) => x.value).slice().sort((a, b) => a - b)

function pickStaleMinutesAtLeast(minMinutes: number) {
  for (const v of STALE_MINUTES_SORTED) {
    if (v >= minMinutes) return v
  }
  return STALE_MINUTES_SORTED[STALE_MINUTES_SORTED.length - 1] ?? minMinutes
}

const MODE_OPTIONS: Array<{ label: string; value: CacheMode }> = [
  { label: "自动", value: "auto" },
  { label: "只走网络", value: "network_only" },
  { label: "只用缓存", value: "cache_only" },
]

const TTL_POLICY_OPTIONS: Array<{ label: string; value: "auto" | "fixed" }> = [
  { label: "自动", value: "auto" },
  { label: "手动选择", value: "fixed" },
]

function normalizeMode(v: unknown, fallback: CacheMode): CacheMode {
  const s = String(v)
  if (s === "auto" || s === "network_only" || s === "cache_only") return s
  return fallback
}

function normalizeTtlPolicy(v: unknown, fallback: "auto" | "fixed"): "auto" | "fixed" {
  const s = String(v)
  if (s === "auto" || s === "fixed") return s
  return fallback
}

function clampNumber(v: any, fallback: number, min = 0) {
  const n = typeof v === "number" && Number.isFinite(v) ? v : fallback
  return Math.max(min, n)
}

function sameCache(a: CacheConfig, b: CacheConfig) {
  return (
    a.enabled === b.enabled &&
    a.mode === b.mode &&
    a.ttlPolicy === b.ttlPolicy &&
    a.ttlMinutesFixed === b.ttlMinutesFixed &&
    a.allowStaleOnError === b.allowStaleOnError &&
    a.maxStaleMinutes === b.maxStaleMinutes
  )
}

function computeTtlActualMinutes(cache: CacheConfig, refreshMinutesMaybe?: any) {
  const refreshMinutes = clampNumber(Number(refreshMinutesMaybe), 0, 0)
  const fixed = clampNumber(cache.ttlMinutesFixed, MIN_TTL_MINUTES, MIN_TTL_MINUTES)

  if (cache.ttlPolicy === "fixed") {
    return Math.max(MIN_TTL_MINUTES, fixed)
  }
  // auto：max(4h, refreshInterval)
  return Math.max(MIN_TTL_MINUTES, refreshMinutes)
}

/**
 * 关键纠偏：
 * - ttlMinutesFixed >= MIN_TTL
 * - 若开启 allowStaleOnError：maxStaleMinutes >= ttlActualMinutes（避免“兜底比 TTL 还短”的反直觉）
 */
function normalizeCacheConfig(next: CacheConfig, ttlActualMinutes: number): CacheConfig {
  const ttlMinutesFixed = clampNumber(next.ttlMinutesFixed, MIN_TTL_MINUTES, MIN_TTL_MINUTES)

  const maxStaleMinutesRaw = clampNumber(next.maxStaleMinutes, STALE_MINUTES_SORTED[0] ?? 0, 0)

  const minNeed = next.allowStaleOnError ? ttlActualMinutes : maxStaleMinutesRaw
  const maxStaleMinutes = pickStaleMinutesAtLeast(Math.max(maxStaleMinutesRaw, minNeed))

  return { ...next, ttlMinutesFixed, maxStaleMinutes }
}

export function CacheSection<TSettings>({
  store,
  refreshKey,
  // ✅ 延迟保存（只更新草稿，不落盘）
  deferPersist,
  // ✅ 外部草稿（用于“只点完成才保存”）
  draft,
  onDraftChange,
}: {
  store: CacheStore<TSettings>
  refreshKey?: any
  deferPersist?: boolean
  draft?: CacheConfig
  onDraftChange?: (next: CacheConfig) => void
}) {
  const [cache, setCache] = useState<CacheConfig>(() => {
    if (draft) return draft
    const s = store.load()
    return store.getCache(s)
  })

  // 外部草稿优先：外部变化就同步到内部（不依赖 useEffect）
  if (draft && !sameCache(draft, cache)) {
    setCache(draft)
  }

  // 非草稿模式：当外部 refreshKey 变化时，同步 store 最新缓存
  if (!draft && refreshKey !== undefined) {
    const latest = store.getCache(store.load())
    if (!sameCache(latest, cache)) {
      setCache(latest)
    }
  }

  function commit(nextCache: CacheConfig) {
    const ttlActualMinutes = computeTtlActualMinutes(nextCache, refreshKey)
    const normalized = normalizeCacheConfig(nextCache, ttlActualMinutes)

    // 1) 立刻刷新 UI
    setCache(normalized)

    // 2) 草稿回传（用于“完成”统一保存）
    onDraftChange?.(normalized)

    // 3) 是否落盘
    if (!deferPersist && !draft) {
      const cur = store.load()
      store.save(store.setCache(cur, normalized))
    }
  }

  function patchCache(patch: Partial<CacheConfig>) {
    commit({ ...cache, ...patch })
  }

  const cacheEnabled = cache.enabled
  const isNetworkOnly = cache.mode === "network_only"
  const isCacheOnly = cache.mode === "cache_only"

  // 当前生效 TTL / 兜底窗口（用于说明，不改变业务）
  const ttlActualMinutes = computeTtlActualMinutes(cache, refreshKey)
  const ttlActualText = formatDuration(ttlActualMinutes, { includeSeconds: false })
  const staleText = cache.allowStaleOnError
    ? formatDuration(cache.maxStaleMinutes, { includeSeconds: false })
    : "未启用"

  return (
    <Section
      header={
        <Text font="body" fontWeight="semibold">
          {store.title ?? "缓存策略"}
        </Text>
      }
      footer={
        <Text font="caption2" foregroundStyle="secondaryLabel">
          • 当前生效：缓存有效期（TTL）={ttlActualText}；旧缓存兜底={staleText}。
          {cache.allowStaleOnError
            ? "\n• 已自动纠偏：兜底时长不会小于 TTL（避免网络失败时反而不能用缓存兜底）。"
            : ""}
        </Text>
      }
    >
      <Toggle
        title="启用缓存"
        value={cacheEnabled}
        onChanged={(v: boolean) => patchCache({ enabled: v })}
      />

      {!cacheEnabled ? (
        <Text font="caption2" foregroundStyle="secondaryLabel">
          已关闭缓存：将始终请求接口获取最新数据。
        </Text>
      ) : null}

      {cacheEnabled ? (
        <VStack>
          <Picker
            title="缓存模式"
            value={cache.mode}
            onChanged={(v: unknown) => patchCache({ mode: normalizeMode(v, cache.mode) })}
            pickerStyle="menu"
          >
            {MODE_OPTIONS.map((opt) => (
              <Text key={opt.value} tag={opt.value as any}>
                {opt.label}
              </Text>
            ))}
          </Picker>

          {cache.mode === "auto" ? (
            <Text font="caption2" foregroundStyle="secondaryLabel">
              自动模式：优先使用“新鲜缓存”，缓存过期再请求接口；接口失败时可按兜底策略回退旧缓存。
            </Text>
          ) : null}

          {isNetworkOnly ? (
            <Text font="caption2" foregroundStyle="secondaryLabel">
              • 只走网络：不读取缓存；是否写入缓存由模块实现决定。
              {"\n"}• 提示：TTL/兜底仅用于下次切回「自动/只用缓存」时生效。
            </Text>
          ) : null}

          {isCacheOnly ? (
            <Text font="caption2" foregroundStyle="secondaryLabel">
              只用缓存：不请求接口；适合临时避免 Token 失效导致空白。
            </Text>
          ) : null}

          <Picker
            title="缓存有效期（TTL）"
            value={cache.ttlPolicy}
            onChanged={(v: unknown) =>
              patchCache({ ttlPolicy: normalizeTtlPolicy(v, cache.ttlPolicy) })
            }
            pickerStyle="menu"
          >
            {TTL_POLICY_OPTIONS.map((opt) => (
              <Text key={opt.value} tag={opt.value as any}>
                {opt.label}
              </Text>
            ))}
          </Picker>

          {cache.ttlPolicy === "fixed" ? (
            <Picker
              title="固定 TTL"
              value={cache.ttlMinutesFixed}
              onChanged={(v: number) =>
                patchCache({ ttlMinutesFixed: Number(v) })
              }
              pickerStyle="menu"
            >
              {TTL_FIXED_OPTIONS.map((opt) => (
                <Text key={opt.value} tag={opt.value as any}>
                  {opt.label}
                </Text>
              ))}
            </Picker>
          ) : (
            <Text font="caption2" foregroundStyle="secondaryLabel">
              TTL 自动：max(4 小时, 组件刷新间隔)。当前 TTL={ttlActualText}。
            </Text>
          )}

          <Toggle
            title="接口失败允许兜底旧缓存"
            value={cache.allowStaleOnError}
            onChanged={(v: boolean) => patchCache({ allowStaleOnError: v })}
          />

          {cache.allowStaleOnError ? (
            <>
              <Picker
                title="兜底旧缓存最长允许"
                value={cache.maxStaleMinutes}
                onChanged={(v: number) =>
                  patchCache({ maxStaleMinutes: Number(v) })
                }
                pickerStyle="menu"
              >
                {STALE_OPTIONS.map((opt) => (
                  <Text key={opt.value} tag={opt.value as any}>
                    {opt.label}
                  </Text>
                ))}
              </Picker>

              {/* 额外说明：把“不会冲突”讲清楚 */}
              <Text font="caption2" foregroundStyle="secondaryLabel">
                兜底只在“接口请求失败”时生效；平时是否使用缓存由 TTL 决定。已保证：兜底时长 ≥ TTL（避免反直觉）。
              </Text>
            </>
          ) : null}
        </VStack>
      ) : null}
    </Section>
  )
}