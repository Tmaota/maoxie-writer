// 这部分负责: Part 组合编辑器 —— 多章拼成一篇、改动回写各章、修订模式

import { useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react'
import {
  Layers, ListChecks, SlidersHorizontal, MoreHorizontal,
  FileText, FileDown, Pin, NotebookText,
} from 'lucide-react'
import type { Chapter, RevisionState, Snippet } from '@/types'
import { buildMerged, chapterIndexAtCursor, effectiveChapters, syncMergedEdit } from '@/lib/merge'
import { countChars, formatCount } from '@/lib/wordcount'
import { findTrigger } from '@/lib/snippets'
import { partAtOffset, splitIntoParts } from '@/lib/revision'
import { RevMarker } from './RevMarker'
import { RevHighlight } from './RevHighlight'
import { useIPadKeyboard } from './useIPadKeyboard'
import { useLastPos } from './useLastPos'
import { FlashLine, scrollPosToCenter, type FlashTrigger } from './FlashLine'
import { TuneSheet, TuneSection, FontTune } from './MobileEditorTools'
import { TopBarSlot } from './MobileChrome'
import { Textarea } from '@/components/ui/textarea'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { Switch } from '@/components/ui/switch'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

interface Props {
  /** 已加入 Part 的章节（按拼章顺序） */
  pChapters: Chapter[]
  /** 所属书 id（编辑位置记忆用） */
  bookId?: string | null
  /** 当前 Part id（编辑位置记忆用） */
  comboId?: string | null
  snippets: Snippet[]
  /** 正文字号 px */
  fontSize: number
  /** 快捷调字号（delta 为 ±1） */
  onFontSize: (delta: number) => void
  /** 光标位置上报（合并文稿的字符偏移） */
  onCaret?: (pos: number) => void
  /** 从阅读模式返回：把 pos 滚动到可见并定位光标 */
  focusPos?: number | null
  onFocusHandled?: () => void
  /** 刚进 Part 模式时定位到的章节（通常=章节模式下看的那一章）：挂载后把光标放到它在 Part 里的开头 */
  initialChapterId?: string | null
  /** 把合并文稿的编辑写回章节 */
  onSync: (updated: Chapter[]) => void
  /** 命令式插入（Alt+数字 快捷键等） */
  apiRef: React.RefObject<{ insert: (text: string) => void } | null>
  /** 修订模式开关（由 Home 持有） */
  revMode: boolean
  onRevModeChange: (on: boolean) => void
  /** 修订：整个 Part 按字数均分的部分数（0=未设置）与当前状态 */
  revN: number
  revState: RevisionState | null | undefined
  /** 上报“最后修改到第几部分的第几个字”（已节流） */
  onRevLast: (partIndex: number, p: number) => void
  /** 修订面板里当前点选的部分序号（用于正文选中高亮；null=无） */
  revActive?: number | null
  /** 手机端：精简顶栏（右侧双按钮），工具收进「页面调节」与「⋯」菜单 */
  mobile?: boolean
  /** Part 名称（手机顶栏显示） */
  comboName?: string
  /** ⋯ 菜单：导出本 Part TXT / DOCX */
  onExportTxt?: () => void
  onExportDocx?: () => void
  /** ⋯ 菜单：打开修改记录（历史版本页） */
  onOpenEdits?: () => void
  /** ⋯ 菜单：生成本 Part 桌面挂件 */
  onPinWidget?: () => void
  /** ⋯ 菜单：批量导入 TXT/DOCX/MD 为章节 */
  onImportDocs?: (files: File[]) => void
}

export function MergedEditor({ pChapters, bookId, comboId, snippets, fontSize, onFontSize, onCaret, focusPos, onFocusHandled, initialChapterId, onSync, apiRef, revMode, onRevModeChange, revN, revState, onRevLast, revActive, mobile = false, onExportTxt, onExportDocx, onOpenEdits, onPinWidget, onImportDocs }: Props) {
  const eff = useMemo(() => effectiveChapters(pChapters), [pChapters])
  const mergedFromStore = useMemo(() => buildMerged(eff), [eff])
  const [text, setText] = useState(mergedFromStore)
  const [cursor, setCursor] = useState(0)
  const [selCount, setSelCount] = useState(0)
  /** 手机「页面调节」弹层 */
  const [tuneOpen, setTuneOpen] = useState(false)
  /** 批量导入章节文件选择 */
  const importDocRef = useRef<HTMLInputElement>(null)
  /** 跳转提醒：闪烁高亮（seq 每次跳转递增，保证重复触发） */
  const [flash, setFlash] = useState<FlashTrigger | null>(null)
  const flashSeq = useRef(0)
  const lastSynced = useRef(mergedFromStore)
  const timer = useRef<number | null>(null)
  const taRef = useRef<HTMLTextAreaElement | null>(null)
  /** iPad 键盘锁：默认只读不弹键盘，点浮动键盘按钮才解锁 */
  const kbd = useIPadKeyboard(taRef)
  /** 编辑位置记忆：重开 App 时恢复关闭前的滚动位置与光标（不聚焦，避免手机弹键盘） */
  const lastPosHit = useLastPos(
    taRef,
    { view: 'merged', bookId: bookId ?? null, chapterId: null, comboId: comboId ?? null },
    (caret) => {
      setCursor(caret)
      onCaret?.(caret)
    },
  )
  const lastText = useRef(text)
  /** 中文输入法正在组合：期间绝不强制重置文本/光标，否则会把已输入的整段吃掉 */
  const composing = useRef(false)
  /** 自己刚写回 store 的文本：store 重建出的 mergedFromStore 与它相同时，无需重置编辑区 */
  const pendingSelf = useRef<string | null>(null)
  /** 编辑期间发生的外部改动（单章编辑、排序等）：等收起键盘/失焦再应用，不打扰输入 */
  const externalPending = useRef<string | null>(null)
  /** eff / onSync / flushSync 的最新引用，供卸载刷新等异步路径使用，避免闭包过期 */
  const effRef = useRef(eff)
  effRef.current = eff
  const onSyncRef = useRef(onSync)
  onSyncRef.current = onSync

  /** 修订位置上报节流 */
  const revTimer = useRef<number | null>(null)
  const revPending = useRef<{ i: number; p: number } | null>(null)
  const revNRef = useRef(revN)
  revNRef.current = revN
  // 修订模式：光标落在合并文稿的哪一部分，节流上报部分内位置
  const trackRev = (value: string, caret: number) => {
    const n = revNRef.current
    if (!n) return
    const pt = partAtOffset(splitIntoParts(value, n), caret)
    if (!pt) return
    revPending.current = { i: pt.index, p: Math.max(0, caret - pt.start) }
    if (revTimer.current) return
    revTimer.current = window.setTimeout(() => {
      revTimer.current = null
      const pending = revPending.current
      if (pending) onRevLastRef.current(pending.i, pending.p)
    }, 600)
  }
  const onRevLastRef = useRef(onRevLast)
  onRevLastRef.current = onRevLast
  const flushRev = () => {
    if (revTimer.current) {
      window.clearTimeout(revTimer.current)
      revTimer.current = null
    }
    const pending = revPending.current
    if (pending) {
      onRevLastRef.current(pending.i, pending.p)
      revPending.current = null
    }
  }
  useEffect(
    () => () => {
      if (revTimer.current) window.clearTimeout(revTimer.current)
    },
    [],
  )

  const setRefs = (el: HTMLTextAreaElement | null) => {
    taRef.current = el
  }

  /** 应用外部改动：保留光标位置与滚动（调用方保证不在输入中） */
  const applyExternal = (nextStore: string) => {
    const el = taRef.current
    const prevPos = el?.selectionStart ?? null
    const prevScroll = el?.scrollTop ?? 0
    lastSynced.current = nextStore
    setText(nextStore)
    if (el && prevPos != null) {
      requestAnimationFrame(() => {
        const pos = Math.min(prevPos, nextStore.length)
        el.setSelectionRange(pos, pos)
        el.scrollTop = prevScroll
      })
    }
  }

  // Alt+数字 等外部调用：在光标处插入并立即回写（一律读 DOM 最新值，避免状态滞后丢字）
  useImperativeHandle(
    apiRef,
    () => ({
      insert: (insert: string) => {
        const el = taRef.current
        const cur = el?.value ?? text
        const start = el?.selectionStart ?? cur.length
        const end = el?.selectionEnd ?? cur.length
        const next = cur.slice(0, start) + insert + cur.slice(end)
        const cursorPos = start + insert.length
        lastText.current = next
        setText(next)
        setCursor(cursorPos)
        flushSync(next)
        requestAnimationFrame(() => {
          el?.focus()
          el?.setSelectionRange(cursorPos, cursorPos)
        })
      },
    }),
    [text]
  )

  // 外部改动（单章编辑、排序、增删章节）时刷新合并文本。
  // 三种情况：自己写回的（忽略）/ 正在输入的（等失焦再应用）/ 真正的外部改动（保留光标直接应用）
  useEffect(() => {
    if (mergedFromStore === lastSynced.current) return
    if (pendingSelf.current !== null && mergedFromStore === pendingSelf.current) {
      pendingSelf.current = null
      lastSynced.current = mergedFromStore
      return
    }
    pendingSelf.current = null
    externalPending.current = mergedFromStore
    const el = taRef.current
    if (!composing.current && document.activeElement !== el) {
      const pending = externalPending.current
      externalPending.current = null
      applyExternal(pending)
    }
  }, [mergedFromStore])

  const flushSync = (next: string) => {
    if (next === lastSynced.current) return
    const updated = syncMergedEdit(effRef.current, lastSynced.current, next)
    lastSynced.current = next
    pendingSelf.current = next
    onSyncRef.current(updated)
  }

  const flushSyncRef = useRef(flushSync)
  flushSyncRef.current = flushSync

  const scheduleSync = (next: string) => {
    if (timer.current) window.clearTimeout(timer.current)
    timer.current = window.setTimeout(() => flushSync(next), 400)
  }

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const v = e.target.value
    lastText.current = v
    setText(v)
    setCursor(e.target.selectionStart)
    onCaret?.(e.target.selectionStart)
    if (revMode) trackRev(v, e.target.selectionStart)
    scheduleSync(v)
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
    lastText.current = next
    setText(next)
    const newCursor = before.length - hit.trigger.length + hit.text.length + tail.length
    setCursor(newCursor)
    if (revMode) trackRev(next, newCursor)
    flushSync(next)
    requestAnimationFrame(() => {
      el.focus()
      el.setSelectionRange(newCursor, newCursor)
    })
  }

  // 切换走前把未落盘的改动同步掉（阅读模式会让编辑器频繁卸载，400ms 防抖会丢字，必须补）
  // 用 flushSyncRef 拿到最新引用，避免用过期的章节结构写回
  useEffect(() => {
    return () => {
      if (timer.current) {
        window.clearTimeout(timer.current)
        flushSyncRef.current(lastText.current)
      }
    }
  }, [])

  // 收起键盘 / 失焦时，应用在输入期间攒下的外部改动
  const handleBlur = () => {
    if (revMode) flushRev()
    kbd.handleBlur()
    if (externalPending.current !== null) {
      const pending = externalPending.current
      externalPending.current = null
      applyExternal(pending)
    }
  }

  // 刚进 Part 模式：把光标放到来源章节（章节模式下看的那一章）在 Part 里的开头
  // （若命中「上次退出位置」恢复，则跳过本次定位，保持关闭前的滚动位置）
  const didInitPos = useRef(false)
  useEffect(() => {
    if (didInitPos.current) return
    didInitPos.current = true
    if (lastPosHit) return
    const idx = initialChapterId ? effRef.current.findIndex((c) => c.id === initialChapterId) : -1
    let pos = 0
    if (idx > 0) {
      for (let i = 0; i < idx; i++) pos += effRef.current[i].content.length + 2 // 章节间 \n\n
    }
    setCursor(pos)
    const el = taRef.current
    if (el) {
      requestAnimationFrame(() => {
        const p = Math.min(pos, el.value.length)
        el.setSelectionRange(p, p)
        const lineHeight = parseFloat(getComputedStyle(el).lineHeight) || fontSize * 2
        const lineNo = el.value.slice(0, p).split('\n').length - 1
        el.scrollTop = Math.max(0, lineNo * lineHeight - el.clientHeight / 2)
      })
    }
    // 仅在挂载时定位一次
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // 从阅读模式返回 / 修订与修改记录跳转：把 pos 滚动到可见并定位光标
  useEffect(() => {
    if (focusPos == null) return
    const el = taRef.current
    if (!el) return
    el.focus()
    const pos = Math.min(focusPos, text.length)
    el.setSelectionRange(pos, pos)
    scrollPosToCenter(el, text, pos) // 目标行（段落）垂直居中
    setFlash({ pos, seq: ++flashSeq.current }) // 跳转提醒：整行高亮闪烁 5 秒
    onFocusHandled?.()
  }, [focusPos])

  const curIdx = chapterIndexAtCursor(eff, Math.min(cursor, text.length))
  const curChapter = eff[curIdx]
  const totalChars = countChars(text)
  // “最后改到这里”的标记坐标（整个 Part 均分后的部分内）
  const revMarkPos = (() => {
    if (!revMode || !revN || !revState?.last) return null
    const pt = splitIntoParts(text, revN)[revState.last.i]
    if (!pt) return null
    return pt.start + Math.min(revState.last.p, pt.end - pt.start)
  })()
  // 修订面板点选部分的正文范围（随文本改动实时重算）
  const revActiveRange = (() => {
    if (!revMode || !revN || revActive == null) return null
    const pt = splitIntoParts(text, revN)[revActive]
    return pt && pt.end > pt.start ? { start: pt.start, end: pt.end } : null
  })()

  return (
    <div className="flex h-full flex-col">
      {mobile ? (
        <>
          {/* 手机端控制按钮合并进顶栏（portal 注入 MobileTopBar 右侧） */}
          <TopBarSlot>
            <div className="flex min-w-0 shrink-0 items-center gap-1.5">
              <Layers className="h-4 w-4 shrink-0 text-amber-500" />
              <div className="min-w-0 leading-none">
                <span className="text-[11px] font-semibold text-amber-500">{formatCount(totalChars)} 字</span>
                <div className="mt-0.5 max-w-[36vw] truncate text-[9px] text-muted-foreground">
                  {curChapter ? `${curChapter.title} · ` : ''}
                  {selCount > 0
                    ? `选中 ${formatCount(selCount)} 字`
                    : `光标 ${formatCount(countChars(text.slice(0, cursor)))} 字`}
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
                    <FileText className="mr-2 h-4 w-4" />
                    导入章节（可多选 TXT/DOCX/MD）
                  </DropdownMenuItem>
                  <DropdownMenuItem className="text-sm" onSelect={onExportTxt}>
                    <FileText className="mr-2 h-4 w-4" />
                    导出本 Part → TXT
                  </DropdownMenuItem>
                  <DropdownMenuItem className="text-sm" onSelect={onExportDocx}>
                    <FileDown className="mr-2 h-4 w-4" />
                    导出本 Part → DOCX
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

          {/* 页面调节：修订 / 字号 */}
          <TuneSheet open={tuneOpen} onOpenChange={setTuneOpen}>
            <p className="mb-4 text-center text-[11px] text-muted-foreground">
              本 Part <span className="font-semibold text-amber-500">{formatCount(totalChars)}</span> 字 ·{' '}
              {selCount > 0
                ? `选中 ${formatCount(selCount)} 字`
                : `光标 第 ${formatCount(countChars(text.slice(0, cursor)))} 字`}
              {curChapter && <> · {curChapter.title}</>}
            </p>
            <TuneSection title="修订模式（按段落定修改目标）">
              <div className="flex items-center justify-between">
                <span className={`text-sm ${revMode ? 'text-emerald-500' : 'text-muted-foreground'}`}>
                  {revMode ? `已开启 · 分成 ${revN || '…'} 部分` : '关闭'}
                </span>
                <Switch checked={revMode} onCheckedChange={onRevModeChange} />
              </div>
            </TuneSection>
            <TuneSection title="字号">
              <FontTune value={fontSize} onChange={(v) => onFontSize(v - fontSize)} />
            </TuneSection>
          </TuneSheet>
        </>
      ) : (
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-border/60 px-4 py-2.5 text-xs">
        <span className="inline-flex items-center gap-1.5 font-semibold">
          <Layers className="h-4 w-4 text-amber-500" />
          Part 文稿
        </span>
        <span className="flex-1" />
        <div className="flex shrink-0 items-center gap-0.5">
          <button
            type="button"
            onClick={() => onRevModeChange(!revMode)}
            title="修订模式：按段落定修改目标"
            className={`flex h-6 w-6 items-center justify-center rounded transition-colors hover:bg-muted hover:text-foreground ${
              revMode ? 'text-emerald-600' : 'text-muted-foreground'
            }`}
          >
            <ListChecks className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={() => onFontSize(-1)}
            title="减小字号"
            className="flex h-6 w-6 items-center justify-center rounded text-[11px] font-bold text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            A-
          </button>
          <button
            type="button"
            onClick={() => onFontSize(1)}
            title="增大字号"
            className="flex h-6 w-6 items-center justify-center rounded text-[13px] font-bold text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            A+
          </button>
        </div>
        <span className="text-right leading-tight text-muted-foreground">
          <div>
            本 Part <span className="text-sm font-semibold text-amber-500">{formatCount(totalChars)}</span> 字
          </div>
          {curChapter && (
            <Tooltip>
              <TooltipTrigger asChild>
                <div className="cursor-default text-[10px]">
                  {selCount > 0
                    ? `选中 ${formatCount(selCount)} 字`
                    : `光标 第 ${formatCount(countChars(text.slice(0, cursor)))} 字`}{' '}
                  · {curChapter.title}
                </div>
              </TooltipTrigger>
              <TooltipContent>这一段内容写回「{curChapter.title}」</TooltipContent>
            </Tooltip>
          )}
        </span>
      </div>
      )}

      {eff.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-2 text-muted-foreground">
          <Layers className="h-10 w-10 opacity-40" />
          <p className="text-sm">这个 Part 里还没有章节</p>
          <p className="text-xs">在左侧展开这个 Part，点「编辑组成」勾选要拼到一起的章节</p>
        </div>
      ) : (
        <div className="relative min-h-0 flex-1">
          <Textarea
            ref={setRefs}
            value={text}
            readOnly={kbd.readOnly}
            onChange={handleChange}
            onKeyDown={handleKeyDown}
            onBlur={handleBlur}
            onCompositionStart={() => {
              composing.current = true
            }}
            onCompositionEnd={() => {
              composing.current = false
            }}
            onSelect={(e) => {
              const t = e.currentTarget
              setCursor(t.selectionStart)
              setSelCount(countChars(t.value.slice(t.selectionStart, t.selectionEnd)))
              onCaret?.(t.selectionStart)
              if (revMode) trackRev(t.value, t.selectionStart)
            }}
            placeholder="这里是由各章拼成的一篇 Part 文稿，直接编辑即可……"
            style={{ fontSize, lineHeight: `${fontSize * 2}px` }}
            className="writer-editor h-full resize-none rounded-none border-0 px-4 py-4 focus-visible:ring-0 lg:px-6"
          />
          <RevHighlight text={text} range={revActiveRange} taRef={taRef} />
          <RevMarker text={text} pos={revMarkPos} active={revMode && revN > 0} taRef={taRef} />
          <FlashLine text={text} flash={flash} taRef={taRef} />
          {kbd.kbdButton}
        </div>
      )}
    </div>
  )
}
