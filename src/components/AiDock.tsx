// 这部分负责: AI 协作浮窗 —— 发任务（写新章/审查/拆书）、看任务进度、手动模式交接、报告入口

import { useState } from 'react'
import { Sparkles, X, Trash2, Square, FileText, BookOpenCheck, Scissors, Loader2, ChevronDown, ChevronUp, Copy, Check } from 'lucide-react'
import type { Book, Chapter } from '@/types'
import type { AiTask, ReviewReport } from '@/lib/ai'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { ScrollArea } from '@/components/ui/scroll-area'

// ─────────────── ฅ(ΦωΦ)ฅ ───────────────

interface Props {
  open: boolean
  onToggle: () => void
  book: Book | null
  activeChapter: Chapter | null
  view: 'chapter' | 'merged' | 'reading'
  desktop: boolean
  tasks: AiTask[]
  reports: ReviewReport[]
  onStartWrite: (no: number, title: string, manual: boolean) => void
  onStartReview: (manual: boolean) => void
  onStartDecompose: (manual: boolean) => void
  onOpenReport: (r: ReviewReport) => void
  onKillTask: (t: AiTask) => void
  onDeleteTask: (t: AiTask) => void
  onDeleteReport: (id: string) => void
  /** 手动模式：粘贴报告 JSON（写章/审查阶段） */
  onManualReport: (t: AiTask, json: string) => void
  /** 手动模式：粘贴初稿正文（写章阶段） */
  onManualDraft: (t: AiTask, text: string) => void
  /** 手动模式：粘贴修订稿正文（修稿阶段） */
  onManualRevised: (t: AiTask, text: string) => void
}

// ─────────────── (=`ω´=) ───────────────

const PHASE_LABEL: Record<string, string> = {
  write: '写稿+自审',
  review: '审查',
  revise: '修稿',
  decompose: '拆书',
}

function fmtTime(ts: number) {
  return new Date(ts).toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })
}

// ─────────────── ヾ(ΦωΦ) ───────────────

