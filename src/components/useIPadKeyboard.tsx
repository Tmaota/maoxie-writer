// 这部分负责: iPad 键盘锁 —— 不点键盘按钮绝不弹系统键盘

import { useLayoutEffect, useMemo, useState } from 'react'
import { Keyboard } from 'lucide-react'

/** iPad（触屏 Safari，含开了“请求桌面网站”的 iPad）检测 */
export function isIPadDevice(): boolean {
  if (typeof navigator === 'undefined') return false
  if (!('ontouchstart' in window)) return false
  return /iPad/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && (navigator.maxTouchPoints ?? 0) > 1)
}

/**
 * iPad 键盘锁：iPad 网页版默认把编辑区设成只读——
 * 点击正文、移动光标、跳转修订/修改记录都不会弹出系统键盘；
 * 只有点浮动键盘按钮才解除只读并聚焦弹出键盘，键盘收起（blur）后自动恢复只读。
 * 非 iPad 设备完全不生效。
 */
export function useIPadKeyboard(taRef: React.RefObject<HTMLTextAreaElement | null>) {
  const isIPad = useMemo(isIPadDevice, [])
  const [kbOn, setKbOn] = useState(false)

  // 打开键盘：等只读解除、DOM 提交后聚焦（iOS 允许用户点击后数秒内的 focus 弹键盘）
  useLayoutEffect(() => {
    if (isIPad && kbOn) taRef.current?.focus()
  }, [isIPad, kbOn, taRef])

  const kbdButton =
    isIPad && !kbOn ? (
      <button
        type="button"
        onClick={() => setKbOn(true)}
        title="打开键盘修改"
        className="fixed right-3 bottom-[15.5rem] z-50 flex h-12 w-12 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg shadow-black/40 transition-transform hover:scale-105 active:scale-95"
      >
        <Keyboard className="h-5 w-5" />
      </button>
    ) : null

  return {
    /** 传给 textarea 的 readOnly（仅 iPad 且键盘未开时生效） */
    readOnly: isIPad && !kbOn,
    /** 合进 textarea 的 onBlur：键盘收起后恢复只读 */
    handleBlur: () => {
      if (isIPad && kbOn) setKbOn(false)
    },
    /** 浮动键盘按钮（非 iPad 为 null） */
    kbdButton,
  }
}
