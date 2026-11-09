// 这部分负责: 云端面板 —— GitHub 令牌登录、保存/同步、自动同步开关

import { useState } from 'react'
import { CloudUpload, CloudDownload, Loader2, LogOut, ExternalLink, Github } from 'lucide-react'
import { toast } from 'sonner'
import type { CloudSettings, GhSession } from '@/lib/github'
import { clearSession, saveSession, verifyToken, TOKEN_URL, openExternal, GhError } from '@/lib/github'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'

export interface CloudPanelProps {
  session: GhSession | null
  settings: CloudSettings
  onSessionChange: (s: GhSession | null) => void
  onSettingsChange: (s: CloudSettings) => void
  onPush: () => Promise<void>
  onPull: () => void
}

function fmtTime(ts: number | null): string {
  if (!ts) return '还没有同步过'
  const d = new Date(ts)
  const today = new Date()
  const sameDay = d.toDateString() === today.toDateString()
  const hm = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
  return sameDay ? `今天 ${hm}` : `${d.getMonth() + 1}/${d.getDate()} ${hm}`
}

/** GitHub 云端存储面板：登录 / 仓库 / 手动上传下载 / 自动同步（顶栏菜单与手机「我的」页共用） */
export function CloudPanel({ session, settings, onSessionChange, onSettingsChange, onPush, onPull }: CloudPanelProps) {
  const [token, setToken] = useState('')
  const [loggingIn, setLoggingIn] = useState(false)
  const [busy, setBusy] = useState<'push' | 'pull' | null>(null)
  const [error, setError] = useState<string | null>(null)

  const login = async () => {
    const t = token.trim()
    if (!t) return
    setLoggingIn(true)
    setError(null)
    try {
      const s = await verifyToken(t)
      saveSession(s)
      onSessionChange(s)
      setToken('')
      toast.success(`已连接 GitHub：${s.login}，现在可以保存到云端了`)
    } catch (e) {
      setError(e instanceof GhError ? e.message : '登录失败，请检查网络后重试')
    } finally {
      setLoggingIn(false)
    }
  }

  const logout = () => {
    clearSession()
    onSessionChange(null)
    setError(null)
  }

  const run = async (kind: 'push' | 'pull') => {
    setBusy(kind)
    setError(null)
    try {
      if (kind === 'push') await onPush()
      else onPull()
    } catch (e) {
      const msg = e instanceof GhError ? e.message : '操作失败，请检查网络后重试'
      setError(msg)
      toast.error(msg)
      if (e instanceof GhError && e.status === 401) logout()
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="space-y-2.5">
      <div className="flex items-center gap-2">
        <Github className="h-4 w-4 shrink-0" />
        <span className="text-xs font-medium">GitHub 云端存储</span>
        {session && <span className="ml-auto text-[10px] font-normal text-emerald-500">已连接</span>}
      </div>

      {!session ? (
        <div className="space-y-2.5">
          <p className="text-[11px] leading-4 text-muted-foreground">
            文稿保存到你自己的 GitHub 私有仓库。首次使用需要一枚访问令牌：
          </p>
          <ol className="list-decimal space-y-1 pl-4 text-[11px] leading-4 text-muted-foreground">
            <li>
              点下方按钮打开 GitHub，勾选 <b className="text-foreground">repo</b> 权限后生成令牌
            </li>
            <li>把生成的令牌（ghp_ 开头）粘贴到下面，点登录</li>
          </ol>
          <Button
            variant="outline"
            size="sm"
            className="w-full gap-1.5 text-xs"
            onClick={() => openExternal(TOKEN_URL)}
          >
            <ExternalLink className="h-3.5 w-3.5" />
            去 GitHub 创建令牌
          </Button>
          <Input
            type="password"
            value={token}
            onChange={(e) => setToken(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && void login()}
            placeholder="粘贴令牌（ghp_…）"
            className="h-8 font-mono text-xs"
          />
          <Button size="sm" className="w-full text-xs" disabled={loggingIn || !token.trim()} onClick={() => void login()}>
            {loggingIn && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
            登录并连接
          </Button>
        </div>
      ) : (
        <div className="space-y-2.5">
          <div className="flex items-center gap-2">
            {session.avatarUrl ? (
              <img src={session.avatarUrl} alt="" className="h-6 w-6 rounded-full" />
            ) : (
              <Github className="h-5 w-5" />
            )}
            <span className="text-xs font-medium">{session.login}</span>
            <button
              className="ml-auto inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground"
              onClick={logout}
            >
              <LogOut className="h-3 w-3" />
              退出登录
            </button>
          </div>

          <div className="space-y-1">
            <label className="text-[11px] text-muted-foreground">云端仓库名（不存在会自动创建为私有仓库）</label>
            <Input
              value={settings.repo}
              onChange={(e) => onSettingsChange({ ...settings, repo: e.target.value.replace(/[^A-Za-z0-9_.-]/g, '') })}
              placeholder="maoxie-cloud"
              className="h-8 font-mono text-xs"
            />
          </div>

          <div className="grid grid-cols-2 gap-2">
            <Button
              size="sm"
              variant="secondary"
              className="text-xs"
              disabled={busy !== null}
              onClick={() => void run('push')}
            >
              {busy === 'push' ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <CloudUpload className="mr-1 h-3.5 w-3.5" />}
              手动上传
            </Button>
            <Button
              size="sm"
              variant="secondary"
              className="text-xs"
              disabled={busy !== null}
              onClick={() => void run('pull')}
            >
              {busy === 'pull' ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <CloudDownload className="mr-1 h-3.5 w-3.5" />}
              手动同步
            </Button>
          </div>

          <div className="flex items-center justify-between rounded-md bg-muted/50 px-2 py-1.5">
            <div className="text-[11px] leading-4">
              <div>自动同步</div>
              <div className="text-muted-foreground">有改动才上传，停改 1 分钟后自动推送</div>
            </div>
            <Switch
              checked={settings.autoSync}
              onCheckedChange={(v) => onSettingsChange({ ...settings, autoSync: v })}
            />
          </div>

          <p className="text-[10px] leading-4 text-muted-foreground">
            上传内容：全部书稿、词组，以及设置（字体、背景图、快捷键、阅读辅助）。
          </p>
          <p className="text-[10px] leading-4 text-muted-foreground">
            上次{settings.lastSyncKind === 'pull' ? '从云端同步' : '保存到云端'}：{fmtTime(settings.lastSyncAt)}
          </p>
        </div>
      )}

      {error && <p className="text-[11px] leading-4 text-destructive">{error}</p>}
    </div>
  )
}
