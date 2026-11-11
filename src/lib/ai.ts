// 这部分负责: AI 协作对接协议 —— 和 Claude 桌面版之间的任务派发/审稿报告/修稿交接（MCP 工具回交）

/**
 * 对接思路：界面壳（任务派发/报告勾选/段落 diff/定稿）+ Claude 桌面版（写稿/审查/修稿/拆书）。
 * Claude 桌面版没有文件读写能力，所以：
 * 1. 软件把写作上下文（文风画像/大纲/人设/账本/上一章）直接嵌进提示词，复制给桌面版；
 * 2. 软件内置一个 MCP 桥（码字工坊 --mcp），注册进 Claude 桌面版后，
 *    Claude 通过 maoxie_submit_* 工具把结果交回，软件轮询收件箱取件；
 * 3. 没配 MCP 也能用：任务卡上有粘贴框，手动把结果粘回来，流程一样。
 */

// ─────────────── ฅ(ΦωΦ)ฅ ───────────────

export type AiTaskType = 'write' | 'review' | 'revise' | 'decompose'

export type AiTaskPhase = 'write' | 'review' | 'revise'

export interface AiTask {
  id: string
  bookId: string
  bookName: string
  bookDir: string
  type: AiTaskType
  /** write/review：目标章节标题；decompose：来源文件名 */
  label: string
  /** write 专用：章号 */
  chapterNo?: number
  /** review/revise 专用：章节 id（定稿回写用） */
  chapterId?: string
  phase: AiTaskPhase | 'decompose'
  /** waiting=提示词已就绪等 Claude 回交 done/error/cancelled */
  status: 'waiting' | 'done' | 'error' | 'cancelled'
  startedAt: number
  finishedAt?: number
  error?: string
  /** 完整提示词（复制/重发用） */
  prompt?: string
  /** review：原章内容；write：回交的初稿（diff 原版） */
  origText?: string
  /** 最近收件箱动向（展示用） */
  logTail?: string
}

// ─────────────── (=`ω´=) ───────────────

/** 审稿报告里的一条意见（Claude 回交 report.json 内容） */
export interface ReviewItem {
  id: number
  rule: string
  para: number
  original: string
  problem: string
  suggestion: string
}

export interface ReviewReport {
  /** 唯一 id（taskId+时间戳） */
  id: string
  taskId: string
  bookId: string
  bookName: string
  chapterId: string | null
  chapterTitle: string
  createdAt: number
  items: ReviewItem[]
  /** pending=待勾选 decided=已确认（等修稿） resolved=已定稿 */
  state: 'pending' | 'decided' | 'resolved'
}

// ─────────────── ヾ(ΦωΦ) ───────────────

/** 写进小说文件夹交换目录的文件名（留档/排障用；结果本体走 MCP 收件箱） */
export const F = {
  prompt: '任务.txt',
  draft: '初稿.txt',
  report: '审稿报告.json',
  decision: '审稿决定.json',
  revised: '修订稿.txt',
  source: '送审稿.txt',
  decomposeOut: '拆解.md',
}

/** 任务在书文件夹下的相对目录（运行\ai\<id>\） */
export function taskRelDir(id: string): string {
  return `运行\\ai\\${id}`
}

// ─────────────── (=①ω①=) ───────────────

const LS_TASKS = 'maoxie-writer:aitasks'
const LS_REPORTS = 'maoxie-writer:aireports'

function load<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key)
    return raw ? (JSON.parse(raw) as T) : fallback
  } catch {
    return fallback
  }
}

function save(key: string, v: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(v))
  } catch {
    // 存储满了也不打断
  }
}

export function loadAiTasks(): AiTask[] {
  return load<AiTask[]>(LS_TASKS, [])
}

export function saveAiTasks(tasks: AiTask[]) {
  save(LS_TASKS, tasks)
}

export function loadAiReports(): ReviewReport[] {
  return load<ReviewReport[]>(LS_REPORTS, [])
}

export function saveAiReports(reports: ReviewReport[]) {
  save(LS_REPORTS, reports)
}

// ─────────────── (=ΦωΦ=) ───────────────

/** 从书文件夹里捞出来的写作上下文（嵌进提示词用） */
export interface BookContext {
  /** 文风画像.md 全文（没有为 null） */
  styleProfile: string | null
  /** 故事大纲\ 全部文件合并 */
  outline: string | null
  /** 人物设定\ 全部文件合并 */
  characters: string | null
  /** 账本\ 全部文件合并 */
  ledger: string | null
  /** 正文\ 上一章全文 */
  prevChapter: string | null
}

/** 单块上下文超过就截断，防把整个书塞进提示词 */
function clip(s: string | null, n = 9000): string | null {
  if (!s || !s.trim()) return null
  return s.length > n ? s.slice(0, n) + '\n（……此处后略）' : s
}

