// 这部分负责: 导出命名 —— 导出前自定义文件名

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

interface ExportNameDialogProps {
  open: boolean
  /** 默认文件名（不含扩展名），也是输入留空时的回退值 */
  defaultName: string
  ext: string
  onOpenChange: (open: boolean) => void
  onConfirm: (name: string) => void
}

/** 导出前的命名弹窗：留空确定则使用默认名 */
export function ExportNameDialog({ open, defaultName, ext, onOpenChange, onConfirm }: ExportNameDialogProps) {
  const [name, setName] = useState(defaultName)

  useEffect(() => {
    if (open) setName(defaultName)
  }, [open, defaultName])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>导出命名</DialogTitle>
          <DialogDescription>
            留空直接确定，将默认命名为「{defaultName}」。
          </DialogDescription>
        </DialogHeader>
        <div className="py-2">
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={defaultName}
            className="h-9 text-sm"
            autoFocus
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                onConfirm(name.trim() || defaultName)
                onOpenChange(false)
              }
            }}
          />
          <p className="mt-1.5 text-xs text-muted-foreground">
            将导出为 {((name.trim() || defaultName))}.{ext}
          </p>
        </div>
        <DialogFooter>
          <DialogClose asChild>
            <button className="rounded-md border border-border px-4 py-2 text-sm text-muted-foreground hover:bg-accent">
              取消
            </button>
          </DialogClose>
          <button
            onClick={() => {
              onConfirm(name.trim() || defaultName)
              onOpenChange(false)
            }}
            className="rounded-md bg-amber-600 px-4 py-2 text-sm font-medium text-white hover:bg-amber-500"
          >
            确定导出
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
