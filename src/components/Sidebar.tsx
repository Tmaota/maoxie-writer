// 这部分负责: 左侧目录 —— 书架→书→章节/Part 导航、新建重命名删除

import { useMemo, useRef, useState } from 'react'
import {
  Plus, ArrowUp, ArrowDown, Trash2, Pencil, Check, X, Library, ChevronLeft,
  ChevronRight, ChevronDown, BookOpenText, Layers, Link2, Link2Off, BookCopy, Target,
} from 'lucide-react'
import type { Book, ChapterStatus, Combo, ViewMode } from '@/types'
import { STATUS_META } from '@/types'
import { countChars, formatCount } from '@/lib/wordcount'
import { StatusIcon } from './StatusBadge'
import { ConfirmDialog } from './ConfirmDialog'
import { WritingStats } from './WritingStats'
import { GoalDialog } from './GoalDialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ScrollArea } from '@/components/ui/scroll-area'

/* ================= 书架层：大分类 = 书名 ================= */

interface ShelfProps {
  books: Book[]
  onEnterBook: (id: string) => void
  onAddBook: (name: string) => void
  onRenameBook: (id: string, name: string) => void
  onDeleteBook: (id: string) => void
  onSetBookGoal: (id: string, total: number | null, date: string | null) => void
}

function bookChars(book: Book) {
  return book.chapters.reduce((s, c) => s + countChars(c.content), 0)
}

