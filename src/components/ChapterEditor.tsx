// 这部分负责: 章节编辑器 —— 单章写作、状态标记、修订模式、词组触发、字数统计

import { useEffect, useMemo, useRef, useState } from 'react'
import {
  History, ListChecks, Target, SlidersHorizontal, MoreHorizontal,
  FileText, FileDown, Pin, NotebookText,
} from 'lucide-react'
import type { Chapter, ChapterStatus, RevisionState, Snippet } from '@/types'
import { STATUS_META } from '@/types'
import { countChars, formatCount, readingMinutes } from '@/lib/wordcount'
import { findTrigger } from '@/lib/snippets'
import { partAtOffset, splitIntoParts } from '@/lib/revision'
import { StatusIcon } from './StatusBadge'
import { VersionsDialog } from './VersionsDialog'
import { GoalDialog } from './GoalDialog'
import { RevMarker } from './RevMarker'
import { RevHighlight } from './RevHighlight'
import { useIPadKeyboard } from './useIPadKeyboard'
import { FlashLine, scrollPosToCenter, type FlashTrigger } from './FlashLine'
import { useLastPos } from './useLastPos'
import { TuneSheet, TuneSection, FontTune } from './MobileEditorTools'
import { TopBarSlot } from './MobileChrome'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

interface Props {
  chapter: Chapter
  /** 所属书 id（编辑位置记忆用） */
  bookId?: string | null
  snippets: Snippet[]
  /** 正文字号 px */
  fontSize: number
  /** 快捷调字号（delta 为 ±1） */
  onFontSize: (delta: number) => void
  /** 光标位置上报（原文字符偏移） */
  onCaret?: (pos: number) => void
  onTitleChange: (title: string) => void
  onContentChange: (content: string) => void
  onStatusChange: (status: ChapterStatus) => void
  editorRef: React.RefObject<HTMLTextAreaElement | null>
  /** 跳转目标：把 pos 处滚动到屏幕正中并选中 [pos, pos+len) */
  focusTarget?: { pos: number; len: number } | null
  onFocusHandled?: () => void
  /** 时光机：恢复某个历史版本内容 */
  onRestoreVersion: (content: string) => void
  /** 本章目标字数（null 清除） */
  onSetTarget: (n: number | null) => void
  /** 修订模式开关（由 Home 持有，切章保持） */
  revMode: boolean
  onRevModeChange: (on: boolean) => void
  /** 修订：分成的部分数（0=未设置）与当前状态 */
  revN: number
  revState: RevisionState | null | undefined
  /** 上报“最后修改到第几部分的第几个字”（已节流） */
  onRevLast: (partIndex: number, p: number) => void
  /** 修订面板里当前点选的部分序号（用于正文选中高亮；null=无） */
  revActive?: number | null
  /** 手机端：精简顶栏（右侧双按钮），工具收进「页面调节」与「⋯」菜单 */
  mobile?: boolean
  /** ⋯ 菜单：导出本章 TXT / DOCX */
  onExportTxt?: () => void
  onExportDocx?: () => void
  /** ⋯ 菜单：打开修改记录（历史版本页） */
  onOpenEdits?: () => void
  /** ⋯ 菜单：生成本章桌面挂件 */
  onPinWidget?: () => void
  /** ⋯ 菜单：批量导入 TXT/DOCX/MD 为章节 */
  onImportDocs?: (files: File[]) => void
}

