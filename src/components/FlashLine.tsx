// 这部分负责: 跳转提醒 —— 目标行滚到屏幕正中 + 整行严丝合缝闪烁 5 秒

import { useEffect, useLayoutEffect, useRef, useState } from 'react'

/** 一次跳转提醒：pos 为目标位置，seq 每次跳转递增（保证同一位置重复点击也能重新触发） */
export interface FlashTrigger {
  pos: number
  seq: number
}

interface Props {
  /** 文本框当前全文 */
  text: string
  /** 跳转提醒（null=不提醒） */
  flash: FlashTrigger | null
  /** 目标 textarea（同一个 DOM 节点） */
  taRef: React.RefObject<HTMLTextAreaElement | null>
}

/** 把 textarea 的排版环境原样复制到镜像 div（同样的宽/内边距/字体/行高/断行规则） */
function styleMirror(m: HTMLDivElement, ta: HTMLTextAreaElement) {
  const cs = getComputedStyle(ta)
  m.style.position = 'absolute'
  m.style.left = '-9999px'
  m.style.top = '0'
  m.style.visibility = 'hidden'
  m.style.pointerEvents = 'none'
  m.style.margin = '0'
  m.style.border = 'none'
  m.style.boxSizing = 'border-box'
  m.style.width = `${ta.clientWidth}px`
  m.style.padding = cs.padding
  m.style.font = cs.font
  m.style.letterSpacing = cs.letterSpacing
  m.style.whiteSpace = 'pre-wrap'
  m.style.wordBreak = 'break-word'
  m.style.overflowWrap = cs.overflowWrap
}

interface LineGeom {
  /** 目标行顶部（相对文本框内容区，未含滚动） */
  top: number
  /** 目标行总高（折行段落 = 所有视觉行之和） */
  height: number
  /** 单行视觉行高 */
  rowH: number
}

/**
 * 真实排版测量：在镜像里渲染目标行之前的全文 + 探针，
 * 用 getBoundingClientRect 逐像素读出目标行（段落）的顶部与高度。
 * pos 落在哪个逻辑行（\n 之间）就量哪一行；折行自动覆盖整段。
 */
export function measureLine(ta: HTMLTextAreaElement, text: string, pos: number): LineGeom | null {
  if (pos < 0 || pos > text.length) return null
  // 文本框不可见（宽为 0，如移动端切到别的标签页仍挂载）时不测量，避免按零宽排版量出整屏高度
  if (ta.clientWidth <= 0) return null
  const m = document.createElement('div')
  styleMirror(m, ta)
  document.body.appendChild(m)
  try {
    const lineStart = text.lastIndexOf('\n', Math.max(0, pos - 1)) + 1
    const nl = text.indexOf('\n', pos)
    const lineEnd = nl === -1 ? text.length : nl
    const probe = () => {
      const s = document.createElement('span')
      s.textContent = '​'
      return s
    }
    // 行首探针：精确落在目标行第一视觉行上
    m.textContent = text.slice(0, lineStart)
    const p1 = probe()
    m.appendChild(p1)
    const r1 = p1.getBoundingClientRect()
    const mTop = m.getBoundingClientRect().top
    // 行尾探针：落在目标行最后一个视觉行上（折行时取其底部）
    m.textContent = text.slice(0, lineEnd)
    const p2 = probe()
    m.appendChild(p2)
    const r2 = p2.getBoundingClientRect()
    const rowH = r1.height || parseFloat(getComputedStyle(ta).fontSize) * 1.6
    return { top: r1.top - mTop, height: Math.max(rowH, r2.top + r2.height - r1.top), rowH }
  } finally {
    m.remove()
  }
}

/** 跳转滚动：把 pos 所在的行（段落）垂直居中到文本框可视区（内容不够贴边时自然靠顶/底） */
export function scrollPosToCenter(ta: HTMLTextAreaElement, text: string, pos: number) {
  const g = measureLine(ta, text, pos)
  if (!g) return
  const max = ta.scrollHeight - ta.clientHeight
  if (max <= 0) return
  const target = g.top + g.height / 2 - ta.clientHeight / 2
  ta.scrollTop = Math.max(0, Math.min(target, max))
}

/** 量出一段字符范围（start~end）的视觉覆盖：从 start 所在行行首到 end 所在行行尾 */
export function measureRange(ta: HTMLTextAreaElement, text: string, start: number, end: number): LineGeom | null {
  if (start < 0 || end > text.length || start >= end) return null
  if (ta.clientWidth <= 0) return null
  const m = document.createElement('div')
  styleMirror(m, ta)
  document.body.appendChild(m)
  try {
    const startLine = text.lastIndexOf('\n', Math.max(0, start - 1)) + 1
    const probe = () => {
      const s = document.createElement('span')
      s.textContent = '​'
      return s
    }
    m.textContent = text.slice(0, startLine)
    const p1 = probe()
    m.appendChild(p1)
    const r1 = p1.getBoundingClientRect()
    const mTop = m.getBoundingClientRect().top
    m.textContent = text.slice(0, end)
    const p2 = probe()
    m.appendChild(p2)
    const r2 = p2.getBoundingClientRect()
    const rowH = r1.height || parseFloat(getComputedStyle(ta).fontSize) * 1.6
    return { top: r1.top - mTop, height: Math.max(rowH, r2.top + r2.height - r1.top), rowH }
  } finally {
    m.remove()
  }
}

