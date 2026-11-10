// 这部分负责: AI 协作对接协议 —— 和 Claude Code 无头模式之间的任务单/审稿报告/修稿交接

/**
 * 对接思路：软件壳（界面/展示/定稿）+ Claude Code 无头模式（写稿/审查/修稿）。
 * 每本书绑定一个小说文件夹（含 正文\ 故事大纲\ 人物设定\ 账本\ 文风画像.md 等），
 * 任务运行时在该文件夹下建 运行\ai\<任务id>\ 交换目录，Claude 按固定文件名读写，
 * 软件轮询任务状态，完成后把审稿报告渲染成可勾选清单、修稿渲染成段落级 diff。
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
  /** write 专用：章号（用于读上一章等） */
  chapterNo?: number
  /** review/revise 专用：章节 id（定稿回写用） */
  chapterId?: string
  phase: AiTaskPhase | 'decompose'
  status: 'running' | 'done' | 'error' | 'cancelled'
  startedAt: number
  finishedAt?: number
  error?: string
  /** 完整提示词（手动模式复制用） */
  prompt?: string
  /** review：原章内容；write：手动模式下用户粘贴的初稿（diff 原版） */
  origText?: string
  /** 手动模式（Claude 命令行不可用，改在聊天里手动跑） */
  manual?: boolean
  /** 最近轮询到的日志尾巴（展示用） */
  logTail?: string
}

// ─────────────── (=`ω´=) ───────────────

/** 审稿报告里的一条意见（Claude 写入 report.json，软件只读） */
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

/** 交换目录里的固定文件名 */
export const F = {
  prompt: '任务.txt',
  log: '日志.txt',
  draft: '初稿.txt',
  report: '审稿报告.json',
  decision: '审稿决定.json',
  revised: '修订稿.txt',
  source: '送审稿.txt',
  done: '完成.txt',
  fail: '失败.txt',
  decomposeOut: '拆解.md',
  decomposeSrc: '拆书原文.txt',
}

/** 任务在书文件夹下的相对交换目录（运行\ai\<id>\） */
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

/** 写新章任务提示词：让 Claude 写稿 + 自审并落盘报告 */
export function buildWritePrompt(task: AiTask, prevChapterTitle: string | null): string {
  const t = taskRelDir(task.id)
  return [
    `你是小说协作写稿模式。工作目录就是这本小说的根目录（已 cd 进来）。`,
    `任务：写《${task.bookName}》${task.label}。`,
    ``,
    `步骤（必须全部完成）：`,
    `1. 先读 文风画像.md（没有就跳过）、故事大纲\\ 里的文件、人物设定\\ 里的文件、账本\\ 里的两本账（时间线和伏笔），${prevChapterTitle ? `再读 正文\\${prevChapterTitle}.txt（上一章）` : '这是第一章，不用读上一章'}。`,
    `2. 动笔写${task.label}正文，只写正文，不要任何解释、提纲或创作说明。`,
    `3. 写完后通读一遍，按你的 AI 味审查规矩自查（金句收尾、升华、缺主语毛边句等全部红线逐条过）。`,
    `4. 把正文写入 ${t}\\${F.draft}（纯文本，UTF-8）。`,
    `5. 把审查结果写入 ${t}\\${F.report}，严格用 JSON 格式：`,
    `{"chapter":"${task.label}","items":[{"id":1,"rule":"规则名","para":段落序号,"original":"原文句子","problem":"问题描述","suggestion":"改法建议"}]}`,
    `没有任何问题也要写 {"chapter":"${task.label}","items":[]}，这个文件必须存在。`,
    `6. 最后往 ${t}\\${F.done} 写一个 DONE。`,
    `注意：不要写 ${t}\\${F.decision}，那是下一步的事；不要碰 正文\\ 里的旧文件。`,
  ].join('\n')
}

