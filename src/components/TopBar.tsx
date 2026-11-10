// 这部分负责: 桌面顶栏 —— 模式切换、章节/Part 信息、云端与设置入口

import { useRef } from 'react'
import { PenLine, Layers, BookOpenText, Menu, FileDown, FileText, FileArchive, Trash2, PanelRightClose, PanelRightOpen, History, Settings, Sparkles } from 'lucide-react'
import type { ViewMode } from '@/types'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'

interface Props {
  view: ViewMode
  bookName: string | null
  rightCollapsed: boolean
  editsOpen: boolean
  /** 云端存储菜单（GitHub 登录 / 同步）由 Home 注入 */
  cloudMenu?: React.ReactNode
  onViewChange: (v: ViewMode) => void
  onToggleRight: () => void
  onToggleEdits: () => void
  /** AI 协作浮窗开关（Claude 写稿/审查/拆书） */
  aiOpen: boolean
  aiCount: number
  onToggleAi: () => void
  /** 批量导入 txt/docx/md 为章节（导入前弹命名窗） */
  onImportDocs: (files: File[]) => void
  onExportChapterTxt: () => void
  onExportChapterDocx: () => void
  onExportComboTxt: () => void
  onExportComboDocx: () => void
  onExportBackup: () => void
  onImportBackup: () => void
  onClearAll: () => void
  onOpenSettings: () => void
}

export function TopBar(props: Props) {
  const importDocRef = useRef<HTMLInputElement>(null)
  const atShelf = props.bookName === null

  return (
    <header className="flex h-12 items-center gap-2 border-b border-border/60 bg-card/70 px-3 backdrop-blur-sm">
      <PenLine className="h-5 w-5 shrink-0 text-amber-500" />
      <span className="shrink-0 text-sm font-bold tracking-wide">码字工坊</span>
      {!atShelf && (
        <span className="max-w-40 truncate text-xs text-muted-foreground">《{props.bookName}》</span>
      )}

      {!atShelf && (
        <div className="ml-2 flex rounded-md border border-border/60 p-0.5">
          <button
            onClick={() => props.onViewChange('chapter')}
            className={`flex items-center gap-1 rounded px-3 py-1 text-xs transition-colors ${
              props.view === 'chapter' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted'
            }`}
          >
            <PenLine className="h-3.5 w-3.5" />
            章节模式
          </button>
          <button
            onClick={() => props.onViewChange('merged')}
            className={`flex items-center gap-1 rounded px-3 py-1 text-xs transition-colors ${
              props.view === 'merged' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted'
            }`}
          >
            <Layers className="h-3.5 w-3.5" />
            Part 模式
          </button>
          <button
            onClick={() => props.onViewChange('reading')}
            className={`flex items-center gap-1 rounded px-3 py-1 text-xs transition-colors ${
              props.view === 'reading' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted'
            }`}
          >
            <BookOpenText className="h-3.5 w-3.5" />
            阅读模式
          </button>
        </div>
      )}

      <span className="flex-1" />

      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant={props.aiOpen ? 'secondary' : 'ghost'}
            size="icon"
            className="relative h-8 w-8"
            onClick={props.onToggleAi}
          >
            <Sparkles className="h-4 w-4" />
            {props.aiCount > 0 && (
              <span className="absolute -right-0.5 -top-0.5 flex h-3.5 min-w-3.5 items-center justify-center rounded-full bg-amber-500 px-0.5 text-[9px] font-bold text-black">
                {props.aiCount}
              </span>
            )}
          </Button>
        </TooltipTrigger>
        <TooltipContent>AI 协作（Claude 写稿 / 审查 / 拆书）</TooltipContent>
      </Tooltip>

      {props.cloudMenu}

      <Tooltip>
        <TooltipTrigger asChild>
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={props.onOpenSettings}>
            <Settings className="h-4 w-4" />
          </Button>
        </TooltipTrigger>
        <TooltipContent>设置（导出路径 / 字体 / 背景 / 快捷键）</TooltipContent>
      </Tooltip>

      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant={props.editsOpen ? 'secondary' : 'ghost'}
            size="icon"
            className="h-8 w-8"
            onClick={props.onToggleEdits}
          >
            <History className="h-4 w-4" />
          </Button>
        </TooltipTrigger>
        <TooltipContent>{props.editsOpen ? '收起修改记录浮窗' : '展开修改记录浮窗'}</TooltipContent>
      </Tooltip>

      <Tooltip>
        <TooltipTrigger asChild>
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={props.onToggleRight}>
            {props.rightCollapsed ? <PanelRightOpen className="h-4 w-4" /> : <PanelRightClose className="h-4 w-4" />}
          </Button>
        </TooltipTrigger>
        <TooltipContent>{props.rightCollapsed ? '展开侧栏（大纲/参考/词组）' : '收起侧栏'}</TooltipContent>
      </Tooltip>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="sm" className="h-8 gap-1.5 text-xs">
            <Menu className="h-3.5 w-3.5" />
            导入 / 导出
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-60">
          <DropdownMenuLabel className="text-xs">文章导入导出</DropdownMenuLabel>
          <DropdownMenuItem
            className="text-xs"
            onSelect={() => {
              if (atShelf) return
              importDocRef.current?.click()
            }}
          >
            <FileDown className="mr-2 h-3.5 w-3.5" />
            导入章节（可多选 TXT/DOCX/MD）
          </DropdownMenuItem>
          <DropdownMenuItem className="text-xs" onSelect={props.onExportChapterTxt}>
            <FileText className="mr-2 h-3.5 w-3.5" />
            当前章 → TXT
          </DropdownMenuItem>
          <DropdownMenuItem className="text-xs" onSelect={props.onExportChapterDocx}>
            <FileDown className="mr-2 h-3.5 w-3.5" />
            当前章 → DOCX
          </DropdownMenuItem>
          <DropdownMenuItem className="text-xs" onSelect={props.onExportComboTxt}>
            <FileText className="mr-2 h-3.5 w-3.5" />
            当前 Part → TXT
          </DropdownMenuItem>
          <DropdownMenuItem className="text-xs" onSelect={props.onExportComboDocx}>
            <FileDown className="mr-2 h-3.5 w-3.5" />
            当前 Part → DOCX
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuLabel className="text-xs">工程备份</DropdownMenuLabel>
          <DropdownMenuItem className="text-xs" onSelect={props.onImportBackup}>
            <FileArchive className="mr-2 h-3.5 w-3.5" />
            导入工程备份（JSON）
          </DropdownMenuItem>
          <DropdownMenuItem className="text-xs" onSelect={props.onExportBackup}>
            <FileArchive className="mr-2 h-3.5 w-3.5" />
            导出工程备份（JSON）
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem className="text-xs text-destructive focus:text-destructive" onSelect={props.onClearAll}>
            <Trash2 className="mr-2 h-3.5 w-3.5" />
            清空全部数据
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <input
        ref={importDocRef}
        type="file"
        accept=".txt,.docx,.md"
        multiple
        className="hidden"
        onChange={(e) => {
          const fs = Array.from(e.target.files ?? [])
          if (fs.length) props.onImportDocs(fs)
          e.target.value = ''
        }}
      />
    </header>
  )
}