/** 单个任务卡片：状态、日志、手动模式交接区 */
function TaskCard({
  t,
  onKill,
  onDelete,
  onManualReport,
  onManualDraft,
  onManualRevised,
}: {
  t: AiTask
  onKill: () => void
  onDelete: () => void
  onManualReport: (json: string) => void
  onManualDraft: (text: string) => void
  onManualRevised: (text: string) => void
}) {
  const [showLog, setShowLog] = useState(false)
  const [copied, setCopied] = useState(false)
  const [paste, setPaste] = useState('')
  const statusColor =
    t.status === 'running' ? 'text-amber-500' : t.status === 'error' ? 'text-destructive' : 'text-emerald-500'

  const copyPrompt = async () => {
    if (!t.prompt) return
    try {
      await navigator.clipboard.writeText(t.prompt)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      /* 剪贴板不可用时静默 */
    }
  }

  return (
    <div className="space-y-1.5 rounded-md border border-border/60 bg-muted/30 p-2 text-xs">
      <div className="flex items-center gap-1.5">
        {t.status === 'running' ? (
          <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-amber-500" />
        ) : (
          <span className={`h-2 w-2 shrink-0 rounded-full ${statusColor.replace('text-', 'bg-')}`} />
        )}
        <span className="min-w-0 flex-1 truncate font-medium">
          {t.type === 'decompose' ? `拆书：${t.label}` : `《${t.bookName}》${t.label}`}
        </span>
        <span className="shrink-0 text-muted-foreground">{PHASE_LABEL[t.phase]}</span>
        {t.status === 'running' && !t.manual && (
          <button onClick={onKill} className="shrink-0 rounded p-0.5 text-muted-foreground hover:text-destructive" title="中断任务">
            <Square className="h-3 w-3" />
          </button>
        )}
        {t.status !== 'running' && (
          <button onClick={onDelete} className="shrink-0 rounded p-0.5 text-muted-foreground hover:text-destructive" title="移除记录">
            <Trash2 className="h-3 w-3" />
          </button>
        )}
      </div>
      <div className="pl-5 text-[10px] text-muted-foreground">
        {t.status === 'running' ? '进行中' : t.status === 'error' ? `失败：${t.error ?? '未知'}` : t.status === 'cancelled' ? '已中断' : '已完成'} · {fmtTime(t.startedAt)}
      </div>

      {/* 手动模式交接区 */}
      {t.manual && t.status === 'running' && (
        <div className="space-y-1.5 pl-1">
          <button onClick={copyPrompt} className="flex items-center gap-1 rounded border border-border/60 px-2 py-1 text-[11px] hover:bg-muted">
            {copied ? <Check className="h-3 w-3 text-emerald-500" /> : <Copy className="h-3 w-3" />}
            复制提示词（粘到 Claude 对话框）
          </button>
          <Textarea
            value={paste}
            onChange={(e) => setPaste(e.target.value)}
            placeholder={
              t.type === 'decompose'
                ? '把拆解报告的 Markdown 全文粘到这里'
                : t.phase === 'revise'
                  ? '把 Claude 改完的完整正文粘到这里'
                  : t.phase === 'write'
                    ? '先把初稿正文粘到这里（它会存成初稿）'
                    : '把审稿报告 JSON 粘到这里'
            }
            className="min-h-16 text-[11px]"
          />
          <div className="flex gap-1.5">
            {t.phase !== 'revise' && (
              <Button
                size="sm"
                variant="outline"
                className="h-6 flex-1 text-[11px]"
                disabled={!paste.trim()}
                onClick={() => {
                  if (t.phase === 'write') onManualDraft(paste)
                  else onManualReport(paste)
                  setPaste('')
                }}
              >
                {t.phase === 'write' ? '提交初稿' : '提交报告'}
              </Button>
            )}
            {t.phase === 'write' && (
              <Button
                size="sm"
                variant="outline"
                className="h-6 flex-1 text-[11px]"
                disabled={!paste.trim()}
                onClick={() => {
                  onManualReport(paste)
                  setPaste('')
                }}
              >
                提交报告
              </Button>
            )}
            {t.phase === 'revise' && (
              <Button size="sm" variant="outline" className="h-6 flex-1 text-[11px]" disabled={!paste.trim()} onClick={() => onManualRevised(paste)}>
                提交修订稿
              </Button>
            )}
          </div>
        </div>
      )}

      {t.error && <div className="pl-5 text-[10px] text-destructive">{t.error}</div>}
      {showLog && t.logTail && <pre className="max-h-32 overflow-auto whitespace-pre-wrap rounded bg-background/80 p-1.5 text-[10px] text-muted-foreground">{t.logTail}</pre>}
      <button onClick={() => setShowLog((v) => !v)} className="flex items-center gap-0.5 pl-1 text-[10px] text-muted-foreground hover:text-foreground">
        {showLog ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
        日志
      </button>
    </div>
  )
}

// ─────────────── (=①ω①=) ───────────────

export function AiDock(p: Props) {
  const [tab, setTab] = useState<'tasks' | 'reports'>('tasks')
  const [writeNo, setWriteNo] = useState('')
  const [writeTitle, setWriteTitle] = useState('')
  const [manual, setManual] = useState(false)

  const submitWrite = () => {
    const no = parseInt(writeNo, 10)
    if (!no || no < 1) return
    const title = writeTitle.trim() || `第${no}章`
    p.onStartWrite(no, title, manual)
    setWriteNo('')
    setWriteTitle('')
  }

  const running = p.tasks.filter((t) => t.status === 'running').length
  const pendingReports = p.reports.filter((r) => r.state !== 'resolved')
  const canAi = p.desktop && !!p.book?.dir

  // 浮泡（收起时）
  if (!p.open) {
    return (
      <button
        onClick={p.onToggle}
        className="fixed bottom-20 left-4 z-40 flex h-11 w-11 items-center justify-center rounded-full border border-amber-500/40 bg-card/90 text-amber-500 shadow-lg backdrop-blur-sm transition-transform hover:scale-105"
        title="AI 协作"
      >
        <Sparkles className="h-5 w-5" />
        {running + pendingReports.length > 0 && (
          <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-amber-500 px-1 text-[10px] font-bold text-black">
            {running + pendingReports.length}
          </span>
        )}
      </button>
    )
  }

  return (
    <div className="fixed bottom-20 left-4 z-40 flex max-h-[70vh] w-[340px] flex-col rounded-xl border border-border/60 bg-card/95 shadow-2xl backdrop-blur-md">
      <div className="flex items-center gap-1.5 border-b border-border/60 px-3 py-2">
        <Sparkles className="h-4 w-4 text-amber-500" />
        <span className="text-sm font-semibold">AI 协作</span>
        <span className="flex-1" />
        <button onClick={p.onToggle} className="rounded p-1 text-muted-foreground hover:text-foreground">
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="flex border-b border-border/60 text-xs">
        {(['tasks', 'reports'] as const).map((k) => (
          <button
            key={k}
            onClick={() => setTab(k)}
            className={`flex-1 py-1.5 ${tab === k ? 'border-b-2 border-amber-500 font-medium text-foreground' : 'text-muted-foreground'}`}
          >
            {k === 'tasks' ? `任务 ${p.tasks.length}` : `报告 ${pendingReports.length}`}
          </button>
        ))}
      </div>

      <ScrollArea className="min-h-0 flex-1">
        <div className="space-y-2 p-2.5">
          {tab === 'tasks' ? (
            <>
              {/* 新建任务 */}
              {p.book ? (
                canAi ? (
                  <div className="space-y-2 rounded-md border border-amber-500/25 bg-amber-500/5 p-2">
                    <div className="flex items-center justify-between">
                      <div className="text-[11px] font-medium text-amber-600 dark:text-amber-400">向 Claude 派活（《{p.book.name}》）</div>
                      <label className="flex cursor-pointer items-center gap-1 text-[10px] text-muted-foreground">
                        <input type="checkbox" checked={manual} onChange={(e) => setManual(e.target.checked)} className="h-3 w-3 accent-amber-500" />
                        手动模式
                      </label>
                    </div>
                    <div className="flex gap-1">
                      <Input value={writeNo} onChange={(e) => setWriteNo(e.target.value.replace(/\D/g, ''))} placeholder="章号" className="h-7 w-16 text-xs" />
                      <Input value={writeTitle} onChange={(e) => setWriteTitle(e.target.value)} placeholder="标题（可空）" className="h-7 flex-1 text-xs" onKeyDown={(e) => e.key === 'Enter' && submitWrite()} />
                      <Button size="sm" className="h-7 gap-1 text-xs" disabled={!writeNo} onClick={submitWrite}>
                        <FileText className="h-3.5 w-3.5" />
                        写这章
                      </Button>
                    </div>
                    <div className="flex gap-1.5">
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 flex-1 gap-1 text-xs"
                        disabled={p.view !== 'chapter' || !p.activeChapter}
                        title={p.view !== 'chapter' ? '先到章节模式选中一章' : ''}
                        onClick={() => p.onStartReview(manual)}
                      >
                        <BookOpenCheck className="h-3.5 w-3.5" />
                        审查当前章
                      </Button>
                      <Button size="sm" variant="outline" className="h-7 flex-1 gap-1 text-xs" onClick={() => p.onStartDecompose(manual)}>
                        <Scissors className="h-3.5 w-3.5" />
                        拆书
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="rounded-md border border-border/60 bg-muted/30 p-2 text-[11px] text-muted-foreground">
                    这本书还没绑定小说文件夹。回书架，点书封面上的文件夹图标绑定（AI 协作需要它当工作目录），网页/手机端不可用。
                  </div>
                )
              ) : (
                <div className="rounded-md border border-border/60 bg-muted/30 p-2 text-[11px] text-muted-foreground">
                  先进到一本书里，才能向 Claude 派活。
                </div>
              )}

              {/* 任务列表 */}
              {p.tasks.length === 0 ? (
                <div className="py-4 text-center text-[11px] text-muted-foreground">
                  还没有任务。写一章或审查一章试试——Claude 写稿、自审、修稿全程自动，报告在这里等你勾选。
                </div>
              ) : (
                p.tasks.map((t) => (
                  <TaskCard
                    key={t.id}
                    t={t}
                    onKill={() => p.onKillTask(t)}
                    onDelete={() => p.onDeleteTask(t)}
                    onManualReport={(json) => p.onManualReport(t, json)}
                    onManualDraft={(text) => p.onManualDraft(t, text)}
                    onManualRevised={(text) => p.onManualRevised(t, text)}
                  />
                ))
              )}
            </>
          ) : (
            <>
              {p.reports.length === 0 ? (
                <div className="py-4 text-center text-[11px] text-muted-foreground">还没有审稿报告。</div>
              ) : (
                p.reports.map((r) => (
                  <div key={r.id} className="flex items-center gap-1.5 rounded-md border border-border/60 bg-muted/30 p-2 text-xs">
                    <button className="min-w-0 flex-1 text-left" onClick={() => p.onOpenReport(r)}>
                      <div className="truncate font-medium">
                        《{r.bookName}》{r.chapterTitle}
                        <span className="ml-1 text-muted-foreground">{r.items.length} 条意见</span>
                      </div>
                      <div className="text-[10px] text-muted-foreground">
                        {fmtTime(r.createdAt)} · {r.state === 'pending' ? '待勾选' : r.state === 'decided' ? '修稿中' : '已定稿'}
                      </div>
                    </button>
                    <button onClick={() => p.onDeleteReport(r.id)} className="shrink-0 rounded p-1 text-muted-foreground hover:text-destructive" title="删除报告">
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))
              )}
            </>
          )}
        </div>
      </ScrollArea>
    </div>
  )
}
