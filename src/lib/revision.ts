// 这部分负责: 修订 —— 按字数均分部分、段落归属取舍、进度判定

import type { RevisionState } from '@/types'
import { countChars } from './wordcount'

/** 段落：文本 + 在全文中的起始偏移 */
export interface Para {
  text: string
  start: number
}

/**
 * 把正文按行切成段落（空行不算修订单位，直接跳过）。
 * start 为段首在全文中的字符偏移。
 */
export function splitParas(text: string): Para[] {
  const out: Para[] = []
  let start = 0
  for (const line of text.split('\n')) {
    if (line.trim() !== '') out.push({ text: line, start })
    start += line.length + 1
  }
  return out
}

/** FNV-1a 32 位哈希，把一段文本压成短键（内容一变键即变） */
export function paraHash(s: string): string {
  let h = 0x811c9dc5
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return (h >>> 0).toString(36)
}

/** offset 落在哪个段落里，不在任何段落（空行上）返回 -1 */
export function paraIndexAtOffset(paras: Para[], offset: number): number {
  for (let i = paras.length - 1; i >= 0; i--) {
    if (offset >= paras[i].start) return i
  }
  return -1
}

/** 修订部分：整段整段归属，不倒 partial */
export interface RevPart {
  index: number
  /** 该部分包含的段落（全文段落下标范围） */
  paras: Para[]
  /** 该部分第一个字的偏移 */
  start: number
  /** 该部分末尾（最后一个字之后）的偏移 */
  end: number
  /** 该部分的字数（按 countChars 口径） */
  chars: number
}

/**
 * 按字数把正文均分成 n 个部分。
 * 分割点落在某段中间时：该段“前一半字数”归前一部分、“后一半”归后一部分，
 * 哪边分到的字数多，整个段落就归哪边（相等归前）。
 * 每部分至少一个段落；n 超过段落数时按段落数收拢。
 */
export function splitIntoParts(text: string, n: number): RevPart[] {
  const paras = splitParas(text)
  if (!paras.length || n < 2) {
    return paras.length
      ? [
          {
            index: 0,
            paras,
            start: paras[0].start,
            end: paras[paras.length - 1].start + paras[paras.length - 1].text.length,
            chars: paras.reduce((s, p) => s + countChars(p.text), 0),
          },
        ]
      : []
  }
  n = Math.min(n, paras.length)
  const w = paras.map((p) => countChars(p.text))
  const total = w.reduce((a, b) => a + b, 0)

  // 全部零权重（极端情况）：按段落数均分
  if (total <= 0) {
    const out: RevPart[] = []
    const per = Math.ceil(paras.length / n)
    for (let k = 0; k < n; k++) {
      const slice = paras.slice(k * per, k === n - 1 ? paras.length : (k + 1) * per)
      if (!slice.length) continue
      out.push({
        index: out.length,
        paras: slice,
        start: slice[0].start,
        end: slice[slice.length - 1].start + slice[slice.length - 1].text.length,
        chars: 0,
      })
    }
    return out
  }

  const parts: RevPart[] = []
  let startIdx = 0
  let j = 0
  let cum = 0 // 已归属前面部分的累计字数
  for (let k = 1; k <= n; k++) {
    const target = (total * k) / n
    let boundary: number
    if (k === n) {
      boundary = paras.length
    } else {
      while (j < paras.length && cum + w[j] < target) {
        cum += w[j]
        j++
      }
      if (j >= paras.length) {
        boundary = paras.length
      } else {
        const before = target - cum // 本部分在这段里能分到的字数
        const after = w[j] - before // 下一部分能分到的字数
        if (before >= after) {
          boundary = j + 1 // 这段归本部分
          cum += w[j]
          j++
        } else {
          boundary = j // 这段归下一部分
        }
        if (boundary <= startIdx) boundary = startIdx + 1 // 保证每部分至少一段
        if (boundary === startIdx + 1 && j === startIdx) {
          cum += w[j] // 保底并入后，j 也要跟着走
          j++
        }
      }
    }
    const slice = paras.slice(startIdx, boundary)
    if (slice.length) {
      parts.push({
        index: parts.length,
        paras: slice,
        start: slice[0].start,
        end: slice[slice.length - 1].start + slice[slice.length - 1].text.length,
        chars: slice.reduce((s, p) => s + countChars(p.text), 0),
      })
    }
    startIdx = boundary
  }
  return parts
}

/** offset 落在哪个部分里 */
export function partAtOffset(parts: RevPart[], offset: number): RevPart | null {
  for (const pt of parts) {
    if (offset >= pt.start && offset <= pt.end) return pt
  }
  return parts.length ? parts[parts.length - 1] : null
}

/** 部分内容的哈希（确认完成时存下来，内容一变即失效） */
export function partHash(text: string, part: RevPart): string {
  return paraHash(text.slice(part.start, part.end))
}

/** 当前文本 + 修订状态 → 各部分与完成集合（自动忽略失效的确认） */
export function revisionParts(text: string, rev: RevisionState | null | undefined) {
  const parts = splitIntoParts(text, rev?.n ?? 0)
  const doneSet = new Set<number>()
  for (const d of rev?.done ?? []) {
    const pt = parts[d.i]
    if (pt && partHash(text, pt) === d.h) doneSet.add(d.i)
  }
  const lastPart = rev?.last ? (parts[rev.last.i] ?? null) : null
  return { parts, doneSet, lastPart, total: parts.length, doneCount: doneSet.size }
}

/** 部分行的展示状态 */
export type RevRowState = 'done' | 'editing' | 'todo'

// ─────────────── (=ΦωΦ=) ───────────────

export function revRowState(i: number, lastI: number | null, doneSet: Set<number>): RevRowState {
  if (doneSet.has(i)) return 'done'
  if (lastI === i) return 'editing'
  return 'todo'
}

/**
 * 在文本预览里插入“光标”符号：把 p 处前后的文字切开，中间放闪烁条。
 * 超长时截取该位置附近的窗口。
 */
export function previewWithCaret(text: string, p: number, width = 26): { before: string; after: string } {
  const pos = Math.max(0, Math.min(p, text.length))
  let before = text.slice(0, pos)
  let after = text.slice(pos)
  if (before.length + after.length > width) {
    const half = Math.floor(width / 2)
    const s = Math.max(0, Math.min(pos - half, text.length - width))
    before = (s > 0 ? '…' : '') + text.slice(s, pos)
    after = text.slice(pos, s + width) + (s + width < text.length ? '…' : '')
  }
  return { before, after }
}
