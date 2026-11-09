// 这部分负责: 修订高亮 —— 面板点选部分时正文对应段落框选

import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { measureRange } from './FlashLine'

interface Props {
  /** 文本框当前全文 */
  text: string
  /** 要高亮的字符范围（null=不高亮） */
  range: { start: number; end: number } | null
  /** 目标 textarea（同一个 DOM 节点） */
  taRef: React.RefObject<HTMLTextAreaElement | null>
}

interface Mark {
  top: number
  height: number
}

/**
 * 修订面板选中部分的外框：只从修订面板点击部分时才会出现，
 * 手动选中文字不会触发。整个部分（修订模式按字数分出来的大段）
 * 画一个完整的绿色描边框，滚动/改字期间持续跟随。
 * 必须放在 position: relative 的容器里（包住 textarea 的那层）。
 */
export function RevHighlight({ text, range, taRef }: Props) {
  const [mark, setMark] = useState<Mark | null>(null)
  /** 范围在内容坐标系里的几何信息（不含滚动） */
  const geomRef = useRef<Mark | null>(null)

  const measure = () => {
    const ta = taRef.current
    if (!ta || !range) {
      geomRef.current = null
      setMark(null)
      return
    }
    const g = measureRange(ta, text, range.start, range.end)
    geomRef.current = g
    setMark(g ? { top: g.top - ta.scrollTop, height: g.height } : null)
  }

  // 范围变化或文本改动（修订中边改边跟）都重新测量
  useLayoutEffect(() => {
    measure()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text, range?.start, range?.end])

  // 滚动只换算坐标，不重新排版
  useEffect(() => {
    const ta = taRef.current
    if (!ta || !range) return
    const onScroll = () => {
      const g = geomRef.current
      if (g) setMark({ top: g.top - ta.scrollTop, height: g.height })
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [range?.start, range?.end])

  if (!mark) return null
  // 外扩 3px，避免边框线压住部分首行/末行的字形
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute right-0 left-0 z-[4]"
      style={{
        top: mark.top - 3,
        height: mark.height + 6,
        border: '1.5px solid rgba(16, 185, 129, 0.55)',
      }}
    />
  )
}
