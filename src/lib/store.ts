// 这部分负责: 本地存储 —— 全部书稿状态的读写、自动保存节流

import type { Book, Chapter, ProjectState, Snippet } from '@/types'

export const STORAGE_KEY = 'maoxie-writer:v2'
const OLD_KEY = 'maoxie-writer:v1'

// ─────────────── ฅ(ΦωΦ)ฅ ───────────────

export function uid(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8)
}

// ─────────────── (=`ω´=) ───────────────

export function seedChapters(): Chapter[] {
  const now = Date.now()
  return [
    {
      id: uid(),
      title: '第1章 雨夜来客',
      content:
        '雨下了一整夜，檐角的水连成线，砸在青石板上溅起细碎的白。\n\n林晚把最后一扇窗关好，回头时，铺子里那盏油灯忽然晃了晃。\n\n「这么晚了，还有人？」她抄起门边的伞，推门出去。雨幕里站着一个人，浑身湿透，手里却紧紧护着一只木匣。\n\n「姑娘，」那人抬起头，声音哑得不成样子，「这东西……求你替我保管三天。」',
      status: 'published',
      createdAt: now - 86400000 * 3,
      updatedAt: now - 86400000,
    },
    {
      id: uid(),
      title: '第2章 木匣',
      content:
        '木匣没有锁，却在她指尖碰到搭扣的那一刻，发出极轻的一声「咔」。\n\n匣子里没有金银，只有一卷用牛皮纸包着的旧稿。纸页边缘已经发脆，墨迹深浅不一，像是很多人、在很多年里陆续写下的。\n\n第一页只有一行字：\n\n「写下它的人，都得死。」',
      status: 'draft',
      createdAt: now - 86400000 * 2,
      updatedAt: now - 86400000,
    },
    {
      id: uid(),
      title: '第3章 第三个人',
      content:
        '（本章还没有动笔，先占个位置——你可以直接在这里开写，也可以把状态标成「待修改」提醒自己。）',
      status: 'revise',
      createdAt: now - 86400000,
      updatedAt: now,
    },
  ]
}

// ─────────────── ヾ(ΦωΦ) ───────────────

export function seedSnippets(): Snippet[] {
  return [
    { id: uid(), name: '章节符号（示例）', trigger: ';p', text: '◇ ◇ ◇', hotkey: 1 },
    { id: uid(), name: '分页符号（示例）', trigger: ';f', text: '\n———【分页】———\n', hotkey: 2 },
    { id: uid(), name: '时间分隔（示例）', trigger: ';t', text: '※ 三天后 ※', hotkey: 3 },
  ]
}

function seedBook(): Book {
  const chapters = seedChapters()
  return {
    id: uid(),
    name: '示例作品',
    chapters,
    combos: [
      { id: uid(), name: 'Part1', chapterIds: chapters.map((c) => c.id), createdAt: Date.now() },
    ],
    outline:
      '# 故事大纲（示例）\n\n## 主线\n- 林晚受托保管神秘木匣，卷入三十年前的一桩旧案\n\n## 卷一·雨夜（第1-10章）\n- [x] 第1章 雨夜来客（已发布）\n- [ ] 第2章 木匣\n- [ ] 第3章 第三个人',
    reference: '【参考资料】\n\n人物设定、地名考据、资料摘抄都可以放在这里，写作时随时翻看。\n\n示例：\n- 林晚：23岁，城西「听雨铺」掌柜，惯用左手\n- 旧案关键物：木匣、半枚铜钱、一封未寄出的信',
  }
}

// ─────────────── (=①ω①=) ───────────────

export function seedState(): ProjectState {
  const book = seedBook()
  return {
    books: [book],
    activeBookId: null, // 首次进入停在书架层
    snippets: seedSnippets(),
    view: 'chapter',
    activeChapterId: book.chapters[0]?.id ?? null,
    activeComboId: book.combos[0]?.id ?? null,
    recentEdits: [],
  }
}

interface OldStateV1 {
  projectName?: string
  chapters?: Chapter[]
  pChapterIds?: string[]
  outline?: string
  reference?: string
  snippets?: Snippet[]
  activeChapterId?: string | null
  view?: 'chapter' | 'merged'
}

/** 把 v1 旧数据（单书 + pChapterIds）迁移成多书结构 */
function migrateV1(old: OldStateV1): ProjectState {
  const chapters = Array.isArray(old.chapters) ? old.chapters : []
  const book: Book = {
    id: uid(),
    name: old.projectName || '未命名作品',
    chapters,
    combos:
      Array.isArray(old.pChapterIds) && old.pChapterIds.length
        ? [{ id: uid(), name: 'Part1', chapterIds: old.pChapterIds, createdAt: Date.now() }]
        : [],
    outline: old.outline || '',
    reference: old.reference || '',
  }
  const base = seedState()
  return {
    ...base,
    books: [book],
    activeBookId: null,
    snippets: Array.isArray(old.snippets) ? old.snippets : base.snippets,
    view: old.view === 'merged' ? 'merged' : 'chapter',
    activeChapterId: old.activeChapterId ?? chapters[0]?.id ?? null,
    activeComboId: book.combos[0]?.id ?? null,
    recentEdits: [],
  }
}

// ─────────────── (=`ェ´=) ───────────────

export function loadState(): ProjectState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) {
      const parsed = JSON.parse(raw) as ProjectState
      if (Array.isArray(parsed.books) && parsed.books.length) {
        return { ...seedState(), ...parsed, recentEdits: parsed.recentEdits ?? [] }
      }
    }
    const oldRaw = localStorage.getItem(OLD_KEY)
    if (oldRaw) {
      const migrated = migrateV1(JSON.parse(oldRaw))
      saveState(migrated)
      return migrated
    }
    return seedState()
  } catch {
    return seedState()
  }
}

// ─────────────── (=^･ω･^=) ───────────────

export function saveState(state: ProjectState) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
  } catch {
    // 存储满了也不打断写作
  }
}

// ─────────────── ┏(ΦωΦ)┛ ───────────────

export function clearState() {
  localStorage.removeItem(STORAGE_KEY)
}
