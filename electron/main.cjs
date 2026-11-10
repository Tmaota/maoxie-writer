// 这部分负责: 桌面端主进程 —— 窗口生命周期、GitHub API 代理（绕开 CORS）、导出写文件、外部链接、Claude 任务执行

// 码字工坊 桌面端主进程
const { app, BrowserWindow, Menu, ipcMain, net, shell, dialog } = require('electron')
const path = require('path')
const fs = require('fs/promises')
const { spawn } = require('child_process')

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

/** 在跑的 Claude 任务表：taskId -> 子进程 */
const aiProcs = new Map()

ipcMain.handle('maoxie-ai-spawn', async (_e, taskId, bookDir, prompt, extraArgs) => {
  if (aiProcs.has(taskId)) return { ok: false, error: '任务已在运行' }
  const dirAbs = resolveInBook(bookDir, `运行\\ai\\${taskId}`)
  if (!dirAbs) return { ok: false, error: '书文件夹无效' }
  try {
    await fs.mkdir(dirAbs, { recursive: true })
    await fs.writeFile(path.join(dirAbs, '任务.txt'), prompt, 'utf-8')
    const logFd = await fs.open(path.join(dirAbs, '日志.txt'), 'w')
    // claude -p 无头模式：print 模式跑完自动退出；模型与全局规矩沿用本机 Claude Code 配置
    const args = ['-p', prompt, '--output-format', 'text', ...(Array.isArray(extraArgs) ? extraArgs : [])]
    const isWin = process.platform === 'win32'
    const proc = spawn(isWin ? 'claude.cmd' : 'claude', args, {
      cwd: path.resolve(bookDir),
      shell: isWin,
      env: { ...process.env, PYTHONIOENCODING: 'utf-8' },
    })
    proc.stdout.on('data', (d) => logFd.write(d))
    proc.stderr.on('data', (d) => logFd.write(d))
    proc.on('close', () => {
      aiProcs.delete(taskId)
      logFd.close().catch(() => {})
    })
    proc.on('error', (err) => {
      fs.writeFile(path.join(dirAbs, '失败.txt'), String(err), 'utf-8').catch(() => {})
      aiProcs.delete(taskId)
      logFd.close().catch(() => {})
    })
    aiProcs.set(taskId, proc)
    return { ok: true }
  } catch (err) {
    return { ok: false, error: String(err) }
  }
})

ipcMain.handle('maoxie-ai-status', async (_e, taskId, bookDir) => {
  const dirAbs = resolveInBook(bookDir, `运行\\ai\\${taskId}`)
  if (!dirAbs) return { running: false, exitCode: null, done: false, fail: '书文件夹无效', logTail: '' }
  const proc = aiProcs.get(taskId)
  let done = false
  let fail = null
  let logTail = ''
  try {
    done = await fs.readFile(path.join(dirAbs, '完成.txt'), 'utf-8').then(() => true).catch(() => false)
    if (!done) fail = await fs.readFile(path.join(dirAbs, '失败.txt'), 'utf-8').catch(() => null)
    const log = await fs.readFile(path.join(dirAbs, '日志.txt'), 'utf-8').catch(() => '')
    logTail = log.slice(-1200)
  } catch {
    /* 忽略 */
  }
  return { running: !!proc, exitCode: proc ? proc.exitCode : null, done, fail, logTail }
})

ipcMain.handle('maoxie-ai-kill', async (_e, taskId) => {
  const proc = aiProcs.get(taskId)
  if (!proc) return false
  try {
    proc.kill()
    return true
  } catch {
    return false
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

app.whenReady().then(() => {
  createWindow()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
