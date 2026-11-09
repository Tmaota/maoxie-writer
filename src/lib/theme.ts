// 这部分负责: 主题 —— 日间/夜间/跟随系统的切换逻辑

/** 主题模式：日间 / 夜间 / 跟随系统 */
export type ThemeMode = 'light' | 'dark' | 'system'

// ─────────────── (=①ω①=) ───────────────

export const THEME_COLORS: Record<'light' | 'dark', string> = {
  light: '#f2ece1',
  dark: '#17130f',
}

const mq = () => window.matchMedia('(prefers-color-scheme: dark)')

/** 当前生效的明暗（system 模式实时解析系统偏好） */
export function resolvedTheme(mode: ThemeMode): 'light' | 'dark' {
  if (mode === 'system') return mq().matches ? 'dark' : 'light'
  return mode
}

function apply(resolved: 'light' | 'dark') {
  document.documentElement.classList.toggle('dark', resolved === 'dark')
  document
    .querySelector('meta[name="theme-color"]')
    ?.setAttribute('content', THEME_COLORS[resolved])
}

let mqListener: (() => void) | null = null

/** 应用主题模式：写 .dark 类 + 系统模式时订阅系统切换 */
export function applyThemeMode(mode: ThemeMode): void {
  if (mqListener) {
    mq().removeEventListener('change', mqListener)
    mqListener = null
  }
  if (mode === 'system') {
    mqListener = () => apply(resolvedTheme('system'))
    mq().addEventListener('change', mqListener)
  }
  apply(resolvedTheme(mode))
}
