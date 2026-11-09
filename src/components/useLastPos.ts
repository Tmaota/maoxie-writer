// 这部分负责: 编辑位置记忆 —— 记下退出前的滚动与光标，重开 App 原地恢复

import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { loadLastPos, saveLastPos } from '@/lib/lastpos'

interface Match {
  view: 'chapter' | 'merged'
  bookId: string | null
  chapterId: string | null
  comboId: string | null
}

/**
 * 编辑位置记忆：
 * - 挂载时若本地存的位置就是当前这篇（章节/Part），恢复滚动量与光标（不 focus，避免手机弹键盘）；
 * - 滚动/选区变化时节流保存，失焦、切后台（visibilitychange）、关页面（pagehide）时立即保存——
 *   手机划掉 App 也能记下退出前的位置。
 * 返回是否命中恢复（供调用方跳过其它挂载定位逻辑）。
 */
export function useLastPos(
  taRef: React.RefObject<HTMLTextAreaElement | null>,
  match: Match,
  onRestore?: (caret: number) => void,
): boolean {
  const [hit] = useState(() => {
    const lp = loadLastPos()
    return (
      !!lp &&
      lp.view === match.view &&
      lp.bookId === match.bookId &&
      lp.chapterId === match.chapterId &&
      lp.comboId === match.comboId
    )
  })
  const restored = useRef(false)
  const matchRef = useRef(match)
  matchRef.current = match
  const onRestoreRef = useRef(onRestore)
  onRestoreRef.current = onRestore

  // 恢复一次（rAF 等首帧布局完成后）
  useLayoutEffect(() => {
    if (restored.current || !hit) return
    restored.current = true
    requestAnimationFrame(() => {
      const ta = taRef.current
      if (!ta) return
      const lp = loadLastPos()
      if (!lp) return
      const caret = Math.max(0, Math.min(lp.caret, ta.value.length))
      ta.scrollTop = Math.max(0, lp.scrollTop)
      if (caret >= 0) {
        ta.setSelectionRange(caret, caret) // 会触发 select 事件，顶栏光标字数随之更新
        onRestoreRef.current?.(caret)
      }
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // 持续保存
  useEffect(() => {
    const ta = taRef.current
    if (!ta) return
    let timer: number | null = null
    const snapshot = () => ({
      ...matchRef.current,
      caret: ta.selectionStart ?? 0,
      scrollTop: ta.scrollTop ?? 0,
    })
    const schedule = () => {
      if (timer !== null) return
      timer = window.setTimeout(() => {
        timer = null
        saveLastPos(snapshot())
      }, 400)
    }
    const commitNow = () => {
      if (timer !== null) {
        window.clearTimeout(timer)
        timer = null
      }
      saveLastPos(snapshot())
    }
    ta.addEventListener('scroll', schedule, { passive: true })
    ta.addEventListener('select', schedule)
    ta.addEventListener('blur', commitNow)
    const onVis = () => {
      if (document.visibilityState === 'hidden') commitNow()
    }
    document.addEventListener('visibilitychange', onVis)
    window.addEventListener('pagehide', commitNow)
    return () => {
      ta.removeEventListener('scroll', schedule)
      ta.removeEventListener('select', schedule)
      ta.removeEventListener('blur', commitNow)
      document.removeEventListener('visibilitychange', onVis)
      window.removeEventListener('pagehide', commitNow)
      if (timer !== null) window.clearTimeout(timer)
    }
  }, [taRef])

  return hit
}
