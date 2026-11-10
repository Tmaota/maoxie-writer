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
  /** 选文件（拆书导入/通用），filters 形如 [['文本','txt,md']]，返回路径或 null */
  pickFile: (filters?: [string, string][], title?: string) => Promise<string | null>
  /** 读任意路径的文本文件（拆书导入源文件用），失败返回 null */
  readAnyFile: (absPath: string) => Promise<string | null>
  /** 读书文件夹内相对路径的文本文件（限 bookDir 内防穿越），不存在返回 null */
  readBookFile: (bookDir: string, relPath: string) => Promise<string | null>
  /** 往书文件夹内相对路径写文本（自动建目录） */
  writeBookFile: (bookDir: string, relPath: string, content: string) => Promise<boolean>
  /** 起 Claude 无头任务：prompt 写入交换目录后 spawn claude -p */
  aiSpawn: (taskId: string, bookDir: string, prompt: string, extraArgs?: string[]) => Promise<{ ok: boolean; error?: string }>
  /** 轮询任务：running / exitCode / done / fail 内容 / 日志尾巴 */
  aiStatus: (taskId: string, bookDir: string) => Promise<{ running: boolean; exitCode: number | null; done: boolean; fail: string | null; logTail: string }>
  /** 中断任务进程 */
  aiKill: (taskId: string) => Promise<boolean>
  /** 列书文件夹内相对目录（一层），返回文件名 */
  listBookDir: (bookDir: string, relPath: string) => Promise<string[]>
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
