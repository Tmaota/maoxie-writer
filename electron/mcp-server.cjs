// 这部分负责: Claude 桌面版 MCP 桥 —— 桌面版 Claude 通过 maoxie_submit_* 工具把结果交回码字工坊

/**
 * 无第三方依赖的 MCP 服务（stdio + JSON-RPC 2.0，换行分隔）。
 * 由码字工坊.exe 以 --mcp 参数拉起（在 Claude 桌面版的 claude_desktop_config.json 里注册）。
 * Claude 在聊天里调用工具 → 结果写进收件箱 ai-inbox.jsonl → 软件轮询取件。
 */

const fs = require('fs')
const path = require('path')
const os = require('os')

// ─────────────── ฅ(ΦωΦ)ฅ ───────────────

const userData = path.join(os.homedir(), 'AppData', 'Roaming', 'maoxie-writer')
const inboxFile = path.join(userData, 'ai-inbox.jsonl')
const currentTaskFile = path.join(userData, 'ai-current-task.json')
/** 单次回交体量上限（字符），防误传超大内容撑爆收件箱 */
const MAX_CHARS = 200_000

function inboxPush(line) {
  fs.mkdirSync(userData, { recursive: true })
  fs.appendFileSync(inboxFile, JSON.stringify(line) + '\n', 'utf-8')
}

function readCurrentTask() {
  try {
    return JSON.parse(fs.readFileSync(currentTaskFile, 'utf-8'))
  } catch {
    return null
  }
}

// ─────────────── (=`ω´=) ───────────────

const TOOLS = [
  {
    name: 'maoxie_get_task',
    description: '获取码字工坊当前派发给你的任务（提示词、作品、阶段）。对话里找不到任务说明时用它取。',
    inputSchema: { type: 'object', properties: {}, required: [] },
  },
  {
    name: 'maoxie_submit_draft',
    description: '【写新章任务·第一步】交回你写好的章节初稿正文。',
    inputSchema: { type: 'object', properties: { text: { type: 'string', description: '完整的章节正文（纯文本，只要正文）' } }, required: ['text'] },
  },
  {
    name: 'maoxie_submit_report',
    description: '【写新章/审查任务·第二步】交回自查审查报告 JSON。',
    inputSchema: {
      type: 'object',
      properties: {
        json: {
          type: 'string',
          description: '严格格式：{"chapter":"第N章","items":[{"id":1,"rule":"规则名","para":段落序号,"original":"原文句子","problem":"问题描述","suggestion":"改法建议"}]}；没有问题的规则不写，一条没有就 items 为空数组。',
        },
      },
      required: ['json'],
    },
  },
  {
    name: 'maoxie_submit_revised',
    description: '【修稿任务】交回按决定修好的完整修订稿全文。',
    inputSchema: { type: 'object', properties: { text: { type: 'string', description: '修订后的完整正文（纯文本全文）' } }, required: ['text'] },
  },
  {
    name: 'maoxie_submit_decompose',
    description: '【拆书任务】交回拆书报告 Markdown。',
    inputSchema: { type: 'object', properties: { markdown: { type: 'string', description: '按约定的几个二级标题分段的完整拆解报告' } }, required: ['markdown'] },
  },
]

// ─────────────── ヾ(ΦωΦ) ───────────────

function callTool(name, args) {
  const argsObj = args && typeof args === 'object' ? args : {}
  const task = readCurrentTask()
  const taskId = (task && task.taskId) || 'unknown'

  switch (name) {
    case 'maoxie_get_task':
      return { ok: true, task }
    case 'maoxie_submit_draft': {
      const text = String(argsObj.text ?? '')
      if (!text.trim()) throw new Error('text 不能为空')
      inboxPush({ type: 'draft', taskId, text: text.slice(0, MAX_CHARS), at: Date.now() })
      return { ok: true, received: text.length }
    }
    case 'maoxie_submit_report': {
      const json = String(argsObj.json ?? '')
      if (!json.trim()) throw new Error('json 不能为空')
      inboxPush({ type: 'report', taskId, text: json.slice(0, MAX_CHARS), at: Date.now() })
      return { ok: true, received: json.length }
    }
    case 'maoxie_submit_revised': {
      const text = String(argsObj.text ?? '')
      if (!text.trim()) throw new Error('text 不能为空')
      inboxPush({ type: 'revised', taskId, text: text.slice(0, MAX_CHARS), at: Date.now() })
      return { ok: true, received: text.length }
    }
    case 'maoxie_submit_decompose': {
      const markdown = String(argsObj.markdown ?? '')
      if (!markdown.trim()) throw new Error('markdown 不能为空')
      inboxPush({ type: 'decompose', taskId, text: markdown.slice(0, MAX_CHARS), at: Date.now() })
      return { ok: true, received: markdown.length }
    }
    default:
      throw new Error(`未知工具：${name}`)
  }
}

// ─────────────── (=①ω①=) ───────────────

/** 往 stdout 发一条 JSON-RPC 消息（换行分隔）；管道关了就不发 */
function send(obj) {
  try {
    process.stdout.write(JSON.stringify(obj) + '\n')
  } catch {
    /* Claude 桌面版关管道时静默 */
  }
}

let buffer = ''
process.stdin.on('data', (chunk) => {
  buffer += chunk.toString('utf-8')
  let idx
  while ((idx = buffer.indexOf('\n')) >= 0) {
    const line = buffer.slice(0, idx).trim()
    buffer = buffer.slice(idx + 1)
    if (line) handleLine(line)
  }
})
process.stdin.on('end', () => process.exit(0))

function handleLine(line) {
  let msg
  try {
    msg = JSON.parse(line)
  } catch {
    return
  }
  const { id, method, params } = msg
  // 通知（initialized 等）不回包
  if (id === undefined || id === null) return

  if (method === 'initialize') {
    send({
      jsonrpc: '2.0',
      id,
      result: {
        protocolVersion: (params && params.protocolVersion) || '2025-03-26',
        capabilities: { tools: {} },
        serverInfo: { name: 'maoxie', version: '1.15.0' },
      },
    })
    return
  }
  if (method === 'ping') {
    send({ jsonrpc: '2.0', id, result: {} })
    return
  }
  if (method === 'tools/list') {
    send({ jsonrpc: '2.0', id, result: { tools: TOOLS } })
    return
  }
  if (method === 'tools/call') {
    try {
      const result = callTool(params && params.name, params && params.arguments)
      send({
        jsonrpc: '2.0',
        id,
        result: { content: [{ type: 'text', text: JSON.stringify(result) }], isError: false },
      })
    } catch (err) {
      send({
        jsonrpc: '2.0',
        id,
        result: { content: [{ type: 'text', text: String((err && err.message) || err) }], isError: true },
      })
    }
    return
  }
  send({ jsonrpc: '2.0', id, error: { code: -32601, message: `不支持的方法：${method}` } })
}