function Shelf({ books, onEnterBook, onAddBook, onRenameBook, onDeleteBook, onSetBookGoal }: ShelfProps) {
  const [adding, setAdding] = useState(false)
  const [addName, setAddName] = useState('')
  const [renamingId, setRenamingId] = useState<string | null>(null)
  const [renameVal, setRenameVal] = useState('')
  const [deletingBook, setDeletingBook] = useState<Book | null>(null)
  const [goalBook, setGoalBook] = useState<Book | null>(null)

  const totalAll = useMemo(() => books.reduce((s, b) => s + bookChars(b), 0), [books])

  const submitAdd = () => {
    const n = addName.trim()
    if (n) onAddBook(n)
    setAddName('')
    setAdding(false)
  }

  return (
    <>
      <div className="space-y-2 border-b border-border/60 p-2.5">
        <h2 className="flex items-center gap-1.5 text-sm font-semibold">
          <Library className="h-4 w-4 text-amber-500" />
          书架
          <span className="text-xs font-normal text-muted-foreground">{books.length} 本</span>
        </h2>
        <WritingStats />
        {adding ? (
          <div className="flex items-center gap-1">
            <Input
              autoFocus
              value={addName}
              onChange={(e) => setAddName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') submitAdd()
                if (e.key === 'Escape') setAdding(false)
              }}
              placeholder="书名，回车创建"
              className="h-8 flex-1 text-xs"
            />
            <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={() => setAdding(false)}>
              <X className="h-3.5 w-3.5" />
            </Button>
          </div>
        ) : (
          <Button variant="outline" size="sm" className="h-8 w-full gap-1 text-xs" onClick={() => setAdding(true)}>
            <Plus className="h-3.5 w-3.5" />
            新建一本书
          </Button>
        )}
      </div>

      <ScrollArea className="flex-1">
        <ul className="space-y-1.5 p-2">
          {books.map((b) => (
            <li
              key={b.id}
              onClick={() => renamingId !== b.id && onEnterBook(b.id)}
              className={`group cursor-pointer rounded-md border px-2.5 py-2.5 transition-colors ${
                'border-transparent hover:border-amber-500/30 hover:bg-amber-500/5'
              }`}
            >
              {renamingId === b.id ? (
                <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                  <Input
                    autoFocus
                    value={renameVal}
                    onChange={(e) => setRenameVal(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        if (renameVal.trim()) onRenameBook(b.id, renameVal.trim())
                        setRenamingId(null)
                      }
                      if (e.key === 'Escape') setRenamingId(null)
                    }}
                    className="h-7 flex-1 text-xs"
                  />
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6 shrink-0"
                    onClick={() => {
                      if (renameVal.trim()) onRenameBook(b.id, renameVal.trim())
                      setRenamingId(null)
                    }}
                  >
                    <Check className="h-3.5 w-3.5" />
                  </Button>
                </div>
              ) : (
                <>
                  <div className="flex items-center gap-1.5">
                    <BookCopy className="h-4 w-4 shrink-0 text-amber-500" />
                    <span className="min-w-0 flex-1 truncate text-[13px] font-semibold">{b.name}</span>
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        setRenameVal(b.name)
                        setRenamingId(b.id)
                      }}
                      className="rounded p-0.5 text-muted-foreground transition-opacity hover:text-foreground lg:opacity-0 lg:group-hover:opacity-100"
                    >
                      <Pencil className="h-3 w-3" />
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        setGoalBook(b)
                      }}
                      className={`rounded p-0.5 transition-opacity hover:text-foreground lg:opacity-0 lg:group-hover:opacity-100 ${
                        b.goalTotal ? 'text-amber-500' : 'text-muted-foreground'
                      }`}
                      title="完本目标"
                    >
                      <Target className="h-3 w-3" />
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        setDeletingBook(b)
                      }}
                      className="rounded p-0.5 text-muted-foreground transition-opacity hover:text-destructive lg:opacity-0 lg:group-hover:opacity-100"
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </div>
                  <div className="mt-1 pl-5 text-[10px] text-muted-foreground">
                    {b.chapters.length} 章 · {b.combos.length} 个 Part · {formatCount(bookChars(b))} 字
                  </div>
                  {b.goalTotal ? (
                    <div className="mt-1 space-y-0.5 pl-5" onClick={(e) => e.stopPropagation()}>
                      <div className="h-1 w-full overflow-hidden rounded bg-muted">
                        <div
                          className="h-full rounded bg-amber-500"
                          style={{ width: `${Math.min(100, (bookChars(b) / b.goalTotal) * 100)}%` }}
                        />
                      </div>
                      <div className="text-[10px] text-muted-foreground">
                        {formatCount(bookChars(b))} / {formatCount(b.goalTotal)} 字
                        {b.goalDate &&
                          (() => {
                            const daysLeft = Math.ceil(
                              (new Date(b.goalDate + 'T00:00:00').getTime() - Date.now()) / 86400000,
                            )
                            if (daysLeft < 0) return <span className="text-destructive"> · 已超期</span>
                            const left = b.goalTotal - bookChars(b)
                            if (daysLeft === 0)
                              return <span> · 今天完本，还差 {formatCount(Math.max(0, left))} 字</span>
                            return (
                              <span>
                                {' '}
                                · 剩 {daysLeft} 天 · 每天约 {formatCount(Math.max(0, Math.ceil(left / daysLeft)))} 字
                              </span>
                            )
                          })()}
                      </div>
                    </div>
                  ) : null}
                </>
              )}
            </li>
          ))}
        </ul>
      </ScrollArea>

      <div className="border-t border-border/60 px-3 py-2 text-[11px] text-muted-foreground">
        全部作品共 <span className="font-medium text-foreground">{formatCount(totalAll)}</span> 字
      </div>

      <ConfirmDialog
        open={deletingBook !== null}
        onOpenChange={(o) => !o && setDeletingBook(null)}
        title={books.length <= 1 ? '这本书暂时不能删' : `删除《${deletingBook?.name}》？`}
        description={
          books.length <= 1
            ? '书架里至少保留一本书。要重新开始的话，可以进书后删掉所有章节，或用「清空全部数据」。'
            : '该书全部章节、Part、大纲、参考都会被删除，不可恢复。'
        }
        noticeOnly={books.length <= 1}
        onConfirm={() => {
          if (deletingBook) onDeleteBook(deletingBook.id)
          setDeletingBook(null)
        }}
      />

      <GoalDialog
        open={goalBook !== null}
        onOpenChange={(o) => !o && setGoalBook(null)}
        title={goalBook ? `《${goalBook.name}》完本目标` : ''}
        withDate
        initialTotal={goalBook?.goalTotal ?? null}
        initialDate={goalBook?.goalDate ?? null}
        onConfirm={(total, date) => {
          if (goalBook) onSetBookGoal(goalBook.id, total, date)
          setGoalBook(null)
        }}
      />
    </>
  )
}

