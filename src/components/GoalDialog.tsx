// 这部分负责: 目标字数设置弹窗

import { useEffect, useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogFooter,
  DialogTitle,
  DialogDescription,
  DialogClose,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'

interface GoalDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** 弹窗标题，如「《xxx》完本目标」「本章目标」 */
  title: string
  description?: string
  /** 输入框标签（默认写作目标用法；修订模式传「部分数」） */
  inputLabel?: string
  /** 输入框占位提示 */
  inputPlaceholder?: string
  /** 初始目标字数（空为未设置） */
  initialTotal: number | null
  /** 是否显示完本日期（书级目标显示，章级不显示） */
  withDate?: boolean
  initialDate?: string | null
  /** 确认：总字数为 null 表示清除目标 */
  onConfirm: (total: number | null, date: string | null) => void
}

/** 写作目标设置弹窗：书级（总字数+完本日期）与章级（仅字数）共用 */
export function GoalDialog({ open, onOpenChange, title, description, inputLabel = '目标字数（留空并确定 = 清除目标）', inputPlaceholder = '例如 300000', initialTotal, withDate = false, initialDate, onConfirm }: GoalDialogProps) {
  const [total, setTotal] = useState('')
  const [date, setDate] = useState('')

  useEffect(() => {
    if (open) {
      setTotal(initialTotal != null && initialTotal > 0 ? String(initialTotal) : '')
      setDate(initialDate ?? '')
    }
  }, [open, initialTotal, initialDate])

  const submit = () => {
    const n = parseInt(total, 10)
    onConfirm(Number.isFinite(n) && n > 0 ? n : null, withDate && date ? date : null)
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description && <DialogDescription>{description}</DialogDescription>}
        </DialogHeader>
        <div className="space-y-3 py-2">
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">{inputLabel}</label>
            <Input
              value={total}
              onChange={(e) => setTotal(e.target.value.replace(/[^0-9]/g, ''))}
              placeholder={inputPlaceholder}
              inputMode="numeric"
              className="h-9 text-sm"
              autoFocus
            />
          </div>
          {withDate && (
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">预计完本日期（可选，用来倒推每天该写多少）</label>
              <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="h-9 text-sm" />
            </div>
          )}
        </div>
        <DialogFooter>
          <DialogClose asChild>
            <button className="rounded-md border border-border px-4 py-2 text-sm text-muted-foreground hover:bg-accent">
              取消
            </button>
          </DialogClose>
          <button
            onClick={submit}
            className="rounded-md bg-amber-600 px-4 py-2 text-sm font-medium text-white hover:bg-amber-500"
          >
            确定
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
