// 这部分负责: 修稿对比 —— 原文/修订稿段落级并排，逐段选哪版，合成定稿

import { useEffect, useMemo, useState } from 'react'
import { GitCompareArrows, Check, CornerDownRight } from 'lucide-react'
import { diffParagraphs, mergeDiff, type DiffBlock } from '@/lib/ai'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'

// ─────────────── ฅ(ΦωΦ)ฅ ───────────────

export interface DiffRequest {
  title: string
  hint?: string
  original: string
  revised: string
  onConfirm: (merged: string) => void
}

interface Props {
  req: DiffRequest | null
  onClose: () => void
}

// ─────────────── (=`ω´=) ───────────────

function BlockRow({ bk, choice, onPick }: { bk: DiffBlock; choice: boolean; onPick: (v: boolean) => void }) {
  if (bk.kind === 'same') {
    return (
      <div className="rounded-md bg-muted/20 px-3 py-2 text-[13px] leading-6 text-muted-foreground">
        {bk.oldText}
      </div>
    )
  }
  return (
    <div className={`overflow-hidden rounded-md border ${choice ? 'border-emerald-500/40' : 'border-amber-500/40'}`}>
      <div className="flex items-center justify-end gap-1 border-b border-border/50 bg-muted/40 px-2 py-1 text-[10px]">
        <button
          onClick={() => onPick(false)}
          className={`flex items-center gap-0.5 rounded px-1.5 py-0.5 ${!choice ? 'bg-amber-500/80 font-medium text-black' : 'text-muted-foreground hover:text-foreground'}`}
        >
          用原版
        </button>
        <button
          onClick={() => onPick(true)}
          className={`flex items-center gap-0.5 rounded px-1.5 py-0.5 ${choice ? 'bg-emerald-500/80 font-medium text-black' : 'text-muted-foreground hover:text-foreground'}`}
        >
          用新版
        </button>
      </div>
      <div className="grid grid-cols-1 gap-0 sm:grid-cols-2">
        {(bk.kind === 'changed' || bk.kind === 'removed') && (
          <div className={`px-3 py-2 text-[13px] leading-6 ${!choice ? 'bg-amber-500/10' : 'opacity-50 line-through decoration-amber-500/50'}`}>
            {bk.oldText}
          </div>
        )}
        {(bk.kind === 'changed' || bk.kind === 'added') && (
          <div className={`px-3 py-2 text-[13px] leading-6 ${choice ? 'bg-emerald-500/10' : 'opacity-50'}`}>
            <span className="mb-0.5 flex items-center gap-0.5 text-[10px] text-emerald-600 dark:text-emerald-400">
              <CornerDownRight className="h-3 w-3" />
              修订
            </span>
            {bk.newText}
          </div>
        )}
      </div>
    </div>
  )
}

// ─────────────── ヾ(ΦωΦ) ───────────────

export function DiffDialog({ req, onClose }: Props) {
  const [choice, setChoice] = useState<Record<number, boolean>>({})
  const [choiceKey, setChoiceKey] = useState<DiffRequest | null>(null)
  const blocks = useMemo(() => (req ? diffParagraphs(req.original, req.revised) : []), [req])

  // 换一份对比时重置选择，默认改动一律用新版
  useEffect(() => {
    if (req && req !== choiceKey) {
      setChoiceKey(req)
      const init: Record<number, boolean> = {}
      diffParagraphs(req.original, req.revised).forEach((bk, i) => {
        if (bk.kind !== 'same') init[i] = true
      })
      setChoice(init)
    }
  }, [req, choiceKey])

  if (!req) return null

  const pickAll = (v: boolean) => setChoice(Object.fromEntries(blocks.map((_, i) => [i, v])))
  const changedCount = blocks.filter((b) => b.kind !== 'same').length

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="flex max-h-[85vh] w-[min(860px,96vw)] flex-col gap-0 p-0">
        <DialogHeader className="border-b border-border/60 px-4 py-3">
          <DialogTitle className="flex items-center gap-1.5 text-sm">
            <GitCompareArrows className="h-4 w-4 text-amber-500" />
            修稿对比 · {req.title}
          </DialogTitle>
          <DialogDescription className="text-xs">
            共 {changedCount} 处改动，逐段选「用原版」还是「用新版」，选完点定稿。没动的段落保持原样。
            {req.hint ? ` ${req.hint}` : ''}
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="min-h-0 flex-1">
          <div className="space-y-2 p-3">
            {blocks.map((bk, i) => (
              <BlockRow key={i} bk={bk} choice={choice[i] !== false} onPick={(v) => setChoice((c) => ({ ...c, [i]: v }))} />
            ))}
          </div>
        </ScrollArea>

        <div className="flex items-center gap-2 border-t border-border/60 px-4 py-3">
          <Button variant="outline" size="sm" className="h-8 text-xs" onClick={() => pickAll(true)}>
            全部用新版
          </Button>
          <Button variant="outline" size="sm" className="h-8 text-xs" onClick={() => pickAll(false)}>
            全部用原版
          </Button>
          <span className="flex-1" />
          <Button variant="ghost" size="sm" className="h-8 text-xs" onClick={onClose}>
            取消
          </Button>
          <Button size="sm" className="h-8 gap-1 text-xs" onClick={() => req.onConfirm(mergeDiff(blocks, choice))}>
            <Check className="h-3.5 w-3.5" />
            定稿（写入章节）
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
