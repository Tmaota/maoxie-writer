// 这部分负责: 自定义词组 —— 触发词匹配、在光标处插入

import type { Snippet } from '@/types'

/** 光标前的文本若以某个触发词结尾，返回该词组（取最长触发词） */
export function findTrigger(beforeCursor: string, snippets: Snippet[]): Snippet | null {
  let best: Snippet | null = null
  for (const s of snippets) {
    if (!s.trigger) continue
    if (beforeCursor.endsWith(s.trigger)) {
      if (!best || s.trigger.length > best.trigger.length) best = s
    }
  }
  return best
}

/**
 * 在 textarea 的光标处插入文本，返回新值与新光标位置。
 */
export function insertAtCursor(
  value: string,
  selStart: number,
  selEnd: number,
  insert: string
): { value: string; cursor: number } {
  const next = value.slice(0, selStart) + insert + value.slice(selEnd)
  return { value: next, cursor: selStart + insert.length }
}
