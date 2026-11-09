// 这部分负责: 拼稿 —— 多章合成 Part 文稿、编辑差异回写到各章

import type { Chapter } from '@/types'

/**
 * 把多个章节拼成「一 P」的完整文稿。
 * 章节之间用一个空行分隔。
 */
export function buildMerged(chapters: Chapter[]): string {
  return chapters.map((c) => c.content).join('\n\n')
}

/** 行级差异操作 */
export interface LineOp {
  type: 'del' | 'ins'
  /** del: 删除 old 文本中 [oldStart, oldStart+count) 的行；ins: 在 oldStart 处插入 */
  oldStart: number
  count: number
  lines: string[] // ins 时为新行内容
}

/**
 * 计算两行数组之间的行级差异（先剥掉公共前后缀，中间用 LCS）。
 * 返回按 old 坐标升序的操作列表。
 */
export function diffLines(oldLines: string[], newLines: string[]): LineOp[] {
  // 公共前缀
  let pre = 0
  const maxPre = Math.min(oldLines.length, newLines.length)
  while (pre < maxPre && oldLines[pre] === newLines[pre]) pre++
  // 公共后缀
  let suf = 0
  while (
    suf < Math.min(oldLines.length - pre, newLines.length - pre) &&
    oldLines[oldLines.length - 1 - suf] === newLines[newLines.length - 1 - suf]
  ) {
    suf++
  }
  const a = oldLines.slice(pre, oldLines.length - suf)
  const b = newLines.slice(pre, newLines.length - suf)

  // 中间差异过大时退化为整体替换，避免 O(n*m) 卡死
  if (a.length * b.length > 4_000_000) {
    const ops: LineOp[] = []
    if (a.length) ops.push({ type: 'del', oldStart: pre, count: a.length, lines: [] })
    if (b.length) ops.push({ type: 'ins', oldStart: pre, count: 0, lines: b })
    return ops
  }

  // LCS 动态规划
  const n = a.length
  const m = b.length
  const dp: Uint32Array[] = Array.from({ length: n + 1 }, () => new Uint32Array(m + 1))
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1])
    }
  }
  const ops: LineOp[] = []
  let i = 0
  let j = 0
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      i++
      j++
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      ops.push({ type: 'del', oldStart: pre + i, count: 1, lines: [] })
      i++
    } else {
      ops.push({ type: 'ins', oldStart: pre + i, count: 0, lines: [b[j]] })
      j++
    }
  }
  while (i < n) {
    ops.push({ type: 'del', oldStart: pre + i, count: 1, lines: [] })
    i++
  }
  while (j < m) {
    ops.push({ type: 'ins', oldStart: pre + n, count: 0, lines: [b[j]] })
    j++
  }
  return mergeAdjacent(ops)
}

/** 相邻的同位置 del+ins 合并为一次替换，减少回写次数 */
function mergeAdjacent(ops: LineOp[]): LineOp[] {
  const out: LineOp[] = []
  for (const op of ops) {
    const last = out[out.length - 1]
    if (op.type === 'ins' && last && last.type === 'del' && last.oldStart + last.count === op.oldStart) {
      last.lines = op.lines
      continue
    }
    if (op.type === 'del' && last && last.type === 'ins' && last.oldStart === op.oldStart) {
      out[out.length - 1] = { type: 'del', oldStart: op.oldStart, count: op.count, lines: last.lines }
      continue
    }
    out.push(op)
  }
  return out
}

interface ChapterSpan {
  start: number // 章节第一行在 merged 行数组中的下标
  end: number // 最后一行下标（含）
}

function computeSpans(chapterLines: string[][]): ChapterSpan[] {
  const spans: ChapterSpan[] = []
  let offset = 0
  for (const lines of chapterLines) {
    spans.push({ start: offset, end: offset + lines.length - 1 })
    offset += lines.length + 1 // +1 为章节间的空行分隔
  }
  return spans
}

