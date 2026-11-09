// 这部分负责: 阅读模式 —— 审稿排版、ADHD 辅助阅读（逐行聚焦 + 高亮）

import { useEffect, useMemo, useRef, useState } from 'react'
import { BookOpenText, Minus, Plus, Crosshair, Play, Pause } from 'lucide-react'
import { countChars, formatCount } from '@/lib/wordcount'
import { CALM_COLORS, type ReadingAssistSettings } from '@/lib/settings'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'

interface Props {
  /** 阅读对象名：章节标题或 Part 名 */
  title: string
  /** 来源提示：如「章节模式」/「Part 模式」 */
  sourceLabel: string
  text: string
  fontSize: number
  onFontSize: (delta: number) => void
  /** ADHD 专注阅读：只显示当前行 ±2 行并高亮当前行 */
  focusMode: boolean
  onFocusModeChange: (v: boolean) => void
  /** 阅读辅助设置（高亮色 / 键盘阅读 / 阅读尺 / 舒缓配色 / 字间距 / 自动阅读） */
  assist: ReadingAssistSettings
  /** 初始阅读位置（原文字符偏移），组件每次重新挂载时生效 */
  initialPos: number
  /** 点击正文时上报阅读位置（原文字符偏移） */
  onPosChange: (pos: number) => void
}

interface Paragraph {
  start: number
  text: string
}

interface Line {
  start: number
  end: number
}

/** 把正文按空行切成段，记录每段在原文中的字符偏移 */
function splitParagraphs(text: string): Paragraph[] {
  const out: Paragraph[] = []
  let i = 0
  while (i < text.length) {
    const j = text.indexOf('\n\n', i)
    if (j === -1) {
      out.push({ start: i, text: text.slice(i) })
      break
    }
    out.push({ start: i, text: text.slice(i, j) })
    i = j + 2
  }
  return out.filter((p) => p.text.trim().length > 0)
}

/** 统计 container 内 node 之前所有文本的字符数 */
function charsBefore(container: Node, node: Node, offset: number): number {
  const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT)
  let count = 0
  let n: Node | null
  while ((n = walker.nextNode())) {
    if (n === node) return count + offset
    count += n.textContent?.length ?? 0
  }
  return count
}

