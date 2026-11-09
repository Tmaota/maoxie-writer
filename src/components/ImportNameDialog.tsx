// 这部分负责: 批量导入命名 —— 导入前给每章起名

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

/** 待导入章节行：来源文件 + 默认章节名 + 正文 */
export interface ImportRow {
  fileName: string
  defaultTitle: string
  content: string
}

interface ImportNameDialogProps {
  open: boolean
  rows: ImportRow[]
  bookName: string
  onOpenChange: (open: boolean) => void
  /** 确认导入，titles 与 rows 一一对应（空值回退为默认章节名） */
  onConfirm: (titles: string[]) => void
}

/** 批量导入章节前的命名弹窗：每个文件（或拆分出的每章）都可改名 */
export function ImportNameDialog({ open, rows, bookName, onOpenChange, onConfirm }: ImportNameDialogProps) {
  const [titles, setTitles] = useState<string[]>([])

  useEffect(() => {
    if (open) setTitles(rows.map((r) => r.defaultTitle))
  }, [open, rows])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[80vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>导入 {rows.length} 个章节到《{bookName}》</DialogTitle>
          <DialogDescription>导入前给每章命名；留空则使用默认名。</DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-2 py-2">
          {rows.map((row, i) => (
            <div key={i} className="flex items-center gap-2">
              <span className="w-24 shrink-0 truncate text-xs text-muted-foreground" title={row.fileName}>
                {row.fileName}
              </span>
              <Input
                value={titles[i] ?? ''}
                onChange={(e) => setTitles((ts) => ts.map((t, j) => (j === i ? e.target.value : t)))}
                placeholder={row.defaultTitle}
                className="h-8 flex-1 text-sm"
              />
            </div>
          ))}
        </div>
        <DialogFooter>
          <DialogClose asChild>
            <button className="rounded-md border border-border px-4 py-2 text-sm text-muted-foreground hover:bg-accent">
              取消
            </button>
          </DialogClose>
          <button
            onClick={() => onConfirm(titles.map((t, i) => t.trim() || rows[i].defaultTitle))}
            className="rounded-md bg-amber-600 px-4 py-2 text-sm font-medium text-white hover:bg-amber-500"
          >
            导入 {rows.length} 章
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
