// 这部分负责: 右侧面板 —— 大纲/参考/自定义词组，宽度可拖拽

import { useRef } from 'react'
import { ListTree, NotebookPen, Zap, Plus, Trash2, FileUp, FileDown } from 'lucide-react'
import type { Snippet } from '@/types'
import { uid } from '@/lib/store'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'

interface Props {
  outline: string
  reference: string
  snippets: Snippet[]
  /** 初始页签（手机底部弹层按入口指定） */
  defaultTab?: 'outline' | 'reference' | 'snippets'
  /** 手机底部弹层模式：去掉左边框和底色，由弹层承载 */
  embedded?: boolean
  onOutlineChange: (v: string) => void
  onReferenceChange: (v: string) => void
  onSnippetsChange: (snippets: Snippet[]) => void
  /** 点击词组 = 在光标处插入 */
  onInsertSnippet: (text: string) => void
  /** 大纲 / 参考各自的导入导出（按当前书分开） */
  onImportOutline: (file: File) => void
  onExportOutline: () => void
  onImportReference: (file: File) => void
  onExportReference: () => void
}

/** 页签角落的导入导出小按钮组 */
function IoButtons({
  onImport,
  onExport,
  tip,
}: {
  onImport: () => void
  onExport: () => void
  tip: string
}) {
  return (
    <div className="flex items-center gap-0.5">
      <Tooltip>
        <TooltipTrigger asChild>
          <Button variant="ghost" size="icon" className="h-6 w-6 text-muted-foreground hover:text-foreground" onClick={onImport}>
            <FileUp className="h-3.5 w-3.5" />
          </Button>
        </TooltipTrigger>
        <TooltipContent>导入{tip}（MD / TXT，覆盖现有）</TooltipContent>
      </Tooltip>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button variant="ghost" size="icon" className="h-6 w-6 text-muted-foreground hover:text-foreground" onClick={onExport}>
            <FileDown className="h-3.5 w-3.5" />
          </Button>
        </TooltipTrigger>
        <TooltipContent>导出{tip}为 MD</TooltipContent>
      </Tooltip>
    </div>
  )
}

