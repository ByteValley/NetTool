// shared/ui-kit/moduleSection.tsx

import { Section, Text, Button, useState } from "scripting"

// ✅ 复用 shared/utils/storage 的安全读写
import { safeGetBoolean, safeSet } from "../utils/storage"

export type ModuleSectionProps = {
  footerLines: string[]

  collapsible?: boolean
  collapseStorageKey?: string
  defaultCollapsed?: boolean

  onOpenBoxJsSub?: () => void | Promise<void>
  boxJsTitle?: string

  onInstallSurge?: () => void | Promise<void>
  surgeTitle?: string

  onInstallEgern?: () => void | Promise<void>
  egernTitle?: string

  onInstallLoon?: () => void | Promise<void>
  loonTitle?: string

  onInstallQx?: () => void | Promise<void>
  qxTitle?: string

  onOpenExtra?: () => void | Promise<void>
  extraTitle?: string

  onOpenExtra1?: () => void | Promise<void>
  extraTitle1?: string

  onOpenExtra2?: () => void | Promise<void>
  extraTitle2?: string
}

export function ModuleSection(props: ModuleSectionProps) {
  const {
    footerLines,

    collapsible = true,
    collapseStorageKey = "telecomModuleSectionCollapsed",
    defaultCollapsed = true,

    onOpenBoxJsSub,
    boxJsTitle = "📦 添加 BoxJS 订阅",

    onInstallSurge,
    surgeTitle = "⚡ 安装 Surge 模块",

    onInstallEgern,
    egernTitle = "🌀 安装 Egern 模块",

    onInstallLoon,
    loonTitle = "🧩 安装 Loon 插件",

    onInstallQx,
    qxTitle = "🧾 安装 Quantumult X 重写",

    onOpenExtra,
    extraTitle = "📂 相关脚本与说明",

    onOpenExtra1,
    extraTitle1 = "📂 相关脚本与说明（1）",

    onOpenExtra2,
    extraTitle2 = "📂 相关脚本与说明（2）",
  } = props

  const footerText = footerLines.join("\n")

  const [expanded, setExpanded] = useState(() => {
    if (!collapsible) return true
    // defaultCollapsed=true => expanded=false
    const collapsed = safeGetBoolean(collapseStorageKey, defaultCollapsed)
    return !collapsed
  })

  const toggleExpanded = async () => {
    if (!collapsible) return
    const nextExpanded = !expanded
    setExpanded(nextExpanded) // ✅ 立刻生效
    safeSet(collapseStorageKey, !nextExpanded) // ✅ 存“collapsed”
  }

  return (
    <Section
      header={
        <Text font="body" fontWeight="semibold">
          组件模块
        </Text>
      }
      footer={
        <Text font="caption2" foregroundStyle="secondaryLabel">
          {footerText}
        </Text>
      }
    >
      {collapsible ? (
        <Button
          title={expanded ? "收起组件模块" : "展开组件模块"}
          systemImage={expanded ? "chevron.down" : "chevron.right"}
          foregroundStyle="secondaryLabel"
          action={toggleExpanded}
        />
      ) : null}

      {expanded ? (
        <>
          {onOpenBoxJsSub ? <Button title={boxJsTitle} action={onOpenBoxJsSub} /> : null}
          {onInstallSurge ? <Button title={surgeTitle} action={onInstallSurge} /> : null}
          {onInstallEgern ? <Button title={egernTitle} action={onInstallEgern} /> : null}
          {onInstallLoon ? <Button title={loonTitle} action={onInstallLoon} /> : null}
          {onInstallQx ? <Button title={qxTitle} action={onInstallQx} /> : null}
          {onOpenExtra ? <Button title={extraTitle} action={onOpenExtra} /> : null}
          {onOpenExtra1 ? <Button title={extraTitle1} action={onOpenExtra1} /> : null}
          {onOpenExtra2 ? <Button title={extraTitle2} action={onOpenExtra2} /> : null}
        </>
      ) : null}
    </Section>
  )
}