function block(title: string, content: string | null): string {
  return content ? `\n【${title}】\n${content}\n` : ''
}

/** 写作红线（桌面版读不到 Claude Code 的全局 CLAUDE.md，红线随提示词走） */
const RED_LINES = [
  '禁金句式收尾、升华式感慨、普世判断格言',
  '禁缺主语的毛边句（灯亮着，走远的兽就找得着回来的路 ← 这种不行）',
  '比喻要贴人物视角，不许作者跳出来感叹',
  '对话要口语化，符合各人物设定，不许全员一个腔',
  '写完逐条自查以上红线，踩了的写进审稿报告',
].join('\n')

// ─────────────── (=`ェ´=) ───────────────

/** 写新章提示词：上下文全嵌进去，写完按顺序调两个工具交回 */
export function buildWritePrompt(task: AiTask, ctx: BookContext): string {
  return [
    `【码字工坊任务：写新章】`,
    `作品：《${task.bookName}》　本章：${task.label}`,
    ``,
    `写完后必须按顺序调用工具交回结果（缺一不可）：`,
    `1. maoxie_submit_draft —— 完整正文（纯文本，只要正文，不要解释）`,
    `2. maoxie_submit_report —— 自查审查报告 JSON：{"chapter":"${task.label}","items":[{"id":1,"rule":"规则名","para":段落序号,"original":"原文句子","problem":"问题描述","suggestion":"改法建议"}]}，一条问题没有也要交（items 为空数组）。`,
    ``,
    `【写作红线】`,
    RED_LINES,
    block('文风画像（必须遵守的成文规矩）', clip(ctx.styleProfile)),
    block('故事大纲', clip(ctx.outline)),
    block('人物设定', clip(ctx.characters)),
    block('账本（时间线+伏笔，番外事实不进正篇账）', clip(ctx.ledger)),
    block('上一章结尾（接这里的文气往下写）', clip(ctx.prevChapter, 6000)),
    ``,
    `现在动笔写${task.label}正文。`,
  ].join('\n')
}

/** 审查已有章节：正文嵌进去，交报告 JSON */
export function buildReviewPrompt(task: AiTask, ctx: BookContext): string {
  return [
    `【码字工坊任务：审查章节】`,
    `作品：《${task.bookName}》　待审：${task.label}`,
    ``,
    `通读下面正文，对照【文风画像】【人物设定】【账本】逐条挑问题，全部写进审查报告，然后调用 maoxie_submit_report 交回。`,
    `报告 JSON 格式：{"chapter":"${task.label}","items":[{"id":1,"rule":"规则名","para":段落序号,"original":"原文句子","problem":"问题描述","suggestion":"改法建议"}]}`,
    `没有问题的规则跳过，一条没有就交空 items。`,
    ``,
    `【审查红线】`,
    RED_LINES,
    block('文风画像', clip(ctx.styleProfile)),
    block('人物设定', clip(ctx.characters)),
    block('账本', clip(ctx.ledger)),
    block(`待审正文《${task.label}》`, task.origText ? clip(task.origText, 20000) : null),
    ``,
    `审完调 maoxie_submit_report 交报告，不要改原文。`,
  ].join('\n')
}

/** 修稿任务：原版+用户勾选的决定嵌进去，交修订稿 */
export function buildRevisePrompt(task: AiTask, adoptedItems: ReviewItem[], fromDraft: boolean): string {
  const orig = task.origText ?? ''
  const items = adoptedItems
    .map((it) => `${it.id}. [${it.rule}] 原文：${it.original}\n   问题：${it.problem}\n   建议：${it.suggestion}`)
    .join('\n')
  return [
    `【码字工坊任务：按决定修稿】`,
    `作品：《${task.bookName}》　篇目：${task.label}`,
    ``,
    `下面是原版全文和「必须处理的意见清单」。只改清单里的问题，其余一字不动；段落结构尽量保持。改完调用 maoxie_submit_revised 交回完整修订稿（纯文本全文）。`,
    ``,
    `【必须处理的意见清单】`,
    items || '（没有勾选项，原样交回即可）',
    block(fromDraft ? '初稿全文' : '原文全文', clip(orig, 20000)),
    ``,
    `修完调 maoxie_submit_revised 交回。`,
  ].join('\n')
}

