// 这部分负责: 章节状态图标 —— 草稿/已发布/待修改三种标记

import { Pencil, BookOpenCheck, AlertTriangle } from 'lucide-react'
import type { ChapterStatus } from '@/types'
import { STATUS_META } from '@/types'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'

const CONFIG: Record<ChapterStatus, { icon: typeof Pencil; className: string; dot: string }> = {
  draft: {
    icon: Pencil,
    className: 'text-sky-400',
    dot: 'bg-sky-400',
  },
  published: {
    icon: BookOpenCheck,
    className: 'text-emerald-400',
    dot: 'bg-emerald-400',
  },
  revise: {
    icon: AlertTriangle,
    className: 'text-amber-400',
    dot: 'bg-amber-400',
  },
}

export function StatusIcon({ status, className = 'h-3.5 w-3.5' }: { status: ChapterStatus; className?: string }) {
  const cfg = CONFIG[status]
  const Icon = cfg.icon
  return <Icon className={`${className} ${cfg.className}`} aria-label={STATUS_META[status].label} />
}

// ─────────────── ┏(ΦωΦ)┛ ───────────────

export function StatusBadge({ status }: { status: ChapterStatus }) {
  const cfg = CONFIG[status]
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="inline-flex items-center gap-1 rounded-full border border-border/60 bg-background/50 px-1.5 py-0.5 text-[10px]">
          <span className={`h-1.5 w-1.5 rounded-full ${cfg.dot}`} />
          <span className="text-muted-foreground">{STATUS_META[status].label}</span>
        </span>
      </TooltipTrigger>
      <TooltipContent side="top">{STATUS_META[status].hint}</TooltipContent>
    </Tooltip>
  )
}
