// 这部分负责: 应用入口 —— 挂载 React、注册 PWA 离线缓存

import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { HashRouter } from 'react-router'
import './index.css'
import App from './App.tsx'

// PWA 离线缓存：只在真实部署的 http(s) 环境注册；localhost 开发/预览不注册，避免旧缓存干扰
if (
  typeof navigator !== 'undefined' &&
  'serviceWorker' in navigator &&
  location.protocol.startsWith('http') &&
  location.hostname !== 'localhost' &&
  location.hostname !== '127.0.0.1'
) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch(() => {
      // 注册失败（如桌面 file:// 或旧浏览器）不影响使用
    })
  })
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <HashRouter>
      <App />
    </HashRouter>
  </StrictMode>,
)
