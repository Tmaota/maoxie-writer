// 这部分负责: 修改记录 —— 前后文差异计算、生成记录、一键回退

import type { EditRecord } from '@/types'
import { diffLines } from './merge'
import { uid } from './store'

const MAX_LEN = 60
/** 快照超过该长度就不存（避免超大章撑爆本地存储），此情况下「回退」不可用 */
const MAX_SNAP = 200_000

function clip(s: string): string {
  const t = s.replace(/\s+/g, ' ').trim()
  return t.length > MAX_LEN ? t.slice(0, MAX_LEN) + '…' : t
}

/**
 * 比较章节修改前后的内容，生成一条人类可读的修改记录。
 * 取第一处差异：before → after。
 */
export function buildEditRecord(
  base: Omit<EditRecord, 'id' | 'time' | 'kind' | 'before' | 'after' | 'pos'>,
  oldContent: string,
  newContent: string
): EditRecord | null {
  if (oldContent === newContent) return null
  const oldLines = oldContent ? oldContent.split('\n') : []
  const newLines = newContent ? newContent.split('\n') : []
  const ops = diffLines(oldLines, newLines)
  if (!ops.length) return null
  // 找到第一个有实际变化的 op（ins 或 带 lines 的 del）
  const op = ops.find((o) => (o.type === 'del' && o.lines.length > 0) || (o.type === 'ins' && o.lines.length > 0))
  // 修改位置的字符偏移 = 变化点之前公共前缀的长度（新旧内容前缀一致）
  const prefixLines = oldLines.slice(0, op ? op.oldStart : ops[0].oldStart)
  const pos = prefixLines.join('\n').length + (prefixLines.length > 0 ? 1 : 0)
  let kind: EditRecord['kind']
  let before = ''
  let after = ''
  if (!op) {
    kind = 'delete'
    const d = ops.find((o) => o.type === 'del')
    if (!d) return null
    before = clip(oldLines.slice(d.oldStart, d.oldStart + d.count).join(' '))
  } else if (op.type === 'ins') {
    kind = 'insert'
    after = clip(op.lines.join(' '))
    before = clip(oldLines[op.oldStart - 1] ?? '')
  } else {
    kind = 'replace'
    before = clip(oldLines.slice(op.oldStart, op.oldStart + op.count).join(' '))
    after = clip(op.lines.join(' '))
  }
  return {
    ...base,
    id: uid(),
    time: Date.now(),
    kind,
    before,
    after,
    pos,
    snap: oldContent.length <= MAX_SNAP ? oldContent : undefined,
  }
}

// ─────────────── (=^･ω･^=) ───────────────

export const KIND_LABEL: Record<EditRecord['kind'], string> = {
  insert: '新增',
  delete: '删除',
  replace: '改写',
}

// ─────────────── ┏(ΦωΦ)┛ ───────────────

export function timeAgo(ts: number): string {
  const diff = Date.now() - ts
  const m = Math.floor(diff / 60000)
  if (m < 1) return '刚刚'
  if (m < 60) return `${m} 分钟前`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h} 小时前`
  const d = Math.floor(h / 24)
  if (d < 30) return `${d} 天前`
  return new Date(ts).toLocaleDateString('zh-CN')
}
