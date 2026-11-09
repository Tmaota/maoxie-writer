// 这部分负责: 写作热力图 —— 最近每天的码字量格子墙

import { useMemo } from 'react'
import { Flame } from 'lucide-react'
import { getWritingSummary } from '@/lib/stats'
import { formatCount } from '@/lib/wordcount'

interface Cell {
  key: string
  label: string
  count: number
  /** 0=无数据 1-4 强度 */
  level: number
}

/** 书架层的写作热力图 + 今日/连续/累计统计（GitHub 贡献图样式，最近约 20 周） */
export function WritingStats() {
  const summary = useMemo(() => getWritingSummary(), [])
  const { days, today, total, streak, longestStreak } = summary

  const weeks = useMemo(() => {
    const max = Math.max(1, ...Object.values(days))
    const now = new Date()
    // 对齐到本周一往前 19 周，共 20 列 × 7 行
    const monday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - ((now.getDay() + 6) % 7))
    const cols: Cell[][] = []
    for (let w = 19; w >= 0; w--) {
      const col: Cell[] = []
      for (let d = 0; d < 7; d++) {
        const date = new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() - w * 7 + d)
        const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
        const count = days[key] ?? 0
        const future = date.getTime() > now.getTime()
        col.push({
          key,
          label: `${key} · ${formatCount(count)} 字`,
          count,
          level: future ? 0 : count <= 0 ? 0 : count >= max * 0.75 ? 4 : count >= max * 0.5 ? 3 : count >= max * 0.25 ? 2 : 1,
        })
      }
      cols.push(col)
    }
    return cols
  }, [days])

  const levelClass = ['bg-muted/40', 'bg-amber-500/25', 'bg-amber-500/45', 'bg-amber-500/70', 'bg-amber-500']

  return (
    <div className="rounded-md border border-border/60 bg-card/60 p-2">
      <div className="flex items-center gap-1.5 text-[11px] font-semibold">
        <Flame className="h-3.5 w-3.5 text-amber-500" />
        写作热力
        <span className="ml-auto font-normal text-muted-foreground">
          今日 <span className="font-medium text-amber-500">{formatCount(today)}</span> 字 · 连续{' '}
          <span className="font-medium text-amber-500">{streak}</span> 天
          {longestStreak > streak && <span className="text-muted-foreground/70">（最长 {longestStreak}）</span>} · 累计{' '}
          <span className="font-medium text-foreground">{formatCount(total)}</span>
        </span>
      </div>
      {/* 原生横向滚动：安卓 WebView 里 Radix ScrollArea 触摸滚动会失效 */}
      <div className="mt-1.5 overflow-x-auto overscroll-contain [-webkit-overflow-scrolling:touch]">
        <div className="flex gap-[2px]">
          {weeks.map((col, i) => (
            <div key={i} className="flex flex-col gap-[2px]">
              {col.map((cell) => (
                <div
                  key={cell.key}
                  title={cell.label}
                  className={`h-[10px] w-[10px] shrink-0 rounded-[2px] ${levelClass[cell.level]}`}
                />
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
