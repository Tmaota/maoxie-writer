// 这部分负责: 桌面端主进程 —— 窗口生命周期、GitHub API 代理（绕开 CORS）、导出写文件、外部链接、Claude 任务执行

// 码字工坊 桌面端主进程
const { app, BrowserWindow, Menu, ipcMain, net, shell, dialog } = require('electron')
const path = require('path')
const fs = require('fs/promises')
const os = require('os')

// ─────────────── ฅ(ΦωΦ)ฅ ───────────────

/** 把书文件夹内的相对路径解析成绝对路径，并防目录穿越（必须落在 bookDir 里） */
function resolveInBook(bookDir, relPath) {
  if (typeof bookDir !== 'string' || !bookDir || typeof relPath !== 'string' || !relPath) return null
  const abs = path.resolve(bookDir, relPath)
  const base = path.resolve(bookDir)
  if (abs !== base && !abs.startsWith(base + path.sep)) return null
  return abs
}

// ─────────────── (=`ω´=) ───────────────

ipcMain.handle('maoxie-pick-file', async (event, filters, title) => {
  const win = BrowserWindow.fromWebContents(event.sender)
  const res = await dialog.showOpenDialog(win, {
    properties: ['openFile'],
    title: typeof title === 'string' && title ? title : '选择文件',
    filters: Array.isArray(filters) ? filters.map(([name, exts]) => ({ name, extensions: String(exts).split(',').map((s) => s.trim()).filter(Boolean) })) : undefined,
  })
  return res.canceled ? null : res.filePaths[0]
})

// ─────────────── ヾ(ΦωΦ) ───────────────

ipcMain.handle('maoxie-read-any-file', async (_e, absPath) => {
  if (typeof absPath !== 'string' || !absPath) return null
  try {
    return await fs.readFile(absPath, 'utf-8')
  } catch {
    return null
  }
})

ipcMain.handle('maoxie-read-book-file', async (_e, bookDir, relPath) => {
  const abs = resolveInBook(bookDir, relPath)
  if (!abs) return null
  try {
    return await fs.readFile(abs, 'utf-8')
  } catch {
    return null
  }
})

ipcMain.handle('maoxie-write-book-file', async (_e, bookDir, relPath, content) => {
  const abs = resolveInBook(bookDir, relPath)
  if (!abs || typeof content !== 'string') return false
  try {
    await fs.mkdir(path.dirname(abs), { recursive: true })
    await fs.writeFile(abs, content, 'utf-8')
    return true
  } catch {
    return false
  }
})

ipcMain.handle('maoxie-list-book-dir', async (_e, bookDir, relPath) => {
  const abs = resolveInBook(bookDir, relPath)
  if (!abs) return []
  try {
    const ents = await fs.readdir(abs, { withFileTypes: true })
    return ents.filter((x) => x.isFile()).map((x) => x.name)
  } catch {
    return []
  }
})

// ─────────────── (=①ω①=) ───────────────
// AI 协作收件箱：MCP 桥（Claude 桌面版）把结果写进 ai-inbox.jsonl，渲染进程轮询取走后清空

const aiUserData = path.join(app.getPath('userData'))
const aiInboxFile = path.join(aiUserData, 'ai-inbox.jsonl')
const aiCurrentTaskFile = path.join(aiUserData, 'ai-current-task.json')

/** 渲染进程登记/清除「当前任务」（MCP 桥的 maoxie_get_task 读这个文件） */
ipcMain.handle('maoxie-ai-set-current', async (_e, payload) => {
  try {
    if (payload && typeof payload === 'object') {
      await fs.writeFile(aiCurrentTaskFile, JSON.stringify(payload), 'utf-8')
    } else {
      await fs.rm(aiCurrentTaskFile, { force: true })
    }
    return true
  } catch {
    return false
  }
})

/** 取走收件箱全部内容（读出来就清空，防重复处理） */
ipcMain.handle('maoxie-ai-poll-inbox', async () => {
  try {
    const raw = await fs.readFile(aiInboxFile, 'utf-8')
    await fs.rm(aiInboxFile, { force: true })
    return raw
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean)
      .map((l) => {
        try {
          return JSON.parse(l)
        } catch {
          return null
        }
      })
      .filter(Boolean)
  } catch {
    return []
  }
})

/** Claude 桌面版 MCP 配置状态 + 一键注册 */
const CLAUDE_CONFIG = path.join(os.homedir(), 'AppData', 'Roaming', 'Claude', 'claude_desktop_config.json')

function readClaudeConfig() {
  try {
    return JSON.parse(fs.readFileSync(CLAUDE_CONFIG, 'utf-8'))
  } catch {
    return {}
  }
}

ipcMain.handle('maoxie-claude-status', async () => {
  try {
    const cfg = readClaudeConfig()
    const servers = cfg.mcpServers || {}
    const entry = servers.maoxie
    return { configured: !!(entry && entry.command), command: entry?.command ?? null }
  } catch {
    return { configured: false, command: null }
  }
})