/** 拆书任务：原文太长不嵌，让用户拖文件进对话 */
export function buildDecomposePrompt(task: AiTask, srcName: string): string {
  void task
  return [
    `【码字工坊任务：拆书】`,
    `来源文件：${srcName}`,
    ``,
    `用户会把原文文件（${srcName}）拖进对话。收齐后拆解它，把报告调用 maoxie_submit_decompose 交回。`,
    `报告用 Markdown，严格用这几个二级标题分段：`,
    `## 基本信息（书名、作者如可知、体裁、总字数估计）`,
    `## 结构拆解（卷/部/章节划分，情节链按顺序列，每环一句话）`,
    `## 文风画像（叙事视角、时态、句长节奏、断句习惯、对话占比、比喻风格、它从不做什么——具体到能照着仿写）`,
    `## 人物与关系（主要人物一句话画像 + 关系网）`,
    `## 剧情蓝图（开端/发展/转折/高潮/结局各一段，可直接当写作蓝图）`,
    ``,
    `先回复「就绪」，等用户贴原文。贴完开拆，拆完调 maoxie_submit_decompose 交回报告。`,
  ].join('\n')
}

// ─────────────── (=^･ω･^=) ───────────────

/** 解析审稿报告 JSON：容错（去掉代码块围栏、截断修复、单条容错） */
export function parseReport(raw: string): ReviewItem[] | null {
  let text = raw.trim()
  text = text.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '').trim()
  const end = text.lastIndexOf('}')
  if (end > 0) text = text.slice(0, end + 1)
  try {
    const obj = JSON.parse(text) as { items?: unknown }
    if (!Array.isArray(obj.items)) return []
    return obj.items
      .map((it, i) => {
        const o = (it ?? {}) as Record<string, unknown>
        return {
          id: typeof o.id === 'number' ? o.id : i + 1,
          rule: String(o.rule ?? '未分类'),
          para: typeof o.para === 'number' ? o.para : 0,
          original: String(o.original ?? ''),
          problem: String(o.problem ?? ''),
          suggestion: String(o.suggestion ?? ''),
        }
      })
      .filter((it) => it.original || it.problem)
  } catch {
    return null
  }
}

// ─────────────── (ΦωΦ)ﾉ ───────────────

export interface DiffBlock {
  kind: 'same' | 'changed' | 'added' | 'removed'
  oldText: string
  newText: string
}

/** 段落级对齐 diff：按空行分段，LCS 对齐；一对一的段落若文本不同则标 changed，多出的标 added/removed */
export function diffParagraphs(oldText: string, newText: string): DiffBlock[] {
  const split = (s: string) =>
    s
      .replace(/\r\n/g, '\n')
      .split(/\n{2,}/)
      .map((p) => p.trim())
      .filter(Boolean)
  const a = split(oldText)
  const b = split(newText)
  const n = a.length
  const m = b.length
  const dp: number[][] = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0))
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1])
    }
  }
  const blocks: DiffBlock[] = []
  let i = 0
  let j = 0
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      blocks.push({ kind: 'same', oldText: a[i], newText: b[j] })
      i++
      j++
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      blocks.push({ kind: 'removed', oldText: a[i], newText: '' })
      i++
    } else {
      blocks.push({ kind: 'added', oldText: '', newText: b[j] })
      j++
    }
  }
  while (i < n) blocks.push({ kind: 'removed', oldText: a[i++], newText: '' })
  while (j < m) blocks.push({ kind: 'added', oldText: '', newText: b[j++] })
  // 折叠相邻的 removed+added 为 changed（同一处改写）
  const out: DiffBlock[] = []
  for (const bk of blocks) {
    const prev = out[out.length - 1]
    if (prev && prev.kind === 'removed' && bk.kind === 'added') {
      prev.kind = 'changed'
      prev.newText = bk.newText
    } else {
      out.push({ ...bk })
    }
  }
  return out
}

/** 按用户逐段选择合并定稿：choice[i] = 用新版(true)还是原版(false)，仅对 changed 有意义 */
export function mergeDiff(blocks: DiffBlock[], choice: Record<number, boolean>): string {
  return blocks
    .map((bk, i) => {
      if (bk.kind === 'same') return bk.oldText
      if (bk.kind === 'removed') return choice[i] === false ? bk.oldText : ''
      if (bk.kind === 'added') return choice[i] === false ? '' : bk.newText
      return choice[i] === false ? bk.oldText : bk.newText
    })
    .filter(Boolean)
    .join('\n\n')
}

// ─────────────── ┏(ΦωΦ)┛ ───────────────

/** 把拆书报告按二级标题切成几块（渲染/导出用） */
export function splitDecompose(md: string): { head: string; body: string }[] {
  const parts = md.split(/^## /m).filter((s) => s.trim())
  return parts.map((s) => {
    const nl = s.indexOf('\n')
    if (nl === -1) return { head: s.trim(), body: '' }
    return { head: s.slice(0, nl).trim(), body: s.slice(nl + 1).trim() }
  })
}