/** 审查已有章节：内容已由软件写入 送审稿.txt */
export function buildReviewPrompt(task: AiTask): string {
  const t = taskRelDir(task.id)
  return [
    `你是小说协作审稿模式。工作目录是小说根目录。`,
    `任务：审查《${task.bookName}》的「${task.label}」。待审全文在 ${t}\\${F.source}。`,
    ``,
    `步骤：`,
    `1. 读 ${t}\\${F.source} 全文，同时读 文风画像.md、人物设定\\、账本\\ 对照设定与文风。`,
    `2. 按 AI 味审查规矩逐条过：金句收尾、升华、缺主语毛边句、比喻密度超标、对话腔不对，全部列出。`,
    `3. 把审查结果写入 ${t}\\${F.report}，严格 JSON：`,
    `{"chapter":"${task.label}","items":[{"id":1,"rule":"规则名","para":段落序号,"original":"原文句子","problem":"问题描述","suggestion":"改法建议"}]}`,
    `没有问题的规则就跳过，没任何问题写 {"chapter":"${task.label}","items":[]}。`,
    `4. 往 ${t}\\${F.done} 写一个 DONE。`,
  ].join('\n')
}

/** 修稿任务：按用户勾选的决定改稿 */
export function buildRevisePrompt(task: AiTask, fromDraft: boolean): string {
  const t = taskRelDir(task.id)
  const src = fromDraft ? `${t}\\${F.draft}` : `${t}\\${F.source}`
  return [
    `你是小说协作修稿模式。工作目录是小说根目录。`,
    `任务：按决定修《${task.bookName}》的「${task.label}」。`,
    ``,
    `材料：`,
    `- 原文：${src}`,
    `- 要处理的意见：${t}\\${F.decision}（JSON，含 items 数组，每条有 id/original/problem/suggestion/adopt，adopt=true 的才改）`,
    ``,
    `步骤：`,
    `1. 读原文和决定文件，只处理 adopt=true 的条目，其余一字不动。`,
    `2. 改的时候保住原文的段落结构（段落数量可以变，但别整段重排），改法遵循 suggestion 的方向但要服从文风画像的规矩。`,
    `3. 把修订后的完整正文写入 ${t}\\${F.revised}（纯文本，UTF-8）。`,
    `4. 往 ${t}\\${F.done} 写一个 DONE。`,
  ].join('\n')
}

/** 拆书任务：拆结构、提文风、反推蓝图 */
export function buildDecomposePrompt(task: AiTask, srcName: string): string {
  const t = taskRelDir(task.id)
  return [
    `你是小说拆解模式。工作目录里 ${t}\\${F.decomposeSrc} 是一部作品的纯文本（原文件名：${srcName}）。`,
    `任务：完整拆解这部作品，把结果写入 ${t}\\${F.decomposeOut}（Markdown，UTF-8）。`,
    ``,
    `报告必须严格用这几个二级标题分段：`,
    `## 基本信息（书名、作者如可知、体裁、总字数估计）`,
    `## 结构拆解（卷/部/章节划分，情节链按顺序列，每环一句话）`,
    `## 文风画像（叙事视角、时态、句长节奏、断句习惯、对话占比、比喻风格、禁区的反面即它从不做什么——要具体到能照着仿写的程度）`,
    `## 人物与关系（主要人物一句话画像 + 关系网）`,
    `## 剧情蓝图（开端/发展/转折/高潮/结局各一段，可直接当写作蓝图用）`,
    ``,
    `全部写完后往 ${t}\\${F.done} 写一个 DONE。`,
  ].join('\n')
}

// ─────────────── (=`ェ´=) ───────────────

/** 解析审稿报告 JSON：容错（去掉代码块围栏、截断修复、单条容错） */
export function parseReport(raw: string): ReviewItem[] | null {
  let text = raw.trim()
  text = text.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '').trim()
  // 有些模型会在 JSON 后面追加解释，截取到最后一个 }
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

// ─────────────── (=^･ω･^=) ───────────────

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
  // LCS
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
