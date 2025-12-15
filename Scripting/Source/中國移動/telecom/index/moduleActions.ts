// telecom/index/moduleActions.ts
import type { ModuleAction } from "./moduleSection"

declare const Safari: any

export type ModuleExtra = {
  title: string
  url: string
  systemImage?: string
  foregroundStyle?: any
  hidden?: boolean
}

export type ModuleLinks = {
  // BoxJS
  boxjsSubUrl: string

  // 资源 URL
  surgeModuleUrl: string
  loonPluginUrl: string
  qxRewriteUrl: string

  // ✅ 额外跳转统一走数组（可扩展）
  extras?: ModuleExtra[]
}

export type ModuleMeta = {
  // egern 的 name（会显示在新建模块页）
  egernName: string
}

function open(url: string) {
  return Safari.openURL(url)
}

function enc(u: string) {
  return encodeURIComponent(u)
}

export function createModuleHandles(meta: ModuleMeta, links: ModuleLinks) {
  const handleOpenBoxJsSub = async () => open(links.boxjsSubUrl)

  const handleInstallToSurge = async () => {
    await open(`surge:///install-module?url=${enc(links.surgeModuleUrl)}`)
  }

  const handleInstallToEgern = async () => {
    const name = enc(meta.egernName)
    await open(`egern:/modules/new?name=${name}&url=${enc(links.surgeModuleUrl)}`)
  }

  const handleInstallToLoon = async () => {
    await open(`loon://import?plugin=${enc(links.loonPluginUrl)}`)
  }

  const handleInstallToQx = async () => {
    await open(
      `quantumult-x:///update-configuration?remote-resource=${enc(links.qxRewriteUrl)}`,
    )
  }

  const openExtra = async (url: string) => open(url)

  return {
    handleOpenBoxJsSub,
    handleInstallToSurge,
    handleInstallToEgern,
    handleInstallToLoon,
    handleInstallToQx,
    openExtra,
  }
}

export function createModuleActions(
  handles: ReturnType<typeof createModuleHandles>,
  links: ModuleLinks,
): ModuleAction[] {
  const actions: ModuleAction[] = [
    { title: "添加 BoxJS 订阅", systemImage: "shippingbox", action: handles.handleOpenBoxJsSub },
    { title: "安装 Surge 模块", systemImage: "bolt.fill", action: handles.handleInstallToSurge },
    { title: "安装 Egern 模块", systemImage: "tornado", action: handles.handleInstallToEgern },
    { title: "安装 Loon 插件", systemImage: "puzzlepiece.extension", action: handles.handleInstallToLoon },
    { title: "安装 Quantumult X 重写", systemImage: "doc.text", action: handles.handleInstallToQx },
  ]

  if (links.extras?.length) {
    for (const item of links.extras) {
      if (!item || item.hidden) continue
      if (!item.title || !item.url) continue
      actions.push({
        title: item.title,
        systemImage: item.systemImage ?? "link",
        foregroundStyle: item.foregroundStyle ?? "secondaryLabel",
        action: () => handles.openExtra(item.url),
      })
    }
  }

  return actions
}