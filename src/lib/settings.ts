// 这部分负责: 设置读写 —— 默认值、20 种字体清单、导入导出入口路径

/** 软件设置：导出路径 / 字体 / 背景 / 快捷键 / 主题，全部存本机 */

import type { ThemeMode } from './theme'

export type ExportCategory = 'chapter' | 'combo' | 'side' | 'backup'

// ─────────────── (=ΦωΦ=) ───────────────

export interface ExportDirs {
  /** 各导出类别对应的文件夹；空字符串 = 未设置（每次弹出保存对话框） */
  chapter: string
  combo: string
  side: string
  backup: string
}

// ─────────────── ฅ(ΦωΦ)ฅ ───────────────

export interface BackgroundSettings {
  /** 背景图 dataURL；null = 无背景 */
  image: string | null
  /** 背景图不透明度 0.05 ~ 1 */
  opacity: number
}

/** 可自定义的快捷键动作 */
export interface HotkeyMap {
  toggleView: string
  toggleRight: string
  toggleEdits: string
  cloudPush: string
}

/** ADHD 专注阅读与辅助阅读设置 */
export interface ReadingAssistSettings {
  /** 当前行高亮底色（hex，含透明度） */
  highlightColor: string
  /** 键盘 ↑↓ 逐行/逐段阅读 */
  keys: boolean
  /** 阅读尺：当前行上下两条压视线 */
  ruler: boolean
  /** 舒缓配色（专注模式下换低刺激底色） */
  calmColor: boolean
  /** 舒缓配色方案 key，见 CALM_COLORS */
  calmColorValue: string
  /** 字间距加大 */
  wideSpacing: boolean
  /** 自动阅读滚动 */
  autoScroll: boolean
  /** 自动阅读速度（字/分） */
  wpm: number
}

// ─────────────── (=`ω´=) ───────────────

export const DEFAULT_READING_ASSIST: ReadingAssistSettings = {
  highlightColor: '#f59e0b2e',
  keys: true,
  ruler: false,
  calmColor: false,
  calmColorValue: 'paper',
  wideSpacing: false,
  autoScroll: false,
  wpm: 220,
}

/** 高亮底色色卡 */
export const HIGHLIGHT_SWATCHES: { label: string; value: string }[] = [
  { label: '琥珀', value: '#f59e0b2e' },
  { label: '明黄', value: '#eab3082e' },
  { label: '橘橙', value: '#f973162e' },
  { label: '绯红', value: '#ef44442e' },
  { label: '翠绿', value: '#22c55e2e' },
  { label: '青碧', value: '#14b8a62e' },
  { label: '湖蓝', value: '#3b82f62e' },
  { label: '薰衣紫', value: '#a855f72e' },
]

/** 舒缓配色方案（专注模式用纸色/低刺激深色） */
export const CALM_COLORS: { key: string; label: string; bg: string; fg: string }[] = [
  { key: 'paper', label: '米黄纸', bg: '#f6f1e3', fg: '#3d372c' },
  { key: 'green', label: '浅绿纸', bg: '#ecf2e9', fg: '#31402e' },
  { key: 'warmblack', label: '暖黑', bg: '#221e19', fg: '#d9d0c1' },
  { key: 'bean', label: '深豆沙', bg: '#262021', fg: '#d8cbcb' },
]

// ─────────────── ヾ(ΦωΦ) ───────────────

export const WPM_MIN = 100
// ─────────────── (=①ω①=) ───────────────

export const WPM_MAX = 500

// ─────────────── (=`ェ´=) ───────────────

export interface AppSettings {
  exportDirs: ExportDirs
  /** font-family 值；'' = 系统默认 */
  font: string
  /** 电脑/网页端背景图 */
  background: BackgroundSettings
  /** 手机端专属背景图（与电脑/网页互不影响） */
  backgroundMobile: BackgroundSettings
  hotkeys: HotkeyMap
  /** 正文字号（px） */
  readingFontSize: number
  /** 阅读模式：ADHD 专注阅读（只显示当前行±2行并高亮当前行） */
  readingFocusMode: boolean
  /** 阅读辅助（高亮色 / 键盘阅读 / 阅读尺 / 舒缓配色 / 字间距 / 自动阅读） */
  readingAssist: ReadingAssistSettings
  /** 主题模式：日间 / 夜间 / 跟随系统 */
  themeMode: ThemeMode
}

// ─────────────── (=^･ω･^=) ───────────────

export const FONT_SIZE_MIN = 12
// ─────────────── ┏(ΦωΦ)┛ ───────────────

export const FONT_SIZE_MAX = 28
// ─────────────── (ΦωΦ)ﾉ ───────────────

export const DEFAULT_FONT_SIZE = 16

// ─────────────── (=ↀωↀ=) ───────────────

export const DEFAULT_HOTKEYS: HotkeyMap = {
  toggleView: 'Ctrl+Shift+M',
  toggleRight: 'Ctrl+B',
  toggleEdits: 'Ctrl+J',
  cloudPush: 'Ctrl+Shift+S',
}

// ─────────────── (=ΦωΦ=) ───────────────

export const DEFAULT_SETTINGS: AppSettings = {
  exportDirs: { chapter: '', combo: '', side: '', backup: '' },
  font: '',
  background: { image: null, opacity: 0.3 },
  backgroundMobile: { image: null, opacity: 0.3 },
  hotkeys: { ...DEFAULT_HOTKEYS },
  readingFontSize: DEFAULT_FONT_SIZE,
  readingFocusMode: false,
  readingAssist: { ...DEFAULT_READING_ASSIST },
  themeMode: 'dark',
}

const KEY = 'maoxie-writer:settings'

