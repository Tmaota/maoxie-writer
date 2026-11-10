// 这部分负责: 审稿报告 —— 逐条勾选采纳/忽略，确认后驱动修稿或直接用初稿

import { useEffect, useState } from 'react'
import { Check, X, Quote, ClipboardCheck } from 'lucide-react'
import type { ReviewReport } from '@/lib/ai'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'

// ─────────────── ฅ(ΦωΦ)ฅ ───────────────

interface Props {
  report: ReviewReport | null
  onClose: () => void
  /** 勾选确认：adopt=条目id→是否采纳；mode=revise 修稿 / draft 直接用初稿 */
  onConfirm: (adopt: Record<number, boolean>, mode: 'revise' | 'draft') => void
}

// ─────────────── (=`ω´=) ───────────────

export function ReviewReportDialog({ report, onClose, onConfirm }: Props) {
  const [adopt, setAdopt] = useState<Record<number, boolean>>({})

  useEffect(() => {
    if (report) {
      const init: Record<number, boolean> = {}
      for (const it of report.items) init[it.id] = true
      setAdopt(init)
    }
  }, [report])

  if (!report) return null
  const adoptedCount = report.items.filter((it) => adopt[it.id]).length

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="flex max-h-[82vh] w-[min(720px,94vw)] flex-col gap-0 p-0">
        <DialogHeader className="border-b border-border/60 px-4 py-3">
          <DialogTitle className="flex items-center gap-1.5 text-sm">
            <ClipboardCheck className="h-4 w-4 text-amber-500" />
            审稿报告 · 《{report.bookName}》{report.chapterTitle}
          </DialogTitle>
          <DialogDescription className="text-xs">
            共 {report.items.length} 条意见，已勾选采纳 {adoptedCount} 条。勾上的会让 Claude 修掉，没勾的保留原样。
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="min-h-0 flex-1">
          {report.items.length === 0 ? (
            <div className="px-4 py-10 text-center text-sm text-muted-foreground">
              Claude 自查一圈，没有发现踩红线的句子。可以直接定稿。
            </div>
          ) : (
            <ul className="space-y-2 p-3">
              {report.items.map((it) => {
                const on = adopt[it.id] !== false
                return (
                  <li
                    key={it.id}
                    className={`cursor-pointer rounded-md border p-2.5 text-xs transition-colors ${
                      on ? 'border-amber-500/40 bg-amber-500/5' : 'border-border/60 opacity-60'
                    }`}
                    onClick={() => setAdopt((a) => ({ ...a, [it.id]: !on }))}
                  >
                    <div className="flex items-start gap-2">
                      <span
                        className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded border ${
                          on ? 'border-amber-500 bg-amber-500 text-black' : 'border-border'
                        }`}
                      >
                        {on && <Check className="h-3 w-3" />}
                      </span>
                      <div className="min-w-0 flex-1 space-y-1">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium">{it.rule}</span>
                          {it.para > 0 && <span className="text-[10px] text-muted-foreground">第 {it.para} 段</span>}
                        </div>
                        {it.original && (
                          <div className="flex gap-1 rounded bg-background/70 p-1.5 text-muted-foreground">
                            <Quote className="h-3 w-3 shrink-0 translate-y-0.5" />
                            <span className="min-w-0">{it.original}</span>
                          </div>
                        )}
                        <div className="text-foreground/90">{it.problem}</div>
                        {it.suggestion && (
                          <div className="text-emerald-600 dark:text-emerald-400">
                            建议：{it.suggestion}
                          </div>
                        )}
                      </div>
                    </div>
                  </li>
                )
              })}
            </ul>
          )}
        </ScrollArea>

        <div className="flex items-center gap-2 border-t border-border/60 px-4 py-3">
          <Button variant="outline" size="sm" className="h-8 gap-1 text-xs" onClick={() => setAdopt(Object.fromEntries(report.items.map((i) => [i.id, true])))}>
            <Check className="h-3.5 w-3.5" />
            全采纳
          </Button>
          <Button variant="outline" size="sm" className="h-8 gap-1 text-xs" onClick={() => setAdopt(Object.fromEntries(report.items.map((i) => [i.id, false])))}>
            <X className="h-3.5 w-3.5" />
            全忽略
          </Button>
          <span className="flex-1" />
          <Button variant="ghost" size="sm" className="h-8 text-xs" onClick={onClose}>
            先放着
          </Button>
          {report.items.length > 0 && (
            <Button variant="outline" size="sm" className="h-8 text-xs" onClick={() => onConfirm(adopt, 'draft')}>
              不修稿，直接用初稿
            </Button>
          )}
          <Button size="sm" className="h-8 gap-1 text-xs" onClick={() => onConfirm(adopt, 'revise')}>
            <Check className="h-3.5 w-3.5" />
            确认勾选项，让 Claude 修稿
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
