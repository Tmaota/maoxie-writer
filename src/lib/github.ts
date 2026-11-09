// 这部分负责: GitHub 云端 —— 令牌验证、私有仓库自动创建、推送/拉取（大文件走 git data API，缓存穿透）

/**
 * GitHub 云端存储。
 * 桌面端走 Electron 主进程代理（window.maoxie.gh，无 CORS 限制）；
 * 浏览器开发环境退回直接 fetch（GitHub API 本身允许 CORS）。
 * 书稿以 JSON 存放在用户自己的私有仓库里。
 */
import { bridge } from './bridge'

export const TOKEN_URL = 'https://github.com/settings/tokens/new?scopes=repo&description=maoxie-writer'
const FILE_PATH = 'maoxie-writer/state.json'
/** contents API 单文件上限约 1MB，超过则走 git data API */
const CONTENTS_LIMIT = 900_000
const SESSION_KEY = 'maoxie-writer:gh-session'
const SETTINGS_KEY = 'maoxie-writer:cloud-settings'
/** 上次成功同步时的内容指纹：重启后据此判断「有没有真的改过」，没改就不自动上传 */
const LAST_PUSHED_KEY = 'maoxie-writer:last-pushed-fp'

// ─────────────── (=ↀωↀ=) ───────────────

export class GhError extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message)
    this.name = 'GhError'
    this.status = status
  }
}

// ─────────────── (=ΦωΦ=) ───────────────

export interface GhSession {
  token: string
  login: string
  avatarUrl: string
}

// ─────────────── ฅ(ΦωΦ)ฅ ───────────────

export interface CloudSettings {
  /** 仓库名（不含用户名，保存时自动放到登录用户名下） */
  repo: string
  autoSync: boolean
  lastSyncAt: number | null
  lastSyncKind: 'push' | 'pull'
}

const DEFAULT_SETTINGS: CloudSettings = {
  repo: 'maoxie-cloud',
  autoSync: false,
  lastSyncAt: null,
  lastSyncKind: 'push',
}

/* ---------- 底层请求 ---------- */

/**
 * 绕过 HTTP 缓存：Electron net.fetch 的会话缓存不按 Vary: Accept 区分请求，
 * 会把 contents API 的 JSON 包元缓存给 raw 请求（导致拉取报「没有书稿数据」）；
 * 缓存还可能在新推送后 60 秒内返回旧存档。加时间戳参数强制回源，GitHub 会忽略未知参数。
 */
function noCache(path: string): string {
  return `${path}${path.includes('?') ? '&' : '?'}_=${Date.now()}`
}

interface GhResponse {
  status: number
  body: unknown
}

async function ghRequest(
  token: string,
  path: string,
  init?: { method?: string; body?: unknown; accept?: string; signal?: AbortSignal }
): Promise<GhResponse> {
  const b = bridge()
  const headers: Record<string, string> = { Authorization: `Bearer ${token}` }
  let body: string | undefined
  if (init?.body !== undefined) {
    headers['Content-Type'] = 'application/json'
    body = JSON.stringify(init.body)
  }
  if (b) {
    // 桌面端：signal 映射为主进程的中断（单飞请求，ghAbort 打断当前这一个）
    const onAbort = () => b.ghAbort()
    init?.signal?.addEventListener('abort', onAbort)
    try {
      return await b.gh(noCache(path), { method: init?.method ?? 'GET', headers, body })
    } finally {
      init?.signal?.removeEventListener('abort', onAbort)
    }
  }
  const res = await fetch(`https://api.github.com${noCache(path)}`, {
    method: init?.method ?? 'GET',
    headers: { Accept: init?.accept ?? 'application/vnd.github+json', ...headers },
    body,
    signal: init?.signal,
    cache: 'no-store',
  })
  const text = await res.text()
  let parsed: unknown = null
  try {
    parsed = JSON.parse(text)
  } catch {
    parsed = text
  }
  return { status: res.status, body: parsed }
}

/** GET 原始文件字节（raw accept，支持最大 100MB，用于拉取超过 1MB 的存档） */
async function ghRaw(token: string, path: string, accept: string): Promise<{ status: number; text: string }> {
  const b = bridge()
  const headers: Record<string, string> = { Authorization: `Bearer ${token}`, Accept: accept }
  if (b) {
    const r = await b.gh(noCache(path), { method: 'GET', headers })
    return { status: r.status, text: typeof r.body === 'string' ? r.body : JSON.stringify(r.body) }
  }
  const res = await fetch(`https://api.github.com${noCache(path)}`, { method: 'GET', headers, cache: 'no-store' })
  return { status: res.status, text: await res.text() }
}

