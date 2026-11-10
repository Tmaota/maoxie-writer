// 这部分负责: 拆书报告 —— 按「结构拆解/文风画像/剧情蓝图」等分段展示，文风画像可一键导出

import { Scissors, Download } from 'lucide-react'
import { splitDecompose } from '@/lib/ai'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'

// ─────────────── ฅ(ΦωΦ)ฅ ───────────────

export interface DecomposeRequest {
  title: string
  markdown: string
  onExportStyle: (styleMd: string) => void
  onExportAll: (fullMd: string) => void
}

interface Props {
  req: DecomposeRequest | null
  onClose: () => void
}

// ─────────────── (=`ω´=) ───────────────

function renderInline(s: string) {
  // 轻量渲染：加粗、行内代码；换行走 <br/>
  const html = s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\n/g, '<br/>')
  return <span dangerouslySetInnerHTML={{ __html: html }} />
}

// ─────────────── ヾ(ΦωΦ) ───────────────

export function DecomposeDialog({ req, onClose }: Props) {
  if (!req) return null
  const sections = splitDecompose(req.markdown)
  const styleSection = sections.find((s) => s.head.includes('文风'))
  const firstSection = sections[0]
  const bookName = (() => {
    const m = firstSection?.body?.match(/书名[：:]\s*([^\n，,]+)/)
    return m?.[1]?.trim() || req.title
  })()

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="flex max-h-[85vh] w-[min(820px,96vw)] flex-col gap-0 p-0">
        <DialogHeader className="border-b border-border/60 px-4 py-3">
          <DialogTitle className="flex items-center gap-1.5 text-sm">
            <Scissors className="h-4 w-4 text-amber-500" />
            拆书报告 · {bookName}
          </DialogTitle>
          <DialogDescription className="text-xs">
            Claude 已把这部作品拆成结构、文风、人物、蓝图几块。文风画像可以一键导出成 md 收进你的文风库。
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="min-h-0 flex-1">
          <div className="space-y-3 p-4">
            {sections.map((sec) => (
              <section key={sec.head} className="rounded-md border border-border/60">
                <h3 className="border-b border-border/50 bg-muted/40 px-3 py-1.5 text-[13px] font-semibold">{sec.head}</h3>
                <div className="whitespace-pre-wrap px-3 py-2 text-[13px] leading-6 text-foreground/90">
                  {renderInline(sec.body)}
                </div>
              </section>
            ))}
          </div>
        </ScrollArea>

        <div className="flex items-center gap-2 border-t border-border/60 px-4 py-3">
          {styleSection && (
            <Button
              size="sm"
              className="h-8 gap-1 text-xs"
              onClick={() => req.onExportStyle(`# 文风画像 · ${bookName}\n\n（蒸馏自《${bookName}》拆解）\n\n${styleSection.body}`)}
            >
              <Download className="h-3.5 w-3.5" />
              导出文风画像 MD
            </Button>
          )}
          <Button size="sm" variant="outline" className="h-8 gap-1 text-xs" onClick={() => req.onExportAll(req.markdown)}>
            <Download className="h-3.5 w-3.5" />
            导出完整拆解 MD
          </Button>
          <span className="flex-1" />
          <Button variant="ghost" size="sm" className="h-8 text-xs" onClick={onClose}>
            关闭
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
