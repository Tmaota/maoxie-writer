// 这部分负责: 桌面端主进程 —— 窗口生命周期、GitHub API 代理（绕开 CORS）、导出写文件、外部链接

// 码字工坊 桌面端主进程
const { app, BrowserWindow, Menu, ipcMain, net, shell, dialog } = require('electron')
const path = require('path')
const fs = require('fs/promises')

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
