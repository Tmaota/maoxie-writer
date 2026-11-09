// 这部分负责: 时光机 —— 每章历史版本列表与一键恢复

import { useMemo, useState } from 'react'
import { History, RotateCcw } from 'lucide-react'
import type { Chapter } from '@/types'
import { diffLines } from '@/lib/merge'
import { countChars, formatCount } from '@/lib/wordcount'
import { getVersions } from '@/lib/versions'
import { ConfirmDialog } from './ConfirmDialog'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  chapter: Chapter
  /** 恢复到某个版本的完整内容（调用方负责真正写回章节） */
  onRestore: (content: string) => void
}

function fmtTime(ts: number): string {
  const d = new Date(ts)
  const today = new Date()
  const sameDay = d.toDateString() === today.toDateString()
  const hm = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
  return sameDay ? `今天 ${hm}` : `${d.getMonth() + 1}/${d.getDate()} ${hm}`
}

const MAX_DIFF_LINES = 300

/** 时光机：这一章的历史版本列表 + 与当前内容的差异对比 + 一键恢复 */
export function VersionsDialog({ open, onOpenChange, chapter, onRestore }: Props) {
  const versions = useMemo(() => (open ? getVersions(chapter.id) : []), [open, chapter.id])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [restoreOpen, setRestoreOpen] = useState(false)

  const selected = versions.find((v) => v.id === selectedId) ?? null

  const diff = useMemo(() => {
    if (!selected) return []
    const ops = diffLines(
      selected.content ? selected.content.split('\n') : [],
      chapter.content ? chapter.content.split('\n') : []
    )
    const rows: { type: 'del' | 'ins'; text: string }[] = []
    for (const op of ops) {
      if (op.type === 'del') {
        for (const l of op.lines.length ? op.lines : selected.content.split('\n').slice(op.oldStart, op.oldStart + op.count)) {
          rows.push({ type: 'del', text: l })
        }
      } else {
        for (const l of op.lines) rows.push({ type: 'ins', text: l })
      }
      if (rows.length > MAX_DIFF_LINES) break
    }
    return rows.slice(0, MAX_DIFF_LINES)
  }, [selected, chapter.content])

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="flex max-h-[85vh] flex-col sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <History className="h-4 w-4 text-amber-500" />
              时光机 · {chapter.title}
            </DialogTitle>
            <DialogDescription>
              每次自动保存时给这一章存一份版本（只存本机）。选中版本可与当前内容对比，或一键恢复。
            </DialogDescription>
          </DialogHeader>

          {versions.length === 0 ? (
            <p className="py-8 text-center text-xs text-muted-foreground">
              这一章还没有历史版本
              <br />
              改动并停笔几秒后，自动保存会留下第一份快照
            </p>
          ) : (
            <div className="flex min-h-0 flex-1 flex-col gap-2 py-2">
              {/* 版本列表 */}
              <div className="max-h-36 overflow-y-auto overscroll-contain rounded-md border border-border/60 [-webkit-overflow-scrolling:touch]">
                {versions.map((v, i) => (
                  <button
                    key={v.id}
                    onClick={() => setSelectedId(v.id === selectedId ? null : v.id)}
                    className={`flex w-full items-center gap-2 px-2.5 py-1.5 text-left text-xs transition-colors ${
                      v.id === selectedId ? 'bg-amber-500/15 text-foreground' : 'hover:bg-muted/60'
                    }`}
                  >
                    <span className="shrink-0 text-muted-foreground">{i === 0 ? '最新' : `#${i + 1}`}</span>
                    <span className="shrink-0">{fmtTime(v.time)}</span>
                    <span className="shrink-0 text-muted-foreground">{formatCount(countChars(v.content))} 字</span>
                    <span className="min-w-0 flex-1 truncate text-muted-foreground">
                      {(v.content.split('\n').find((l) => l.trim()) ?? '（空白）').slice(0, 30)}
                    </span>
                  </button>
                ))}
              </div>

              {/* 差异对比 */}
              {selected && (
                <div className="min-h-0 flex-1">
                  <div className="mb-1 flex items-center gap-2 text-[11px] text-muted-foreground">
                    <span>
                      {fmtTime(selected.time)} 的版本 ↔ 当前内容（{diff.length >= MAX_DIFF_LINES ? `前 ${MAX_DIFF_LINES} 行` : `${diff.length} 行差异`}）
                    </span>
                    <button
                      onClick={() => setRestoreOpen(true)}
                      className="ml-auto inline-flex items-center gap-1 rounded bg-amber-600 px-2 py-1 text-[11px] font-medium text-white hover:bg-amber-500"
                    >
                      <RotateCcw className="h-3 w-3" />
                      恢复此版本
                    </button>
                  </div>
                  <div className="max-h-[38vh] overflow-y-auto overscroll-contain rounded-md border border-border/60 bg-background/60 p-2 font-mono text-[11px] leading-5 [-webkit-overflow-scrolling:touch]">
                    {diff.length === 0 ? (
                      <p className="text-muted-foreground">与当前内容完全一致</p>
                    ) : (
                      diff.map((r, i) => (
                        <div
                          key={i}
                          className={
                            r.type === 'del'
                              ? 'whitespace-pre-wrap break-all rounded bg-red-500/10 px-1 text-red-400'
                              : 'whitespace-pre-wrap break-all rounded bg-emerald-500/10 px-1 text-emerald-400'
                          }
                        >
                          {r.type === 'del' ? `- ${r.text}` : `+ ${r.text}`}
                        </div>
                      ))
                    )}
                  </div>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={restoreOpen}
        onOpenChange={setRestoreOpen}
        title={`恢复到 ${selected ? fmtTime(selected.time) : ''} 的版本？`}
        description="这一章的当前内容会被该版本覆盖（当前内容也会先存进版本列表，随时可以换回来）。"
        confirmText="恢复"
        onConfirm={() => {
          if (selected) onRestore(selected.content)
          setRestoreOpen(false)
          onOpenChange(false)
        }}
      />
    </>
  )
}
