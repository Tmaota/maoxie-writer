// 这部分负责: 修订光标标记 —— 用镜像测量把“最后改到这里”画在字后面

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'

interface Props {
  /** 文本框当前全文 */
  text: string
  /** 标记位置（全文字符偏移）：光标画在这个偏移之后 */
  pos: number | null
  /** 是否显示 */
  active: boolean
  /** 目标 textarea（同一个 DOM 节点，取滚动量/尺寸/行高） */
  taRef: React.RefObject<HTMLTextAreaElement | null>
}

/**
 * 修订模式的光标标记：在「最后修改到的字」后面叠一个闪烁的琥珀色光标。
 * 用一个不可见的镜像 div 模拟 textarea 的折行，量出标记点坐标，
 * 再扣掉 textarea 的滚动量，把光标绝对定位到文字上方（pointer-events: none，不挡输入）。
 * 必须放在 position: relative 的容器里（包住 textarea 的那层）。
 */
export function RevMarker({ text, pos, active, taRef }: Props) {
  const mirrorRef = useRef<HTMLDivElement | null>(null)
  const [mark, setMark] = useState<{ top: number; left: number; height: number } | null>(null)
  /** 文本框聚焦（正在输入）时隐藏假光标：编辑状态下只保留系统光标，避免双光标干扰 */
  const [focused, setFocused] = useState(false)
  const show = active && !focused

  useEffect(() => {
    const ta = taRef.current
    if (!ta) return
    const onFocus = () => setFocused(true)
    const onBlur = () => setFocused(false)
    ta.addEventListener('focus', onFocus)
    ta.addEventListener('blur', onBlur)
    return () => {
      ta.removeEventListener('focus', onFocus)
      ta.removeEventListener('blur', onBlur)
    }
  }, [taRef])

  const measure = useCallback(() => {
    const ta = taRef.current
    const mirror = mirrorRef.current
    if (!show || !ta || !mirror || pos == null || pos < 0 || pos > text.length) {
      setMark(null)
      return
    }
    const cs = getComputedStyle(ta)
    // 镜像与文本框同宽同字体同内边距，保证折行一致
    mirror.style.width = `${ta.clientWidth}px`
    mirror.style.padding = cs.padding
    mirror.style.fontSize = cs.fontSize
    mirror.style.lineHeight = cs.lineHeight
    mirror.style.fontFamily = cs.fontFamily
    mirror.style.letterSpacing = cs.letterSpacing
    // 内容 = 标记点之前的文字 + 零宽占位 span（它的位置就是光标位置）
    mirror.textContent = ''
    mirror.appendChild(document.createTextNode(text.slice(0, pos)))
    const probe = document.createElement('span')
    probe.textContent = '​'
    mirror.appendChild(probe)
    setMark({
      top: probe.offsetTop - ta.scrollTop,
      left: probe.offsetLeft - ta.scrollLeft,
      height: parseFloat(cs.lineHeight) || parseFloat(cs.fontSize) * 2,
    })
  }, [show, text, pos, taRef])

  useLayoutEffect(() => {
    measure()
  }, [measure])

  // 滚动 / 尺寸变化时重新定位（capture 阶段挂原生监听，不依赖 React 合成事件）
  useEffect(() => {
    const ta = taRef.current
    if (!ta || !show) return
    ta.addEventListener('scroll', measure, { passive: true })
    const ro = new ResizeObserver(measure)
    ro.observe(ta)
    window.addEventListener('resize', measure)
    return () => {
      ta.removeEventListener('scroll', measure)
      ro.disconnect()
      window.removeEventListener('resize', measure)
    }
  }, [taRef, show, measure])

  return (
    <>
      {/* 镜像测量层：不可见，probe span 的坐标即文字坐标 */}
      <div
        ref={mirrorRef}
        aria-hidden
        className="pointer-events-none absolute top-0 left-[-9999px] whitespace-pre-wrap break-words"
      />
      {mark && (
        <div
          aria-hidden
          className="rev-caret pointer-events-none absolute z-10 w-[2px] rounded-sm bg-amber-400"
          style={{ top: mark.top, left: mark.left, height: mark.height }}
        />
      )}
      <style>{`
        .rev-caret { animation: rev-caret-blink 1s steps(1) infinite; }
        @keyframes rev-caret-blink { 0%, 55% { opacity: 1; } 56%, 100% { opacity: 0.15; } }
      `}</style>
    </>
  )
}
