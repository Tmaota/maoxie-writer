// 这部分负责: 设置弹窗 —— 导出路径、20 种字体、背景图与透明度、快捷键、阅读辅助

import { useRef, useState } from 'react'
import { FolderOpen, X, Upload, ImageOff, Keyboard, Type, FolderCog, Image as ImageIcon, RotateCcw, BookOpenText } from 'lucide-react'
import { toast } from 'sonner'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Button } from '@/components/ui/button'
import { Slider } from '@/components/ui/slider'
import { Switch } from '@/components/ui/switch'
import { ThemeModePicker } from './ThemeModePicker'
import {
  FONT_OPTIONS,
  FONT_SIZE_MAX,
  FONT_SIZE_MIN,
  HOTKEY_ACTIONS,
  CALM_COLORS,
  HIGHLIGHT_SWATCHES,
  WPM_MIN,
  WPM_MAX,
  comboFromEvent,
  type AppSettings,
  type ExportCategory,
} from '@/lib/settings'

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  settings: AppSettings
  onChange: (patch: Partial<AppSettings>) => void
  /** 桌面端选目录；浏览器环境返回 null */
  onPickDir: (category: ExportCategory) => Promise<string | null>
}

const EXPORT_ITEMS: { key: ExportCategory; label: string; desc: string }[] = [
  { key: 'chapter', label: '章节导出', desc: '当前章 → TXT / DOCX' },
  { key: 'combo', label: 'Part 导出', desc: '当前 Part → TXT / DOCX' },
  { key: 'side', label: '大纲 / 参考导出', desc: '导出为 MD 文件' },
  { key: 'backup', label: '工程备份', desc: '整份工程 JSON' },
]

/** 把上传的图片压缩成 dataURL（最长边 1920，JPEG 0.82） */
async function compressImage(file: File): Promise<string> {
  const bitmap = await createImageBitmap(file)
  const scale = Math.min(1, 1920 / Math.max(bitmap.width, bitmap.height))
  const w = Math.max(1, Math.round(bitmap.width * scale))
  const h = Math.max(1, Math.round(bitmap.height * scale))
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')!
  ctx.drawImage(bitmap, 0, 0, w, h)
  bitmap.close()
  return canvas.toDataURL('image/jpeg', 0.82)
}