export function RightPanel({
  outline,
  reference,
  snippets,
  defaultTab,
  embedded = false,
  onOutlineChange,
  onReferenceChange,
  onSnippetsChange,
  onInsertSnippet,
  onImportOutline,
  onExportOutline,
  onImportReference,
  onExportReference,
}: Props) {
  const outlineFileRef = useRef<HTMLInputElement>(null)
  const referenceFileRef = useRef<HTMLInputElement>(null)

  const updateSnippet = (id: string, patch: Partial<Snippet>) => {
    onSnippetsChange(snippets.map((s) => (s.id === id ? { ...s, ...patch } : s)))
  }

  return (
    <div
      data-right-panel
      className={`flex h-full flex-col ${embedded ? 'bg-transparent' : 'border-l border-border/60 bg-card/40'}`}
    >
      <Tabs defaultValue={defaultTab ?? 'outline'} className="flex h-full flex-col">
        <div className="flex items-center justify-between border-b border-border/60 pl-2 pr-1 pt-2">
          <TabsList className="h-8 w-full min-w-0 flex-1">
            <TabsTrigger value="outline" className="min-w-0 flex-1 gap-1 px-1 text-xs">
              <ListTree className="h-3.5 w-3.5 shrink-0" />
              <span className="truncate">大纲</span>
            </TabsTrigger>
            <TabsTrigger value="reference" className="min-w-0 flex-1 gap-1 px-1 text-xs">
              <NotebookPen className="h-3.5 w-3.5 shrink-0" />
              <span className="truncate">参考</span>
            </TabsTrigger>
            <TabsTrigger value="snippets" className="min-w-0 flex-1 gap-1 px-1 text-xs">
              <Zap className="h-3.5 w-3.5 shrink-0" />
              <span className="truncate">词组</span>
            </TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="outline" className="m-0 flex-1 flex-col data-[state=active]:flex">
          <div className="flex items-center justify-between border-b border-border/60 px-3 py-1">
            <span className="text-[10px] text-muted-foreground">本书大纲 · 随书保存</span>
            <IoButtons
              tip="大纲"
              onImport={() => outlineFileRef.current?.click()}
              onExport={onExportOutline}
            />
          </div>
          <Textarea
            value={outline}
            onChange={(e) => onOutlineChange(e.target.value)}
            placeholder="故事大纲、卷章规划、待办勾选……"
            className="h-full flex-1 resize-none rounded-none border-0 px-4 py-3 text-[13px] leading-6 focus-visible:ring-0"
          />
        </TabsContent>

        <TabsContent value="reference" className="m-0 flex-1 flex-col data-[state=active]:flex">
          <div className="flex items-center justify-between border-b border-border/60 px-3 py-1">
            <span className="text-[10px] text-muted-foreground">本书参考资料 · 随书保存</span>
            <IoButtons
              tip="参考资料"
              onImport={() => referenceFileRef.current?.click()}
              onExport={onExportReference}
            />
          </div>
          <Textarea
            value={reference}
            onChange={(e) => onReferenceChange(e.target.value)}
            placeholder="人物设定、资料摘抄、伏笔记录……写作时随时翻看"
            className="h-full flex-1 resize-none rounded-none border-0 px-4 py-3 text-[13px] leading-6 focus-visible:ring-0"
          />
        </TabsContent>

        <TabsContent value="snippets" className="m-0 min-w-0 flex-1 data-[state=active]:block">
          <ScrollArea className="h-full">
            <div className="w-full min-w-0 space-y-2 p-2">
              <p className="w-full min-w-0 break-words rounded-md bg-muted/60 px-2 py-1.5 text-[11px] leading-4 text-muted-foreground">
                用法：文稿里输入触发词再按空格/回车自动展开；或按 Alt+数字 直接打出；也可以点下方按钮插入。
              </p>
              {snippets.map((s) => (
                <div key={s.id} className="w-full min-w-0 space-y-1.5 overflow-hidden rounded-md border border-border/60 p-2">
                  <div className="flex w-full min-w-0 items-center gap-1.5">
                    <Input
                      value={s.name}
                      onChange={(e) => updateSnippet(s.id, { name: e.target.value })}
                      placeholder="名称"
                      className="h-7 min-w-0 flex-1 text-xs"
                    />
                    <Select
                      value={s.hotkey === 0 ? 'none' : String(s.hotkey)}
                      onValueChange={(v) => updateSnippet(s.id, { hotkey: v === 'none' ? 0 : Number(v) })}
                    >
                      <SelectTrigger className="h-7 w-[72px] shrink-0 px-1.5 text-[11px]">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent position="popper" sideOffset={4}>
                        <SelectItem value="none" className="text-xs">无快捷键</SelectItem>
                        {Array.from({ length: 9 }, (_, i) => (
                          <SelectItem key={i + 1} value={String(i + 1)} className="text-xs">
                            Alt+{i + 1}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 shrink-0 text-muted-foreground hover:text-destructive"
                      onClick={() => onSnippetsChange(snippets.filter((x) => x.id !== s.id))}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                  <div className="flex w-full min-w-0 flex-wrap items-center gap-1.5">
                    <span className="shrink-0 text-[11px] text-muted-foreground">触发词</span>
                    <Input
                      value={s.trigger}
                      onChange={(e) => updateSnippet(s.id, { trigger: e.target.value.replace(/\s/g, '') })}
                      placeholder=";p"
                      className="h-7 w-14 shrink-0 font-mono text-xs"
                    />
                    <Button
                      variant="secondary"
                      size="sm"
                      className="h-7 min-w-0 flex-1 basis-16 px-2 text-xs"
                      title={s.text.replace(/\n/g, '⏎')}
                      onClick={() => onInsertSnippet(s.text)}
                    >
                      <span className="min-w-0 truncate">
                        插入：{s.text.length > 10 ? s.text.slice(0, 10) + '…' : s.text.replace(/\n/g, '⏎')}
                      </span>
                    </Button>
                  </div>
                  <Textarea
                    value={s.text}
                    onChange={(e) => updateSnippet(s.id, { text: e.target.value })}
                    placeholder="要插入的内容，可含换行"
                    rows={2}
                    className="w-full min-w-0 resize-none text-xs leading-5"
                  />
                </div>
              ))}
              <Button
                variant="outline"
                size="sm"
                className="w-full text-xs"
                onClick={() =>
                  onSnippetsChange([...snippets, { id: uid(), name: '新词组', trigger: '', text: '', hotkey: 0 }])
                }
              >
                <Plus className="mr-1 h-3.5 w-3.5" />
                新建词组
              </Button>
            </div>
          </ScrollArea>
        </TabsContent>
      </Tabs>

      <input
        ref={outlineFileRef}
        type="file"
        accept=".md,.txt"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0]
          if (f) onImportOutline(f)
          e.target.value = ''
        }}
      />
      <input
        ref={referenceFileRef}
        type="file"
        accept=".md,.txt"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0]
          if (f) onImportReference(f)
          e.target.value = ''
        }}
      />
    </div>
  )
}