// ─────────────── ฅ(ΦωΦ)ฅ ───────────────

export function loadSettings(): AppSettings {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return structuredClone(DEFAULT_SETTINGS)
    const p = JSON.parse(raw)
    return {
      exportDirs: { ...DEFAULT_SETTINGS.exportDirs, ...(p.exportDirs ?? {}) },
      font: typeof p.font === 'string' ? p.font : '',
      background: { ...DEFAULT_SETTINGS.background, ...(p.background ?? {}) },
      backgroundMobile: { ...DEFAULT_SETTINGS.backgroundMobile, ...(p.backgroundMobile ?? {}) },
      hotkeys: { ...DEFAULT_HOTKEYS, ...(p.hotkeys ?? {}) },
      readingFontSize:
        typeof p.readingFontSize === 'number'
          ? Math.min(FONT_SIZE_MAX, Math.max(FONT_SIZE_MIN, p.readingFontSize))
          : DEFAULT_FONT_SIZE,
      readingFocusMode: typeof p.readingFocusMode === 'boolean' ? p.readingFocusMode : false,
      themeMode: p.themeMode === 'light' || p.themeMode === 'system' ? p.themeMode : 'dark',
      readingAssist: (() => {
        const ra = { ...DEFAULT_READING_ASSIST, ...(p.readingAssist ?? {}) }
        if (!CALM_COLORS.some((c) => c.key === ra.calmColorValue)) ra.calmColorValue = DEFAULT_READING_ASSIST.calmColorValue
        ra.wpm = Math.min(WPM_MAX, Math.max(WPM_MIN, typeof ra.wpm === 'number' ? ra.wpm : DEFAULT_READING_ASSIST.wpm))
        return ra
      })(),
    }
  } catch {
    return structuredClone(DEFAULT_SETTINGS)
  }
}

// ─────────────── (=`ω´=) ───────────────

export function saveSettings(s: AppSettings): void {
  localStorage.setItem(KEY, JSON.stringify(s))
}

/* ---------- 预设字体（20 种） ---------- */

export interface FontOption {
  label: string
  /** CSS font-family 值 */
  value: string
}

// ─────────────── ヾ(ΦωΦ) ───────────────

export const FONT_OPTIONS: FontOption[] = [
  { label: '系统默认', value: '' },
  { label: '宋体', value: 'SimSun, "NSimSun", serif' },
  { label: '仿宋', value: 'FangSong, "STFangsong", serif' },
  { label: '楷体', value: 'KaiTi, "STKaiti", serif' },
  { label: '黑体', value: 'SimHei, sans-serif' },
  { label: '微软雅黑', value: '"Microsoft YaHei", sans-serif' },
  { label: '微软正黑', value: '"Microsoft JhengHei", sans-serif' },
  { label: '苹方', value: '"PingFang SC", "Hiragino Sans GB", sans-serif' },
  { label: '思源宋体', value: '"Source Han Serif SC", "Noto Serif SC", "Noto Serif CJK SC", serif' },
  { label: '思源黑体', value: '"Source Han Sans SC", "Noto Sans SC", "Noto Sans CJK SC", sans-serif' },
  { label: '霞鹜文楷', value: '"LXGW WenKai", "LXGW WenKai Screen", serif' },
  { label: '霞鹜文楷等宽', value: '"LXGW WenKai Mono", monospace' },
  { label: '得意黑', value: '"Smiley Sans", sans-serif' },
  { label: '小赖字体', value: '"Xiaolai SC", "Xiaolai", cursive' },
  { label: '华文宋体', value: '"STSong", "Songti SC", serif' },
  { label: '华文楷体', value: '"STKaiti", "Kaiti SC", serif' },
  { label: '华文仿宋', value: '"STFangsong", "FangSong_GB2312", serif' },
  { label: '文泉驿正黑', value: '"WenQuanYi Zen Hei", sans-serif' },
  { label: 'Times New Roman', value: '"Times New Roman", "Nimbus Roman", serif' },
  { label: 'Arial', value: 'Arial, "Helvetica Neue", Helvetica, sans-serif' },
  { label: 'Consolas 等宽', value: 'Consolas, "Courier New", monospace' },
]

// ─────────────── (=①ω①=) ───────────────

export const FONT_LABELS: Record<string, string> = Object.fromEntries(
  FONT_OPTIONS.map((f) => [f.value, f.label])
)

/* ---------- 快捷键 ---------- */

export const HOTKEY_ACTIONS: { key: keyof HotkeyMap; label: string; hint: string }[] = [
  { key: 'toggleView', label: '切换章节 / Part / 阅读模式', hint: '写作时快速切换模式，阅读模式下按此键返回来源模式' },
  { key: 'toggleRight', label: '收起 / 展开右栏', hint: '大纲、参考、词组面板' },
  { key: 'toggleEdits', label: '打开 / 收起修改记录', hint: '底边浮泡' },
  { key: 'cloudPush', label: '保存到云端', hint: '推送到 GitHub（需已登录）' },
]

/** 把键盘事件规范化为 "Ctrl+Shift+K" 形式；不合法返回 null */
export function comboFromEvent(e: KeyboardEvent): string | null {
  const key = e.key
  if (['Control', 'Shift', 'Alt', 'Meta'].includes(key)) return null
  if (!e.ctrlKey && !e.altKey && !e.metaKey) return null // 必须带修饰键
  const parts: string[] = []
  if (e.ctrlKey) parts.push('Ctrl')
  if (e.altKey) parts.push('Alt')
  if (e.shiftKey) parts.push('Shift')
  parts.push(key.length === 1 ? key.toUpperCase() : key)
  return parts.join('+')
}
