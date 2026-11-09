// 这部分负责: 二次确认弹窗 —— 删书/删章/删 Part 防手滑

import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogFooter,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogAction,
  AlertDialogCancel,
} from '@/components/ui/alert-dialog'

interface ConfirmDialogProps {
  open: boolean
  title: string
  description?: string
  confirmText?: string
  cancelText?: string
  /** 只提示不操作（如"最后一本书不能删"）：隐藏确认按钮 */
  noticeOnly?: boolean
  onConfirm?: () => void
  onOpenChange: (open: boolean) => void
}

/** 统一的二次确认弹窗（替代 Electron 不支持的 window.confirm） */
export function ConfirmDialog({
  open,
  title,
  description,
  confirmText = '确定删除',
  cancelText = '取消',
  noticeOnly = false,
  onConfirm,
  onOpenChange,
}: ConfirmDialogProps) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          {description && <AlertDialogDescription>{description}</AlertDialogDescription>}
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>{noticeOnly ? '知道了' : cancelText}</AlertDialogCancel>
          {!noticeOnly && (
            <AlertDialogAction
              onClick={onConfirm}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {confirmText}
            </AlertDialogAction>
          )}
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