ipcMain.handle('maoxie-claude-setup', async () => {
  try {
    const cfg = readClaudeConfig()
    cfg.mcpServers = cfg.mcpServers || {}
    // MCP 桥用 electron 的「以 node 运行」模式拉起打包里的 mcp-server.cjs（stdio 管道行为等同 node，稳定）
    const scriptPath = path.join(path.dirname(process.execPath), 'resources', 'app.asar', 'electron', 'mcp-server.cjs')
    cfg.mcpServers.maoxie = { command: process.execPath, args: [scriptPath], env: { ELECTRON_RUN_AS_NODE: '1' } }
    await fs.mkdir(path.dirname(CLAUDE_CONFIG), { recursive: true })
    await fs.writeFile(CLAUDE_CONFIG, JSON.stringify(cfg, null, 2), 'utf-8')
    return { ok: true }
  } catch (err) {
    return { ok: false, error: String(err) }
  }
})

// 渲染进程请求 GitHub REST API：走主进程 net.fetch，不受 CORS 限制
// 同时只保留一个在途请求的手柄：渲染进程发出「中断」时立即 abort（手动保存接管自动上传）
let ghAbortCtrl = null
ipcMain.on('maoxie-gh-abort', () => {
  try {
    ghAbortCtrl?.abort()
  } catch {}
})
ipcMain.handle('maoxie-gh', async (_event, { path: apiPath, options }) => {
  ghAbortCtrl = new AbortController()
  try {
    const res = await net.fetch(`https://api.github.com${apiPath}`, {
      method: options?.method ?? 'GET',
      signal: ghAbortCtrl.signal,
      headers: {
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        'User-Agent': 'maoxie-writer',
        ...(options?.headers ?? {}),
      },
      body: options?.body,
    })
    const text = await res.text()
    let body = null
    try {
      body = JSON.parse(text)
    } catch {
      body = text
    }
    return { status: res.status, headers: Object.fromEntries(res.headers.entries()), body }
  } finally {
    ghAbortCtrl = null
  }
})

// 用系统浏览器打开外部链接（只允许 https，防注入）
ipcMain.handle('maoxie-open-external', (_event, url) => {
  if (typeof url === 'string' && url.startsWith('https://')) {
    shell.openExternal(url)
  }
})

// 选择文件夹（导出路径设置用）
ipcMain.handle('maoxie-pick-directory', async (event, defaultPath) => {
  const win = BrowserWindow.fromWebContents(event.sender)
  const res = await dialog.showOpenDialog(win, {
    defaultPath: typeof defaultPath === 'string' && defaultPath ? defaultPath : undefined,
    properties: ['openDirectory', 'createDirectory'],
    title: '选择导出文件夹',
  })
  return res.canceled ? null : res.filePaths[0]
})

/**
 * 导出文件：dir 已配置时直接写入该目录；未配置时弹保存对话框。
 * dataBase64 = 文件内容的 base64。返回保存路径；取消返回 null；失败抛错。
 */
ipcMain.handle('maoxie-export-file', async (event, { dir, filename, dataBase64, filterName, filterExt }) => {
  const win = BrowserWindow.fromWebContents(event.sender)
  const name = typeof filename === 'string' && filename ? filename : 'export.txt'
  let target = null
  if (typeof dir === 'string' && dir) {
    target = path.join(dir, name)
  } else {
    const res = await dialog.showSaveDialog(win, {
      defaultPath: name,
      filters: filterName ? [{ name: filterName, extensions: [filterExt] }] : undefined,
      title: '导出文件',
    })
    if (res.canceled || !res.filePath) return null
    target = res.filePath
  }
  await fs.mkdir(path.dirname(target), { recursive: true })
  await fs.writeFile(target, Buffer.from(dataBase64, 'base64'))
  return target
})

// 单实例：重复点击时聚焦已有窗口，而不是再启动一个（便携版重复解压会卡死）
const gotLock = app.requestSingleInstanceLock()
if (!gotLock) {
  app.quit()
} else {
  app.on('second-instance', () => {
    const wins = BrowserWindow.getAllWindows()
    if (wins.length > 0) {
      const w = wins[0]
      if (w.isMinimized()) w.restore()
      w.focus()
    }
  })
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 960,
    minHeight: 640,
    title: '码字工坊',
    backgroundColor: '#17130f',
    autoHideMenuBar: true,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: path.join(__dirname, 'preload.cjs'),
    },
  })

  // 隐藏默认菜单栏，写作软件不需要
  Menu.setApplicationMenu(null)

  win.loadFile(path.join(__dirname, '../dist/index.html'))
}

// MCP 桥走「electron 以 node 模式跑 mcp-server.cjs」，不进这里；正常模式起窗口
app.whenReady().then(() => {
  createWindow()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