function fail(status: number, fallback: string): GhError {
  if (status === 401) return new GhError(401, 'GitHub 登录已失效，请重新登录')
  if (status === 403) return new GhError(403, '没有权限（令牌需要 repo 权限），或请求太频繁，稍后再试')
  if (status === 404) return new GhError(404, fallback)
  if (status === 409) return new GhError(409, '云端版本有冲突（别的设备刚保存过），重试一次即可')
  if (status === 422) return new GhError(422, 'GitHub 拒绝了本次保存（422），请重试')
  return new GhError(status, `GitHub 返回错误（${status}）`)
}

/* ---------- 登录 / 会话 ---------- */

/** 验证令牌，返回会话信息（作为「登录」） */
export async function verifyToken(token: string): Promise<GhSession> {
  const res = await ghRequest(token, '/user')
  if (res.status !== 200) throw fail(res.status, '用户不存在')
  const u = res.body as { login: string; avatar_url: string }
  return { token, login: u.login, avatarUrl: u.avatar_url }
}

// ─────────────── (=`ω´=) ───────────────

export function loadSession(): GhSession | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY)
    if (!raw) return null
    const p = JSON.parse(raw)
    return p && p.token && p.login ? (p as GhSession) : null
  } catch {
    return null
  }
}

// ─────────────── ヾ(ΦωΦ) ───────────────

export function saveSession(s: GhSession): void {
  localStorage.setItem(SESSION_KEY, JSON.stringify(s))
}

// ─────────────── (=①ω①=) ───────────────

export function clearSession(): void {
  localStorage.removeItem(SESSION_KEY)
}

// ─────────────── (=`ェ´=) ───────────────

export function loadCloudSettings(): CloudSettings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY)
    if (!raw) return { ...DEFAULT_SETTINGS }
    return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) }
  } catch {
    return { ...DEFAULT_SETTINGS }
  }
}

// ─────────────── (=^･ω･^=) ───────────────

export function saveCloudSettings(s: CloudSettings): void {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(s))
}

// ─────────────── ┏(ΦωΦ)┛ ───────────────

export function loadLastPushedFp(): string | null {
  try {
    return localStorage.getItem(LAST_PUSHED_KEY)
  } catch {
    return null
  }
}

// ─────────────── (ΦωΦ)ﾉ ───────────────

export function saveLastPushedFp(fp: string): void {
  try {
    localStorage.setItem(LAST_PUSHED_KEY, fp)
  } catch {
    // 存储满等情况忽略：去重失效但同步功能不受影响
  }
}

// ─────────────── (=ↀωↀ=) ───────────────

export function openExternal(url: string): void {
  const b = bridge()
  if (b) {
    void b.openExternal(url)
  } else {
    window.open(url, '_blank', 'noopener,noreferrer')
  }
}

/* ---------- 存取 ---------- */

function fullRepo(session: GhSession, settings: CloudSettings): string {
  return `${session.login}/${settings.repo || DEFAULT_SETTINGS.repo}`
}

async function ensureRepo(session: GhSession, settings: CloudSettings, signal?: AbortSignal): Promise<void> {
  const repo = fullRepo(session, settings)
  const check = await ghRequest(session.token, `/repos/${repo}`, { signal })
  if (check.status === 200) return
  if (check.status !== 404) throw fail(check.status, '仓库检查失败')
  const create = await ghRequest(session.token, '/user/repos', {
    method: 'POST',
    signal,
    body: { name: settings.repo || DEFAULT_SETTINGS.repo, private: true, auto_init: true, description: '码字工坊云端书稿' },
  })
  if (create.status !== 201) throw fail(create.status, '创建仓库失败')
}

interface ContentMeta {
  content: string
  sha: string
}

async function getContent(session: GhSession, settings: CloudSettings, signal?: AbortSignal): Promise<ContentMeta | null> {
  const res = await ghRequest(session.token, `/repos/${fullRepo(session, settings)}/contents/${FILE_PATH}`, { signal })
  if (res.status === 404) return null
  if (res.status !== 200) throw fail(res.status, '读取云端存档失败')
  const b = res.body as { content: string; sha: string }
  return { content: b.content, sha: b.sha }
}

