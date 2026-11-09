// 这部分负责: 修订面板 —— 均分部分列表、每部分预览与“确认修改完成”

import { useMemo } from 'react'
import { Check, CheckCircle2, Circle, ListChecks, RotateCcw, Scissors, X } from 'lucide-react'
import type { RevisionState } from '@/types'
import { previewWithCaret, revisionParts, revRowState } from '@/lib/revision'

interface Props {
  /** 修订对象标题（章名 / Part 名） */
  title: string
  /** 全文（章内容 / 合并文稿） */
  text: string
  revision: RevisionState | null | undefined
  open: boolean
  onToggle: () => void
  /** 跳转到某部分（落在记录的最后修改位置，没有记录则部分开头），partIndex 用于选中高亮 */
  onJump: (pos: number, partIndex: number) => void
  /** 手动确认 / 重新打开某部分 */
  onToggleDone: (partIndex: number) => void
  /** 重新设置部分数 */
  onResplit: () => void
}

/**
 * 修订面板浮泡：收起时是圆形浮泡（显示 完成/总部分数），
 * 点开后从底部向上展开部分目标列表。
 * 每行：状态图标（待修改/修改中/已完成）+ 该部分预览（“最后改到”的位置插入 ▏光标）+ 字数 + 手动确认按钮。
 */
export function RevisionDock({ title, text, revision, open, onToggle, onJump, onToggleDone, onResplit }: Props) {
  const { parts, doneSet, lastPart, total, doneCount } = useMemo(
    () => revisionParts(text, revision),
    [text, revision],
  )
  const lastI = lastPart && revision?.last ? revision.last.i : null
  const allDone = total > 0 && doneCount >= total

  if (!open) {
    return (
      <button
        onClick={onToggle}
        title="修订目标"
        className="fixed right-3 bottom-[10rem] z-50 flex h-12 w-12 items-center justify-center rounded-full bg-emerald-600 text-white shadow-lg shadow-black/40 transition-transform hover:scale-105 lg:right-4 lg:bottom-[8.5rem]"
      >
        <ListChecks className="h-5 w-5" />
        {total > 0 && (
          <span
            className={`absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full px-1 text-[10px] font-bold ring-1 ${
              allDone
                ? 'bg-emerald-500 text-white ring-emerald-300'
                : 'bg-background text-emerald-600 ring-emerald-600/50'
            }`}
          >
            {doneCount}/{total}
          </span>
        )}
      </button>
    )
  }

  return (
    <div className="fixed right-3 bottom-[10rem] left-3 z-50 flex max-h-[70vh] flex-col overflow-hidden rounded-lg border border-border bg-popover shadow-xl shadow-black/50 lg:right-4 lg:bottom-[8.5rem] lg:left-auto lg:w-[430px] lg:max-w-[calc(100vw-2rem)]">
      <div className="flex items-center gap-2 border-b border-border/60 px-3 py-2">
        <ListChecks className={`h-4 w-4 shrink-0 ${allDone ? 'text-emerald-500' : 'text-emerald-600'}`} />
        <span className="min-w-0 truncate text-sm font-semibold">{title}</span>
        <span className="shrink-0 text-xs text-muted-foreground">
          分成 {revision?.n ?? 0} 部分 · 完成 {doneCount}/{total}
        </span>
        <span className="flex-1" />
        <button
          onClick={onResplit}
          title="重新设置部分数"
          className="rounded p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <Scissors className="h-4 w-4" />
        </button>
        <button
          onClick={onToggle}
          title="收起"
          className="rounded p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {parts.length === 0 ? (
          <p className="px-4 py-6 text-center text-xs text-muted-foreground">这里还没有可修订的内容</p>
        ) : (
          <ul>
            {parts.map((pt) => {
              const state = revRowState(pt.index, lastI, doneSet)
              const isLast = lastI === pt.index && revision?.last
              const lastP = isLast && revision?.last ? revision.last.p : null
              return (
                <li
                  key={pt.index}
                  className="flex items-center gap-2 border-b border-border/40 px-3 py-1.5 last:border-b-0"
                >
                  <button
                    onClick={() => onJump(pt.start + Math.max(0, Math.min(lastP ?? 0, pt.end - pt.start)), pt.index)}
                    className="flex min-w-0 flex-1 items-center gap-2 text-left"
                    title="跳转到这一部分"
                  >
                    {state === 'done' ? (
                      <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-500" />
                    ) : state === 'editing' ? (
                      <Circle className="h-4 w-4 shrink-0 fill-amber-500/25 text-amber-500" />
                    ) : (
                      <Circle className="h-4 w-4 shrink-0 text-muted-foreground/50" />
                    )}
                    <span className="shrink-0 text-[10px] text-muted-foreground">
                      {pt.index + 1}/{parts.length}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-xs">
                      {isLast && lastP != null ? (
                        <>
                          <span className="opacity-70">{previewWithCaret(text.slice(pt.start, pt.end), lastP).before}</span>
                          <span className="mx-px inline-block h-[11px] w-[2px] translate-y-[2px] rounded-sm bg-amber-400" />
                          <span className="opacity-70">{previewWithCaret(text.slice(pt.start, pt.end), lastP).after}</span>
                        </>
                      ) : (
                        <span className="opacity-70">{text.slice(pt.start, pt.end).slice(0, 30).trim() || '　'}</span>
                      )}
                    </span>
                    <span className="shrink-0 text-[10px] text-muted-foreground">
                      {state === 'done' ? '已完成' : isLast && lastP != null ? `改到 ${Math.max(0, lastP)} 字` : `${pt.chars} 字`}
                    </span>
                  </button>
                  <button
                    onClick={() => onToggleDone(pt.index)}
                    title={state === 'done' ? '重新打开这一部分' : '确认本部分修改完成'}
                    className={`flex h-7 w-7 shrink-0 items-center justify-center rounded transition-colors ${
                      state === 'done'
                        ? 'text-emerald-600 hover:bg-emerald-500/10'
                        : 'text-muted-foreground hover:bg-emerald-500/10 hover:text-emerald-600'
                    }`}
                  >
                    {state === 'done' ? <RotateCcw className="h-3.5 w-3.5" /> : <Check className="h-4 w-4" />}
                  </button>
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </div>
  )
}