/* ================= 进书层：返回条 + 章节/Part ================= */

function BookHeader({ book, onBack }: { book: Book; onBack: () => void }) {
  return (
    <div className="flex items-center gap-1 border-b border-border/60 px-2 py-1.5">
      <Button variant="ghost" size="sm" className="h-7 gap-1 px-2 text-xs text-muted-foreground" onClick={onBack}>
        <ChevronLeft className="h-3.5 w-3.5" />
        书架
      </Button>
      <span className="min-w-0 flex-1 truncate text-xs font-semibold">《{book.name}》</span>
    </div>
  )
}

const FILTERS: { key: 'all' | ChapterStatus; label: string }[] = [
  { key: 'all', label: '全部' },
  { key: 'draft', label: '草稿' },
  { key: 'published', label: '已发布' },
  { key: 'revise', label: '待修改' },
]

interface ChapterListProps {
  book: Book
  activeChapterId: string | null
  onSelect: (id: string) => void
  onAdd: (title: string) => void
  onDelete: (id: string) => void
  onMove: (id: string, dir: -1 | 1) => void
}

function ChapterList({ book, activeChapterId, onSelect, onAdd, onDelete, onMove }: ChapterListProps) {
  const [filter, setFilter] = useState<'all' | ChapterStatus>('all')
  const [newTitle, setNewTitle] = useState('')
  const [deletingCh, setDeletingCh] = useState<{ id: string; title: string } | null>(null)
  const chapters = book.chapters

  const visible = useMemo(
    () => chapters.filter((c) => filter === 'all' || c.status === filter),
    [chapters, filter]
  )
  const total = useMemo(() => chapters.reduce((s, c) => s + countChars(c.content), 0), [chapters])

  const add = () => {
    onAdd(newTitle.trim() || `第${chapters.length + 1}章`)
    setNewTitle('')
  }

  return (
    <>
      <div className="space-y-2 border-b border-border/60 p-2.5">
        <div className="flex gap-1">
          <Input
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && add()}
            placeholder="新章节标题，回车创建"
            className="h-8 text-xs"
          />
          <Button size="icon" className="h-8 w-8 shrink-0" onClick={add}>
            <Plus className="h-4 w-4" />
          </Button>
        </div>
        <div className="flex flex-wrap gap-1">
          {FILTERS.map((f) => (
            <button
              key={f.key}
              onClick={() => setFilter(f.key)}
              className={`rounded-full px-2 py-0.5 text-[11px] transition-colors ${
                filter === f.key
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-muted text-muted-foreground hover:bg-muted/70'
              }`}
            >
              {f.key === 'all' ? (
                f.label
              ) : (
                <span className="inline-flex items-center gap-1">
                  <StatusIcon status={f.key as ChapterStatus} className="h-3 w-3" />
                  {f.label}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      <ScrollArea className="flex-1">
        <ul className="space-y-1 p-2">
          {visible.map((c) => (
            <li
              key={c.id}
              onClick={() => onSelect(c.id)}
              className={`group cursor-pointer rounded-md border px-2 py-3 transition-colors lg:py-2 ${
                activeChapterId === c.id
                  ? 'border-amber-500/50 bg-amber-500/10'
                  : 'border-transparent hover:bg-muted/60'
              }`}
            >
              <div className="flex items-center gap-1.5">
                <StatusIcon status={c.status} />
                <span className="min-w-0 flex-1 truncate text-[13px] font-medium">{c.title}</span>
              </div>
              <div className="mt-1 flex items-center gap-1 pl-5 text-[10px] text-muted-foreground">
                <span>{formatCount(countChars(c.content))} 字</span>
                <span>·</span>
                <span>{STATUS_META[c.status].label}</span>
                <span className="flex-1" />
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    onMove(c.id, -1)
                  }}
                  className="rounded p-0.5 transition-opacity hover:bg-muted lg:opacity-0 lg:group-hover:opacity-100"
                >
                  <ArrowUp className="h-3 w-3" />
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    onMove(c.id, 1)
                  }}
                  className="rounded p-0.5 transition-opacity hover:bg-muted lg:opacity-0 lg:group-hover:opacity-100"
                >
                  <ArrowDown className="h-3 w-3" />
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    setDeletingCh({ id: c.id, title: c.title })
                  }}
                  className="rounded p-0.5 transition-opacity hover:bg-destructive/20 hover:text-destructive lg:opacity-0 lg:group-hover:opacity-100"
                >
                  <Trash2 className="h-3 w-3" />
                </button>
              </div>
            </li>
          ))}
          {visible.length === 0 && (
            <li className="px-3 py-8 text-center text-xs text-muted-foreground">该状态下暂无章节</li>
          )}
        </ul>
      </ScrollArea>

      <div className="border-t border-border/60 px-3 py-2 text-[11px] text-muted-foreground">
        《{book.name}》共 <span className="font-medium text-foreground">{formatCount(total)}</span> 字 ·{' '}
        {chapters.length} 章
      </div>

      <ConfirmDialog
        open={deletingCh !== null}
        onOpenChange={(o) => !o && setDeletingCh(null)}
        title={`删除章节「${deletingCh?.title}」？`}
        description="章节正文会被删除，不可恢复。如果这个章节已加入某个 Part，也会从那个 Part 里移除。"
        onConfirm={() => {
          if (deletingCh) onDelete(deletingCh.id)
          setDeletingCh(null)
        }}
      />
    </>
  )
}

