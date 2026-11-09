// 这部分负责: 移动端断点判断（≤899px 走手机布局，iQOO 15 横竖屏都覆盖）

import { useEffect, useState } from 'react'

/** 手机版断点：≤899px 走移动端布局（iQOO 15 竖屏约 400px 宽，横屏约 890px 也走移动布局） */
const QUERY = '(max-width: 899px)'

export function useIsMobile(): boolean {
  const [mobile, setMobile] = useState(() => window.matchMedia(QUERY).matches)
  useEffect(() => {
    const mq = window.matchMedia(QUERY)
    const onChange = () => setMobile(mq.matches)
    onChange()
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [])
  return mobile
}