export function SettingsDialog({ open, onOpenChange, settings, onChange, onPickDir }: Props) {
  const [recording, setRecording] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  const setExportDir = (key: ExportCategory, dir: string) =>
    onChange({ exportDirs: { ...settings.exportDirs, [key]: dir } })

  const pick = async (key: ExportCategory) => {
    const dir = await onPickDir(key)
    if (dir) {
      setExportDir(key, dir)
      toast.success(`已设置导出路径：${dir}`)
    }
  }

  const onBgFile = async (file: File) => {
    try {
      const dataUrl = await compressImage(file)
      onChange({ background: { ...settings.background, image: dataUrl } })
      toast.success('背景图片已设置')
    } catch {
      toast.error('图片读取失败，换一张试试')
    }
  }

  const onHotkeyKeyDown = (e: React.KeyboardEvent, actionKey: string) => {
    e.preventDefault()
    e.stopPropagation()
    const combo = comboFromEvent(e.nativeEvent)
    if (!combo) return
    onChange({ hotkeys: { ...settings.hotkeys, [actionKey]: combo } })
    setRecording(null)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex h-[92dvh] w-[calc(100vw-1rem)] max-w-[560px] flex-col gap-0 overflow-hidden p-0 sm:h-auto sm:max-h-[85vh]">
        <DialogHeader className="border-b border-border/60 px-4 py-3">
          <DialogTitle className="text-sm">设置</DialogTitle>
        </DialogHeader>

        <Tabs defaultValue="export" className="flex min-h-0 flex-1 flex-col">
          <div className="overflow-x-auto border-b border-border/60 px-3 pt-2">
            <TabsList className="h-8 w-max">
              <TabsTrigger value="export" className="gap-1 text-xs">
                <FolderCog className="h-3.5 w-3.5" />
                导出路径
              </TabsTrigger>
              <TabsTrigger value="font" className="gap-1 text-xs">
                <Type className="h-3.5 w-3.5" />
                字体
              </TabsTrigger>
              <TabsTrigger value="reading" className="gap-1 text-xs">
                <BookOpenText className="h-3.5 w-3.5" />
                阅读
              </TabsTrigger>
              <TabsTrigger value="background" className="gap-1 text-xs">
                <ImageIcon className="h-3.5 w-3.5" />
                背景
              </TabsTrigger>
              <TabsTrigger value="hotkeys" className="gap-1 text-xs">
                <Keyboard className="h-3.5 w-3.5" />
                快捷键
              </TabsTrigger>
            </TabsList>
          </div>

          {/* ---------- 导出路径 ---------- */}
          <TabsContent value="export" className="min-h-0 flex-1 overflow-y-auto p-3">
            <p className="mb-2 text-[11px] leading-4 text-muted-foreground">
              设置后，对应类别的导出会直接写入该文件夹（桌面端）；留空则每次弹出保存对话框。浏览器预览环境下始终以下载方式导出。
            </p>
            <div className="space-y-2">
              {EXPORT_ITEMS.map((item) => (
                <div key={item.key} className="rounded-md border border-border/60 p-2.5">
                  <div className="flex items-center gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-medium">{item.label}</p>
                      <p className="truncate font-mono text-[10px] text-muted-foreground">
                        {settings.exportDirs[item.key] || '未设置 · 每次询问保存位置'}
                      </p>
                    </div>
                    <Button variant="outline" size="sm" className="h-7 gap-1 text-[11px]" onClick={() => void pick(item.key)}>
                      <FolderOpen className="h-3 w-3" />
                      选择
                    </Button>
                    {settings.exportDirs[item.key] && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-muted-foreground hover:text-destructive"
                        title="恢复为每次询问"
                        onClick={() => setExportDir(item.key, '')}
                      >
                        <X className="h-3 w-3" />
                      </Button>
                    )}
                  </div>
                  <p className="mt-1 text-[10px] text-muted-foreground">{item.desc}</p>
                </div>
              ))}
            </div>
          </TabsContent>

          {/* ---------- 字体 ---------- */}
          <TabsContent value="font" className="min-h-0 flex-1 overflow-y-auto p-3">
            <div className="mb-3 rounded-md border border-border/60 p-2.5">
              <div className="mb-1.5 flex items-center justify-between">
                <span className="text-xs font-medium">正文字号</span>
                <span className="text-xs text-amber-500">{settings.readingFontSize}px</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-[10px] text-muted-foreground">A</span>
                <input
                  type="range"
                  min={FONT_SIZE_MIN}
                  max={FONT_SIZE_MAX}
                  step={1}
                  value={settings.readingFontSize}
                  onChange={(e) => onChange({ readingFontSize: Number(e.target.value) })}
                  className="h-1.5 flex-1 cursor-pointer appearance-none rounded-full bg-muted accent-amber-500"
                />
                <span className="text-sm text-muted-foreground">A</span>
              </div>
              <div className="mt-1.5 flex gap-1.5">
                {[14, 16, 18, 20, 24].map((n) => (
                  <button
                    key={n}
                    onClick={() => onChange({ readingFontSize: n })}
                    className={`rounded-full border px-2 py-0.5 text-[11px] transition-colors ${
                      settings.readingFontSize === n
                        ? 'border-amber-500/60 bg-amber-500/10 text-foreground'
                        : 'border-border/60 text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    {n}
                  </button>
                ))}
              </div>
              <p className="mt-1.5 text-[10px] text-muted-foreground">只影响章节编辑器和 Part 文稿的阅读字号。</p>
            </div>
            <p className="mb-2 text-[11px] leading-4 text-muted-foreground">
              预设 20 种字体，点击即切换（只影响本软件界面）。标「★」的字体需要系统里安装过，否则会回退到系统字体。
            </p>
            <div className="grid grid-cols-2 gap-1.5">
              {FONT_OPTIONS.map((f) => {
                const active = settings.font === f.value
                const needInstall = ['霞鹜', '得意黑', '小赖', '思源', '苹方', '文泉驿'].some((k) => f.label.includes(k))
                return (
                  <button
                    key={f.label}
                    onClick={() => onChange({ font: f.value })}
                    className={`truncate rounded-md border px-2.5 py-2 text-left text-[13px] transition-colors ${
                      active
                        ? 'border-amber-500/60 bg-amber-500/10 text-foreground'
                        : 'border-border/60 text-muted-foreground hover:border-amber-500/30 hover:text-foreground'
                    }`}
                    style={f.value ? { fontFamily: f.value } : undefined}
                    title={f.label}
                  >
                    {f.label}
                    {needInstall && <span className="ml-1 text-[10px] text-amber-500/80">★</span>}
                  </button>
                )
              })}
            </div>
          </TabsContent>

          {/* ---------- 阅读（ADHD 辅助） ---------- */}
          <TabsContent value="reading" className="min-h-0 flex-1 overflow-y-auto p-3">
            <p className="mb-2 text-[11px] leading-4 text-muted-foreground">
              阅读模式（章节 / Part 通用）的辅助功能，逐项独立开关；除键盘阅读与自动阅读外，其余在专注模式下生效。
            </p>
            <div className="space-y-2">
              {(
                [
                  { key: 'focusMode', label: '专注阅读', desc: '只显示当前行上下各 2 行，其余隐藏（阅读中也可点「专注」按钮临时切换）' },
                  { key: 'keys', label: '键盘逐行阅读', desc: '阅读模式里按 ↑ ↓ 移动当前行（普通模式按段移动）' },
                  { key: 'ruler', label: '阅读尺', desc: '当前行上下显示两条横线，压住上下文视线' },
                  { key: 'calmColor', label: '舒缓配色', desc: '专注模式下换成低刺激纸色 / 深色底，减轻白底刺激' },
                  { key: 'wideSpacing', label: '字间距加大', desc: '专注模式下自动加宽字间距，减少串行跳行' },
                  { key: 'autoScroll', label: '自动阅读滚动', desc: '阅读模式头部出现播放键，按设定速度自动下移阅读位置' },
                ] as const
              ).map((item) => (
                <div key={item.key} className="flex items-center gap-2.5 rounded-md border border-border/60 px-2.5 py-2">
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-medium">{item.label}</p>
                    <p className="text-[10px] leading-4 text-muted-foreground">{item.desc}</p>
                  </div>
                  {item.key === 'focusMode' ? (
                    <Switch
                      checked={settings.readingFocusMode}
                      onCheckedChange={(v) => onChange({ readingFocusMode: v })}
                    />
                  ) : (
                    <Switch
                      checked={settings.readingAssist[item.key]}
                      onCheckedChange={(v) => onChange({ readingAssist: { ...settings.readingAssist, [item.key]: v } })}
                    />
                  )}
                </div>
              ))}

              {/* 高亮底色色卡 */}
              <div className="rounded-md border border-border/60 px-2.5 py-2">
                <p className="text-xs font-medium">高亮底色</p>
                <p className="mb-1.5 mt-0.5 text-[10px] text-muted-foreground">专注模式当前行的底色，点色卡切换</p>
                <div className="flex flex-wrap gap-1.5">
                  {HIGHLIGHT_SWATCHES.map((s) => (
                    <button
                      key={s.value}
                      title={s.label}
                      onClick={() => onChange({ readingAssist: { ...settings.readingAssist, highlightColor: s.value } })}
                      className={`h-7 w-9 rounded-md border transition-all ${
                        settings.readingAssist.highlightColor === s.value
                          ? 'scale-105 border-amber-400 ring-2 ring-amber-500/40'
                          : 'border-border/60 hover:border-amber-500/40'
                      }`}
                      style={{ background: s.value }}
                    />
                  ))}
                </div>
              </div>

              {/* 舒缓配色方案 */}
              <div className={`rounded-md border border-border/60 px-2.5 py-2 ${settings.readingAssist.calmColor ? '' : 'opacity-50'}`}>
                <p className="text-xs font-medium">舒缓配色方案</p>
                <p className="mb-1.5 mt-0.5 text-[10px] text-muted-foreground">浅色纸会在专注区域整面铺底（文字自动反色）</p>
                <div className="grid grid-cols-4 gap-1.5">
                  {CALM_COLORS.map((c) => (
                    <button
                      key={c.key}
                      onClick={() => onChange({ readingAssist: { ...settings.readingAssist, calmColorValue: c.key } })}
                      className={`overflow-hidden rounded-md border text-center transition-all ${
                        settings.readingAssist.calmColorValue === c.key
                          ? 'border-amber-400 ring-2 ring-amber-500/40'
                          : 'border-border/60 hover:border-amber-500/40'
                      }`}
                    >
                      <span className="block h-7" style={{ background: c.bg }} />
                      <span className="block bg-card py-0.5 text-[10px] text-muted-foreground">{c.label}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* 自动阅读速度 */}
              <div className={`rounded-md border border-border/60 px-2.5 py-2 ${settings.readingAssist.autoScroll ? '' : 'opacity-50'}`}>
                <div className="mb-1 flex items-center justify-between">
                  <span className="text-xs font-medium">自动阅读速度</span>
                  <span className="text-xs text-amber-500">{settings.readingAssist.wpm} 字/分</span>
                </div>
                <Slider
                  value={[settings.readingAssist.wpm]}
                  min={WPM_MIN}
                  max={WPM_MAX}
                  step={10}
                  onValueChange={([v]) => onChange({ readingAssist: { ...settings.readingAssist, wpm: v } })}
                />
                <div className="mt-1.5 flex gap-1.5">
                  {[150, 220, 300, 400].map((n) => (
                    <button
                      key={n}
                      onClick={() => onChange({ readingAssist: { ...settings.readingAssist, wpm: n } })}
                      className={`rounded-full border px-2 py-0.5 text-[11px] transition-colors ${
                        settings.readingAssist.wpm === n
                          ? 'border-amber-500/60 bg-amber-500/10 text-foreground'
                          : 'border-border/60 text-muted-foreground hover:text-foreground'
                      }`}
                    >
                      {n}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </TabsContent>

          {/* ---------- 背景 ---------- */}
          <TabsContent value="background" className="min-h-0 flex-1 overflow-y-auto p-3">
            <div className="space-y-3">
              <div>
                <p className="mb-1.5 text-xs font-medium">主题模式</p>
                <ThemeModePicker value={settings.themeMode} onChange={(themeMode) => onChange({ themeMode })} />
              </div>
              <div className="border-t border-border/40" />
              <div
                className="relative h-32 overflow-hidden rounded-md border border-border/60 bg-muted"
                style={{
                  backgroundImage: settings.background.image ? `url(${settings.background.image})` : undefined,
                  backgroundSize: 'cover',
                  backgroundPosition: 'center',
                }}
              >
                {!settings.background.image && (
                  <span className="absolute inset-0 flex items-center justify-center text-xs text-muted-foreground">
                    还没有背景图
                  </span>
                )}
                <div className="absolute inset-0 bg-black/45" style={{ opacity: settings.background.image ? 1 : 0 }} />
                <span className="absolute bottom-1.5 left-2 rounded bg-black/60 px-1.5 py-0.5 text-[10px] text-white">
                  预览（含阅读暗化层）
                </span>
              </div>

              <div className="flex items-center gap-2">
                <Button size="sm" className="h-8 gap-1.5 text-xs" onClick={() => fileRef.current?.click()}>
                  <Upload className="h-3.5 w-3.5" />
                  上传背景图片
                </Button>
                {settings.background.image && (
                  <Button variant="outline" size="sm" className="h-8 gap-1.5 text-xs" onClick={() => onChange({ background: { ...settings.background, image: null } })}>
                    <ImageOff className="h-3.5 w-3.5" />
                    清除背景
                  </Button>
                )}
              </div>

              <div className="space-y-1">
                <div className="flex items-center justify-between text-[11px]">
                  <span className="text-muted-foreground">背景图不透明度</span>
                  <span className="font-mono">{Math.round(settings.background.opacity * 100)}%</span>
                </div>
                <Slider
                  value={[settings.background.opacity]}
                  min={0.05}
                  max={1}
                  step={0.05}
                  onValueChange={([v]) => onChange({ background: { ...settings.background, opacity: v } })}
                />
              </div>

              <p className="text-[11px] leading-4 text-muted-foreground">
                图片只保存在这台电脑的本机存储里（上传时自动压缩）。界面文字区会叠一层暗化保证可读性。
              </p>
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0]
                  if (f) void onBgFile(f)
                  e.target.value = ''
                }}
              />
            </div>
          </TabsContent>

          {/* ---------- 快捷键 ---------- */}
          <TabsContent value="hotkeys" className="min-h-0 flex-1 overflow-y-auto p-3">
            <p className="mb-2 text-[11px] leading-4 text-muted-foreground">
              点「设置」后按下新的组合键（必须含 Ctrl / Alt）。词组的 Alt+1~9 在右侧「词组」页签单独设置。
            </p>
            <div className="space-y-1.5">
              {HOTKEY_ACTIONS.map((a) => (
                <div key={a.key} className="flex items-center gap-2 rounded-md border border-border/60 px-2.5 py-2">
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-medium">{a.label}</p>
                    <p className="text-[10px] text-muted-foreground">{a.hint}</p>
                  </div>
                  {recording === a.key ? (
                    <button
                      autoFocus
                      onKeyDown={(e) => onHotkeyKeyDown(e, a.key)}
                      onBlur={() => setRecording(null)}
                      className="h-7 min-w-24 animate-pulse rounded border border-amber-500/60 bg-amber-500/10 px-2 text-[11px] text-amber-400"
                    >
                      按下新组合键…
                    </button>
                  ) : (
                    <>
                      <kbd className="rounded bg-muted px-1.5 py-0.5 font-mono text-[11px]">
                        {settings.hotkeys[a.key] || '未设置'}
                      </kbd>
                      <Button variant="outline" size="sm" className="h-7 text-[11px]" onClick={() => setRecording(a.key)}>
                        设置
                      </Button>
                      {settings.hotkeys[a.key] && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-muted-foreground hover:text-destructive"
                          title="清除快捷键"
                          onClick={() => onChange({ hotkeys: { ...settings.hotkeys, [a.key]: '' } })}
                        >
                          <X className="h-3 w-3" />
                        </Button>
                      )}
                    </>
                  )}
                </div>
              ))}
              <Button
                variant="ghost"
                size="sm"
                className="h-7 gap-1 text-[11px] text-muted-foreground"
                onClick={() =>
                  onChange({
                    hotkeys: { toggleView: 'Ctrl+Shift+M', toggleRight: 'Ctrl+B', toggleEdits: 'Ctrl+J', cloudPush: 'Ctrl+Shift+S' },
                  })
                }
              >
                <RotateCcw className="h-3 w-3" />
                恢复默认快捷键
              </Button>
            </div>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  )
}