interface ComboListProps {
  book: Book
  activeComboId: string | null
  onSelect: (id: string | null) => void
  /** 返回新 Part 的 id（用于创建后直接进入组成编辑） */
  onAdd: (name: string) => string
  onRename: (id: string, name: string) => void
  onDelete: (id: string) => void
  onToggleChapter: (comboId: string, chapterId: string) => void
}

/**
 * Part = 手风琴分类层：每个 Part 是一个分类行，列表可滚动。
 * 点 Part 名字：选中并在右侧打开它的文稿（不自动展开）；
 * 点行上的「展开」：它滚动到列表最顶并显示组成章节，平时只显示已组成的章节，
 * 点「编辑组成」才列出全书章节进行勾选，空 Part 创建后自动进入编辑。
 * 点「收起」：回到原来的位置。
 */
function ComboList({ book, activeComboId, onSelect, onAdd, onRename, onDelete, onToggleChapter }: ComboListProps) {
  const [newName, setNewName] = useState('')
  const [renamingId, setRenamingId] = useState<string | null>(null)
  const [renameVal, setRenameVal] = useState('')
  const [deletingCombo, setDeletingCombo] = useState<Combo | null>(null)
  /** 正在编辑组成的 Part */
  const [editingId, setEditingId] = useState<string | null>(null)
  /** 展开组成章节的 Part（与选中态解耦：点名字只打开文稿，点「展开」才看组成） */
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const rowRefs = useRef(new Map<string, HTMLDivElement>())
  const combos = book.combos

  const add = () => {
    const id = onAdd(newName.trim() || `Part${combos.length + 1}`)
    setNewName('')
    // 新建的 Part 是空的：自动展开并进入组成编辑，完整列出所有章节
    if (id) {
      setExpandedId(id)
      setEditingId(id)
    }
  }

  const comboChars = (combo: Combo) =>
    combo.chapterIds.reduce((s, id) => {
      const ch = book.chapters.find((c) => c.id === id)
      return s + (ch ? countChars(ch.content) : 0)
    }, 0)

  const scrollRow = (id: string, block: ScrollLogicalPosition) => {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        rowRefs.current.get(id)?.scrollIntoView({ block, behavior: 'smooth' })
      })
    })
  }

  /** 点名字：选中并在右侧打开 Part 文稿 */
  const select = (id: string) => {
    if (activeComboId !== id) onSelect(id)
    scrollRow(id, 'nearest')
  }

  /** 点「展开」：置顶展开 / 收起回原位 */
  const toggleExpand = (id: string) => {
    const expanding = expandedId !== id
    setExpandedId(expanding ? id : null)
    scrollRow(id, expanding ? 'start' : 'nearest')
  }

  return (
    <>
      <div className="space-y-2 border-b border-border/60 p-2.5">
        <div className="flex gap-1">
          <Input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && add()}
            placeholder="新 Part 名，如 Part2"
            className="h-8 text-xs"
          />
          <Button size="icon" className="h-8 w-8 shrink-0" onClick={add}>
            <Plus className="h-4 w-4" />
          </Button>
        </div>
        <p className="text-[11px] leading-4 text-muted-foreground">
          点 Part 名字打开它的文稿；点「展开」查看和编辑它由哪些章节组成。
        </p>
      </div>

      <div className="flex-1 overflow-y-auto">
        <div className="space-y-1 p-2">
          {combos.map((combo) => {
            const expanded = expandedId === combo.id
            return (
              <div
                key={combo.id}
                ref={(el) => {
                  if (el) rowRefs.current.set(combo.id, el)
                  else rowRefs.current.delete(combo.id)
                }}
                onClick={() => select(combo.id)}
                className={`group cursor-pointer rounded-md border px-2 py-3 transition-colors lg:py-2 ${
                  activeComboId === combo.id
                    ? 'border-amber-500/50 bg-amber-500/10'
                    : 'border-transparent hover:bg-muted/60'
                }`}
              >
                {renamingId === combo.id ? (
                  <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                    <Input
                      autoFocus
                      value={renameVal}
                      onChange={(e) => setRenameVal(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          if (renameVal.trim()) onRename(combo.id, renameVal.trim())
                          setRenamingId(null)
                        }
                        if (e.key === 'Escape') setRenamingId(null)
                      }}
                      className="h-7 flex-1 text-xs"
                    />
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6 shrink-0"
                      onClick={() => {
                        if (renameVal.trim()) onRename(combo.id, renameVal.trim())
                        setRenamingId(null)
                      }}
                    >
                      <Check className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                ) : (
                  <>
                    <div className="flex items-center gap-1.5">
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          toggleExpand(combo.id)
                        }}
                        title={expanded ? '收起组成章节' : '展开组成章节'}
                        className={`shrink-0 rounded p-0.5 transition-colors ${
                          expanded ? 'text-amber-400 hover:text-amber-300' : 'text-muted-foreground transition-opacity hover:text-foreground lg:opacity-0 lg:group-hover:opacity-100'
                        }`}
                      >
                        {expanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                      </button>
                      <Layers className="h-3.5 w-3.5 shrink-0 text-amber-500" />
                      <span className="min-w-0 flex-1 truncate text-[13px] font-medium">{combo.name}</span>
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          setRenameVal(combo.name)
                          setRenamingId(combo.id)
                        }}
                        className="rounded p-0.5 text-muted-foreground transition-opacity hover:text-foreground lg:opacity-0 lg:group-hover:opacity-100"
                      >
                        <Pencil className="h-3 w-3" />
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          setDeletingCombo(combo)
                        }}
                        className="rounded p-0.5 text-muted-foreground transition-opacity hover:text-destructive lg:opacity-0 lg:group-hover:opacity-100"
                      >
                        <Trash2 className="h-3 w-3" />
                      </button>
                    </div>
                    <div className="mt-0.5 flex items-center gap-1 pl-5 text-[10px] text-muted-foreground">
                      <span>{combo.chapterIds.length} 章 · {formatCount(comboChars(combo))} 字</span>
                      <span className="flex-1" />
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          toggleExpand(combo.id)
                        }}
                        className={expanded ? 'text-amber-400 hover:text-amber-300' : 'opacity-60 hover:text-foreground'}
                      >
                        {expanded ? '▾ 收起' : '▸ 展开组成'}
                      </button>
                    </div>
                  </>
                )}

                {/* 展开内容：平时只显示已组成章节；「编辑组成」才列出全部章节勾选 */}
                {expanded && !renamingId && (
                  <ul className="mt-1.5 space-y-0.5 border-t border-amber-500/20 pt-1.5" onClick={(e) => e.stopPropagation()}>
                    {(() => {
                      const editMode = editingId === combo.id || combo.chapterIds.length === 0
                      if (editMode) {
                        return (
                          <>
                            <li className="flex items-center justify-between px-1.5 py-1">
                              <span className="text-[10px] text-muted-foreground">勾选组成这个 Part 的章节</span>
                              <Button
                                variant="secondary"
                                size="sm"
                                className="h-6 gap-1 px-2 text-[11px]"
                                onClick={() => setEditingId(null)}
                              >
                                <Check className="h-3 w-3" />
                                完成
                              </Button>
                            </li>
                            {book.chapters.map((ch) => {
                              const included = combo.chapterIds.includes(ch.id)
                              return (
                                <li
                                  key={ch.id}
                                  onClick={() => onToggleChapter(combo.id, ch.id)}
                                  className={`flex cursor-pointer items-center gap-1.5 rounded px-1.5 py-1 text-xs transition-colors ${
                                    included ? 'bg-amber-500/10 text-foreground' : 'text-muted-foreground hover:bg-muted/60'
                                  }`}
                                >
                                  {included ? (
                                    <Link2 className="h-3.5 w-3.5 shrink-0 text-amber-400" />
                                  ) : (
                                    <Link2Off className="h-3.5 w-3.5 shrink-0 opacity-50" />
                                  )}
                                  <StatusIcon status={ch.status} className="h-3 w-3 shrink-0" />
                                  <span className="min-w-0 flex-1 truncate">{ch.title}</span>
                                  <span className="shrink-0 text-[10px] opacity-60">{formatCount(countChars(ch.content))}</span>
                                </li>
                              )
                            })}
                            {book.chapters.length === 0 && (
                              <li className="px-2 py-3 text-center text-[11px] text-muted-foreground">
                                本书还没有章节，请先到章节模式创建
                              </li>
                            )}
                          </>
                        )
                      }
                      // 平时：只显示已组成的章节
                      const members = combo.chapterIds
                        .map((id) => book.chapters.find((c) => c.id === id))
                        .filter((c): c is NonNullable<typeof c> => !!c)
                      return (
                        <>
                          <li className="flex items-center justify-between px-1.5 py-1">
                            <span className="text-[10px] text-muted-foreground">已组成 {members.length} 章</span>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-6 gap-1 px-2 text-[11px] text-amber-500 hover:text-amber-400"
                              onClick={() => setEditingId(combo.id)}
                            >
                              <Pencil className="h-3 w-3" />
                              编辑组成
                            </Button>
                          </li>
                          {members.map((ch) => (
                            <li key={ch.id} className="flex items-center gap-1.5 rounded px-1.5 py-1 text-xs text-foreground">
                              <Link2 className="h-3.5 w-3.5 shrink-0 text-amber-400" />
                              <StatusIcon status={ch.status} className="h-3 w-3 shrink-0" />
                              <span className="min-w-0 flex-1 truncate">{ch.title}</span>
                              <span className="shrink-0 text-[10px] opacity-60">{formatCount(countChars(ch.content))}</span>
                            </li>
                          ))}
                        </>
                      )
                    })()}
                  </ul>
                )}
              </div>
            )
          })}
          {combos.length === 0 && (
            <p className="px-3 py-8 text-center text-xs text-muted-foreground">还没有 Part，先建一个吧</p>
          )}
        </div>
      </div>

      <div className="border-t border-border/60 px-3 py-2 text-[11px] text-muted-foreground">
        《{book.name}》共 {combos.length} 个 Part
      </div>

      <ConfirmDialog
        open={deletingCombo !== null}
        onOpenChange={(o) => !o && setDeletingCombo(null)}
        title={`删除 Part「${deletingCombo?.name}」？`}
        description="只是解除这个 Part 的组成关系，章节本身不会被删。"
        onConfirm={() => {
          if (deletingCombo) onDelete(deletingCombo.id)
          setDeletingCombo(null)
        }}
      />
    </>
  )
}

