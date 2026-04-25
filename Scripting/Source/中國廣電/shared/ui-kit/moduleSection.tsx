// shared/ui-kit/moduleSection.tsx
import { Section, Text, Button, useState, DisclosureGroup } from "scripting"

declare const Storage: any

export type ModuleAction = {
  title: string
  action: () => void | Promise<void>

  // 可选：左侧 SF Symbol
  systemImage?: string

  // 可选：弱化显示（比如“相关仓库/说明”这种）
  foregroundStyle?: any

  // 可选：条件隐藏
  hidden?: boolean
}

export type ModuleSectionProps = {
  headerTitle?: string
  footerLines?: string[]

  collapsible?: boolean
  collapseStorageKey?: string
  defaultCollapsed?: boolean

  // ✅ actions 配置驱动
  actions: ModuleAction[]
}

function readBool(key: string, fallback: boolean): boolean {
  try {
    const v = Storage?.get?.(key)
    if (typeof v === "boolean") return v
  } catch { }
  return fallback
}

function writeBool(key: string, value: boolean) {
  try {
    Storage?.set?.(key, value)
  } catch { }
}

export function ModuleSection(props: ModuleSectionProps) {
  const {
    headerTitle = "组件模块",
    footerLines = [],

    collapsible = true,
    collapseStorageKey = "moduleSectionCollapsed",
    defaultCollapsed = true,

    actions,
  } = props

  const footerText = footerLines.filter(Boolean).join("\n")
  const visibleActions = (actions ?? []).filter((a) => !a?.hidden)

  // Storage 里存的是 collapsed（true=收起）
  const [expanded, setExpanded] = useState(() => {
    if (!collapsible) return true
    const collapsed = readBool(collapseStorageKey, defaultCollapsed)
    return !collapsed
  })

  function persistExpanded(nextExpanded: boolean) {
    // ✅ Storage 存 collapsed
    writeBool(collapseStorageKey, !nextExpanded)
  }

  const handleDisclosureChanged = (nextExpanded: boolean) => {
    if (!collapsible) return
    setExpanded(nextExpanded)
    persistExpanded(nextExpanded)
  }

  const toggleTitle = expanded ? "收起组件模块" : "展开组件模块"

  return (
    <Section
      header={
        <Text font="body" fontWeight="semibold">
          {headerTitle}
        </Text>
      }
      footer={
        footerText ? (
          <Text font="caption2" foregroundStyle="secondaryLabel">
            {footerText}
          </Text>
        ) : undefined
      }
    >

      {collapsible ? (
        <DisclosureGroup
          title={toggleTitle}
          isExpanded={expanded}
          onChanged={handleDisclosureChanged}
        >
          {visibleActions.map((item, idx) => (
            <Button
              key={`${idx}-${item.title}`}
              title={item.title}
              systemImage={item.systemImage}
              foregroundStyle={item.foregroundStyle}
              action={item.action}
            />
          ))}
        </DisclosureGroup>
      ) : (
        visibleActions.map((item, idx) => (
          <Button
            key={`${idx}-${item.title}`}
            title={item.title}
            systemImage={item.systemImage}
            foregroundStyle={item.foregroundStyle}
            action={item.action}
          />
        ))
      )}
    </Section>
  )
}