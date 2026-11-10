// 这部分负责: 全局数据类型 —— 书/章节/组合/词组/修改记录/修订状态长什么样都在这

export type ChapterStatus = 'draft' | 'published' | 'revise'

/** 段落修订状态：把一章/一个 Part 按字数均分成 n 个部分，逐个确认修改 */
export interface RevisionState {
  /** 分成的部分数 */
  n: number
  /** 已手动确认完成的部分：序号 + 确认时该部分内容的哈希（内容一变即失效，自动回到待修改） */
  done: { i: number; h: string }[]
  /** 最近修改：部分序号 + 该部分内的字符偏移（“光标改到这里”） */
  last?: { i: number; p: number } | null
}

// ─────────────── (=ΦωΦ=) ───────────────

export interface Chapter {
  id: string
  title: string
  content: string
  status: ChapterStatus
  createdAt: number
  updatedAt: number
  /** 本章目标字数（写作目标功能，可空） */
  targetChars?: number | null
  /** 段落修订（修订模式，可空） */
  revision?: RevisionState | null
}

/** 组合：把书里自己选的几章合成一篇文稿（对应发布用的“一个 Part”） */
export interface Combo {
  id: string
  name: string
  chapterIds: string[]
  createdAt: number
  /** 整个 Part 的段落修订（按 Part 文稿均分，可空） */
  revision?: RevisionState | null
}

/** 一本书 = 一个分类，章节/组合/大纲/参考都归在书下 */
export interface Book {
  id: string
  name: string
  chapters: Chapter[]
  combos: Combo[]
  outline: string
  reference: string
  /** 完本目标字数（写作目标功能，可空） */
  goalTotal?: number | null
  /** 预计完本日期 YYYY-MM-DD（用于倒推每天该写多少，可空） */
  goalDate?: string | null
  /** 绑定的小说根文件夹（桌面端 AI 协作用：Claude 在此读写，可空） */
  dir?: string | null
}

// ─────────────── ฅ(ΦωΦ)ฅ ───────────────

export interface Snippet {
  id: string
  name: string
  trigger: string
  text: string
  hotkey: number
}

/** 一次修改的记录：改了哪本书哪一章、改了什么、在什么位置 */
export interface EditRecord {
  id: string
  time: number
  bookId: string
  bookName: string
  chapterId: string
  chapterTitle: string
  mode: 'chapter' | 'merged'
  /** 组合模式下产生的记录属于哪个 Part；章节模式产生的记录为 null */
  comboId: string | null
  comboName: string | null
  kind: 'insert' | 'delete' | 'replace'
  before: string
  after: string
  /** 修改位置在章节正文中的字符偏移（用于跳转定位） */
  pos: number
  /** 修改前该章的完整内容快照：「回退」功能恢复用（大章节可能缺省） */
  snap?: string
}

// ─────────────── (=`ω´=) ───────────────

export type ViewMode = 'chapter' | 'merged' | 'reading'

// ─────────────── ヾ(ΦωΦ) ───────────────

export interface ProjectState {
  books: Book[]
  /** null = 书架层（未进入任何书） */
  activeBookId: string | null
  snippets: Snippet[]
  view: ViewMode
  activeChapterId: string | null
  activeComboId: string | null
  recentEdits: EditRecord[]
}

// ─────────────── (=①ω①=) ───────────────

export const STATUS_META: Record<ChapterStatus, { label: string; hint: string }> = {
  draft: { label: '草稿', hint: '还没定稿的章节' },
  published: { label: '已发布', hint: '已经发出去的成稿' },
  revise: { label: '待修改', hint: '需要回头改的章节' },
}