/* ================= 侧栏总装 ================= */

export interface SidebarProps {
  books: Book[]
  activeBookId: string | null
  view: ViewMode
  activeChapterId: string | null
  activeComboId: string | null
  onEnterBook: (id: string) => void
  onBackToShelf: () => void
  onAddBook: (name: string) => void
  onRenameBook: (id: string, name: string) => void
  onDeleteBook: (id: string) => void
  onSelectChapter: (id: string) => void
  onAddChapter: (title: string) => void
  onDeleteChapter: (id: string) => void
  onMoveChapter: (id: string, dir: -1 | 1) => void
  onSelectCombo: (id: string | null) => void
  onAddCombo: (name: string) => string
  onRenameCombo: (id: string, name: string) => void
  onDeleteCombo: (id: string) => void
  onToggleComboChapter: (comboId: string, chapterId: string) => void
  onSetBookGoal: (id: string, total: number | null, date: string | null) => void
}

// ─────────────── (ΦωΦ)ﾉ ───────────────

export function Sidebar(props: SidebarProps) {
  const book = props.books.find((b) => b.id === props.activeBookId) ?? null

  if (!book) {
    // 书架层：只显示书，建书/重命名只在这里
    return (
      <div className="flex h-full flex-col bg-card/40">
        <Shelf
          books={props.books}
          onEnterBook={props.onEnterBook}
          onAddBook={props.onAddBook}
          onRenameBook={props.onRenameBook}
          onDeleteBook={props.onDeleteBook}
          onSetBookGoal={props.onSetBookGoal}
        />
      </div>
    )
  }

  // 进书层：只显示章节/Part功能，不显示建书/重命名
  return (
    <div className="flex h-full flex-col bg-card/40">
      <BookHeader book={book} onBack={props.onBackToShelf} />
      <div className="flex items-center gap-1.5 border-b border-border/60 px-2.5 py-2 text-[11px] text-muted-foreground">
        {props.view === 'chapter' ? (
          <>
            <BookOpenText className="h-3.5 w-3.5 text-amber-500" />
            章节模式 · 只显示章节
          </>
        ) : (
          <>
            <Layers className="h-3.5 w-3.5 text-amber-500" />
            Part 模式 · 只显示 Part
          </>
        )}
      </div>
      {props.view === 'chapter' ? (
        <ChapterList
          book={book}
          activeChapterId={props.activeChapterId}
          onSelect={props.onSelectChapter}
          onAdd={props.onAddChapter}
          onDelete={props.onDeleteChapter}
          onMove={props.onMoveChapter}
        />
      ) : (
        <ComboList
          book={book}
          activeComboId={props.activeComboId}
          onSelect={props.onSelectCombo}
          onAdd={props.onAddCombo}
          onRename={props.onRenameCombo}
          onDelete={props.onDeleteCombo}
          onToggleChapter={props.onToggleComboChapter}
        />
      )}
    </div>
  )
}
