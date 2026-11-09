// 这部分负责: 时光机快照 —— 自动存历史版本、容量控制、恢复

/**
 * 时光机：每章的本地历史版本（自动保存时快照，只存本机，不走云端同步）。
 * 恢复/对比都从这儿取。容量控制：每章最多 30 个版本，全局最多 600 个。
 */
import type { Book } from '@/types'
import { uid } from './store'

export interface ChapterVersion {
  id: string
  time: number
  /** 该版本时刻的章节完整内容 */
  content: string
}

const KEY = 'maoxie-writer:versions'
const MAX_PER_CHAPTER = 30
const MAX_TOTAL = 600
/** 超过该长度的章节不存快照（防超大章撑爆本地存储） */
const MAX_SNAP_LEN = 200_000

function loadAll(): Record<string, ChapterVersion[]> {
  try {
    const raw = localStorage.getItem(KEY)
    const p = raw ? JSON.parse(raw) : {}
    return typeof p === 'object' && p ? (p as Record<string, ChapterVersion[]>) : {}
  } catch {
    return {}
  }
}

function saveAll(all: Record<string, ChapterVersion[]>): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(all))
  } catch {
    // 满了就丢最老的再试一次
    const keys = Object.keys(all)
    if (!keys.length) return
    let oldestKey = keys[0]
    for (const k of keys) {
      const a = all[k][0]?.time ?? Infinity
      const b = all[oldestKey][0]?.time ?? Infinity
      if (a < b) oldestKey = k
    }
    delete all[oldestKey]
    try {
      localStorage.setItem(KEY, JSON.stringify(all))
    } catch {
      // 仍然失败就放弃本次写入
    }
  }
}

/** 推入一个版本；与最新版本内容相同则跳过。返回是否写入。 */
export function pushVersion(chapterId: string, content: string): boolean {
  if (!chapterId || content.length > MAX_SNAP_LEN) return false
  const all = loadAll()
  const list = all[chapterId] ?? []
  if (list[0] && list[0].content === content) return false
  list.unshift({ id: uid(), time: Date.now(), content })
  all[chapterId] = list.slice(0, MAX_PER_CHAPTER)
  // 全局容量：超了丢最老的版本
  let total = Object.values(all).reduce((s, l) => s + l.length, 0)
  while (total > MAX_TOTAL) {
    let oldestKey = ''
    let oldestTime = Infinity
    for (const [k, l] of Object.entries(all)) {
      const t = l[l.length - 1]?.time ?? Infinity
      if (t < oldestTime && l.length) {
        oldestTime = t
        oldestKey = k
      }
    }
    if (!oldestKey) break
    all[oldestKey].pop()
    if (!all[oldestKey].length) delete all[oldestKey]
    total--
  }
  saveAll(all)
  return true
}

// ─────────────── ฅ(ΦωΦ)ฅ ───────────────

export function getVersions(chapterId: string): ChapterVersion[] {
  return loadAll()[chapterId] ?? []
}

// ─────────────── (=`ω´=) ───────────────

export function getVersion(chapterId: string, versionId: string): ChapterVersion | null {
  return getVersions(chapterId).find((v) => v.id === versionId) ?? null
}

/** 清掉已不存在章节（书被删等）的版本条目 */
export function pruneVersions(validChapterIds: Set<string>): void {
  const all = loadAll()
  let changed = false
  for (const k of Object.keys(all)) {
    if (!validChapterIds.has(k)) {
      delete all[k]
      changed = true
    }
  }
  if (changed) saveAll(all)
}

/**
 * 自动保存时调用：与当前书稿对齐。
 * 内容相对上一快照有变化的章节存一份新版本（首次运行会给所有非空章节存基线快照），
 * 已删除章节的版本条目一并清掉。
 */
export function syncVersionsFromState(books: Book[]): void {
  const all = loadAll()
  const valid = new Set<string>()
  let changed = false
  for (const b of books) {
    for (const c of b.chapters) {
      valid.add(c.id)
      const list = all[c.id]
      const latest = list?.[0]
      if (c.content.trim() !== '' && c.content.length <= MAX_SNAP_LEN && latest?.content !== c.content) {
        all[c.id] = [{ id: uid(), time: Date.now(), content: c.content }, ...(list ?? [])].slice(0, MAX_PER_CHAPTER)
        changed = true
      }
    }
  }
  for (const k of Object.keys(all)) {
    if (!valid.has(k)) {
      delete all[k]
      changed = true
    }
  }
  if (!changed) return
  // 全局容量：超了丢最老的版本
  let total = Object.values(all).reduce((s, l) => s + l.length, 0)
  while (total > MAX_TOTAL) {
    let oldestKey = ''
    let oldestTime = Infinity
    for (const [k, l] of Object.entries(all)) {
      const t = l[l.length - 1]?.time ?? Infinity
      if (t < oldestTime && l.length) {
        oldestTime = t
        oldestKey = k
      }
    }
    if (!oldestKey) break
    all[oldestKey].pop()
    if (!all[oldestKey].length) delete all[oldestKey]
    total--
  }
  saveAll(all)
}
