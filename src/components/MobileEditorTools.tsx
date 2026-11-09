// 这部分负责: 手机编辑工具 —— 页面调节弹层、字号微调

import type { ReactNode } from 'react'
import { Sheet, SheetContent } from '@/components/ui/sheet'
import { Slider } from '@/components/ui/slider'
import { FONT_SIZE_MIN, FONT_SIZE_MAX } from '@/lib/settings'

/** 手机写作页的「页面调节」底部弹层（仿原子笔记：圆角上拉面板） */
export function TuneSheet({
  open,
  onOpenChange,
  children,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  children: ReactNode
}) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        className="max-h-[80%] overflow-y-auto overscroll-contain rounded-t-2xl px-4 pt-3 pb-8 [-webkit-overflow-scrolling:touch]"
      >
        <h3 className="mb-4 text-center text-sm font-semibold tracking-wide">页面调节</h3>
        {children}
      </SheetContent>
    </Sheet>
  )
}

// ─────────────── ฅ(ΦωΦ)ฅ ───────────────

export function TuneSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="mb-5">
      <div className="mb-2 text-xs font-medium text-muted-foreground">{title}</div>
      {children}
    </div>
  )
}

/** 字号调节：A- 滑杆 A+ + 常用字号快捷钮 */
export function FontTune({
  value,
  onChange,
  quick = [14, 16, 18, 20, 24],
}: {
  value: number
  onChange: (v: number) => void
  quick?: number[]
}) {
  return (
    <div>
      <div className="flex items-center gap-3">
        <button
          onClick={() => onChange(value - 1)}
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-border/60 text-[11px] font-bold text-muted-foreground active:bg-muted"
          aria-label="减小字号"
        >
          A-
        </button>
        <Slider
          className="flex-1"
          min={FONT_SIZE_MIN}
          max={FONT_SIZE_MAX}
          step={1}
          value={[value]}
          onValueChange={([v]) => onChange(v)}
        />
        <button
          onClick={() => onChange(value + 1)}
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-border/60 text-[13px] font-bold text-muted-foreground active:bg-muted"
          aria-label="增大字号"
        >
          A+
        </button>
        <span className="w-11 shrink-0 text-right text-xs font-semibold text-amber-500">{value}px</span>
      </div>
      <div className="mt-2.5 flex flex-wrap gap-2">
        {quick.map((q) => (
          <button
            key={q}
            onClick={() => onChange(q)}
            className={`h-7 rounded-md border px-2.5 text-xs transition-colors ${
              value === q
                ? 'border-amber-500 bg-amber-500/15 font-medium text-amber-500'
                : 'border-border/60 text-muted-foreground active:bg-muted'
            }`}
          >
            {q}
          </button>
        ))}
      </div>
    </div>
  )
}
