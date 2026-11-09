// 这部分负责: 修改记录浮窗 —— 每章/每 Part 各自一份、跳转定位、回退

import { useState } from 'react'
import { History, X, ChevronLeft, CornerDownLeft, Trash2, Eraser, Undo2, FileText } from 'lucide-react'
import type { EditRecord } from '@/types'
import { KIND_LABEL, timeAgo } from '@/lib/edits'
import { Button } from '@/components/ui/button'
import { ConfirmDialog } from './ConfirmDialog'

interface Props {
  /** 当前归属（当前章 / 当前 P）的记录 */
  edits: EditRecord[]
  /** 全部记录 */
  allEdits: EditRecord[]
  totalCount: number
  open: boolean
  onToggle: () => void
  onJump: (edit: EditRecord) => void
  onDelete: (id: string) => void
  onClear: (ids: string[]) => void
  /** 回退到这次修改之前（ed.snap 为修改前整章内容；没有快照的旧记录不可回退） */
  onRevert: (edit: EditRecord) => void
  /** 手机端：全屏「历史版本」页（仿原子笔记） */
  mobile?: boolean
  /** 「当前版本」卡片标题（当前章 / Part 名） */
  ctxLabel?: string
  /** 「当前版本」卡片预览（正文开头） */
  ctxPreview?: string
  /** 是否显示收起状态的圆形浮泡（默认 true；手机端已在顶栏 ⋯ 菜单里集成入口，传 false） */
  bubble?: boolean
}

/**
 * 底边浮泡：收起时是圆形浮泡，点开后从底部向上展开修改记录面板。
 * 「当前」= 正在写的这一章 / 这一个 Part 的记录；「全部」= 所有书的记录。
 * 点击某条记录跳转到正文对应位置（那一行/那段会显示在屏幕正中并选中）。
 */
