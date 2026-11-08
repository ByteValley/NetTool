// 用连续定位在后台唤醒进程，便于继续 activity.update（耗电/隐私成本高，默认应由开关控制）

export type LocationKeepAliveResult = {
  ok: boolean
  // always | whenInUse | denied | error | cancelled
  mode: string
  message: string
}

type Listener = (location: LocationInfo) => void

let active = false
let listener: Listener | null = null
let lifecycleGeneration = 0
let startPromise: Promise<LocationKeepAliveResult> | null = null

// 是否正在用定位保活
export function isLocationKeepAliveActive(): boolean {
  return active
}

// 开启连续定位保活；onTick 在每次定位回调时触发（忽略坐标，只用于推送歌词）
export async function startLocationKeepAlive(
  onTick?: () => void,
): Promise<LocationKeepAliveResult> {
  if (active) {
    return { ok: true, mode: "always", message: "定位保活已在运行" }
  }
  if (startPromise) return startPromise

  const generation = lifecycleGeneration
  startPromise = (async () => {
    try {
      // 尽量低精度，减少耗电；仅用于维持后台执行窗口
      try {
        await Location.setAccuracy("kilometer")
      } catch {
        // 部分环境可能无 setAccuracy，忽略
      }

      Location.setAllowsBackgroundLocationUpdates(true)
      Location.setPausesLocationUpdatesAutomatically(false)
      Location.setShowsBackgroundLocationIndicator(true)

      const result = await Location.startUpdatingLocation({
        requestAlwaysAuthorization: true,
      })
      const mode = result?.mode ?? "whenInUse"
      if (generation !== lifecycleGeneration) {
        try {
          Location.stopUpdatingLocation()
          Location.setAllowsBackgroundLocationUpdates(false)
        } catch {
          // 忽略取消后的原生清理错误
        }
        return { ok: false, mode: "cancelled", message: "定位保活启动已取消" }
      }

      listener = () => {
        // 不关心坐标，只借系统唤醒机会刷新歌词
        try {
          onTick?.()
        } catch {
          // 单次 tick 失败不影响后续
        }
      }
      Location.addLocationListener(listener)
      active = true

      if (mode === "always") {
        return {
          ok: true,
          mode,
          message: "定位保活已开启（始终，后台可持续）",
        }
      }
      return {
        ok: true,
        mode,
        // 状态区空间有限，只提示关键动作
        message: "当前定位权限为「使用期间」",
      }
    } catch (e: any) {
      active = false
      listener = null
      try {
        Location.stopUpdatingLocation()
      } catch {
        // 忽略
      }
      return {
        ok: false,
        mode: "error",
        message: `定位保活失败：${e?.message ?? e}`,
      }
    }
  })()

  try {
    return await startPromise
  } finally {
    startPromise = null
  }
}

// 停止连续定位并清理监听，同时取消尚未完成的启动
export function stopLocationKeepAlive(): void {
  lifecycleGeneration += 1
  try {
    if (listener) Location.removeLocationListener(listener)
  } catch {
    // 忽略
  }
  listener = null
  active = false
  try {
    Location.stopUpdatingLocation()
  } catch {
    // 忽略
  }
  try {
    Location.setAllowsBackgroundLocationUpdates(false)
  } catch {
    // 忽略
  }
}
