// 这部分负责: 主题模式选择 —— 日间/夜间/跟随系统

import { Sun, Moon, MonitorCog } from 'lucide-react'
import type { ThemeMode } from '@/lib/theme'

const OPTIONS: { key: ThemeMode; label: string; icon: React.ReactNode }[] = [
  { key: 'light', label: '日间', icon: <Sun className="h-4 w-4" /> },
  { key: 'dark', label: '夜间', icon: <Moon className="h-4 w-4" /> },
  { key: 'system', label: '跟随系统', icon: <MonitorCog className="h-4 w-4" /> },
]

/** 主题模式三选一：日间 / 夜间 / 跟随系统 */
export function ThemeModePicker({
  value,
  onChange,
}: {
  value: ThemeMode
  onChange: (m: ThemeMode) => void
}) {
  return (
    <div className="flex gap-1.5">
      {OPTIONS.map((o) => (
        <button
          key={o.key}
          onClick={() => onChange(o.key)}
          className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg border py-2 text-xs transition-colors ${
            value === o.key
              ? 'border-amber-500/60 bg-amber-500/10 text-foreground'
              : 'border-border/60 text-muted-foreground active:bg-muted/60'
          }`}
        >
          {o.icon}
          {o.label}
        </button>
      ))}
    </div>
  )
}