/** 用 git data API 推送大文件（blob → tree → commit → ref），无 1MB 限制 */
async function pushViaGitApi(session: GhSession, settings: CloudSettings, json: string, message: string, signal?: AbortSignal): Promise<void> {
  const repo = fullRepo(session, settings)
  const token = session.token
  // blob 按内容寻址，与分支无关，整个重试过程只需建一次
  const blob = await ghRequest(token, `/repos/${repo}/git/blobs`, {
    method: 'POST',
    signal,
    body: { content: json, encoding: 'utf-8' },
  })
  if (blob.status !== 201) throw fail(blob.status, '保存到云端失败')
  const blobSha = (blob.body as { sha: string }).sha
  // 多设备同时保存会撞车：冲突（409/422）时重新取最新版本号变基重试
  for (let attempt = 0; attempt < 3; attempt++) {
    let branch = 'main'
    let baseSha: string | null = null
    for (const name of ['main', 'master']) {
      const ref = await ghRequest(token, `/repos/${repo}/git/ref/heads/${name}`, { signal })
      if (ref.status === 200) {
        branch = name
        baseSha = (ref.body as { object: { sha: string } }).object.sha
        break
      }
    }
    const tree = await ghRequest(token, `/repos/${repo}/git/trees`, {
      method: 'POST',
      signal,
      body: { base_tree: baseSha ?? undefined, tree: [{ path: FILE_PATH, mode: '100644', type: 'blob', sha: blobSha }] },
    })
    if (tree.status !== 201) throw fail(tree.status, '保存到云端失败')
    const treeSha = (tree.body as { sha: string }).sha
    const commit = await ghRequest(token, `/repos/${repo}/git/commits`, {
      method: 'POST',
      signal,
      body: { message, tree: treeSha, parents: baseSha ? [baseSha] : [] },
    })
    if (commit.status !== 201) throw fail(commit.status, '保存到云端失败')
    const commitSha = (commit.body as { sha: string }).sha
    const update = await ghRequest(token, `/repos/${repo}/git/refs/heads/${branch}`, {
      method: 'PATCH',
      signal,
      body: { sha: commitSha, force: false },
    })
    if (update.status === 200) return
    if (update.status === 404) {
      // 分支引用不存在（空仓库）：新建
      const create = await ghRequest(token, `/repos/${repo}/git/refs`, {
        method: 'POST',
        signal,
        body: { ref: `refs/heads/${branch}`, sha: commitSha },
      })
      if (create.status === 201) return
      throw fail(create.status, '保存到云端失败')
    }
    if (update.status === 409 || update.status === 422) continue // 别人先推了一步：变基再来
    throw fail(update.status, '保存到云端失败')
  }
  throw new GhError(409, '云端同时有多个设备在保存，冲突未解决，请稍后重试')
}

/** 推送本地存档到云端（自动建仓库；覆盖式保存；超过 1MB 自动走 git data API） */
export async function pushState(session: GhSession, settings: CloudSettings, json: string, signal?: AbortSignal): Promise<void> {
  await ensureRepo(session, settings, signal)
  const message = `码字工坊保存 ${new Date().toLocaleString('zh-CN')}`
  const b64 = toBase64(json)
  if (b64.length >= CONTENTS_LIMIT) {
    return pushViaGitApi(session, settings, json, message, signal)
  }
  const existing = await getContent(session, settings, signal)
  const put = (sha?: string) =>
    ghRequest(session.token, `/repos/${fullRepo(session, settings)}/contents/${FILE_PATH}`, {
      method: 'PUT',
      signal,
      body: {
        message,
        content: b64,
        ...(sha ? { sha } : {}),
      },
    })
  let res = await put(existing?.sha)
  if (res.status === 409) {
    // 版本过期（别的设备刚推过）：取最新 sha 再试一次
    const fresh = await getContent(session, settings, signal)
    res = await put(fresh?.sha)
  }
  if (res.status !== 200 && res.status !== 201) throw fail(res.status, '保存到云端失败')
}

/** 从云端拉取存档 JSON 文本（大文件自动退回 raw 下载） */
export async function pullState(session: GhSession, settings: CloudSettings): Promise<string> {
  const res = await ghRequest(session.token, `/repos/${fullRepo(session, settings)}/contents/${FILE_PATH}`)
  if (res.status === 404) throw new GhError(404, '云端还没有存档，请先点「保存到云端」')
  if (res.status !== 200) throw fail(res.status, '读取云端存档失败')
  const b = res.body as { content?: string }
  if (typeof b.content === 'string' && b.content.length > 0) {
    return fromBase64(b.content)
  }
  // 文件超过 contents API 的 1MB 上限：改走 raw 下载
  const raw = await ghRaw(session.token, `/repos/${fullRepo(session, settings)}/contents/${FILE_PATH}`, 'application/vnd.github.raw+json')
  if (raw.status !== 200) throw fail(raw.status, '读取云端存档失败')
  return raw.text
}

/* ---------- base64（Unicode 安全） ---------- */

export function toBase64(s: string): string {
  const bytes = new TextEncoder().encode(s)
  let bin = ''
  for (const b of bytes) bin += String.fromCharCode(b)
  return btoa(bin)
}

// ─────────────── (=ΦωΦ=) ───────────────

export function fromBase64(b64: string): string {
  const bin = atob(b64.replace(/\n/g, ''))
  const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0))
  return new TextDecoder().decode(bytes)
}
