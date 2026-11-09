// 这部分负责: 统一导出入口 —— 桌面弹保存框、手机写 APP 专属文件夹、浏览器下载

/** 统一导出入口：桌面端写入设置的目录/弹保存框；手机 APP 写入 APP 专属文件夹（卸载即删）；浏览器退回下载 */
import { bridge } from './bridge'
import type { TextPayload } from './io'
import { downloadBlobFallback } from './io'
import type { AppSettings, ExportCategory } from './settings'

function payloadToBase64(p: TextPayload): { dataBase64: string; filterName?: string; filterExt?: string } {
  if (p.mime.startsWith('base64:')) {
    const ext = p.filename.split('.').pop() ?? 'bin'
    return { dataBase64: p.text, filterName: ext.toUpperCase(), filterExt: ext }
  }
  const bytes = new TextEncoder().encode(p.text)
  let bin = ''
  for (const b of bytes) bin += String.fromCharCode(b)
  const ext = p.filename.split('.').pop() ?? 'txt'
  return { dataBase64: btoa(bin), filterName: ext.toUpperCase(), filterExt: ext }
}

/** 手机 APP：写入 APP 专属文件夹（Android/data/<包名>/files/exports，随卸载删除，无需权限） */
async function writeToAppFolder(payload: TextPayload): Promise<string> {
  const { Filesystem, Directory } = await import('@capacitor/filesystem')
  const dir = 'exports'
  await Filesystem.mkdir({ path: dir, directory: Directory.External, recursive: true }).catch(() => {})
  const { dataBase64 } = payloadToBase64(payload)
  const safeName = payload.filename.replace(/[\\/:*?"<>|]/g, '_')
  const res = await Filesystem.writeFile({
    path: `${dir}/${safeName}`,
    data: dataBase64,
    directory: Directory.External,
    recursive: true,
  })
  return res.uri
}

/**
 * 保存导出文件。返回：
 * - path 字符串：已保存（桌面端 / 手机 APP 专属文件夹）
 * - 'downloaded'：浏览器环境走下载
 * - null：用户取消
 * - throw：失败
 */
export async function saveExport(payload: TextPayload, category: ExportCategory, settings: AppSettings): Promise<string | 'downloaded' | null> {
  const b = bridge()
  if (!b?.exportFile) {
    // 手机 APP（Capacitor）：直接写进 APP 专属文件夹
    const { Capacitor } = await import('@capacitor/core')
    if (Capacitor.isNativePlatform()) {
      return writeToAppFolder(payload)
    }
    const blob = payload.mime.startsWith('base64:')
      ? new Blob([Uint8Array.from(atob(payload.text), (c) => c.charCodeAt(0))], { type: payload.mime.slice(7) })
      : new Blob([payload.text], { type: payload.mime })
    downloadBlobFallback(blob, payload.filename)
    return 'downloaded'
  }
  const { dataBase64, filterName, filterExt } = payloadToBase64(payload)
  return b.exportFile({
    dir: settings.exportDirs[category] || undefined,
    filename: payload.filename,
    dataBase64,
    filterName,
    filterExt,
  })
}
