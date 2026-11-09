// 这部分负责: 字数统计 —— 中文字符计数、阅读时长估算

/** 统计字数：去除所有空白字符后的字符数（中文写作习惯） */
export function countChars(text: string): number {
  return text.replace(/\s/g, '').length
}

/** 估算阅读时长（按 400 字/分钟） */
export function readingMinutes(text: string): number {
  return Math.max(1, Math.round(countChars(text) / 400))
}

/** 格式化大数字：12345 -> 1.2万 */
export function formatCount(n: number): string {
  if (n >= 10000) return (n / 10000).toFixed(1).replace(/\.0$/, '') + ' 万'
  return String(n)
}
