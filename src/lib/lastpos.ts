// 这部分负责: 退出位置存取 —— 只存本机，不进云端

/**
 * 上次退出时的编辑位置：重开 App 时恢复到关闭前的章节/Part 与滚动位置。
 * 单独存 localStorage（不进云端同步）：滚动会频繁变化，进 state 会污染同步指纹。
 */
export interface LastPos {
  view: 'chapter' | 'merged'
  bookId: string | null
  chapterId: string | null
  comboId: string | null
  /** 光标在原文字符偏移 */
  caret: number
  /** textarea 滚动量 */
  scrollTop: number
}

const KEY = 'maoxie-writer:last-pos'

// ─────────────── ฅ(ΦωΦ)ฅ ───────────────

export function loadLastPos(): LastPos | null {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return null
    const p = JSON.parse(raw)
    if (!p || (p.view !== 'chapter' && p.view !== 'merged')) return null
    return {
      view: p.view,
      bookId: p.bookId ?? null,
      chapterId: p.chapterId ?? null,
      comboId: p.comboId ?? null,
      caret: typeof p.caret === 'number' ? p.caret : 0,
      scrollTop: typeof p.scrollTop === 'number' ? p.scrollTop : 0,
    }
  } catch {
    return null
  }
}

// ─────────────── (=`ω´=) ───────────────

export function saveLastPos(p: LastPos): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(p))
  } catch {
    // 存储满等：位置记忆失效但写作功能不受影响
  }
}