export function EditsDock({ edits, allEdits, totalCount, open, onToggle, onJump, onDelete, onClear, onRevert, mobile = false, ctxLabel, ctxPreview, bubble = true }: Props) {
  const [tab, setTab] = useState<'ctx' | 'all'>('ctx')
  const [clearOpen, setClearOpen] = useState(false)
  /** 待回退的记录（连同它之后同章的修改条数，一起放进确认文案） */
  const [revertReq, setRevertReq] = useState<{ ed: EditRecord; newer: number } | null>(null)

  if (!open) {
    if (!bubble) return null
    return (
      <button
        onClick={onToggle}
        title="最近修改记录"
        className="fixed right-3 bottom-[4.5rem] z-50 flex h-12 w-12 items-center justify-center rounded-full bg-amber-500 text-black shadow-lg shadow-black/40 transition-transform hover:scale-105 lg:right-4 lg:bottom-10"
      >
        <History className="h-5 w-5" />
        {totalCount > 0 && (
          <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-background px-1 text-[10px] font-bold text-amber-500 ring-1 ring-amber-500/50">
            {totalCount > 99 ? '99+' : totalCount}
          </span>
        )}
      </button>
    )
  }

  const list = tab === 'ctx' ? edits : allEdits

  /** 单条记录卡片（桌面浮窗与手机全屏页共用） */
  const RecordCard = ({ ed }: { ed: EditRecord }) => (
    <div
      onClick={() => onJump(ed)}
      className="group relative w-full cursor-pointer rounded-md border border-border/60 p-2 pr-7 text-left transition-colors hover:border-amber-500/40 hover:bg-amber-500/5"
    >
      <button
        onClick={(e) => {
          e.stopPropagation()
          onDelete(ed.id)
        }}
        title="删除这条记录"
        className="absolute right-1 top-1 rounded p-0.5 text-muted-foreground opacity-0 transition-opacity hover:bg-destructive/20 hover:text-destructive group-hover:opacity-100"
      >
        <Trash2 className="h-3 w-3" />
      </button>
      <button
        onClick={(e) => {
          e.stopPropagation()
          if (ed.snap == null) return
          setRevertReq({
            ed,
            newer: allEdits.filter((x) => x.chapterId === ed.chapterId && x.time > ed.time).length,
          })
        }}
        disabled={ed.snap == null}
        title={ed.snap != null ? '回退到这次修改之前' : '这条是旧记录，升级前没有存修改前备份，无法回退'}
        className="absolute right-6 top-1 rounded p-0.5 text-muted-foreground opacity-0 transition-opacity hover:bg-amber-500/20 hover:text-amber-400 group-hover:opacity-100 disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-muted-foreground"
      >
        <Undo2 className="h-3 w-3" />
      </button>
      <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
        <span className="rounded bg-muted px-1 py-0.5 font-medium text-foreground">
          {KIND_LABEL[ed.kind]}
        </span>
        {ed.comboName && (
          <span className="shrink-0 rounded bg-amber-500/15 px-1 py-0.5 font-medium text-amber-400">
            P·{ed.comboName}
          </span>
        )}
        <span className="truncate">
          《{ed.bookName}》{ed.chapterTitle}
        </span>
        <span className="shrink-0">{timeAgo(ed.time)}</span>
      </div>
      <div className="mt-1 space-y-0.5 text-[11px] leading-4">
        {ed.before && (
          <div className="truncate text-muted-foreground line-through opacity-70">-{ed.before}</div>
        )}
        {ed.after && <div className="truncate text-emerald-400">+{ed.after}</div>}
      </div>
      <div className="mt-1 hidden items-center gap-1 text-[10px] text-amber-500 group-hover:flex">
        <CornerDownLeft className="h-3 w-3" />
        跳转到修改处
      </div>
    </div>
  )

  /* ---------- 手机端：历史版本式全屏页 ---------- */
  if (mobile) {
    return (
      <div className="fixed inset-0 z-50 flex flex-col bg-background" style={{ paddingTop: 'var(--sat, env(safe-area-inset-top, 0px))' }}>
        <div className="flex h-12 shrink-0 items-center gap-1 border-b border-border/60 px-2">
          <Button variant="ghost" size="icon" className="h-9 w-9" onClick={onToggle} aria-label="返回">
            <ChevronLeft className="h-5 w-5" />
          </Button>
          <span className="text-sm font-semibold">修改记录</span>
          <span className="text-xs text-muted-foreground">（{totalCount}）</span>
          <span className="flex-1" />
          <Button
            variant="ghost"
            size="icon"
            className="h-9 w-9"
            onClick={() => setClearOpen(true)}
            title={tab === 'ctx' ? '清空当前视图的记录' : '清空全部记录'}
            disabled={!list.length}
          >
            <Eraser className="h-4 w-4" />
          </Button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 pb-8 [-webkit-overflow-scrolling:touch]">
          <p className="px-1 pt-3 pb-2 text-[11px] text-muted-foreground">
            点击一条记录，正文会跳到修改的位置
          </p>

          {/* 当前版本卡片 */}
          <div className="mb-3 flex items-center gap-3 rounded-xl border border-border/60 bg-card p-3">
            <FileText className="h-5 w-5 shrink-0 text-amber-500" />
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-semibold">{ctxLabel || '当前文稿'}</div>
              <div className="truncate text-[11px] text-muted-foreground">
                {ctxPreview || '（还没有内容）'}
              </div>
            </div>
            <span className="shrink-0 rounded bg-emerald-500/15 px-1.5 py-0.5 text-[10px] font-medium text-emerald-500">
              当前版本
            </span>
          </div>

          <div className="mb-3 flex rounded-md bg-muted p-0.5 text-xs">
            <button
              onClick={() => setTab('ctx')}
              className={`flex-1 rounded py-1.5 transition-colors ${
                tab === 'ctx' ? 'bg-background font-medium text-foreground shadow-sm' : 'text-muted-foreground'
              }`}
            >
              当前{edits.length > 0 && ` ${edits.length}`}
            </button>
            <button
              onClick={() => setTab('all')}
              className={`flex-1 rounded py-1.5 transition-colors ${
                tab === 'all' ? 'bg-background font-medium text-foreground shadow-sm' : 'text-muted-foreground'
              }`}
            >
              全部{allEdits.length > 0 && ` ${allEdits.length}`}
            </button>
          </div>

          {list.length === 0 && (
            <p className="py-10 text-center text-xs text-muted-foreground">
              {tab === 'ctx' ? '当前这一章 / 这一个 Part 还没有修改记录' : '还没有修改记录'}
              <br />
              动笔之后，这里会记下每次改了哪里
            </p>
          )}
          <div className="space-y-2">
            {list.map((ed) => (
            <RecordCard key={ed.id} ed={ed} />
          ))}
        </div>
      </div>

      <ConfirmDialog
        open={clearOpen}
        onOpenChange={setClearOpen}
        title={`清空${tab === 'ctx' ? '当前视图' : '全部'}的修改记录？`}
        description={`将删除 ${list.length} 条修改记录，正文内容不受影响。`}
        onConfirm={() => onClear(list.map((e) => e.id))}
      />
      <ConfirmDialog
        open={revertReq !== null}
        onOpenChange={(v) => {
          if (!v) setRevertReq(null)
        }}
        title={`回退《${revertReq?.ed.bookName}》${revertReq?.ed.chapterTitle}？`}
        description={
          revertReq && revertReq.newer > 0
            ? `将把这章恢复到「${KIND_LABEL[revertReq.ed.kind]}：${revertReq.ed.before || revertReq.ed.after}」这次修改之前的样子。注意：这之后还有 ${revertReq.newer} 处修改，会被一起覆盖。`
            : `将把这章恢复到这次${revertReq ? KIND_LABEL[revertReq.ed.kind] : ''}修改之前的样子（只影响这一章）。`
        }
        confirmText="回退"
        onConfirm={() => {
          if (revertReq) onRevert(revertReq.ed)
          setRevertReq(null)
        }}
      />
      </div>
    )
  }

  /* ---------- 桌面端：底边浮泡 + 浮窗 ---------- */
  return (
    <div className="fixed right-3 bottom-[4.5rem] left-3 z-50 flex max-h-[70vh] flex-col overflow-hidden rounded-lg border border-border bg-popover shadow-xl shadow-black/50 lg:right-4 lg:bottom-10 lg:left-auto lg:w-[400px] lg:max-w-[calc(100vw-2rem)]">
      <div className="flex items-center gap-2 border-b border-border/60 px-3 py-2">
        <History className="h-4 w-4 shrink-0 text-amber-500" />
        <div className="flex shrink-0 rounded-md bg-muted p-0.5 text-[11px]">
          <button
            onClick={() => setTab('ctx')}
            className={`rounded px-2 py-0.5 transition-colors ${
              tab === 'ctx' ? 'bg-background font-medium text-foreground shadow-sm' : 'text-muted-foreground'
            }`}
          >
            当前{edits.length > 0 && ` ${edits.length}`}
          </button>
          <button
            onClick={() => setTab('all')}
            className={`rounded px-2 py-0.5 transition-colors ${
              tab === 'all' ? 'bg-background font-medium text-foreground shadow-sm' : 'text-muted-foreground'
            }`}
          >
            全部{allEdits.length > 0 && ` ${allEdits.length}`}
          </button>
        </div>
        <span className="flex-1 truncate text-[10px] text-muted-foreground">点击一条，正文跳到修改位置</span>
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6 shrink-0"
          onClick={() => setClearOpen(true)}
          title={tab === 'ctx' ? '清空当前视图的记录' : '清空全部记录'}
          disabled={!list.length}
        >
          <Eraser className="h-3.5 w-3.5" />
        </Button>
        <Button variant="ghost" size="icon" className="h-6 w-6 shrink-0" onClick={onToggle} title="收起为浮泡">
          <X className="h-4 w-4" />
        </Button>
      </div>
      {/* 原生滚动：Radix ScrollArea 在安卓 WebView 里触摸滚动会失效 */}
      <div className="max-h-[46vh] overflow-y-auto overscroll-contain [-webkit-overflow-scrolling:touch]">
        <div className="space-y-1.5 p-2">
          {list.length === 0 && (
            <p className="px-2 py-8 text-center text-xs text-muted-foreground">
              {tab === 'ctx' ? '当前这一章 / 这一个 Part 还没有修改记录' : '还没有修改记录'}
              <br />
              动笔之后，这里会记下每次改了哪里
            </p>
          )}
          {list.map((ed) => (
            <RecordCard key={ed.id} ed={ed} />
          ))}
        </div>
      </div>

      <ConfirmDialog
        open={clearOpen}
        onOpenChange={setClearOpen}
        title={`清空${tab === 'ctx' ? '当前视图' : '全部'}的修改记录？`}
        description={`将删除 ${list.length} 条修改记录，正文内容不受影响。`}
        onConfirm={() => onClear(list.map((e) => e.id))}
      />
      <ConfirmDialog
        open={revertReq !== null}
        onOpenChange={(v) => {
          if (!v) setRevertReq(null)
        }}
        title={`回退《${revertReq?.ed.bookName}》${revertReq?.ed.chapterTitle}？`}
        description={
          revertReq && revertReq.newer > 0
            ? `将把这章恢复到「${KIND_LABEL[revertReq.ed.kind]}：${revertReq.ed.before || revertReq.ed.after}」这次修改之前的样子。注意：这之后还有 ${revertReq.newer} 处修改，会被一起覆盖。`
            : `将把这章恢复到这次${revertReq ? KIND_LABEL[revertReq.ed.kind] : ''}修改之前的样子（只影响这一章）。`
        }
        confirmText="回退"
        onConfirm={() => {
          if (revertReq) onRevert(revertReq.ed)
          setRevertReq(null)
        }}
      />
    </div>
  )
}