/**
 * 跳转提醒：flash.pos 所在的整行（段落）铺上高亮，闪烁 5 秒后淡出。
 * 高亮位置来自与文本框同排版的镜像测量（measureLine），滚动/改字期间持续跟随。
 * 必须放在 position: relative 的容器里（包住 textarea 的那层）。
 */
export function FlashLine({ text, flash, taRef }: Props) {
  const mirrorRef = useRef<HTMLDivElement | null>(null)
  const [mark, setMark] = useState<{ top: number; height: number } | null>(null)
  const [phase, setPhase] = useState<'off' | 'blink' | 'fade'>('off')
  const posRef = useRef<number | null>(null)
  /** 目标行在内容坐标系里的几何信息（不含滚动） */
  const geomRef = useRef<LineGeom | null>(null)
  const blinkTimer = useRef<number | null>(null)
  const fadeTimer = useRef<number | null>(null)
  const remeasureTimers = useRef<number[]>([])

  const clearTimers = () => {
    if (blinkTimer.current) window.clearTimeout(blinkTimer.current)
    if (fadeTimer.current) window.clearTimeout(fadeTimer.current)
    for (const t of remeasureTimers.current) window.clearTimeout(t)
    blinkTimer.current = null
    fadeTimer.current = null
    remeasureTimers.current = []
  }

  /** 同步镜像样式 + 量出目标行几何（内容坐标），再换算成当前可视坐标 */
  const measure = () => {
    const ta = taRef.current
    const mirror = mirrorRef.current
    const pos = posRef.current
    if (!ta || !mirror || pos == null) return
    styleMirror(mirror, ta)
    const g = measureLine(ta, text, pos)
    geomRef.current = g
    if (!g) {
      setMark(null)
      return
    }
    setMark({ top: g.top - ta.scrollTop, height: g.height })
  }

  // 新的跳转：清旧计时 → 立即测量并在多帧后复测（覆盖滚动尚未结束的时刻）→ 闪烁 5 秒 → 淡出
  useLayoutEffect(() => {
    clearTimers()
    if (!flash) {
      posRef.current = null
      geomRef.current = null
      setPhase('off')
      setMark(null)
      return
    }
    posRef.current = flash.pos
    measure()
    setPhase('blink')
    remeasureTimers.current = [80, 250, 500].map((ms) => window.setTimeout(measure, ms))
    blinkTimer.current = window.setTimeout(() => setPhase('fade'), 5000)
    return clearTimers
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [flash?.seq])

  // 文本变化期间保持位置跟随（修订模式后边改边看）
  useEffect(() => {
    if (phase === 'off') return
    measure()
  }, [text, phase])

  // 淡出结束后彻底关掉
  useEffect(() => {
    if (phase !== 'fade') return
    fadeTimer.current = window.setTimeout(() => setPhase('off'), 900)
    return () => {
      if (fadeTimer.current) window.clearTimeout(fadeTimer.current)
    }
  }, [phase])

  // 闪烁/淡出期间跟随滚动与尺寸变化（滚动只换算坐标，不重新排版，零抖动）
  useEffect(() => {
    const ta = taRef.current
    if (!ta || phase === 'off') return
    const onScroll = () => {
      const g = geomRef.current
      if (!g) return
      setMark({ top: g.top - ta.scrollTop, height: g.height })
    }
    ta.addEventListener('scroll', onScroll, { passive: true })
    const ro = new ResizeObserver(measure)
    ro.observe(ta)
    window.addEventListener('resize', measure)
    return () => {
      ta.removeEventListener('scroll', onScroll)
      ro.disconnect()
      window.removeEventListener('resize', measure)
    }
  }, [taRef, phase])

  return (
    <>
      <div ref={mirrorRef} aria-hidden />
      {mark && phase !== 'off' && (
        <div
          aria-hidden
          className={`jump-flash-line pointer-events-none absolute right-0 left-0 z-[5] ${
            phase === 'fade' ? 'jump-flash-fade' : ''
          }`}
          style={{ top: mark.top, height: mark.height }}
        />
      )}
      <style>{`
        .jump-flash-line {
          background: rgba(245, 158, 11, 0.28);
          animation: jump-flash-blink 1s ease-in-out infinite;
        }
        .jump-flash-fade { animation: none; opacity: 0; transition: opacity .8s ease-out; }
        @keyframes jump-flash-blink { 0%, 100% { opacity: 1; } 50% { opacity: .35; } }
      `}</style>
    </>
  )
}
