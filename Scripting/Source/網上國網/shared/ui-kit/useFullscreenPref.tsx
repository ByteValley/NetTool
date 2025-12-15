// shared/ui-kit/useFullscreenPref.tsx
import { useState } from "scripting"

declare const Storage: any
declare const Dialog: any

/**
 * 三网通用：管理「页面 / 弹层」偏好 + 切换时弹窗提示
 *
 * 用法：
 *   const { fullscreenPref, toggleFullscreen } = useFullscreenPref("chinaUnicomSettingsFullscreen")
 *   ...
 *   <Button
 *     title={fullscreenPref ? "页面" : "弹层"}
 *     systemImage={fullscreenPref ? "rectangle.arrowtriangle.2.outward" : "rectangle"}
 *     action={toggleFullscreen}
 *   />
 */
export function useFullscreenPref(storageKey: string) {
  const [fullscreenPref, setFullscreenPref] = useState<boolean>(() => {
    try {
      const v = Storage.get(storageKey)
      if (typeof v === "boolean") return v
    } catch { }
    return true
  })

  const toggleFullscreen = async () => {
    const next = !fullscreenPref
    setFullscreenPref(next)
    try {
      Storage.set(storageKey, next)
    } catch { }

    try {
      await Dialog.alert({
        title: "显示模式已更新",
        message: `已切换为「${next ? "页面（全屏）" : "弹层弹出"}」模式，下次打开设置时生效。`,
        buttonLabel: "好的",
      })
    } catch {
      // 有些宿主可能不支持 Dialog，这里忽略
    }
  }

  return { fullscreenPref, toggleFullscreen }
}