// 这部分负责: 手机「我的」页 —— 云端账号、主题字号背景、阅读辅助、数据管理

import { useRef } from 'react'
import {
  Cloud, Palette, Type, BookOpenText, Database, ChevronRight, Upload, ImageOff, Feather, SunMoon,
} from 'lucide-react'
import { toast } from 'sonner'
import { Slider } from '@/components/ui/slider'
import { Switch } from '@/components/ui/switch'
import { Button } from '@/components/ui/button'
import { CloudPanel, type CloudPanelProps } from './CloudPanel'
import { ThemeModePicker } from './ThemeModePicker'
import {
  FONT_SIZE_MIN,
  FONT_SIZE_MAX,
  HIGHLIGHT_SWATCHES,
  type AppSettings,
} from '@/lib/settings'
import { APP_VERSION } from '@/lib/version'

interface Props {
  /** 书架统计：书数 / 总字数 */
  stats: { books: number; chars: number }
  cloud: CloudPanelProps
  settings: AppSettings
  onChange: (patch: Partial<AppSettings>) => void
  onExportBackup: () => void
  onImportBackup: () => void
  onClearAll: () => void
}

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

function Section({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return (
    <section className="px-4 pt-5">
      <h2 className="mb-2 flex items-center gap-1.5 text-[13px] font-semibold text-muted-foreground">
        {icon}
        {title}
      </h2>
      <div className="rounded-2xl border border-border/50 bg-card/80 p-3.5">{children}</div>
    </section>
  )
}

function Row({ label, desc, onClick, danger }: { label: string; desc?: string; onClick: () => void; danger?: boolean }) {
  return (
    <button
      onClick={onClick}
      className={`flex w-full items-center gap-2 border-b border-border/40 px-1 py-3 text-left last:border-b-0 ${
        danger ? 'text-destructive' : ''
      }`}
    >
      <div className="min-w-0 flex-1">
        <p className={`text-sm ${danger ? '' : 'font-medium'}`}>{label}</p>
        {desc && <p className="mt-0.5 text-[11px] text-muted-foreground">{desc}</p>}
      </div>
      <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground/60" />
    </button>
  )
}

/** 手机「我的」页：云端存储 / 外观字号背景 / 阅读辅助 / 数据管理（替代手机上的设置弹窗） */
export function MePage({ stats, cloud, settings, onChange, onExportBackup, onImportBackup, onClearAll }: Props) {
  const bgFileRef = useRef<HTMLInputElement>(null)

  const onBgFile = async (file: File) => {
    try {
      const dataUrl = await compressImage(file)
      onChange({ backgroundMobile: { ...settings.backgroundMobile, image: dataUrl } })
      toast.success('背景图片已设置')
    } catch {
      toast.error('图片读取失败，换一张试试')
    }
  }

  const ASSIST_ITEMS = [
    { key: 'focusMode', label: '专注阅读', desc: '只显示当前行上下各 2 行' },
    { key: 'keys', label: '键盘逐行阅读', desc: '按 ↑ ↓ 逐行移动阅读位置' },
    { key: 'ruler', label: '阅读尺', desc: '当前行上下显示两条横线' },
    { key: 'calmColor', label: '舒缓配色', desc: '专注模式换成低刺激纸色' },
    { key: 'wideSpacing', label: '字间距加大', desc: '专注模式自动加宽字间距' },
    { key: 'autoScroll', label: '自动阅读滚动', desc: '按设定速度自动下移' },
  ] as const

  return (
    <div className="h-full overflow-y-auto pb-6">
      {/* 头部：应用名 + 版本 */}
      <div className="flex items-center gap-3 px-5 pt-6 pb-1">
        <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-amber-500/15 text-amber-500">
          <Feather className="h-6 w-6" />
        </span>
        <div>
          <p className="text-lg font-bold">码字工坊</p>
          <p className="text-[11px] text-muted-foreground">版本 {APP_VERSION}</p>
        </div>
      </div>

      {/* 我的创作统计 */}
      <div className="px-4 pt-4">
        <div className="rounded-2xl border border-border/50 bg-card/80 p-4">
          <p className="text-[13px] font-semibold text-muted-foreground">我的创作</p>
          <div className="mt-2 flex items-end gap-8">
            <div>
              <span className="text-2xl font-bold">{stats.books}</span>
              <span className="ml-1 text-xs text-muted-foreground">本书</span>
            </div>
            <div>
              <span className="text-2xl font-bold">{stats.chars}</span>
              <span className="ml-1 text-xs text-muted-foreground">字</span>
            </div>
          </div>
        </div>
      </div>

      {/* 云端存储 */}
      <Section icon={<Cloud className="h-4 w-4" />} title="云端存储">
        <CloudPanel {...cloud} />
      </Section>

      {/* 外观：主题 / 字号 / 背景 */}
      <Section icon={<Palette className="h-4 w-4" />} title="外观">
        <div className="mb-1.5 flex items-center gap-1.5 text-sm font-medium">
          <SunMoon className="h-4 w-4" />
          主题模式
        </div>
        <ThemeModePicker value={settings.themeMode} onChange={(themeMode) => onChange({ themeMode })} />

        <div className="my-3 border-t border-border/40" />

        <div className="mb-1.5 flex items-center justify-between">
          <span className="flex items-center gap-1.5 text-sm font-medium">
            <Type className="h-4 w-4" />
            正文字号
          </span>
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
            style={{ touchAction: 'pan-y' }}
            className="h-1.5 flex-1 cursor-pointer appearance-none rounded-full bg-muted accent-amber-500"
          />
          <span className="text-sm text-muted-foreground">A</span>
        </div>
        <div className="mt-1.5 flex gap-1.5">
          {[14, 16, 18, 20, 24].map((n) => (
            <button
              key={n}
              onClick={() => onChange({ readingFontSize: n })}
              className={`rounded-full border px-2.5 py-0.5 text-[11px] transition-colors ${
                settings.readingFontSize === n
                  ? 'border-amber-500/60 bg-amber-500/10 text-foreground'
                  : 'border-border/60 text-muted-foreground'
              }`}
            >
              {n}
            </button>
          ))}
        </div>

        <div className="my-3 border-t border-border/40" />

        {/* 背景图片 */}
        <div
          className="relative mb-2.5 h-24 overflow-hidden rounded-xl border border-border/60 bg-muted"
          style={{
            backgroundImage: settings.backgroundMobile.image ? `url(${settings.backgroundMobile.image})` : undefined,
            backgroundSize: 'cover',
            backgroundPosition: 'center',
          }}
        >
          {!settings.backgroundMobile.image && (
            <span className="absolute inset-0 flex items-center justify-center text-xs text-muted-foreground">
              还没有背景图
            </span>
          )}
          <div className="absolute inset-0 bg-black/45" style={{ opacity: settings.backgroundMobile.image ? 1 : 0 }} />
          <span className="absolute bottom-1.5 left-2 rounded bg-black/60 px-1.5 py-0.5 text-[10px] text-white">
            预览（含阅读暗化层）
          </span>
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" className="h-8 gap-1.5 text-xs" onClick={() => bgFileRef.current?.click()}>
            <Upload className="h-3.5 w-3.5" />
            上传背景图片
          </Button>
          {settings.backgroundMobile.image && (
            <Button
              variant="outline"
              size="sm"
              className="h-8 gap-1.5 text-xs"
              onClick={() => onChange({ backgroundMobile: { ...settings.backgroundMobile, image: null } })}
            >
              <ImageOff className="h-3.5 w-3.5" />
              清除背景
            </Button>
          )}
        </div>
        <div className="mt-3 space-y-1">
          <div className="flex items-center justify-between text-[11px]">
            <span className="text-muted-foreground">背景图不透明度</span>
            <span className="font-mono">{Math.round(settings.backgroundMobile.opacity * 100)}%</span>
          </div>
          <Slider
            value={[settings.backgroundMobile.opacity]}
            min={0.05}
            max={1}
            step={0.05}
            onValueChange={([v]) => onChange({ backgroundMobile: { ...settings.backgroundMobile, opacity: v } })}
          />
        </div>
        <p className="mt-2 text-[10px] leading-4 text-muted-foreground">
          手机端专属背景，与电脑/网页端互不影响。图片只保存在本机（上传时自动压缩）。
        </p>
        <input
          ref={bgFileRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0]
            if (f) void onBgFile(f)
            e.target.value = ''
          }}
        />
      </Section>

      {/* 阅读辅助 */}
      <Section icon={<BookOpenText className="h-4 w-4" />} title="阅读辅助">
        <div className="space-y-1">
          {ASSIST_ITEMS.map((item) => (
            <div key={item.key} className="flex items-center gap-2.5 border-b border-border/40 px-1 py-2.5 last:border-b-0">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium">{item.label}</p>
                <p className="text-[11px] text-muted-foreground">{item.desc}</p>
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
        </div>
        <div className="mt-3">
          <p className="mb-1.5 text-sm font-medium">高亮底色</p>
          <div className="flex flex-wrap gap-1.5">
            {HIGHLIGHT_SWATCHES.map((s) => (
              <button
                key={s.value}
                title={s.label}
                onClick={() => onChange({ readingAssist: { ...settings.readingAssist, highlightColor: s.value } })}
                className={`h-7 w-9 rounded-md border transition-all ${
                  settings.readingAssist.highlightColor === s.value
                    ? 'scale-105 border-amber-400 ring-2 ring-amber-500/40'
                    : 'border-border/60'
                }`}
                style={{ background: s.value }}
              />
            ))}
          </div>
        </div>
      </Section>

      {/* 数据管理 */}
      <Section icon={<Database className="h-4 w-4" />} title="数据">
        <Row label="导出工程备份" desc="全部书、章节、Part、词组存成一个 JSON" onClick={onExportBackup} />
        <Row label="导入工程备份" desc="从 JSON 恢复整个工程" onClick={onImportBackup} />
        <Row label="清空全部数据" desc="删除所有书稿与设置，不可恢复" onClick={onClearAll} danger />
        <p className="mt-2 text-[10px] leading-4 text-muted-foreground">
          导出的章节 / Part 文件会直接保存在本 APP 专属文件夹（Android/data/com.maoxie.writer/files/exports），卸载 APP 时会一并清除。
        </p>
      </Section>

      <p className="mt-6 text-center text-[10px] text-muted-foreground/60">码字工坊 v{APP_VERSION}</p>
    </div>
  )
}