export function ChapterEditor({
  chapter,
  bookId,
  snippets,
  fontSize,
  onFontSize,
  onCaret,
  onTitleChange,
  onContentChange,
  onStatusChange,
  editorRef,
  focusTarget,
  onFocusHandled,
  onRestoreVersion,
  onSetTarget,
  revMode,
  onRevModeChange,
  revN,
  revState,
  onRevLast,
  revActive,
  mobile = false,
  onExportTxt,
  onExportDocx,
  onOpenEdits,
  onPinWidget,
  onImportDocs,
}: Props) {
  const [selCount, setSelCount] = useState(0)
  const [caretPos, setCaretPos] = useState(0)
  const [showVersions, setShowVersions] = useState(false)
  const [showTarget, setShowTarget] = useState(false)
  /** 手机「页面调节」弹层 */
  const [tuneOpen, setTuneOpen] = useState(false)
  /** 批量导入章节文件选择 */
  const importDocRef = useRef<HTMLInputElement>(null)
  /** 跳转提醒：闪烁高亮（seq 每次跳转递增，保证重复触发） */
  const [flash, setFlash] = useState<FlashTrigger | null>(null)
  const flashSeq = useRef(0)
  const taRef = useRef<HTMLTextAreaElement | null>(null)
  /** iPad 键盘锁：默认只读不弹键盘，点浮动键盘按钮才解锁 */
  const kbd = useIPadKeyboard(taRef)
  /** 编辑位置记忆：重开 App 时恢复关闭前的滚动位置与光标（不聚焦，避免手机弹键盘） */
  useLastPos(
    taRef,
    { view: 'chapter', bookId: bookId ?? null, chapterId: chapter.id, comboId: null },
    (caret) => {
      setCaretPos(caret)
      onCaret?.(caret)
    },
  )
  /** 中文输入法组合期间不强制干预光标/滚动 */
  const composing = useRef(false)
  /** 修订位置上报节流 */
  const revTimer = useRef<number | null>(null)
  const revPending = useRef<{ i: number; p: number } | null>(null)

  // 修订模式：光标所在部分 = “正在改的部分”，节流上报部分内位置
  const trackRev = (value: string, caret: number) => {
    if (!revN) return
    const pt = partAtOffset(splitIntoParts(value, revN), caret)
    if (!pt) return
    revPending.current = { i: pt.index, p: Math.max(0, caret - pt.start) }
    if (revTimer.current) return
    revTimer.current = window.setTimeout(() => {
      revTimer.current = null
      if (revPending.current) onRevLast(revPending.current.i, revPending.current.p)
    }, 600)
  }
  const flushRev = () => {
    if (revTimer.current) {
      window.clearTimeout(revTimer.current)
      revTimer.current = null
    }
    if (revPending.current) {
      onRevLast(revPending.current.i, revPending.current.p)
      revPending.current = null
    }
  }
  useEffect(
    () => () => {
      if (revTimer.current) window.clearTimeout(revTimer.current)
    },
    [],
  )

  // “最后改到这里”的标记坐标
  const revMarkPos = useMemo(() => {
    if (!revMode || !revN || !revState?.last) return null
    const pt = splitIntoParts(chapter.content, revN)[revState.last.i]
    if (!pt) return null
    return pt.start + Math.min(revState.last.p, pt.end - pt.start)
  }, [revMode, revN, revState, chapter.content])

  // 修订面板点选部分的正文范围（随文本改动实时重算）
  const revActiveRange = useMemo(() => {
    if (!revMode || !revN || revActive == null) return null
    const pt = splitIntoParts(chapter.content, revN)[revActive]
    return pt && pt.end > pt.start ? { start: pt.start, end: pt.end } : null
  }, [revMode, revN, revActive, chapter.content])

  // 从修改记录跳转：定位 + 选中 + 滚动到正中（输入法正在组词时不打断）
  useEffect(() => {
    if (!focusTarget) return
    if (composing.current) {
      onFocusHandled?.()
      return
    }
    const el = taRef.current
    if (!el) return
    const pos = Math.min(focusTarget.pos, chapter.content.length)
    const len = Math.max(0, Math.min(focusTarget.len, chapter.content.length - pos))
    el.focus()
    el.setSelectionRange(pos, pos + len)
    scrollPosToCenter(el, chapter.content, pos) // 目标行（段落）垂直居中
    setFlash({ pos, seq: ++flashSeq.current }) // 跳转提醒：整行高亮闪烁 5 秒
    onFocusHandled?.()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusTarget])

  const setRefs = (el: HTMLTextAreaElement | null) => {
    ;(taRef as React.MutableRefObject<HTMLTextAreaElement | null>).current = el
    ;(editorRef as React.MutableRefObject<HTMLTextAreaElement | null>).current = el
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key !== ' ' && e.key !== 'Enter') return
    const el = e.currentTarget
    // 一律以 DOM 当前值为基准：手机快速输入时 state 可能滞后，用旧值拼接会吃掉刚打的字
    const cur = el.value
    const before = cur.slice(0, el.selectionStart)
    const hit = findTrigger(before, snippets)
    if (!hit) return
    e.preventDefault()
    const tail = e.key === 'Enter' ? '\n' : ' '
    const next = before.slice(0, -hit.trigger.length) + hit.text + tail + cur.slice(el.selectionEnd)
    onContentChange(next)
    const cursor = before.length - hit.trigger.length + hit.text.length + tail.length
    requestAnimationFrame(() => {
      el.focus()
      el.setSelectionRange(cursor, cursor)
    })
  }

  const chars = countChars(chapter.content)

  return (
    <div className="flex h-full flex-col">
      {mobile ? (
        <>
          {/* 手机端控制按钮合并进顶栏（portal 注入 MobileTopBar 右侧） */}
          <TopBarSlot>
            <div className="flex shrink-0 items-center gap-1.5">
              <StatusIcon status={chapter.status} className="h-4 w-4 shrink-0" />
              <div className="leading-none">
                <span
                  className={`text-[11px] font-semibold ${
                    chapter.targetChars && chars >= chapter.targetChars ? 'text-emerald-500' : 'text-amber-500'
                  }`}
                >
                  {chapter.targetChars ? `${formatCount(chars)}/${formatCount(chapter.targetChars)}` : formatCount(chars)}{' '}
                  字
                </span>
                <div className="mt-0.5 text-[9px] text-muted-foreground">
                  {selCount > 0
                    ? `选中 ${formatCount(selCount)} 字`
                    : `光标 ${formatCount(countChars(chapter.content.slice(0, caretPos)))} 字`}
                </div>
              </div>
            </div>
              <Button
                variant="ghost"
                size="icon"
                className="h-9 w-9 shrink-0"
                onClick={() => setTuneOpen(true)}
                aria-label="页面调节"
              >
                <SlidersHorizontal className="h-5 w-5" />
              </Button>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon" className="h-9 w-9 shrink-0" aria-label="更多">
                    <MoreHorizontal className="h-5 w-5" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56">
                  <DropdownMenuItem className="text-sm" onSelect={() => importDocRef.current?.click()}>
                    <FileDown className="mr-2 h-4 w-4" />
                    导入章节（可多选 TXT/DOCX/MD）
                  </DropdownMenuItem>
                  <DropdownMenuItem className="text-sm" onSelect={() => setShowVersions(true)}>
                    <History className="mr-2 h-4 w-4" />
                    时光机（历史版本）
                  </DropdownMenuItem>
                  <DropdownMenuItem className="text-sm" onSelect={onExportTxt}>
                    <FileText className="mr-2 h-4 w-4" />
                    导出本章 → TXT
                  </DropdownMenuItem>
                  <DropdownMenuItem className="text-sm" onSelect={onExportDocx}>
                    <FileDown className="mr-2 h-4 w-4" />
                    导出本章 → DOCX
                  </DropdownMenuItem>
                  <DropdownMenuItem className="text-sm" onSelect={onPinWidget}>
                    <Pin className="mr-2 h-4 w-4" />
                    生成桌面挂件
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem className="text-sm" onSelect={onOpenEdits}>
                    <NotebookText className="mr-2 h-4 w-4" />
                    修改记录（历史版本）
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
          </TopBarSlot>
          <input
            ref={importDocRef}
            type="file"
            accept=".txt,.docx,.md"
            multiple
            className="hidden"
            onChange={(e) => {
              const fs = Array.from(e.target.files ?? [])
              if (fs.length) onImportDocs?.(fs)
              e.target.value = ''
            }}
          />

          {/* 页面调节：状态 / 修订 / 目标 / 字号 */}
          <TuneSheet open={tuneOpen} onOpenChange={setTuneOpen}>
            <p className="mb-4 text-center text-[11px] text-muted-foreground">
              本章 <span className="font-semibold text-amber-500">{formatCount(chars)}</span> 字 ·{' '}
              {selCount > 0
                ? `选中 ${formatCount(selCount)} 字`
                : `光标 第 ${formatCount(countChars(chapter.content.slice(0, caretPos)))} 字`}{' '}
              · 约 {readingMinutes(chapter.content)} 分钟
            </p>
            <TuneSection title="章节状态">
              <div className="flex flex-wrap gap-2">
                {(Object.keys(STATUS_META) as ChapterStatus[]).map((s) => (
                  <button
                    key={s}
                    onClick={() => onStatusChange(s)}
                    className={`flex h-8 items-center gap-1.5 rounded-md border px-3 text-xs transition-colors ${
                      chapter.status === s
                        ? 'border-amber-500 bg-amber-500/15 font-medium text-amber-500'
                        : 'border-border/60 text-muted-foreground active:bg-muted'
                    }`}
                  >
                    <StatusIcon status={s} className="h-3.5 w-3.5" />
                    {STATUS_META[s].label}
                  </button>
                ))}
              </div>
            </TuneSection>
            <TuneSection title="修订模式（按段落定修改目标）">
              <div className="flex items-center justify-between">
                <span className={`text-sm ${revMode ? 'text-emerald-500' : 'text-muted-foreground'}`}>
                  {revMode ? `已开启 · 分成 ${revN || '…'} 部分` : '关闭'}
                </span>
                <Switch checked={revMode} onCheckedChange={onRevModeChange} />
              </div>
            </TuneSection>
            <TuneSection title="本章目标字数">
              <button
                onClick={() => setShowTarget(true)}
                className="flex h-9 w-full items-center justify-between rounded-md border border-border/60 px-3 text-sm active:bg-muted"
              >
                <span className="text-muted-foreground">
                  {chapter.targetChars ? `达到 ${formatCount(chapter.targetChars)} 字` : '未设置'}
                </span>
                <Target className={`h-4 w-4 ${chapter.targetChars ? 'text-amber-500' : 'text-muted-foreground'}`} />
              </button>
            </TuneSection>
            <TuneSection title="字号">
              <FontTune value={fontSize} onChange={(v) => onFontSize(v - fontSize)} />
            </TuneSection>
          </TuneSheet>
        </>
      ) : (
      <div className="flex flex-wrap items-center gap-2 border-b border-border/60 px-3 py-2 lg:px-4 lg:py-2.5">
        <StatusIcon status={chapter.status} className="h-4 w-4 shrink-0" />
        <Input
          value={chapter.title}
          onChange={(e) => onTitleChange(e.target.value)}
          className="h-9 flex-1 border-transparent bg-transparent px-1 text-base font-semibold hover:border-input focus:border-input lg:h-8"
          placeholder="章节标题"
        />
        <Select value={chapter.status} onValueChange={(v) => onStatusChange(v as ChapterStatus)}>
          <SelectTrigger className="h-9 w-28 text-xs lg:h-8">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {(Object.keys(STATUS_META) as ChapterStatus[]).map((s) => (
              <SelectItem key={s} value={s} className="text-xs">
                <span className="inline-flex items-center gap-1.5">
                  <StatusIcon status={s} className="h-3.5 w-3.5" />
                  {STATUS_META[s].label}
                </span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <div className="flex shrink-0 items-center gap-0.5">
          <button
            onClick={() => onRevModeChange(!revMode)}
            title="修订模式：按段落定修改目标"
            className={`flex h-8 w-8 items-center justify-center rounded transition-colors hover:bg-muted hover:text-foreground lg:h-6 lg:w-6 ${
              revMode ? 'text-emerald-600' : 'text-muted-foreground'
            }`}
          >
            <ListChecks className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={() => setShowVersions(true)}
            title="时光机（历史版本）"
            className="flex h-8 w-8 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-muted hover:text-foreground lg:h-6 lg:w-6"
          >
            <History className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={() => setShowTarget(true)}
            title="本章目标字数"
            className={`flex h-8 w-8 items-center justify-center rounded transition-colors hover:bg-muted hover:text-foreground lg:h-6 lg:w-6 ${
              chapter.targetChars ? 'text-amber-500' : 'text-muted-foreground'
            }`}
          >
            <Target className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={() => onFontSize(-1)}
            title="减小字号"
            className="flex h-8 w-8 items-center justify-center rounded text-[11px] font-bold text-muted-foreground transition-colors hover:bg-muted hover:text-foreground lg:h-6 lg:w-6"
          >
            A-
          </button>
          <button
            onClick={() => onFontSize(1)}
            title="增大字号"
            className="flex h-8 w-8 items-center justify-center rounded text-[13px] font-bold text-muted-foreground transition-colors hover:bg-muted hover:text-foreground lg:h-6 lg:w-6"
          >
            A+
          </button>
        </div>
        <div className="shrink-0 text-right text-[11px] leading-tight text-muted-foreground">
          <div>
            本章{' '}
            <span
              className={`text-sm font-semibold ${
                chapter.targetChars && chars >= chapter.targetChars ? 'text-emerald-500' : 'text-amber-500'
              }`}
            >
              {chapter.targetChars ? `${formatCount(chars)} / ${formatCount(chapter.targetChars)}` : formatCount(chars)}
            </span>{' '}
            字
          </div>
          <div className="text-[10px]">
            {selCount > 0
              ? `选中 ${formatCount(selCount)} 字 · `
              : `光标 第 ${formatCount(countChars(chapter.content.slice(0, caretPos)))} 字 · `}
            约 {readingMinutes(chapter.content)} 分钟
          </div>
        </div>
      </div>
      )}

      <div className="relative min-h-0 flex-1">
        <Textarea
          ref={setRefs}
          value={chapter.content}
          readOnly={kbd.readOnly}
          onChange={(e) => {
            setCaretPos(e.target.selectionStart)
            onCaret?.(e.target.selectionStart)
            if (revMode) trackRev(e.target.value, e.target.selectionStart)
            onContentChange(e.target.value)
          }}
          onKeyDown={handleKeyDown}
          onBlur={() => {
            if (revMode) flushRev()
            kbd.handleBlur()
          }}
          onCompositionStart={() => {
            composing.current = true
          }}
          onCompositionEnd={() => {
            composing.current = false
          }}
          onSelect={(e) => {
            const t = e.currentTarget
            setCaretPos(t.selectionStart)
            onCaret?.(t.selectionStart)
            if (revMode) trackRev(t.value, t.selectionStart)
            setSelCount(countChars(t.value.slice(t.selectionStart, t.selectionEnd)))
          }}
          placeholder="从这里开始写这一章……（输入触发词如 ;p 再按空格，可自动打出自定义词组）"
          style={{ fontSize, lineHeight: `${fontSize * 2}px` }}
          className="writer-editor h-full resize-none rounded-none border-0 px-4 py-4 focus-visible:ring-0 lg:px-6"
        />
        <RevHighlight text={chapter.content} range={revActiveRange} taRef={taRef} />
        <RevMarker text={chapter.content} active={revMode && revN > 0} taRef={taRef} pos={revMarkPos} />
        <FlashLine text={chapter.content} flash={flash} taRef={taRef} />
        {kbd.kbdButton}
      </div>

      <VersionsDialog
        open={showVersions}
        chapter={chapter}
        onOpenChange={setShowVersions}
        onRestore={onRestoreVersion}
      />
      <GoalDialog
        open={showTarget}
        onOpenChange={setShowTarget}
        title={`「${chapter.title}」本章目标`}
        initialTotal={chapter.targetChars ?? null}
        onConfirm={(total) => {
          onSetTarget(total)
          setShowTarget(false)
        }}
      />
    </div>
  )
}
