// 这部分负责: 文件读写 —— TXT/DOCX/MD 的解析生成、浏览器下载兜底

import type { Chapter } from '@/types'

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 5000)
}

/** 浏览器环境下的下载兜底（桌面端走 Electron 导出） */
export function downloadBlobFallback(blob: Blob, filename: string) {
  downloadBlob(blob, filename)
}

/** 导出载荷：文件名 + 文本内容 */
export interface TextPayload {
  filename: string
  text: string
  mime: string
}

/** 构造 txt / md / json 导出载荷 */
export function makeTextPayload(filename: string, text: string, mime = 'text/plain;charset=utf-8'): TextPayload {
  return { filename, text, mime }
}

/** 导出 docx（整本 P 或单章），返回载荷 */
export async function makeDocxPayload(title: string, text: string): Promise<TextPayload> {
  const { Document, Packer, Paragraph, TextRun, HeadingLevel } = await import('docx')
  const children = [
    new Paragraph({ text: title, heading: HeadingLevel.HEADING_1, spacing: { after: 300 } }),
    ...text.split('\n').map(
      (line) =>
        new Paragraph({
          children: [new TextRun(line)],
          spacing: { after: 120 },
        })
    ),
  ]
  const doc = new Document({ sections: [{ children }] })
  const blob = await Packer.toBlob(doc)
  const buf = new Uint8Array(await blob.arrayBuffer())
  const bin = Array.from(buf, (b) => String.fromCharCode(b)).join('')
  return { filename: `${title}.docx`, text: binToBase64(bin), mime: 'base64:application/vnd.openxmlformats-officedocument.wordprocessingml.document' }
}

function binToBase64(bin: string): string {
  return btoa(bin)
}

/** 导入 docx，提取纯文本 */
export async function readDocxText(file: File): Promise<string> {
  const mammoth = await import('mammoth')
  const buf = await file.arrayBuffer()
  const result = await mammoth.extractRawText({ arrayBuffer: buf })
  return result.value
}

// ─────────────── (=`ω´=) ───────────────

export async function readTxtText(file: File): Promise<string> {
  return file.text()
}

/**
 * 尝试把导入的长文本按「第N章」标题拆成多个章节。
 * 返回 null 表示无法拆分（应作为单章导入）。
 */
export function trySplitChapters(text: string): { title: string; content: string }[] | null {
  const re = /^(第\s*[0-9一二三四五六七八九十百千]+\s*[章回节卷部话][^\n]{0,40})\s*$/gm
  const matches: { index: number; title: string }[] = []
  let m: RegExpExecArray | null
  while ((m = re.exec(text)) !== null) {
    matches.push({ index: m.index, title: m[1].trim() })
  }
  if (matches.length < 2) return null
  const out: { title: string; content: string }[] = []
  for (let i = 0; i < matches.length; i++) {
    const start = matches[i].index + matches[i].title.length
    const end = i + 1 < matches.length ? matches[i + 1].index : text.length
    out.push({ title: matches[i].title, content: text.slice(start, end).replace(/^\s+/, '') })
  }
  return out
}

/** 整本 P 的 txt 导出载荷（章节间带章节标题） */
export function makeMergedTxtPayload(chapters: Chapter[], pTitle: string): TextPayload {
  const text = chapters.map((c) => `${c.title}\n\n${c.content}`).join('\n\n')
  return makeTextPayload(`${pTitle}.txt`, text)
}
