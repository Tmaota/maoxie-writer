// 这部分负责: 桌面端预加载 —— 把主进程能力安全挂到 window.maoxie 给页面用

// 预加载脚本：把主进程的 GitHub 网络能力安全暴露给渲染进程
const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('maoxie', {
  /**
   * 通过主进程请求 GitHub REST API（绕过浏览器 CORS 限制）
   * @param {string} path 以 / 开头的 API 路径
   * @param {{method?: string, headers?: Record<string,string>, body?: string}} [options]
   */
  gh: (path, options) => ipcRenderer.invoke('maoxie-gh', { path, options }),
  /** 中断主进程里正在进行的 GitHub 请求（手动保存接管自动上传时用） */
  ghAbort: () => ipcRenderer.send('maoxie-gh-abort'),
  /** 用系统默认浏览器打开链接（仅允许 https） */
  openExternal: (url) => ipcRenderer.invoke('maoxie-open-external', url),
  /** 选择文件夹，返回路径或 null（取消） */
  pickDirectory: (defaultPath) => ipcRenderer.invoke('maoxie-pick-directory', defaultPath),
  /** 导出文件：已配目录直接写入，否则弹保存对话框；返回保存路径或 null（取消） */
  exportFile: (opts) => ipcRenderer.invoke('maoxie-export-file', opts),
})
