/* =====================================================================
 * shared/ui-kit/useFullscreenPref.tsx
 *
 * 模块分类 · 背景
 * - 设置页需要管理“页面（全屏）/ 弹层弹出”的显示偏好
 * - hook 用于 React 组件内实时刷新按钮状态
 * - ⚠️ 组件外（main 等）不能用 hook，但仍需要读取 Storage 决定 present 模式
 *
 * 模块分类 · 目标
 * - useFullscreenPref(storageKey)：hook 版（读/写 + 切换提示）
 * - readFullscreenPref(storageKey)：非 hook 只读版（给 main 用）
 *
 * 模块分类 · 使用方式
 * - 设置页（组件内）：
 *   const { fullscreenPref, toggleFullscreen } = useFullscreenPref(FULLSCREEN_KEY)
 * - main（组件外）：
 *   const fullscreen = readFullscreenPref(FULLSCREEN_KEY, true)
 *
 * 模块分类 · 日志与边界
 * - Storage/Dialog 在部分宿主可能不可用：全部 try/catch 保守处理
 * - defaultValue 默认 true：更符合“设置页全屏编辑”的体验
 * ===================================================================== */

import { useState } from "scripting"

declare const Storage: any
declare const Dialog: any

/* =====================================================================
 * 模块分类 · 非 hook：只读偏好（给 main 用）
 *
 * 模块分类 · 背景
 * - main 不能调用 hook，但需要决定 Navigation.present 的 modalPresentationStyle
 *
 * 模块分类 · 目标
 * - 从 Storage 读取 boolean；读取失败返回 defaultValue
 *
 * 模块分类 · 使用方式
 * - readFullscreenPref(FULLSCREEN_KEY, true)
 *
 * 模块分类 · 日志与边界
 * - 不打日志；异常吞掉
 * ===================================================================== */

export function readFullscreenPref(storageKey: string, defaultValue = true): boolean {
  try {
    const v = Storage.get(storageKey)
    if (typeof v === "boolean") return v
  } catch { }
  return defaultValue
}

/* =====================================================================
 * 模块分类 · Hook：偏好管理 + 切换提示
 *
 * 模块分类 · 背景
 * - 设置页工具栏按钮需要即时反映当前偏好
 * - 切换后给一个明确提示：下次打开设置页生效（避免误会“立即变成弹层/全屏”）
 *
 * 模块分类 · 目标
 * - useState 初始化从 Storage 读取
 * - toggleFullscreen：反转、写回 Storage、弹窗提示
 *
 * 模块分类 · 使用方式
 * - const { fullscreenPref, toggleFullscreen } = useFullscreenPref(key)
 *
 * 模块分类 · 日志与边界
 * - Dialog 可能不存在：忽略
 * ===================================================================== */

export function useFullscreenPref(storageKey: string) {
  const [fullscreenPref, setFullscreenPref] = useState<boolean>(() => readFullscreenPref(storageKey, true))

  const toggleFullscreen = async () => {
    const next = !fullscreenPref
    setFullscreenPref(next)

    try {
      Storage.set(storageKey, next)
    } catch { }

    try {
      await Dialog?.alert?.({
        title: "显示模式已更新",
        message: `已切换为「${next ? "页面（全屏）" : "弹层弹出"}」模式，下次打开设置时生效。`,
        buttonLabel: "好的",
      })
    } catch { }
  }

  return { fullscreenPref, toggleFullscreen }
}