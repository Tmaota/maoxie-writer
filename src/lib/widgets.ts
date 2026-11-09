// 这部分负责: 桌面挂件 —— 安卓 AppWidget 的数据通道与跳转目标

import { Capacitor, registerPlugin } from '@capacitor/core'

/** 桌面挂件条目：一章或一个 Part */
export interface WidgetEntry {
  key: string
  bookId: string
  bookName: string
  targetType: 'chapter' | 'combo'
  targetId: string
  title: string
  /** 正文（截断到 2 万字以内），挂件里可上下滑动看全文 */
  text: string
}

// ─────────────── (=ↀωↀ=) ───────────────

export interface WidgetLaunchTarget {
  bookId: string
  targetType: 'chapter' | 'combo'
  targetId: string
}

interface WriterWidgetNative {
  requestPin(entry: WidgetEntry): Promise<{ ok: boolean; reason?: string }>
  updateAll(opts: { entries: WidgetEntry[]; lastActive: WidgetLaunchTarget | null }): Promise<void>
  getLaunchTarget(): Promise<{ target?: WidgetLaunchTarget | null }>
}

const Plugin = registerPlugin<WriterWidgetNative>('WriterWidget')

/** 仅在安卓 APP 内可用（浏览器 / iPad / 桌面端为 false） */
export const widgetNative = Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android'

/** 请求把某个章节 / Part 钉到桌面：打开系统挂件列表，选中即放置 */
export async function requestPinWidget(entry: WidgetEntry): Promise<{ ok: boolean; reason?: string }> {
  if (!widgetNative) return { ok: false, reason: '仅安卓 APP 支持桌面挂件' }
  try {
    return await Plugin.requestPin(entry)
  } catch (e) {
    return { ok: false, reason: String(e) }
  }
}

/** 全量刷新桌面挂件：目录（全部章节/Part）+ 当前写作位置 */
export async function syncWidgetEntries(entries: WidgetEntry[], lastActive: WidgetLaunchTarget | null): Promise<void> {
  if (!widgetNative) return
  try {
    await Plugin.updateAll({ entries, lastActive })
  } catch {
    /* 忽略：挂件未放置时 native 端无操作 */
  }
}

/** 读取挂件点击带来的启动目标（读取后即清除） */
export async function consumeWidgetLaunch(): Promise<WidgetLaunchTarget | null> {
  if (!widgetNative) return null
  try {
    const r = await Plugin.getLaunchTarget()
    return r?.target ?? null
  } catch {
    return null
  }
}

// ─────────────── (=ΦωΦ=) ───────────────

export interface PinnedRef {
  key: string
  bookId: string
  bookName: string
  targetType: 'chapter' | 'combo'
  targetId: string
  title: string
}

/** App 内生成挂件时的目标描述（不再本地持久化，目录每次都全量同步） */
export function widgetKey(bookId: string, targetType: 'chapter' | 'combo', targetId: string): string {
  return `${bookId}:${targetType}:${targetId}`
}
