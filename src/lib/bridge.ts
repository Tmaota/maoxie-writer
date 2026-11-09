// 这部分负责: 桌面桥类型 —— window.maoxie 能调什么、怎么调

/** 桌面端能力桥（Electron preload 注入；浏览器环境为 undefined） */

export interface ExportFileOptions {
  dir?: string
  filename: string
  dataBase64: string
  filterName?: string
  filterExt?: string
}

// ─────────────── (ΦωΦ)ﾉ ───────────────

export interface MaoxieBridge {
  gh: (path: string, options?: { method?: string; headers?: Record<string, string>; body?: string }) => Promise<{
    status: number
    headers: Record<string, string>
    body: unknown
  }>
  /** 中断正在进行的 GitHub 请求（渲染层的 AbortSignal 通过它映射到主进程） */
  ghAbort: () => void
  openExternal: (url: string) => Promise<unknown>
  pickDirectory: (defaultPath?: string) => Promise<string | null>
  exportFile: (opts: ExportFileOptions) => Promise<string | null>
}

// ─────────────── (=ↀωↀ=) ───────────────

export function bridge(): MaoxieBridge | null {
  return typeof window !== 'undefined' && window.maoxie ? window.maoxie : null
}

declare global {
  interface Window {
    maoxie?: MaoxieBridge
  }
}
