// 这部分负责: 手机外壳 —— 顶栏/底栏/安全区留白、顶栏右侧插槽

import {
  PenLine, Layers, BookOpenText, Library, BookMarked, User,
} from 'lucide-react'
import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import type { ViewMode } from '@/types'

/** 顶栏右侧插槽（MobileTopBar 渲染；编辑器用 TopBarSlot 把按钮注入这里） */
export const TOPBAR_SLOT_ID = 'mx-topbar-trailing'

/**
 * 把编辑器控制按钮 portal 进顶栏右侧插槽。
 * 挂载后才查 DOM（同一提交里插槽还没进 document），书架层插槽不存在时不渲染。
 */
export function TopBarSlot({ children }: { children: React.ReactNode }) {
  const [slot, setSlot] = useState<HTMLElement | null>(null)
  useEffect(() => {
    setSlot(document.getElementById(TOPBAR_SLOT_ID))
  }, [])
  if (!slot) return null
  return createPortal(children, slot)
}

// ─────────────── ヾ(ΦωΦ) ───────────────

export interface MobileTopBarProps {
  bookName: string | null
  view: ViewMode
  onViewChange: (v: ViewMode) => void
}

/**
 * 手机顶栏：只在书架层显示标题；进入书后只保留 章节 / Part / 阅读 模式切换。
 * 顶部安全区留白放在外层容器（--sat 由安卓原生注入），不与功能键抢高度。
 */
export function MobileTopBar({ bookName, view, onViewChange }: MobileTopBarProps) {
  const atShelf = bookName === null

  const MODES: { key: ViewMode; label: string; icon: React.ReactNode }[] = [
    { key: 'chapter', label: '章节', icon: <PenLine className="h-3.5 w-3.5" /> },
    { key: 'merged', label: 'Part', icon: <Layers className="h-3.5 w-3.5" /> },
    { key: 'reading', label: '阅读', icon: <BookOpenText className="h-3.5 w-3.5" /> },
  ]

  return (
    <div
      style={{ paddingTop: 'var(--sat, env(safe-area-inset-top, 0px))' }}
      className="shrink-0 border-b border-border/60 bg-card/90 backdrop-blur-sm"
    >
      <header className="flex h-12 items-center gap-1.5 px-2">
        {atShelf ? (
          <div className="flex min-w-0 flex-col">
            <span className="truncate text-[13px] leading-4 font-bold">码字工坊</span>
            <span className="text-[10px] leading-3 text-muted-foreground">书架</span>
          </div>
        ) : (
          <div className="flex shrink-0 rounded-md border border-border/60 p-0.5">
            {MODES.map((m) => (
              <button
                key={m.key}
                onClick={() => onViewChange(m.key)}
                className={`flex items-center gap-1 rounded px-2.5 py-1.5 text-xs transition-colors ${
                  view === m.key ? 'bg-primary text-primary-foreground' : 'text-muted-foreground'
                }`}
              >
                {m.icon}
                {m.label}
              </button>
            ))}
          </div>
        )}
        {/* 章节 / Part 编辑器的控制按钮通过 portal 注入这里（与模式切换合并为一栏） */}
        {!atShelf && <div id={TOPBAR_SLOT_ID} className="ml-auto flex shrink-0 items-center gap-1" />}
      </header>
    </div>
  )
}

/** 手机底栏：我的=作品（回写作界面）/ 书内=目录（开侧边栏）/ 书架=目录（提示已到书架）；写作；我的 */
export function MobileBottomNav({
  meOpen,
  atShelf,
  sheetOpen,
  onFirst,
  onOpenWrite,
  onOpenMe,
}: {
  meOpen: boolean
  atShelf: boolean
  sheetOpen: boolean
  onFirst: () => void
  onOpenWrite: () => void
  onOpenMe: () => void
}) {
  const Item = ({
    icon, label, active, onClick, disabled,
  }: { icon: React.ReactNode; label: string; active?: boolean; onClick: () => void; disabled?: boolean }) => (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`flex min-w-0 flex-1 flex-col items-center justify-center gap-0.5 py-1.5 transition-colors ${
        active ? 'text-amber-500' : 'text-muted-foreground'
      } ${disabled ? 'opacity-35' : 'active:bg-muted/60'}`}
    >
      {icon}
      <span className="text-[11px]">{label}</span>
    </button>
  )

  return (
    <div
      style={{ paddingBottom: 'var(--sab, env(safe-area-inset-bottom, 0px))' }}
      className="shrink-0 border-t border-border/60 bg-card/90 backdrop-blur-sm"
    >
      <nav className="flex h-14 items-stretch">
        {meOpen ? (
          <Item icon={<BookMarked className="h-5 w-5" />} label="作品" onClick={onFirst} />
        ) : (
          <Item icon={<Library className="h-5 w-5" />} label="目录" onClick={onFirst} />
        )}
        <Item
          icon={<PenLine className="h-5 w-5" />}
          label="写作"
          active={sheetOpen}
          disabled={atShelf}
          onClick={onOpenWrite}
        />
        <Item icon={<User className="h-5 w-5" />} label="我的" onClick={onOpenMe} />
      </nav>
    </div>
  )
}