/** 拼章时忽略完全空白内容的章节（占位空章不占 P 的篇幅） */
export function effectiveChapters(chapters: Chapter[]): Chapter[] {
  return chapters.filter((c) => c.content.trim() !== '')
}

/**
 * 核心功能：把「一 P」合并文稿的编辑写回各章节。
 * @param chapters  原章节（顺序即拼章顺序，空白章节会被忽略）
 * @param oldMerged 修改前的合并文稿
 * @param newMerged 修改后的合并文稿
 * @returns 写回编辑后的新章节数组（不修改原数组）
 */
export function syncMergedEdit(
  chapters: Chapter[],
  oldMerged: string,
  newMerged: string
): Chapter[] {
  const eff = effectiveChapters(chapters)
  if (oldMerged === newMerged) return eff
  const chapterLines = eff.map((c) => c.content.split('\n'))
  const oldLineCount = oldMerged ? oldMerged.split('\n').length : 0
  const spans = computeSpans(chapterLines)
  const ops = diffLines(oldMerged ? oldMerged.split('\n') : [], newMerged ? newMerged.split('\n') : [])
  if (!ops.length) return chapters

  const result = eff.map((c, i) => ({ ...c, content: chapterLines[i].join('\n') }))
  // 从后往前应用，保证前面的旧坐标仍然有效
  // 注意：mergeAdjacent 可能把 del 和 ins 合并成一个带 lines 的 del（即“替换”）
  for (let k = ops.length - 1; k >= 0; k--) {
    const op = ops[k]
    if (op.type === 'del') {
      applyDelete(result, spans, op.oldStart, op.count)
      if (op.lines.length) applyInsert(result, spans, op.oldStart, op.lines, oldLineCount)
    } else {
      applyInsert(result, spans, op.oldStart, op.lines, oldLineCount)
    }
  }
  const now = Date.now()
  return result.map((c) => ({ ...c, updatedAt: now }))
}

/** 找到包含 merged 行下标 line 的章节；分隔空行归属前一章 */
function chapterAtLine(spans: ChapterSpan[], line: number): number {
  for (let i = 0; i < spans.length; i++) {
    if (line <= spans[i].end) return i
  }
  return spans.length - 1
}

function applyDelete(chapters: Chapter[], spans: ChapterSpan[], start: number, count: number) {
  if (!chapters.length) return
  const end = start + count - 1
  for (let i = 0; i < chapters.length; i++) {
    const sp = spans[i]
    if (end < sp.start || start > sp.end) continue
    const localStart = Math.max(0, start - sp.start)
    const localEnd = Math.min(sp.end - sp.start + 1, end - sp.start + 1)
    const lines = chapters[i].content ? chapters[i].content.split('\n') : []
    lines.splice(localStart, localEnd - localStart)
    chapters[i].content = lines.join('\n')
  }
}

function applyInsert(chapters: Chapter[], spans: ChapterSpan[], at: number, lines: string[], oldLineCount: number) {
  if (!chapters.length) return
  let idx: number
  if (at >= oldLineCount) {
    // 追加到最后一章末尾
    idx = chapters.length - 1
  } else {
    // 插入点在第 at 行之前：归属包含第 at-1 行的章节
    //（章节间分隔空行归属前一章，因此在 A 末尾回车不会跑进 B）
    idx = chapterAtLine(spans, Math.max(0, at - 1))
  }
  const sp = spans[idx]
  const localAt = Math.max(0, at - sp.start)
  const cur = chapters[idx].content ? chapters[idx].content.split('\n') : []
  cur.splice(localAt, 0, ...lines)
  chapters[idx].content = cur.join('\n')
}

/** 根据光标位置找到当前处于合并文稿中哪一章 */
export function chapterIndexAtCursor(chapters: Chapter[], cursor: number): number {
  const text = buildMerged(chapters)
  if (cursor >= text.length) return chapters.length - 1
  let offset = 0
  for (let i = 0; i < chapters.length; i++) {
    offset += chapters[i].content.length
    if (cursor <= offset) return i
    offset += 2 // \n\n 分隔
  }
  return chapters.length - 1
}
