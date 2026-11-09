// 这部分负责: 每日码字统计 —— 本地存储，给热力图供数

/**
 * 每日码字统计（本地存储，不走云端：各设备各自统计）。
 * 记录每天「新增了多少字」，用于书架层的写作热力图。
 */
const KEY = 'maoxie-writer:stats'
/** 只保留最近这么多天的数据 */
const MAX_DAYS = 400

function load(): Record<string, number> {
  try {
    const raw = localStorage.getItem(KEY)
    const p = raw ? JSON.parse(raw) : {}
    return typeof p === 'object' && p ? (p as Record<string, number>) : {}
  } catch {
    return {}
  }
}

function save(days: Record<string, number>): void {
  try {
    const keys = Object.keys(days).sort()
    // 只保留最近 MAX_DAYS 天
    while (keys.length > MAX_DAYS) delete days[keys.shift()!]
    localStorage.setItem(KEY, JSON.stringify(days))
  } catch {
    // 存储满等情况忽略，统计不影响写作
  }
}

function todayKey(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/** 今天新增了 n 字（编辑入口调用，n 已按正增量算好） */
export function addCharsToday(n: number): void {
  if (!Number.isFinite(n) || n <= 0) return
  const days = load()
  const k = todayKey()
  days[k] = (days[k] ?? 0) + Math.round(n)
  save(days)
}

// ─────────────── (=^･ω･^=) ───────────────

export interface WritingSummary {
  /** 最近 400 天 日期→新增字数 */
  days: Record<string, number>
  today: number
  total: number
  week: number
  /** 当前连续写作天数（今天还没写也算上昨天的连续） */
  streak: number
  longestStreak: number
}

// ─────────────── ┏(ΦωΦ)┛ ───────────────

export function getWritingSummary(): WritingSummary {
  const days = load()
  const keys = Object.keys(days)
  const today = days[todayKey()] ?? 0
  const total = keys.reduce((s, k) => s + (days[k] ?? 0), 0)
  const now = new Date()
  let week = 0
  for (let i = 0; i < 7; i++) {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i)
    const k = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    week += days[k] ?? 0
  }
  // 连续天数：从今天（或昨天）往前数有字的日子
  const has = (offsetFromToday: number) => {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - offsetFromToday)
    const k = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    return (days[k] ?? 0) > 0
  }
  let streak = 0
  let i = has(0) ? 0 : 1 // 今天没写不算断，从昨天开始数
  while (has(i)) {
    streak++
    i++
  }
  // 最长连续
  const sorted = keys.filter((k) => days[k] > 0).sort()
  let longest = 0
  let run = 0
  let prev: Date | null = null
  for (const k of sorted) {
    const d = new Date(`${k}T00:00:00`)
    if (prev && d.getTime() - prev.getTime() === 86400000) run++
    else run = 1
    if (run > longest) longest = run
    prev = d
  }
  return { days, today, total, week, streak, longestStreak: longest }
}
