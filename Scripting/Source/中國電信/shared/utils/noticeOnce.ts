// shared/utils/noticeOnce.ts

import { safeGetBoolean, safeSet } from "./storage"

declare const Dialog: any

export type NoticeOnceOptions = {
  scopeKey: string
  noticeId: string
  tag?: string

  title: string
  message: string
  buttonLabel?: string

  force?: boolean
}

export function noticeOnceStorageKey(scopeKey: string, noticeId: string, tag?: string) {
  const suffix = tag ? `${tag}-${noticeId}` : noticeId
  return `${scopeKey}:ui:noticeShown:${suffix}`
}

export async function showNoticeOnce(opts: NoticeOnceOptions) {
  const key = noticeOnceStorageKey(opts.scopeKey, opts.noticeId, opts.tag)
  const shown = safeGetBoolean(key, false)
  if (!opts.force && shown) return

  safeSet(key, true)

  await Dialog?.alert?.({
    title: opts.title,
    message: opts.message,
    buttonLabel: opts.buttonLabel ?? "知道了",
  })
}

export function resetNoticeOnce(scopeKey: string, noticeId: string, tag?: string) {
  safeSet(noticeOnceStorageKey(scopeKey, noticeId, tag), false)
}