export function ReadingView({ title, sourceLabel, text, fontSize, onFontSize, focusMode, onFocusModeChange, assist, initialPos, onPosChange }: Props) {
  const paras = useMemo(() => splitParagraphs(text), [text])
  const total = countChars(text)
  const [pos, setPos] = useState(initialPos)
  /** 专注模式下按像素实测出的实际行（原文偏移区间） */
  const [lines, setLines] = useState<Line[]>([])
  /** 阅读尺位置（相对正文滚动内容） */
  const [ruler, setRuler] = useState<{ top: number; height: number } | null>(null)
  /** 自动阅读播放中 */
  const [playing, setPlaying] = useState(false)
  const posRef = useRef(pos)
  posRef.current = pos

  const highlight = assist.highlightColor
  const rulerOn = focusMode && assist.ruler
  const calm = focusMode && assist.calmColor ? CALM_COLORS.find((c) => c.key === assist.calmColorValue) ?? null : null
  const spacingOn = focusMode && assist.wideSpacing

  // 进入阅读模式：滚动到记忆的阅读位置
  useEffect(() => {
    const target =
      paras.find((p) => initialPos >= p.start && initialPos < p.start + p.text.length + 2) ?? paras[0]
    if (!target) return
    document
      .querySelector(`[data-slot="reading-body"] [data-start="${target.start}"]`)
      ?.scrollIntoView({ block: 'center' })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // 专注模式：等排版稳定后逐字测量实际行（按Range的top分行）
  useEffect(() => {
    if (!focusMode) {
      setLines([])
      return
    }
    const body = document.querySelector('[data-slot="reading-body"]')
    if (!body) return
    let done = false
    const measure = () => {
      if (done) return
      done = true
      const ls: Line[] = []
      for (const p of Array.from(body.querySelectorAll<HTMLElement>('[data-start]'))) {
        const base = Number(p.dataset.start)
        const tn = p.firstChild
        if (!tn || tn.nodeType !== Node.TEXT_NODE) continue
        const len = (tn.textContent || '').length
        if (len === 0) continue
        const range = document.createRange()
        let lineStart = 0
        let lastTop: number | null = null
        for (let i = 0; i < len; i++) {
          range.setStart(tn, i)
          range.setEnd(tn, i + 1)
          const top = range.getBoundingClientRect().top
          if (lastTop === null) {
            lastTop = top
            continue
          }
          if (Math.abs(top - lastTop) <= 1) continue
          ls.push({ start: base + lineStart, end: base + i })
          lineStart = i
          lastTop = top
        }
        ls.push({ start: base + lineStart, end: base + len })
      }
      setLines(ls)
    }
    // 可见时下一帧就量；标签页隐藏时 rAF 不触发，用定时器兜底
    const raf = requestAnimationFrame(measure)
    const timer = window.setTimeout(measure, 600)
    return () => {
      cancelAnimationFrame(raf)
      window.clearTimeout(timer)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusMode, text, fontSize, spacingOn])

  /** 当前行下标：pos 落在哪一行 */
  const curLine = useMemo(() => {
    if (lines.length === 0) return -1
    const i = lines.findIndex((l) => pos >= l.start && pos < l.end)
    if (i >= 0) return i
    return lines.length - 1
  }, [lines, pos])

  // 专注模式：当前行始终滚动到视口中央（打字机式阅读）
  useEffect(() => {
    if (!focusMode || curLine < 0) return
    const el = document.querySelector(`[data-slot="reading-body"] [data-start="${lines[curLine].start}"]`)
    el?.scrollIntoView({ block: 'center' })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusMode, curLine, lines])

  /** 阅读尺跟随当前行（rulerOn 变化时由 pos/scroll 效果驱动） */
  const updateRuler = () => {
    if (!rulerOn || curLine < 0) {
      setRuler(null)
      return
    }
    const body = document.querySelector('[data-slot="reading-body"]')
    const el = body?.querySelector<HTMLElement>(`[data-start="${lines[curLine]?.start}"]`)
    if (!body || !el) return
    const br = body.getBoundingClientRect()
    const r = el.getBoundingClientRect()
    setRuler({ top: r.top - br.top + (body as HTMLElement).scrollTop - 8, height: r.height + 16 })
  }
  const rulerRef = useRef(updateRuler)
  rulerRef.current = updateRuler
  useEffect(() => {
    if (!rulerOn) {
      setRuler(null)
      return
    }
    const raf = requestAnimationFrame(() => rulerRef.current())
    const timer = window.setTimeout(() => rulerRef.current(), 650)
    return () => {
      cancelAnimationFrame(raf)
      window.clearTimeout(timer)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rulerOn, curLine, lines, text, fontSize])

  /* ---------- 键盘逐行/逐段阅读 ---------- */
  useEffect(() => {
    if (!assist.keys) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return
      const t = e.target as HTMLElement | null
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable)) return
      e.preventDefault()
      const dir = e.key === 'ArrowDown' ? 1 : -1
      if (focusMode && lines.length > 0 && curLine >= 0) {
        const next = Math.min(lines.length - 1, Math.max(0, curLine + dir))
        setPos(lines[next].start)
        onPosChange(lines[next].start)
        return
      }
      const idx = paras.findIndex((p) => posRef.current >= p.start && posRef.current < p.start + p.text.length + 2)
      const ni = Math.min(paras.length - 1, Math.max(0, (idx < 0 ? 0 : idx) + dir))
      if (paras[ni]) {
        setPos(paras[ni].start)
        onPosChange(paras[ni].start)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [assist.keys, focusMode, lines, curLine, paras, onPosChange])

  /* ---------- 自动阅读滚动 ---------- */
  useEffect(() => {
    setPlaying(false)
  }, [text])
  useEffect(() => {
    if (pos >= text.length) setPlaying(false)
  }, [pos, text.length])
  useEffect(() => {
    if (!assist.autoScroll || !playing) return
    const step = Math.max(1, Math.round(assist.wpm / 60))
    const t = window.setInterval(() => {
      const next = Math.min(text.length, posRef.current + step)
      posRef.current = next
      setPos(next)
      onPosChange(next)
    }, 1000)
    return () => window.clearInterval(t)
  }, [assist.autoScroll, playing, assist.wpm, text.length, onPosChange])

  const handleClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const range = document.caretRangeFromPoint?.(e.clientX, e.clientY)
    const paraEl = (e.target as HTMLElement).closest('[data-start]') as HTMLElement | null
    if (!range || !paraEl) return
    const within = charsBefore(paraEl, range.startContainer, range.startOffset)
    const real = Math.min(Number(paraEl.dataset.start) + within, text.length)
    setPos(real)
    onPosChange(real)
  }

  /** 滚动时把阅读位置同步到视口顶部（普通模式）或视口中央（专注模式）的段落/行开头，返回编辑器时直接接着改 */
  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const el = e.currentTarget
    if (rulerRef.current) {
      const raf = requestAnimationFrame(() => rulerRef.current())
      void raf
    }
    if (focusMode && lines.length > 0) {
      const cy = el.getBoundingClientRect().top + el.clientHeight / 2
      for (const sp of Array.from(el.querySelectorAll<HTMLElement>('[data-start]'))) {
        const r = sp.getBoundingClientRect()
        if (r.top <= cy && r.bottom >= cy) {
          const s = Number(sp.dataset.start)
          setPos(s)
          onPosChange(s)
          break
        }
      }
      return
    }
    const top = el.getBoundingClientRect().top
    for (const p of Array.from(el.querySelectorAll<HTMLElement>('[data-start]'))) {
      if (p.getBoundingClientRect().bottom > top + 8) {
        const start = Number(p.dataset.start)
        setPos(start)
        onPosChange(start)
        break
      }
    }
  }

  const progress = total > 0 ? Math.min(100, Math.round((countChars(text.slice(0, pos)) / total) * 100)) : 0

  return (
    <div className="flex h-full flex-col">
      <div className="flex flex-wrap items-center gap-2 border-b border-border/60 px-3 py-2 lg:px-4 lg:py-2.5">
        <BookOpenText className="h-4 w-4 shrink-0 text-amber-500" />
        <span className="truncate text-sm font-semibold">{title}</span>
        <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] text-muted-foreground">
          {sourceLabel} · 阅读模式
        </span>
        <span className="flex-1" />
        {assist.autoScroll && (
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                onClick={() => setPlaying((v) => !v)}
                className={`flex h-7 w-7 items-center justify-center rounded-md transition-colors ${
                  playing ? 'bg-amber-500/15 text-amber-400' : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                }`}
              >
                {playing ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
              </button>
            </TooltipTrigger>
            <TooltipContent>自动阅读 · {assist.wpm} 字/分（设置里可改速度）</TooltipContent>
          </Tooltip>
        )}
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              onClick={() => onFocusModeChange(!focusMode)}
              className={`flex h-7 items-center gap-1 rounded-md px-2 text-[11px] transition-colors ${
                focusMode ? 'bg-amber-500/15 text-amber-400' : 'text-muted-foreground hover:bg-muted hover:text-foreground'
              }`}
            >
              <Crosshair className="h-3.5 w-3.5" />
              专注
            </button>
          </TooltipTrigger>
          <TooltipContent>ADHD 辅助阅读：只显示当前行上下各 2 行，并高亮当前行</TooltipContent>
        </Tooltip>
        <div className="flex items-center gap-0.5">
          <Button variant="ghost" size="icon" className="h-7 w-7" title="减小字号" onClick={() => onFontSize(-1)}>
            <Minus className="h-3.5 w-3.5" />
          </Button>
          <span className="w-9 text-center text-[11px] text-muted-foreground">{fontSize}px</span>
          <Button variant="ghost" size="icon" className="h-7 w-7" title="增大字号" onClick={() => onFontSize(1)}>
            <Plus className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      <div
        data-slot="reading-body"
        onClick={handleClick}
        onScroll={handleScroll}
        className="writer-editor relative flex-1 cursor-text overflow-y-auto transition-colors duration-300"
        style={{
          fontSize: fontSize + 2,
          lineHeight: 2,
          letterSpacing: spacingOn ? '0.12em' : undefined,
          background: calm ? calm.bg : undefined,
          color: calm ? calm.fg : undefined,
        }}
      >
        {/* 阅读尺：当前行上下两条线，压住上下文视线 */}
        {ruler && (
          <div
            className="pointer-events-none absolute right-0 left-0 z-10 transition-all duration-150"
            style={{ top: ruler.top, height: ruler.height, borderTop: '1px solid rgba(245,158,11,0.45)', borderBottom: '1px solid rgba(245,158,11,0.45)' }}
          />
        )}
        <div className="mx-auto max-w-2xl px-5 py-8 lg:px-8 lg:py-10">
          {paras.length === 0 ? (
            <p className="text-center text-muted-foreground">这里还没有内容</p>
          ) : focusMode && lines.length > 0 ? (
            <FocusLines lines={lines} text={text} paras={paras} cur={curLine} highlight={highlight} calmFg={calm?.fg ?? null} />
          ) : (
            paras.map((p) => (
              <p key={p.start} data-start={p.start} className="mb-6">
                {p.text}
              </p>
            ))
          )}
        </div>
      </div>

      <div className="flex items-center gap-3 border-t border-border/60 px-4 py-1.5 text-[11px] text-muted-foreground">
        <span>
          读到 第 <span className="font-semibold text-amber-500">{formatCount(countChars(text.slice(0, pos)))}</span> 字
        </span>
        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
          <div className="h-full rounded-full bg-amber-500/70 transition-all" style={{ width: `${progress}%` }} />
        </div>
        <span className="tabular-nums">{progress}%</span>
        <span className="shrink-0">共 {formatCount(total)} 字</span>
      </div>
    </div>
  )
}

/**
 * ADHD 专注阅读：只显示当前行上下各 2 行，当前行高亮（底色可在设置里换）。
 * 其余行用 visibility:hidden 保留占位（不跳动），段落间距保留。
 */
function FocusLines({ lines, text, paras, cur, highlight, calmFg }: { lines: Line[]; text: string; paras: Paragraph[]; cur: number; highlight: string; calmFg: string | null }) {
  const paraStarts = useMemo(() => new Set(paras.map((p) => p.start)), [paras])
  return (
    <div>
      {lines.map((l, i) => {
        const inWindow = i >= cur - 2 && i <= cur + 2
        const isCur = i === cur
        const firstLineOfPara = paraStarts.has(l.start)
        return (
          <span
            key={l.start}
            data-start={l.start}
            className={`block rounded px-1 transition-all duration-150 ${
              inWindow ? '' : 'invisible'
            } ${isCur ? 'font-medium' : ''} ${
              firstLineOfPara && i > 0 ? 'mb-6' : ''
            }`}
            style={isCur ? { background: highlight, color: calmFg ?? undefined } : calmFg ? { color: calmFg } : undefined}
          >
            {text.slice(l.start, l.end)}
          </span>
        )
      })}
    </div>
  )
}
