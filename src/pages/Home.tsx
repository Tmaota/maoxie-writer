// 这部分负责: 主页与状态中枢 —— 四种模式切换、全部状态读写、云端同步调度、快捷键分发

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Toaster, toast } from 'sonner'
import { FilePlus2, Library, ArrowRight, Layers, BookOpenText } from 'lucide-react'
import { Group, Panel, Separator } from 'react-resizable-panels'
import type { PanelImperativeHandle } from 'react-resizable-panels'
import type { Book, Chapter, ChapterStatus, EditRecord, ProjectState, RevisionState, ViewMode } from '@/types'
import { loadState, saveState, clearState, uid } from '@/lib/store'
import { buildMerged, effectiveChapters } from '@/lib/merge'
import { countChars, formatCount } from '@/lib/wordcount'
import { insertAtCursor } from '@/lib/snippets'
import { buildEditRecord, KIND_LABEL } from '@/lib/edits'
import {
  makeTextPayload,
  makeDocxPayload,
  makeMergedTxtPayload,
  readDocxText,
  readTxtText,
  trySplitChapters,
  type TextPayload,
} from '@/lib/io'
import { saveExport } from '@/lib/save'
import { bridge } from '@/lib/bridge'
import { addCharsToday } from '@/lib/stats'
import { pushVersion, syncVersionsFromState } from '@/lib/versions'
import { partHash, splitIntoParts } from '@/lib/revision'
import { applyThemeMode, resolvedTheme } from '@/lib/theme'
import { RevisionDock } from '@/components/RevisionDock'
import { GoalDialog } from '@/components/GoalDialog'
import {
  loadSettings,
  saveSettings,
  comboFromEvent,
  FONT_SIZE_MIN,
  FONT_SIZE_MAX,
  type AppSettings,
  type ExportCategory,
} from '@/lib/settings'
import { TopBar } from '@/components/TopBar'
import { Sidebar } from '@/components/Sidebar'
import { ConfirmDialog } from '@/components/ConfirmDialog'
import { ImportNameDialog, type ImportRow } from '@/components/ImportNameDialog'
import { ExportNameDialog } from '@/components/ExportNameDialog'
import { ChapterEditor } from '@/components/ChapterEditor'
import { MergedEditor } from '@/components/MergedEditor'
import { ReadingView } from '@/components/ReadingView'
import { RightPanel } from '@/components/RightPanel'
import {
  widgetNative, requestPinWidget, syncWidgetEntries, consumeWidgetLaunch,
  widgetKey, type PinnedRef, type WidgetEntry,
} from '@/lib/widgets'
import { EditsDock } from '@/components/EditsDock'
import { CloudMenu } from '@/components/CloudMenu'
import { SettingsDialog } from '@/components/SettingsDialog'
import { MePage } from '@/components/MePage'
import { MobileTopBar, MobileBottomNav } from '@/components/MobileChrome'
import { useIsMobile } from '@/hooks/useIsMobile'
import { Sheet, SheetContent } from '@/components/ui/sheet'
import { TooltipProvider } from '@/components/ui/tooltip'
import {
  loadSession,
  loadCloudSettings,
  saveCloudSettings,
  loadLastPushedFp,
  saveLastPushedFp,
  clearSession,
  verifyToken,
  pushState,
  pullState,
  GhError,
  type CloudSettings,
  type GhSession,
} from '@/lib/github'

const MAX_EDITS = 60

/** 自动同步：内容停改后多久上传 */
const AUTO_SYNC_DELAY = 60000

/** 在解析出的 JSON 里递归找「带书稿数组」的状态对象，兼容早期云端格式的外层包装 */
function findStateWithBooks(obj: unknown, depth = 0): ProjectState | null {
  if (!obj || typeof obj !== 'object' || depth > 3) return null
  const o = obj as { books?: unknown }
  if (Array.isArray(o.books) && o.books.length) return obj as ProjectState
  for (const v of Object.values(obj)) {
    const r = findStateWithBooks(v, depth + 1)
    if (r) return r
  }
  return null
}

function blankBook(name: string): Book {
  const first: Chapter = {
    id: uid(),
    title: '第1章',
    content: '',
    status: 'draft',
    createdAt: Date.now(),
    updatedAt: Date.now(),
  }
  return { id: uid(), name, chapters: [first], combos: [], outline: '', reference: '' }
}

function blankState(): ProjectState {
  const book = blankBook('未命名作品')
  return {
    books: [book],
    activeBookId: null,
    snippets: [],
    view: 'chapter',
    activeChapterId: book.chapters[0].id,
    activeComboId: null,
    recentEdits: [],
  }
}

/** 同步去重指纹：只关心书稿、词组、修改记录和设置；忽略视图模式、当前选中章节等纯界面状态 */
function syncFingerprint(s: ProjectState, st: AppSettings): string {
  return JSON.stringify({ books: s.books, snippets: s.snippets, recentEdits: s.recentEdits, settings: st })
}

export default function Home() {
  const [state, setState] = useState<ProjectState>(loadState)
  const [editsOpen, setEditsOpen] = useState(false)
  const [focusTarget, setFocusTarget] = useState<{ chapterId: string; pos: number; len: number } | null>(null)
  const chapterTaRef = useRef<HTMLTextAreaElement | null>(null)
  const mergedRef = useRef<{ insert: (text: string) => void } | null>(null)
  /** 阅读模式来源（章节 / Part）与光标记忆 */
  const [readingFrom, setReadingFrom] = useState<'chapter' | 'merged'>('chapter')
  const editorCaretRef = useRef({ chapter: 0, combo: 0 })
  const readPosRef = useRef({ chapter: 0, combo: 0 })
  const [mergedFocus, setMergedFocus] = useState<number | null>(null)
  const rightPanelRef = useRef<PanelImperativeHandle | null>(null)
  const [rightCollapsed, setRightCollapsed] = useState(false)
  const [importConfirm, setImportConfirm] = useState<{ target: 'outline' | 'reference'; file: File } | null>(null)
  // 批量导入章节：选中文件后先弹命名窗
  const [importRows, setImportRows] = useState<ImportRow[] | null>(null)
  // 导出命名：确认后把文件名交给 apply
  const [exportNameReq, setExportNameReq] = useState<{ defaultName: string; ext: string; apply: (name: string) => void } | null>(null)
  const [clearConfirmOpen, setClearConfirmOpen] = useState(false)

  /* ---------- 移动端抽屉 / 底栏 ---------- */

  const isMobile = useIsMobile()
  /** 左侧目录抽屉 */
  const [drawerOpen, setDrawerOpen] = useState(false)
  /** 右侧 大纲/参考/词组 底部弹层 */
  const [sheetOpen, setSheetOpen] = useState(false)
  const [sheetTab, setSheetTab] = useState<'outline' | 'reference' | 'snippets'>('outline')
  const openSheet = useCallback((tab: 'outline' | 'reference' | 'snippets') => {
    setSheetTab(tab)
    setSheetOpen(true)
  }, [])

  /* ---------- GitHub 云端存储 ---------- */

  const [settings, setSettings] = useState<AppSettings>(loadSettings)
  const [ghSession, setGhSession] = useState<GhSession | null>(() => loadSession())
  const [cloud, setCloud] = useState<CloudSettings>(() => loadCloudSettings())
  const [cloudSyncState, setCloudSyncState] = useState<'idle' | 'syncing' | 'error'>('idle')
  const [pullConfirmOpen, setPullConfirmOpen] = useState(false)
  /** 最近一次成功同步（推或拉）时的内容指纹，用于自动同步去重；持久化到本地，重启后不重复上传 */
  const lastPushedJson = useRef<string | null>(loadLastPushedFp())
  /** 推送单飞锁：防止手动推送、自动推送、失败重试并发撞车 */
  const pushInFlight = useRef(false)
  /** 进行中推送的 Promise：手动保存撞上上传中时等它完成再接力，避免「多设备保存」冲突 */
  const pushInFlightP = useRef<Promise<void> | null>(null)
  /** 进行中推送的中断手柄：手动保存触发时 abort 掉自动上传，让手动保存立即接管 */
  const pushAbortRef = useRef<AbortController | null>(null)
  /** 自动同步连续失败次数（成功清零，封顶 3 次，避免断网时无限重试） */
  const autoRetryCount = useRef(0)
  /** 最新 state/settings 的引用，供回调与延迟任务读取（声明要早于使用它们的 patchBook/patchChapter） */
  const stateRef = useRef(state)
  stateRef.current = state
  const settingsRef = useRef(settings)
  settingsRef.current = settings
  /**
   * 脏标记：只有真正改过同步内容（章节/书/词组/大纲参考/修改记录/设置）才会置真，
   * 自动上传只认这个标记——没修改就永远不上传，下次修改后才重新启动自动上传。
   * 初始值对比「上次成功同步的指纹」，把上个版本遗留下来的未推送改动也算进来。
   */
  const [syncDirty, setSyncDirty] = useState<boolean>(() => {
    try {
      return syncFingerprint(loadState(), loadSettings()) !== loadLastPushedFp()
    } catch {
      return false
    }
  })

  // 启动时静默校验已保存的令牌是否还有效
  useEffect(() => {
    if (!ghSession) return
    verifyToken(ghSession.token)
      .then(setGhSession)
      .catch(() => {
        clearSession()
        setGhSession(null)
        toast.error('GitHub 登录已失效，请重新登录云端')
      })
    // 只在启动时校验一次
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const handleCloudSettingsChange = useCallback((s: CloudSettings) => {
    setCloud(s)
    saveCloudSettings(s)
  }, [])

  const doCloudPush = useCallback(
    async (opts?: { auto?: boolean }) => {
      if (!ghSession) throw new GhError(401, '请先登录 GitHub')
      if (pushInFlight.current) return
      pushInFlight.current = true
      // v2 存档：文稿 + 设置（含字体、背景图、快捷键、阅读辅助）一起上传
      const json = JSON.stringify({ v: 2, state, settings })
      const pushedFp = syncFingerprint(state, settings)
      // 本次推送可被手动保存中断（AbortSignal 穿到浏览器 fetch / Electron 主进程）
      const ac = new AbortController()
      pushAbortRef.current = ac
      setCloudSyncState('syncing')
      const attempt = (async () => {
        try {
          await pushState(ghSession, cloud, json, ac.signal)
          lastPushedJson.current = pushedFp
          saveLastPushedFp(pushedFp)
          autoRetryCount.current = 0
          const next = { ...cloud, lastSyncAt: Date.now(), lastSyncKind: 'push' as const }
          setCloud(next)
          saveCloudSettings(next)
          setCloudSyncState('idle')
          // 推送期间没人再改：清掉「脏」标记；期间有改动则保持脏，由 finally 的补推再传
          if (syncFingerprint(stateRef.current, settingsRef.current) === pushedFp) setSyncDirty(false)
        } catch (e) {
          if (ac.signal.aborted) {
            // 被手动保存中断：不算错误，也不重试
            setCloudSyncState('idle')
          } else {
            setCloudSyncState('error')
            // 自动同步遇到网络抖动：最多静默重试 3 次（间隔递增，避开网络尖峰）
            if (opts?.auto && !(e instanceof GhError && e.status === 401) && autoRetryCount.current < 3) {
              autoRetryCount.current += 1
              window.setTimeout(() => {
                if (!pushInFlight.current) void doCloudPushRef.current({ auto: true }).catch(() => {})
              }, 20000 * autoRetryCount.current)
            }
          }
          throw e
        } finally {
          pushInFlight.current = false
          if (pushAbortRef.current === ac) pushAbortRef.current = null
          // 本次推送期间内容又有改动（自动模式）：按自动间隔补推一次
          if (
            !ac.signal.aborted &&
            opts?.auto &&
            lastPushedJson.current !== null &&
            syncFingerprint(stateRef.current, settingsRef.current) !== lastPushedJson.current
          ) {
            window.setTimeout(() => {
              if (syncFingerprint(stateRef.current, settingsRef.current) !== lastPushedJson.current) {
                void doCloudPushRef.current({ auto: true }).catch(() => {})
              }
            }, AUTO_SYNC_DELAY)
          }
        }
      })()
      pushInFlightP.current = attempt
      await attempt
    },
    [ghSession, cloud, state, settings]
  )

  // 始终指向最新的 doCloudPush，供延迟重试/补推调用，避免上传过期内容
  const doCloudPushRef = useRef(doCloudPush)
  doCloudPushRef.current = doCloudPush

  // 手动「保存到云端」：自动上传进行中时先中断它，手动保存立刻接管
  const handleCloudPush = useCallback(async () => {
    if (pushInFlight.current && pushInFlightP.current) {
      toast.info('正在中断自动上传，改为立即保存…')
      pushAbortRef.current?.abort()
      try {
        await pushInFlightP.current
      } catch {
        // 旧的已中断，忽略
      }
    }
    await doCloudPush()
    toast.success('已保存到 GitHub 云端')
  }, [doCloudPush])

  const doCloudPull = useCallback(async () => {
    if (!ghSession) return toast.error('请先登录 GitHub')
    setCloudSyncState('syncing')
    try {
      const text = await pullState(ghSession, cloud)
      let parsed: unknown
      try {
        parsed = JSON.parse(text)
      } catch {
        // 不是合法 JSON：把收到的内容开头给用户看，方便定位问题
        const head = text.replace(/\s+/g, ' ').slice(0, 80)
        console.error('[云端同步] 存档不是有效 JSON，开头：', head)
        throw new Error(`cloud-bad-json:${head}`)
      }
      const p = parsed as ProjectState & { v?: number; state?: ProjectState; settings?: Partial<AppSettings> }
      // v2 存档：{ v, state, settings }；旧版是纯 ProjectState，两种都兼容
      let remoteState =
        p && typeof p === 'object' && p.state && Array.isArray(p.state.books) ? p.state : findStateWithBooks(parsed)
      if (!remoteState) remoteState = p as ProjectState
      if (!remoteState || !Array.isArray(remoteState.books) || !remoteState.books.length) {
        const head = text.replace(/\s+/g, ' ').slice(0, 80)
        console.error('[云端同步] 存档里没有书稿数据，开头：', head)
        throw new Error(`cloud-no-books:${head}`)
      }
      const nextState = { ...blankState(), ...remoteState }
      // 修改记录走「并集合并」而不是覆盖：电脑/手机各自产生的记录都保留，按时间新→旧，封顶 MAX_EDITS
      const localEdits = stateRef.current.recentEdits
      const remoteEdits = Array.isArray(nextState.recentEdits) ? nextState.recentEdits : []
      const seen = new Set<string>()
      const mergedEdits = [...remoteEdits, ...localEdits]
        .filter((e) => e && typeof e.id === 'string' && !seen.has(e.id) && (seen.add(e.id), true))
        .sort((a, b) => b.time - a.time)
        .slice(0, MAX_EDITS)
      const finalState = { ...nextState, recentEdits: mergedEdits }
      setState(finalState)
      // 同步设置与背景（云端没有设置字段时保留本机设置）
      let mergedSettings = loadSettings()
      if (p.settings && typeof p.settings === 'object') {
        mergedSettings = { ...mergedSettings, ...p.settings }
        setSettings(mergedSettings)
        saveSettings(mergedSettings)
      }
      // 记录指纹，避免拉取后自动同步立刻又推一遍
      lastPushedJson.current = syncFingerprint(finalState, mergedSettings)
      saveLastPushedFp(lastPushedJson.current)
      const next = { ...cloud, lastSyncAt: Date.now(), lastSyncKind: 'pull' as const }
      setCloud(next)
      saveCloudSettings(next)
      setCloudSyncState('idle')
      // 拉取后本机内容已与云端对齐（书稿以云端为准 + 修改记录并集），不再视为待上传
      setSyncDirty(false)
      toast.success('已从 GitHub 云端同步（文稿 + 设置）')
    } catch (e) {
      setCloudSyncState('error')
      if (e instanceof GhError && e.status === 401) {
        clearSession()
        setGhSession(null)
      }
      if (e instanceof GhError) {
        toast.error(e.message)
      } else if (e instanceof Error && e.message.startsWith('cloud-bad-json:')) {
        toast.error('云端存档不是有效 JSON（可能已损坏），请在电脑端重新手动上传后再同步', {
          description: `收到内容开头：${e.message.slice('cloud-bad-json:'.length)}`,
        })
      } else if (e instanceof Error && e.message.startsWith('cloud-no-books:')) {
        toast.error('云端存档里没有书稿数据（可能是空存档或旧格式），请在电脑端重新手动上传后再同步', {
          description: `收到内容开头：${e.message.slice('cloud-no-books:'.length)}`,
        })
      } else {
        toast.error('同步失败，请检查网络后重试')
      }
    }
  }, [ghSession, cloud])

  // 自动同步：只有真的改过内容（syncDirty）才会排队上传；内容停改 1 分钟后推送。
  // 没修改就永远不触发——上传只由「修改动作」启动，而不是靠定时轮询。
  useEffect(() => {
    if (!ghSession || !cloud.autoSync || !syncDirty) return
    if (pushInFlight.current) return
    const t = window.setTimeout(() => {
      void doCloudPush({ auto: true }).catch(() => {
        // 失败状态已体现在底栏，不反复打扰
      })
    }, AUTO_SYNC_DELAY)
    return () => window.clearTimeout(t)
  }, [syncDirty, ghSession, cloud.autoSync, doCloudPush])

  // 自动保存
  useEffect(() => {
    const t = window.setTimeout(() => {
      saveState(state)
      // 时光机：内容有变化的章节存历史版本（首次运行会给所有非空章节存基线快照）
      syncVersionsFromState(state.books)
    }, 300)
    return () => window.clearTimeout(t)
  }, [state])

  const book = useMemo(
    () => state.books.find((b) => b.id === state.activeBookId) ?? null,
    [state.books, state.activeBookId]
  )
  const activeChapter = useMemo(
    () => book?.chapters.find((c) => c.id === state.activeChapterId) ?? null,
    [book, state.activeChapterId]
  )
  const activeCombo = useMemo(
    () => book?.combos.find((c) => c.id === state.activeComboId) ?? null,
    [book, state.activeComboId]
  )
  const comboChapters = useMemo(
    () => (book && activeCombo ? book.chapters.filter((c) => activeCombo.chapterIds.includes(c.id)) : []),
    [book, activeCombo]
  )
  const bookChars = useMemo(
    () => (book ? book.chapters.reduce((s, c) => s + countChars(c.content), 0) : 0),
    [book]
  )
  const totalChars = useMemo(
    () => state.books.reduce((s, b) => s + b.chapters.reduce((x, c) => x + countChars(c.content), 0), 0),
    [state.books]
  )

  const patch = useCallback((p: Partial<ProjectState>) => setState((s) => ({ ...s, ...p })), [])

  /* ---------- 桌面挂件（安卓 APP）：生成 / 同步预览 / 点击跳转 ---------- */

  /** 全部章节 / Part → 挂件目录（挂件上点「切换」在此范围内轮换；正文够全才可滑着看） */
  const widgetEntries = useMemo<WidgetEntry[]>(
    () =>
      state.books.flatMap((bk) => {
        const items: WidgetEntry[] = bk.chapters.map((c) => ({
          key: widgetKey(bk.id, 'chapter', c.id),
          bookId: bk.id,
          bookName: bk.name,
          targetType: 'chapter' as const,
          targetId: c.id,
          title: c.title,
          text: c.content.slice(0, 20000),
        }))
        for (const combo of bk.combos) {
          const chapters = bk.chapters.filter((c) => combo.chapterIds.includes(c.id))
          items.push({
            key: widgetKey(bk.id, 'combo', combo.id),
            bookId: bk.id,
            bookName: bk.name,
            targetType: 'combo' as const,
            targetId: combo.id,
            title: combo.name,
            text: buildMerged(effectiveChapters(chapters)).slice(0, 20000),
          })
        }
        return items
      }),
    [state.books]
  )

  /** 当前正在写的章节 / Part（桌面上新拖出的挂件默认显示它） */
  const widgetLastActive = useMemo(() => {
    const bk = state.books.find((b) => b.id === state.activeBookId)
    if (!bk) return null
    if (state.view === 'merged' && state.activeComboId) {
      const c = bk.combos.find((x) => x.id === state.activeComboId)
      if (c) return { bookId: bk.id, targetType: 'combo' as const, targetId: c.id }
    }
    if (state.activeChapterId && bk.chapters.some((c) => c.id === state.activeChapterId)) {
      return { bookId: bk.id, targetType: 'chapter' as const, targetId: state.activeChapterId }
    }
    return null
  }, [state.books, state.activeBookId, state.activeChapterId, state.activeComboId, state.view])

  // 书稿变动后防抖刷新桌面挂件（目录 + 当前写作位置）
  useEffect(() => {
    if (!widgetNative) return
    const t = window.setTimeout(() => void syncWidgetEntries(widgetEntries, widgetLastActive), 1500)
    return () => window.clearTimeout(t)
  }, [widgetEntries, widgetLastActive])

  // 挂件点击 → 启动目标：进入对应书的章节 / Part（页面可见时消费，读一次即清除）
  useEffect(() => {
    if (!widgetNative) return
    let alive = true
    const consume = async () => {
      const target = await consumeWidgetLaunch()
      if (!alive || !target) return
      setState((s) => {
        const bk = s.books.find((b) => b.id === target.bookId)
        if (!bk) return s
        if (target.targetType === 'combo' && bk.combos.some((c) => c.id === target.targetId)) {
          return { ...s, activeBookId: bk.id, activeComboId: target.targetId, view: 'merged' }
        }
        if (bk.chapters.some((c) => c.id === target.targetId)) {
          return { ...s, activeBookId: bk.id, activeChapterId: target.targetId, view: 'chapter' }
        }
        return { ...s, activeBookId: bk.id }
      })
    }
    void consume()
    const onVis = () => {
      if (document.visibilityState === 'visible') void consume()
    }
    document.addEventListener('visibilitychange', onVis)
    return () => {
      alive = false
      document.removeEventListener('visibilitychange', onVis)
    }
  }, [])

  const pinTarget = useCallback(
    (targetType: 'chapter' | 'combo', targetId: string, title: string, text: string, bookId: string, bookName: string) => {
      const ref: PinnedRef = { key: widgetKey(bookId, targetType, targetId), bookId, bookName, targetType, targetId, title }
      void requestPinWidget({ ...ref, text: text.slice(0, 20000) }).then((r) => {
        if (!r.ok) toast.error(r.reason ?? '放置失败')
        else toast.success('已放置到桌面（点挂件上的「切换」可换篇目）')
      })
    },
    []
  )

  const patchBook = useCallback((bookId: string, p: Partial<Book>) => {
    // 守卫：传进来的字段和现状完全一样就不碰 state（连 updatedAt 都不刷），
    // 防止「无修改也产生新对象」导致误触发自动上传
    const cur = stateRef.current.books.find((b) => b.id === bookId)
    if (!cur) return
    const changed = Object.entries(p).some(
      ([k, v]) => JSON.stringify((cur as unknown as Record<string, unknown>)[k]) !== JSON.stringify(v)
    )
    if (!changed) return
    setSyncDirty(true)
    setState((s) => ({
      ...s,
      books: s.books.map((b) => (b.id === bookId ? { ...b, ...p } : b)),
    }))
  }, [])

  /* ---------- 设置（导出路径 / 字体 / 背景 / 快捷键） ---------- */

  const patchSettings = useCallback((p: Partial<AppSettings>) => {
    setSyncDirty(true)
    setSettings((s) => ({ ...s, ...p }))
  }, [])
  const [settingsOpen, setSettingsOpen] = useState(false)
  /** 手机「我的」页 */
  const [meOpen, setMeOpen] = useState(false)

  useEffect(() => {
    const t = window.setTimeout(() => saveSettings(settings), 300)
    return () => window.clearTimeout(t)
  }, [settings])

  // 应用字体到全局
  useEffect(() => {
    document.body.style.fontFamily = settings.font || ''
    return () => {
      document.body.style.fontFamily = ''
    }
  }, [settings.font])

  // 应用主题模式（日间/夜间/跟随系统；system 模式实时跟随系统切换）
  useEffect(() => {
    applyThemeMode(settings.themeMode)
  }, [settings.themeMode])

  // 背景直接画在 body 上（不用额外图层，避免桌面端 GPU 合成问题导致整片不绘制）
  // 手机端用专属背景 backgroundMobile，与电脑/网页端互不影响
  useEffect(() => {
    const { image, opacity } = isMobile ? settings.backgroundMobile : settings.background
    const dark = document.documentElement.classList.contains('dark')
    if (image) {
      const op = Math.min(1, Math.max(0, opacity))
      // 等效原来的「图片 opacity + 45%暗化层」：合成单层渐变压暗（亮色主题用亮色蒙层）
      const a = 1 - 0.55 * op
      const rgb = dark ? '23,20,18' : '248,245,241'
      document.body.style.backgroundColor = ''
      document.body.style.backgroundImage = `linear-gradient(rgba(${rgb},${a.toFixed(3)}), rgba(${rgb},${a.toFixed(3)})), url(${image})`
      document.body.style.backgroundSize = 'cover'
      document.body.style.backgroundPosition = 'center'
      document.body.style.backgroundAttachment = 'fixed'
      document.body.style.backgroundRepeat = 'no-repeat'
    } else {
      document.body.style.backgroundImage = ''
      document.body.style.backgroundSize = ''
      document.body.style.backgroundPosition = ''
      document.body.style.backgroundAttachment = ''
      document.body.style.backgroundRepeat = ''
      document.body.style.backgroundColor = ''
    }
    return () => {
      document.body.style.backgroundImage = ''
      document.body.style.backgroundSize = ''
      document.body.style.backgroundPosition = ''
      document.body.style.backgroundAttachment = ''
      document.body.style.backgroundRepeat = ''
      document.body.style.backgroundColor = ''
    }
  }, [isMobile, settings.background, settings.backgroundMobile, settings.themeMode])

  const pickExportDir = useCallback(
    async (category: ExportCategory) => {
      const b = bridge()
      if (!b?.pickDirectory) {
        toast.error('浏览器预览环境不支持选择目录，请在桌面端软件里设置')
        return null
      }
      return b.pickDirectory(settings.exportDirs[category] || undefined)
    },
    [settings.exportDirs]
  )

  const runExport = useCallback(
    async (payload: TextPayload, category: ExportCategory, okMsg: string) => {
      try {
        const res = await saveExport(payload, category, settings)
        if (res === null) return // 用户取消保存对话框
        toast.success(res === 'downloaded' ? okMsg : `${okMsg} → ${res}`)
      } catch (e) {
        toast.error(e instanceof Error ? `导出失败：${e.message}` : '导出失败')
      }
    },
    [settings]
  )

  // 自定义快捷键（在输入框里打字时不触发）
  const toggleRightRef = useRef<() => void>(() => {})
  const handleCloudPushRef = useRef(handleCloudPush)
  const readingFromRef = useRef(readingFrom)
  readingFromRef.current = readingFrom
  const hotkeyRefs = useRef<{ toggleRight: () => void; toggleEdits: () => void; cloudPush: () => void }>({
    toggleRight: () => {},
    toggleEdits: () => {},
    cloudPush: () => {},
  })
  hotkeyRefs.current = {
    toggleRight: () => toggleRightRef.current(),
    toggleEdits: () => setEditsOpen((v) => !v),
    cloudPush: () => void handleCloudPushRef.current().catch(() => {}),
  }
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable)) return
      const combo = comboFromEvent(e)
      if (!combo) return
      const hk = settings.hotkeys
      if (hk.toggleView && combo === hk.toggleView) {
        e.preventDefault()
        const cur = stateRef.current
        const from = readingFromRef.current
        const next = cur.view === 'reading' ? from : cur.view === 'chapter' ? 'merged' : 'chapter'
        setState((s) => ({ ...s, view: next }))
        // 从阅读模式返回：把阅读位置还给对应编辑器
        if (cur.view === 'reading') {
          if (from === 'chapter' && cur.activeChapterId) {
            setFocusTarget({ chapterId: cur.activeChapterId, pos: readPosRef.current.chapter, len: 0 })
          } else if (from === 'merged') {
            setMergedFocus(readPosRef.current.combo)
          }
        }
      } else if (hk.toggleRight && combo === hk.toggleRight) {
        e.preventDefault()
        hotkeyRefs.current.toggleRight()
      } else if (hk.toggleEdits && combo === hk.toggleEdits) {
        e.preventDefault()
        hotkeyRefs.current.toggleEdits()
      } else if (hk.cloudPush && combo === hk.cloudPush) {
        e.preventDefault()
        hotkeyRefs.current.cloudPush()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [settings.hotkeys])


  /* ---------- 修改记录 ---------- */

  const patchChapter = useCallback(
    (id: string, p: Partial<Chapter>, mode: EditRecord['mode'] = 'chapter') => {
      // 守卫：标题/正文/状态/目标字数都没变就直接返回，不刷 updatedAt、不触发自动上传
      const curBk = stateRef.current.books.find((b) => b.id === stateRef.current.activeBookId)
      const cur = curBk?.chapters.find((c) => c.id === id)
      if (!curBk || !cur) return
      if (
        (p.title === undefined || p.title === cur.title) &&
        (p.content === undefined || p.content === cur.content) &&
        (p.status === undefined || p.status === cur.status) &&
        (p.targetChars === undefined || p.targetChars === cur.targetChars) &&
        (p.revision === undefined || p.revision === cur.revision)
      ) {
        return
      }
      // 写作热力：记新增字数（正增量）
      if (p.content !== undefined) {
        const added = countChars(p.content) - countChars(cur.content)
        if (added > 0) addCharsToday(added)
      }
      setSyncDirty(true)
      setState((s) => {
        const bk = s.books.find((b) => b.id === s.activeBookId)
        if (!bk) return s
        const ch = bk.chapters.find((c) => c.id === id)
        if (!ch) return s
        let record: EditRecord | null = null
        if (p.content !== undefined && p.content !== ch.content) {
          record = buildEditRecord(
            {
              bookId: bk.id, bookName: bk.name, chapterId: ch.id, chapterTitle: ch.title, mode,
              comboId: null, comboName: null,
            },
            ch.content,
            p.content
          )
        }
        return {
          ...s,
          books: s.books.map((b) =>
            b.id === bk.id
              ? { ...b, chapters: b.chapters.map((c) => (c.id === id ? { ...c, ...p, updatedAt: Date.now() } : c)) }
              : b
          ),
          recentEdits: record ? [record, ...s.recentEdits].slice(0, MAX_EDITS) : s.recentEdits,
        }
      })
    },
    []
  )

  /* ---------- 书架两层导航 ---------- */

  const enterBook = useCallback(
    (id: string) => {
      setState((s) => {
        const bk = s.books.find((b) => b.id === id)
        if (!bk) return s
        return {
          ...s,
          activeBookId: id,
          activeChapterId: bk.chapters[0]?.id ?? null,
          activeComboId: bk.combos[0]?.id ?? null,
          view: 'chapter',
        }
      })
    },
    []
  )

  const backToShelf = useCallback(() => {
    setState((s) => ({ ...s, activeBookId: null }))
  }, [])

  const addBook = useCallback((name: string) => {
    setSyncDirty(true)
    setState((s) => {
      const bk = blankBook(name)
      return {
        ...s,
        books: [...s.books, bk],
        activeBookId: bk.id,
        activeChapterId: bk.chapters[0].id,
        activeComboId: null,
        view: 'chapter',
      }
    })
    toast.success(`已创建《${name}》，大纲和参考都是空白的，可以直接开写`)
  }, [])

  const renameBook = useCallback((id: string, name: string) => patchBook(id, { name }), [patchBook])

  const deleteBook = useCallback((id: string) => {
    setSyncDirty(true)
    setState((s) => {
      const books = s.books.filter((b) => b.id !== id)
      if (!books.length) return s
      const wasActive = s.activeBookId === id
      const next = wasActive ? null : s.activeBookId
      return {
        ...s,
        books,
        activeBookId: next,
        activeChapterId: wasActive ? null : s.activeChapterId,
        activeComboId: wasActive ? null : s.activeComboId,
        view: wasActive ? 'chapter' : s.view,
      }
    })
  }, [])

  /* ---------- 章节 ---------- */

  const addChapter = useCallback(
    (title: string) => {
      if (!book) return
      const c: Chapter = {
        id: uid(),
        title,
        content: '',
        status: 'draft',
        createdAt: Date.now(),
        updatedAt: Date.now(),
      }
      patchBook(book.id, { chapters: [...book.chapters, c] })
      patch({ activeChapterId: c.id, view: 'chapter' })
    },
    [book, patchBook, patch]
  )

  const deleteChapter = useCallback(
    (id: string) => {
      if (!book) return
      const chapters = book.chapters.filter((c) => c.id !== id)
      patchBook(book.id, {
        chapters,
        combos: book.combos.map((cb) => ({ ...cb, chapterIds: cb.chapterIds.filter((x) => x !== id) })),
      })
      if (state.activeChapterId === id) {
        patch({ activeChapterId: chapters[0]?.id ?? null })
      }
    },
    [book, patchBook, patch, state.activeChapterId]
  )

  const moveChapter = useCallback(
    (id: string, dir: -1 | 1) => {
      if (!book) return
      const i = book.chapters.findIndex((c) => c.id === id)
      const j = i + dir
      if (i < 0 || j < 0 || j >= book.chapters.length) return
      const chapters = [...book.chapters]
      ;[chapters[i], chapters[j]] = [chapters[j], chapters[i]]
      patchBook(book.id, { chapters })
    },
    [book, patchBook]
  )

  /* ---------- 组合 ---------- */

  const addCombo = useCallback(
    (name: string) => {
      if (!book) return ''
      const cb = { id: uid(), name, chapterIds: [] as string[], createdAt: Date.now() }
      patchBook(book.id, { combos: [...book.combos, cb] })
      patch({ activeComboId: cb.id, view: 'merged' })
      return cb.id
    },
    [book, patchBook, patch]
  )

  const toggleComboChapter = useCallback(
    (comboId: string, chapterId: string) => {
      if (!book) return
      patchBook(book.id, {
        combos: book.combos.map((cb) =>
          cb.id === comboId
            ? {
                ...cb,
                chapterIds: cb.chapterIds.includes(chapterId)
                  ? cb.chapterIds.filter((x) => x !== chapterId)
                  : [...cb.chapterIds, chapterId],
              }
            : cb
        ),
      })
    },
    [book, patchBook]
  )

  const deleteCombo = useCallback(
    (id: string) => {
      if (!book) return
      const combos = book.combos.filter((c) => c.id !== id)
      patchBook(book.id, { combos })
      if (state.activeComboId === id) patch({ activeComboId: combos[0]?.id ?? null })
    },
    [book, patchBook, patch, state.activeComboId]
  )

  /** Part 文稿的编辑写回各章节（并记录修改，归属当前 Part 与对应章节） */
  const handleMergedSync = useCallback(
    (updated: Chapter[]) => {
      if (!book) return
      const map = new Map(updated.map((c) => [c.id, c]))
      // 只有真的有章节内容变化才置脏（flushSync 已挡过完全相同的文本，这里双保险）
      const reallyChanged = updated.some((u) => {
        const c = book.chapters.find((x) => x.id === u.id)
        return !c || c.content !== u.content || c.title !== u.title
      })
      if (reallyChanged) setSyncDirty(true)
      // 写作热力：记新增字数（正增量）
      let added = 0
      for (const u of updated) {
        const c = book.chapters.find((x) => x.id === u.id)
        if (c) added += Math.max(0, countChars(u.content) - countChars(c.content))
      }
      if (added > 0) addCharsToday(added)
      setState((s) => {
        const bk = s.books.find((b) => b.id === book.id)
        if (!bk) return s
        const combo = bk.combos.find((c) => c.id === s.activeComboId) ?? null
        const records: EditRecord[] = []
        const chapters = bk.chapters.map((c) => {
          const u = map.get(c.id)
          if (u && u.content !== c.content) {
            const r = buildEditRecord(
              {
                bookId: bk.id, bookName: bk.name, chapterId: c.id, chapterTitle: c.title, mode: 'merged',
                comboId: combo?.id ?? null, comboName: combo?.name ?? null,
              },
              c.content,
              u.content
            )
            if (r) records.push(r)
          }
          return u ?? c
        })
        return {
          ...s,
          books: s.books.map((b) => (b.id === bk.id ? { ...b, chapters } : b)),
          recentEdits: records.length ? [...records.reverse(), ...s.recentEdits].slice(0, MAX_EDITS) : s.recentEdits,
        }
      })
    },
    [book]
  )

  /* ---------- 修改记录：删除 / 归属过滤 ---------- */

  const removeRecord = useCallback(
    (id: string) => {
      setSyncDirty(true)
      setState((s) => ({ ...s, recentEdits: s.recentEdits.filter((e) => e.id !== id) }))
    },
    []
  )

  const clearRecords = useCallback(
    (ids: string[]) => {
      setSyncDirty(true)
      setState((s) => {
        const drop = new Set(ids)
        return { ...s, recentEdits: s.recentEdits.filter((e) => !drop.has(e.id)) }
      })
    },
    []
  )

  /** 当前视图归属的修改记录：章模式 → 当前章；Part 模式 → 当前 Part（含写回各章的那几条） */
  const contextEdits = useMemo(() => {
    if (!book) return []
    if (state.view === 'chapter') {
      if (!state.activeChapterId) return []
      return state.recentEdits.filter((e) => e.bookId === book.id && e.chapterId === state.activeChapterId)
    }
    if (!state.activeComboId) return []
    return state.recentEdits.filter((e) => e.bookId === book.id && e.comboId === state.activeComboId)
  }, [state.recentEdits, state.view, state.activeChapterId, state.activeComboId, book])

  /* ---------- 修改记录：跳转定位 ---------- */

  const jumpToEdit = useCallback(
    (ed: EditRecord) => {
      setState((s) => {
        const bk = s.books.find((b) => b.id === ed.bookId) ?? s.books[0]
        return {
          ...s,
          activeBookId: bk.id,
          activeChapterId: ed.chapterId,
          view: 'chapter',
        }
      })
      // 选中改后的文字（删除则选中改前的长度）
      const len = ed.kind === 'delete' ? ed.before.length : ed.after.length
      setFocusTarget({ chapterId: ed.chapterId, pos: ed.pos, len: Math.min(len, 200) })
    },
    []
  )
  const jumpRef = useRef(jumpToEdit)
  jumpRef.current = jumpToEdit

  /** 回退：把这一章恢复到这次修改之前的完整内容（快照存在记录里），并跳到修改处 */
  const revertEdit = useCallback((ed: EditRecord) => {
    if (ed.snap == null) return
    setSyncDirty(true)
    setState((s) => {
      const bk = s.books.find((b) => b.id === ed.bookId) ?? s.books[0]
      if (!bk) return s
      const ch = bk.chapters.find((c) => c.id === ed.chapterId)
      if (!ch || ch.content === ed.snap) return s
      return {
        ...s,
        activeBookId: bk.id,
        activeChapterId: ed.chapterId,
        view: 'chapter',
        books: s.books.map((b) =>
          b.id === bk.id
            ? {
                ...b,
                chapters: b.chapters.map((c) =>
                  c.id === ed.chapterId ? { ...c, content: ed.snap!, updatedAt: Date.now() } : c
                ),
              }
            : b
        ),
      }
    })
    setFocusTarget({ chapterId: ed.chapterId, pos: ed.pos, len: 0 })
    toast.success(`已回退《${ed.bookName}》${ed.chapterTitle}`)
  }, [])

  /** 时光机：把当前章恢复到历史版本的完整内容（当前内容先存进版本列表，可随时换回来） */
  const restoreChapterVersion = useCallback(
    (content: string) => {
      if (!activeChapter) return
      pushVersion(activeChapter.id, activeChapter.content)
      patchChapter(activeChapter.id, { content })
    },
    [activeChapter, patchChapter]
  )

  /* ---------- 修订模式（按字数均分成 N 个部分定修改目标） ---------- */

  const [revMode, setRevMode] = useState(false)
  const [revDockOpen, setRevDockOpen] = useState(false)
  const [revNDialogOpen, setRevNDialogOpen] = useState(false)
  /** 修订面板里当前点选的部分（用于正文高亮；只从面板点击才会设置，手动选中不影响） */
  const [revActivePart, setRevActivePart] = useState<number | null>(null)

  // 启动时提醒上次修改位置
  useEffect(() => {
    const last = state.recentEdits[0]
    if (!last) return
    const summary = last.after || last.before
    toast(`上次修改在《${last.bookName}》${last.chapterTitle}：${KIND_LABEL[last.kind]}「${summary}」`, {
      duration: 8000,
      action: { label: '去看看', onClick: () => jumpRef.current(last) },
    })
    // 只在启动时提醒一次
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  /* ---------- 词组插入 ---------- */

  const insertToChapter = useCallback(
    (text: string) => {
      if (!activeChapter) return
      const ta = chapterTaRef.current
      const base = ta?.value ?? activeChapter.content
      const { value, cursor } = insertAtCursor(
        base,
        ta?.selectionStart ?? base.length,
        ta?.selectionEnd ?? base.length,
        text
      )
      patchChapter(activeChapter.id, { content: value })
      requestAnimationFrame(() => {
        ta?.focus()
        ta?.setSelectionRange(cursor, cursor)
      })
    },
    [activeChapter, patchChapter]
  )

  const insertSnippet = useCallback(
    (text: string) => {
      if (state.view === 'merged') {
        mergedRef.current?.insert(text)
      } else {
        insertToChapter(text)
      }
    },
    [state.view, insertToChapter]
  )

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!e.altKey || e.ctrlKey || e.metaKey) return
      const n = Number(e.key)
      if (!n || n < 1 || n > 9) return
      const snippet = state.snippets.find((s) => s.hotkey === n)
      if (!snippet) return
      e.preventDefault()
      insertSnippet(snippet.text)
      toast(`已插入「${snippet.name}」`, { duration: 1200 })
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [state.snippets, insertSnippet])

  /* ---------- 导入导出 ---------- */

  // 选中一个或多个 txt/docx/md：单文件会尝试按「第X章」拆分，然后统一弹命名窗
  const handleImportDocs = useCallback(
    async (files: File[]) => {
      if (!book || !files.length) return
      try {
        const rows: ImportRow[] = []
        for (const file of files) {
          const text = file.name.endsWith('.docx') ? await readDocxText(file) : await readTxtText(file)
          const parts = files.length === 1 ? trySplitChapters(text) : null
          if (parts) {
            rows.push(...parts.map((p) => ({ fileName: file.name, defaultTitle: p.title, content: p.content })))
          } else {
            rows.push({
              fileName: file.name,
              defaultTitle: file.name.replace(/\.(txt|docx|md)$/i, ''),
              content: text,
            })
          }
        }
        setImportRows(rows)
      } catch {
        toast.error('导入失败：无法读取该文件')
      }
    },
    [book]
  )

  const confirmImportRows = useCallback(
    (titles: string[]) => {
      if (!book || !importRows) return
      const now = Date.now()
      const newChapters: Chapter[] = importRows.map((r, i) => ({
        id: uid(),
        title: titles[i] || r.defaultTitle,
        content: r.content,
        status: 'draft' as ChapterStatus,
        createdAt: now + i,
        updatedAt: now + i,
      }))
      patchBook(book.id, { chapters: [...book.chapters, ...newChapters] })
      patch({ activeChapterId: newChapters[0].id, view: 'chapter' })
      toast.success(`已导入 ${newChapters.length} 个章节到《${book.name}》`)
      setImportRows(null)
    },
    [book, importRows, patchBook, patch]
  )

  const handleImportSide = useCallback(
    async (target: 'outline' | 'reference', file: File) => {
      if (!book) return
      // 先弹确认框，确认后再覆盖导入
      setImportConfirm({ target, file })
    },
    [book]
  )

  const doImportSide = useCallback(async () => {
    if (!book || !importConfirm) return
    const label = importConfirm.target === 'outline' ? '大纲' : '参考资料'
    const text = await importConfirm.file.text()
    patchBook(book.id, { [importConfirm.target]: text })
    toast.success(`${label}已导入（${importConfirm.file.name}）`)
    setImportConfirm(null)
  }, [book, importConfirm, patchBook])

  const handleExportBackup = useCallback(() => {
    void runExport(
      makeTextPayload(`码字工坊-备份-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(state, null, 2), 'application/json;charset=utf-8'),
      'backup',
      '工程备份已导出（包含全部书、Part、词组）'
    )
  }, [state, runExport])

  const handleImportBackup = useCallback(async (file: File) => {
    try {
      const parsed = JSON.parse(await file.text()) as ProjectState & { state?: ProjectState }
      // 兼容云端仓库格式：{"v":2,"state":{...}}
      const inner = parsed.state ?? parsed
      if (!Array.isArray(inner.books) || !inner.books.length) throw new Error('bad')
      setState({ ...blankState(), ...inner })
      toast.success('工程备份已导入')
    } catch {
      toast.error('导入失败：不是有效的工程备份文件')
    }
  }, [])

  const handleClearAll = useCallback(() => {
    clearState()
    setState(blankState())
    toast.success('已清空，开始新的作品吧')
  }, [])

  /* ---------- 右栏收展 ---------- */

  const toggleRight = useCallback(() => {
    const panel = rightPanelRef.current
    if (!panel) return
    if (panel.isCollapsed()) {
      panel.expand()
      setRightCollapsed(false)
    } else {
      panel.collapse()
      setRightCollapsed(true)
    }
  }, [])
  toggleRightRef.current = toggleRight

  const toggleEdits = useCallback(() => setEditsOpen((v) => !v), [])

  /** 顶栏模式切换：进入阅读时记住来源，返回时把阅读位置还给编辑器 */
  const handleViewChange = (v: ViewMode) => {
    if (v === 'reading') {
      setReadingFrom(state.view === 'merged' ? 'merged' : 'chapter')
      patch({ view: 'reading' })
      return
    }
    if (state.view === 'reading') {
      if (readingFrom === 'chapter' && state.activeChapterId) {
        setFocusTarget({ chapterId: state.activeChapterId, pos: readPosRef.current.chapter, len: 0 })
      } else if (readingFrom === 'merged') {
        setMergedFocus(readPosRef.current.combo)
      }
      patch({ view: readingFrom })
      return
    }
    patch({ view: v })
  }

  const bumpFont = (d: number) =>
    patchSettings({ readingFontSize: Math.min(FONT_SIZE_MAX, Math.max(FONT_SIZE_MIN, settings.readingFontSize + d)) })

  const effCombo = effectiveChapters(comboChapters)

  /** 修订对象：章节模式=当前章；Part 模式=整个 Part 合并文稿 */
  const revInfo = useMemo(() => {
    if (state.view === 'chapter' && activeChapter) {
      return {
        kind: 'chapter' as const,
        id: activeChapter.id,
        title: activeChapter.title,
        text: activeChapter.content,
        n: activeChapter.revision?.n ?? 0,
        revision: activeChapter.revision,
      }
    }
    if (state.view === 'merged' && activeCombo) {
      return {
        kind: 'combo' as const,
        id: activeCombo.id,
        title: activeCombo.name,
        text: buildMerged(effCombo),
        n: activeCombo.revision?.n ?? 0,
        revision: activeCombo.revision,
      }
    }
    return null
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.view, state.activeChapterId, state.activeComboId, activeChapter, activeCombo, effCombo])
  const revInfoRef = useRef(revInfo)
  revInfoRef.current = revInfo

  // 换修订对象 / 开关修订模式时，清掉面板选中高亮
  useEffect(() => {
    setRevActivePart(null)
  }, [revInfo?.id, revMode])

  /** 记录“最后改到第几部分的第几个字” */
  const setRevLast = useCallback(
    (i: number, p: number) => {
      const info = revInfoRef.current
      if (!info || !info.n) return
      if (info.kind === 'chapter') {
        const curBk = stateRef.current.books.find((b) => b.id === stateRef.current.activeBookId)
        const cur = curBk?.chapters.find((c) => c.id === info.id)
        if (!cur) return
        const prev = cur.revision?.last
        if (prev && prev.i === i && prev.p === p) return
        patchChapter(info.id, {
          revision: { n: info.n, done: cur.revision?.done ?? [], last: { i, p } },
        })
      } else {
        const bk = stateRef.current.books.find((b) => b.id === stateRef.current.activeBookId)
        if (!bk) return
        patchBook(bk.id, {
          combos: bk.combos.map((c) =>
            c.id === info.id
              ? { ...c, revision: { n: info.n, done: c.revision?.done ?? [], last: { i, p } } }
              : c,
          ),
        })
      }
    },
    [patchChapter, patchBook],
  )

  /** 手动确认 / 重新打开某部分（顺手清掉已失效的确认） */
  const toggleRevDone = useCallback(
    (i: number) => {
      const info = revInfoRef.current
      if (!info || !info.n) return
      const parts = splitIntoParts(info.text, info.n)
      const pt = parts[i]
      if (!pt) return
      const h = partHash(info.text, pt)
      const apply = (rev: RevisionState | null | undefined): RevisionState => {
        const alive = (rev?.done ?? []).filter(
          (d) => parts[d.i] && partHash(info.text, parts[d.i]) === d.h,
        )
        const next = alive.some((d) => d.i === i) ? alive.filter((d) => d.i !== i) : [...alive, { i, h }]
        return { n: info.n, done: next, last: rev?.last ?? null }
      }
      if (info.kind === 'chapter') {
        const curBk = stateRef.current.books.find((b) => b.id === stateRef.current.activeBookId)
        const cur = curBk?.chapters.find((c) => c.id === info.id)
        if (!cur) return
        patchChapter(info.id, { revision: apply(cur.revision) })
      } else {
        const bk = stateRef.current.books.find((b) => b.id === stateRef.current.activeBookId)
        if (!bk) return
        patchBook(bk.id, {
          combos: bk.combos.map((c) => (c.id === info.id ? { ...c, revision: apply(c.revision) } : c)),
        })
      }
    },
    [patchChapter, patchBook],
  )

  /** 修订开关：没设过部分数时先弹设置窗 */
  const toggleRevMode = useCallback(() => {
    if (revMode) {
      setRevMode(false)
      return
    }
    const info = revInfoRef.current
    if (info && info.n > 0) setRevMode(true)
    else setRevNDialogOpen(true)
  }, [revMode])

  /** 设置/重设部分数：清空完成进度，重新均分 */
  const confirmRevN = useCallback(
    (total: number | null) => {
      const info = revInfoRef.current
      const n = Math.max(1, Math.min(50, Math.round(total ?? 4)))
      if (info) {
        const fresh: RevisionState = { n, done: [], last: null }
        if (info.kind === 'chapter') {
          patchChapter(info.id, { revision: fresh })
        } else {
          const bk = stateRef.current.books.find((b) => b.id === stateRef.current.activeBookId)
          if (bk) {
            patchBook(bk.id, {
              combos: bk.combos.map((c) => (c.id === info.id ? { ...c, revision: fresh } : c)),
            })
          }
        }
      }
      setRevMode(true)
      setRevNDialogOpen(false)
      setRevActivePart(null)
    },
    [patchChapter, patchBook],
  )

  const jumpToRevision = useCallback((pos: number, partIndex: number) => {
    setRevActivePart(partIndex)
    if (stateRef.current.view === 'merged') {
      setMergedFocus(pos)
    } else {
      const id = stateRef.current.activeChapterId
      if (id) setFocusTarget({ chapterId: id, pos, len: 0 })
    }
  }, [])

  /* ---------- 导出（顶栏「导入/导出」与手机「更多」菜单共用） ---------- */

  const exportChapterTxt = useCallback(() => {
    if (!activeChapter || !book) return toast.error('没有可导出的章节')
    const base = `${book.name}-${activeChapter.title}`
    setExportNameReq({
      defaultName: base,
      ext: 'txt',
      apply: (name) => void runExport(makeTextPayload(`${name}.txt`, activeChapter.content), 'chapter', '已导出章节 TXT'),
    })
  }, [activeChapter, book, runExport])
  const exportChapterDocx = useCallback(() => {
    if (!activeChapter || !book) return toast.error('没有可导出的章节')
    const base = `${book.name}-${activeChapter.title}`
    setExportNameReq({
      defaultName: base,
      ext: 'docx',
      apply: (name) =>
        void makeDocxPayload(name, activeChapter.content).then((p) => void runExport(p, 'chapter', '已导出章节 DOCX')),
    })
  }, [activeChapter, book, runExport])
  const exportComboTxt = useCallback(() => {
    if (!activeCombo) return toast.error('请先在 Part 模式选择一个 Part')
    if (!effCombo.length) return toast.error('该 Part 里还没有章节')
    if (!book) return
    const base = `${book.name}-${activeCombo.name}`
    setExportNameReq({
      defaultName: base,
      ext: 'txt',
      apply: (name) => void runExport(makeMergedTxtPayload(effCombo, name), 'combo', '已导出 Part TXT'),
    })
  }, [activeCombo, effCombo, book, runExport])
  const exportComboDocx = useCallback(() => {
    if (!activeCombo) return toast.error('请先在 Part 模式选择一个 Part')
    if (!effCombo.length) return toast.error('该 Part 里还没有章节')
    if (!book) return
    const base = `${book.name}-${activeCombo.name}`
    setExportNameReq({
      defaultName: base,
      ext: 'docx',
      apply: (name) =>
        void makeDocxPayload(name, buildMerged(effCombo)).then((p) => void runExport(p, 'combo', '已导出 Part DOCX')),
    })
  }, [activeCombo, effCombo, book, runExport])

  /* ---------- 正文主区（桌面三栏中间 / 手机单栏共用） ---------- */

  const mainContent = !book ? (
    /* 书架层：正文区空白 */
    <div className="flex h-full flex-col items-center justify-center gap-3 text-muted-foreground">
      <Library className="h-12 w-12 opacity-30" />
      <p className="text-sm">从目录选择一本书进入写作</p>
      <p className="flex items-center gap-1 text-xs opacity-70">
        {isMobile ? (<>或点底部「目录」新建一本书 <ArrowRight className="h-3 w-3" /></>) : (<>或点左侧「新建一本书」开始新作品 <ArrowRight className="h-3 w-3" /></>)}
      </p>
    </div>
  ) : state.view === 'chapter' ? (
    activeChapter ? (
      <ChapterEditor
        key={activeChapter.id}
        chapter={activeChapter}
        bookId={book?.id ?? null}
        snippets={state.snippets}
        fontSize={settings.readingFontSize}
        onFontSize={bumpFont}
        onCaret={(p) => {
          editorCaretRef.current.chapter = p
        }}
        onTitleChange={(t) => patchChapter(activeChapter.id, { title: t })}
        onContentChange={(c) => patchChapter(activeChapter.id, { content: c })}
        onStatusChange={(st) => patchChapter(activeChapter.id, { status: st })}
        editorRef={chapterTaRef}
        focusTarget={focusTarget?.chapterId === activeChapter.id ? focusTarget : null}
        onFocusHandled={() => setFocusTarget(null)}
        onRestoreVersion={restoreChapterVersion}
        onSetTarget={(n) => patchChapter(activeChapter.id, { targetChars: n })}
        revMode={revMode}
        onRevModeChange={toggleRevMode}
        revN={activeChapter.revision?.n ?? 0}
        revState={activeChapter.revision}
        onRevLast={setRevLast}
        revActive={revActivePart}
        mobile={isMobile}
        onExportTxt={exportChapterTxt}
        onExportDocx={exportChapterDocx}
        onOpenEdits={() => setEditsOpen(true)}
        onPinWidget={() => book && pinTarget('chapter', activeChapter.id, activeChapter.title, activeChapter.content, book.id, book.name)}
        onImportDocs={handleImportDocs}
      />
    ) : (
      <EmptyState onCreate={() => addChapter('第1章')} />
    )
  ) : state.view === 'reading' ? (
    readingFrom === 'chapter' && activeChapter ? (
      <ReadingView
        key={'r' + activeChapter.id}
        title={activeChapter.title}
        sourceLabel="章节模式"
        text={activeChapter.content}
        fontSize={settings.readingFontSize}
        onFontSize={bumpFont}
        focusMode={settings.readingFocusMode}
        onFocusModeChange={(v) => patchSettings({ readingFocusMode: v })}
        assist={settings.readingAssist}
        initialPos={editorCaretRef.current.chapter}
        onPosChange={(p) => {
          readPosRef.current.chapter = p
        }}
      />
    ) : readingFrom === 'merged' && activeCombo ? (
      <ReadingView
        key={'r' + activeCombo.id}
        title={activeCombo.name}
        sourceLabel="Part 模式"
        text={buildMerged(effCombo)}
        fontSize={settings.readingFontSize}
        onFontSize={bumpFont}
        focusMode={settings.readingFocusMode}
        onFocusModeChange={(v) => patchSettings({ readingFocusMode: v })}
        assist={settings.readingAssist}
        initialPos={editorCaretRef.current.combo}
        onPosChange={(p) => {
          readPosRef.current.combo = p
        }}
      />
    ) : (
      <div className="flex h-full flex-col items-center justify-center gap-3 text-muted-foreground">
        <BookOpenText className="h-12 w-12 opacity-30" />
        <p className="text-sm">在章节模式选中一章、或在 Part 模式选中一个 Part，再进入阅读模式</p>
      </div>
    )
  ) : activeCombo ? (
    <MergedEditor
      key={activeCombo.id}
      pChapters={comboChapters}
      bookId={book?.id ?? null}
      comboId={activeCombo.id}
      snippets={state.snippets}
      fontSize={settings.readingFontSize}
      onFontSize={bumpFont}
      onCaret={(p) => {
        editorCaretRef.current.combo = p
      }}
      focusPos={mergedFocus}
      onFocusHandled={() => setMergedFocus(null)}
      initialChapterId={state.activeChapterId}
      onSync={handleMergedSync}
      apiRef={mergedRef}
      revMode={revMode}
      onRevModeChange={toggleRevMode}
      revN={activeCombo?.revision?.n ?? 0}
      revState={activeCombo?.revision}
      onRevLast={setRevLast}
      revActive={revActivePart}
      mobile={isMobile}
      comboName={activeCombo.name}
      onExportTxt={exportComboTxt}
      onExportDocx={exportComboDocx}
      onOpenEdits={() => setEditsOpen(true)}
      onPinWidget={() => book && pinTarget('combo', activeCombo.id, activeCombo.name, buildMerged(effCombo), book.id, book.name)}
      onImportDocs={handleImportDocs}
    />
  ) : (
    <div className="flex h-full flex-col items-center justify-center gap-3 text-muted-foreground">
      <Layers className="h-12 w-12 opacity-30" />
      <p className="text-sm">在目录里展开一个 Part，开始组合写作</p>
    </div>
  )

  /* ---------- 左侧目录（桌面栏 / 手机抽屉共用） ---------- */

  const sidebarNav = (onNavigate?: () => void) => (
    <Sidebar
      books={state.books}
      activeBookId={state.activeBookId}
      view={state.view === 'reading' ? readingFrom : state.view}
      activeChapterId={state.activeChapterId}
      activeComboId={state.activeComboId}
      onEnterBook={(id) => {
        enterBook(id)
        onNavigate?.()
      }}
      onBackToShelf={backToShelf}
      onAddBook={addBook}
      onRenameBook={renameBook}
      onDeleteBook={deleteBook}
      onSelectChapter={(id) => {
        patch({ activeChapterId: id, view: 'chapter' })
        onNavigate?.()
      }}
      onAddChapter={addChapter}
      onDeleteChapter={deleteChapter}
      onMoveChapter={moveChapter}
      onSelectCombo={(id) => {
        patch({ activeComboId: id, view: 'merged' })
        onNavigate?.()
      }}
      onAddCombo={addCombo}
      onRenameCombo={(id, name) =>
        patchBook(book!.id, { combos: book!.combos.map((c) => (c.id === id ? { ...c, name } : c)) })
      }
      onDeleteCombo={deleteCombo}
      onToggleComboChapter={toggleComboChapter}
      onSetBookGoal={(id, total, date) => patchBook(id, { goalTotal: total, goalDate: date })}
    />
  )

  const cloudMenuEl = (
    <CloudMenu
      session={ghSession}
      settings={cloud}
      onSessionChange={setGhSession}
      onSettingsChange={handleCloudSettingsChange}
      onPush={handleCloudPush}
      onPull={() => setPullConfirmOpen(true)}
    />
  )

  /** 手机「我的」页：云端 / 外观 / 阅读辅助 / 数据管理 */
  const mePageEl = (
    <MePage
      stats={{ books: state.books.length, chars: totalChars }}
      cloud={{
        session: ghSession,
        settings: cloud,
        onSessionChange: setGhSession,
        onSettingsChange: handleCloudSettingsChange,
        onPush: handleCloudPush,
        onPull: () => setPullConfirmOpen(true),
      }}
      settings={settings}
      onChange={patchSettings}
      onExportBackup={handleExportBackup}
      onImportBackup={() => document.getElementById('backup-import-input')?.click()}
      onClearAll={() => setClearConfirmOpen(true)}
    />
  )

  /** 右侧 大纲/参考/词组（桌面右栏 / 手机底部弹层共用）；defaultTab 仅手机弹层传入 */
  const rightPanelEl = (defaultTab?: 'outline' | 'reference' | 'snippets', embedded = false) =>
    !book ? null : (
      <RightPanel
        key={defaultTab ?? 'desktop'}
        defaultTab={defaultTab}
        embedded={embedded}
        outline={book.outline}
        reference={book.reference}
        snippets={state.snippets}
        onOutlineChange={(v) => patchBook(book.id, { outline: v })}
        onReferenceChange={(v) => patchBook(book.id, { reference: v })}
        onSnippetsChange={(snippets) => {
          setSyncDirty(true)
          patch({ snippets })
        }}
        onInsertSnippet={insertSnippet}
        onImportOutline={(f) => handleImportSide('outline', f)}
        onExportOutline={() =>
          void runExport(makeTextPayload(`${book.name}-大纲.md`, book.outline || '（大纲为空）'), 'side', '大纲已导出为 MD')
        }
        onImportReference={(f) => handleImportSide('reference', f)}
        onExportReference={() =>
          void runExport(makeTextPayload(`${book.name}-参考资料.md`, book.reference || '（参考资料为空）'), 'side', '参考资料已导出为 MD')
        }
      />
    )

  return (
    <TooltipProvider delayDuration={300}>
      <div
        className={`relative flex h-[100dvh] flex-col overflow-hidden ${(isMobile ? settings.backgroundMobile.image : settings.background.image) ? '' : 'bg-background'}`}
      >
        {isMobile ? (
          <>
            <MobileTopBar
              bookName={book?.name ?? null}
              view={state.view}
              onViewChange={handleViewChange}
            />
            <div className="min-h-0 flex-1">{meOpen ? mePageEl : !book ? sidebarNav() : mainContent}</div>
            <MobileBottomNav
              meOpen={meOpen}
              atShelf={!book}
              sheetOpen={sheetOpen}
              onFirst={() => {
                if (meOpen) {
                  // 「我的」里：回到切换之前的写作界面
                  setMeOpen(false)
                } else if (book) {
                  // 写作模式：只打开侧边目录，不做别的
                  setDrawerOpen(true)
                } else {
                  // 书架：已在书架
                  toast('已经到达书架')
                }
              }}
              onOpenWrite={() => { setMeOpen(false); openSheet('outline') }}
              onOpenMe={() => setMeOpen((v) => !v)}
            />
            {/* 左抽屉：书架 / 章节 / Part 目录（顶部留出安全区，避免与状态栏重叠） */}
            <Sheet open={drawerOpen} onOpenChange={setDrawerOpen}>
              <SheetContent side="left" className="w-[300px] p-0 sm:max-w-[86vw]">
                <div style={{ paddingTop: 'var(--sat, env(safe-area-inset-top, 0px))' }} className="h-full">
                  {sidebarNav(() => setDrawerOpen(false))}
                </div>
              </SheetContent>
            </Sheet>
            {/* 底部弹层：大纲 / 参考 / 词组 */}
            <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
              <SheetContent side="bottom" className="h-[72%] rounded-t-2xl p-0">
                {rightPanelEl(sheetTab, true)}
              </SheetContent>
            </Sheet>
          </>
        ) : (
          <>
            <TopBar
              view={state.view}
              bookName={book?.name ?? null}
              rightCollapsed={rightCollapsed}
              editsOpen={editsOpen}
              cloudMenu={cloudMenuEl}
              onViewChange={handleViewChange}
              onToggleRight={toggleRight}
              onToggleEdits={toggleEdits}
              onImportDocs={handleImportDocs}
              onExportChapterTxt={exportChapterTxt}
              onExportChapterDocx={exportChapterDocx}
              onExportComboTxt={exportComboTxt}
              onExportComboDocx={exportComboDocx}
              onExportBackup={handleExportBackup}
              onImportBackup={() => document.getElementById('backup-import-input')?.click()}
              onClearAll={() => setClearConfirmOpen(true)}
              onOpenSettings={() => setSettingsOpen(true)}
            />

            <Group orientation="horizontal" className="min-h-0 flex-1">
          <Panel id="sidebar" defaultSize="264px" minSize="210px" maxSize="38%">
            {sidebarNav()}
          </Panel>
          <Separator className="w-1.5 cursor-col-resize bg-border/30 transition-colors hover:bg-amber-500/40 data-[resize-handle-state=drag]:bg-amber-500/60" />

          <Panel id="main" minSize="35%" className="bg-background/60">
            {mainContent}
          </Panel>
          <Separator className="w-1.5 cursor-col-resize bg-border/30 transition-colors hover:bg-amber-500/40 data-[resize-handle-state=drag]:bg-amber-500/60" />

          <Panel
            id="right"
            panelRef={rightPanelRef}
            collapsible
            collapsedSize={0}
            defaultSize="300px"
            minSize="200px"
            maxSize="45%"
            onResize={(size: { asPercentage: number }) => setRightCollapsed(size.asPercentage < 2)}
          >
            {!book ? (
              /* 书架层：右侧空白 */
              <div className="h-full bg-card/40" />
            ) : (
              rightPanelEl()
            )}
          </Panel>
        </Group>
          </>
        )}

        <footer className="hidden h-7 items-center gap-4 border-t border-border/60 bg-card/70 px-3 text-[11px] text-muted-foreground backdrop-blur-sm lg:flex">
          {book ? (
            <span>
              《{book.name}》<span className="font-medium text-foreground">{formatCount(bookChars)}</span> 字 ·{' '}
              {book.chapters.length} 章 · {book.combos.length} 个 Part · 共 {state.books.length} 本书
            </span>
          ) : (
            <span>
              书架共 <span className="font-medium text-foreground">{state.books.length}</span> 本书 ·{' '}
              <span className="font-medium text-foreground">{formatCount(totalChars)}</span> 字
            </span>
          )}
          <span className="flex-1" />
          {ghSession && (
            <span className={cloudSyncState === 'error' ? 'text-destructive' : ''}>
              云端：
              {cloudSyncState === 'syncing'
                ? '同步中…'
                : cloudSyncState === 'error'
                  ? '同步失败'
                  : cloud.lastSyncAt
                    ? `已同步 ${new Date(cloud.lastSyncAt).toTimeString().slice(0, 5)}`
                    : '未同步'}
              {cloud.autoSync ? '（自动）' : ''}
            </span>
          )}
          <span>自动保存到本机</span>
          <span className="hidden md:inline">Alt+1~9 打词组 · 触发词+空格自动展开</span>
        </footer>

        {/* 底边修改记录浮泡（手机端隐藏浮泡，入口在顶栏 ⋯ 菜单） */}
        <EditsDock
          edits={contextEdits}
          allEdits={state.recentEdits}
          totalCount={state.recentEdits.length}
          open={editsOpen}
          bubble={!isMobile}
          onToggle={toggleEdits}
          onJump={(ed) => {
            jumpToEdit(ed)
            if (isMobile) setEditsOpen(false) // 全屏页跳转后回到正文
          }}
          onDelete={removeRecord}
          onClear={clearRecords}
          onRevert={revertEdit}
          mobile={isMobile}
          ctxLabel={state.view === 'merged' && activeCombo ? `${activeCombo.name}（Part）` : (activeChapter?.title ?? '')}
          ctxPreview={(state.view === 'merged' && activeCombo ? buildMerged(effCombo) : (activeChapter?.content ?? '')).replace(/\s+/g, ' ').trim().slice(0, 60)}
        />

        {/* 修订目标浮泡（修订模式） */}
        {revMode && revInfo && (state.view === 'chapter' || state.view === 'merged') && (
          <RevisionDock
            title={revInfo.kind === 'chapter' ? `「${revInfo.title}」` : revInfo.title}
            text={revInfo.text}
            revision={revInfo.revision}
            open={revDockOpen}
            onToggle={() => setRevDockOpen((o) => !o)}
            onJump={jumpToRevision}
            onToggleDone={toggleRevDone}
            onResplit={() => setRevNDialogOpen(true)}
          />
        )}

        {/* 修订：设置部分数 */}
        <GoalDialog
          open={revNDialogOpen}
          onOpenChange={setRevNDialogOpen}
          title={revInfo ? `把${revInfo.kind === 'chapter' ? `「${revInfo.title}」` : revInfo.title}分成几部分？` : '分成几部分？'}
          description="按字数均分；分割点落在段落中间时，整个段落归分到字数更多的那一边。"
          inputLabel="部分数（留空并确定 = 关闭修订模式）"
          inputPlaceholder="例如 4"
          initialTotal={revInfo?.n || 4}
          onConfirm={(total) => confirmRevN(total)}
        />

        <input
          id="backup-import-input"
          type="file"
          accept=".json"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0]
            if (f) handleImportBackup(f)
            e.target.value = ''
          }}
        />

        {/* 二次确认弹窗 */}
        <ImportNameDialog
          open={importRows !== null}
          rows={importRows ?? []}
          bookName={book?.name ?? ''}
          onOpenChange={(o) => !o && setImportRows(null)}
          onConfirm={confirmImportRows}
        />
        <ExportNameDialog
          open={exportNameReq !== null}
          defaultName={exportNameReq?.defaultName ?? ''}
          ext={exportNameReq?.ext ?? 'txt'}
          onOpenChange={(o) => !o && setExportNameReq(null)}
          onConfirm={(name) => exportNameReq?.apply(name)}
        />
        <ConfirmDialog
          open={importConfirm !== null}
          onOpenChange={(o) => !o && setImportConfirm(null)}
          title={`覆盖导入${importConfirm?.target === 'outline' ? '大纲' : '参考资料'}？`}
          description={`导入将覆盖《${book?.name}》当前的${importConfirm?.target === 'outline' ? '大纲' : '参考资料'}，确定继续吗？`}
          confirmText="覆盖导入"
          onConfirm={() => void doImportSide()}
        />
        <ConfirmDialog
          open={clearConfirmOpen}
          onOpenChange={setClearConfirmOpen}
          title="清空全部数据？"
          description="所有书、章节、Part、词组都会被删除，且不可恢复。建议先导出工程备份。"
          confirmText="全部清空"
          onConfirm={handleClearAll}
        />
        <ConfirmDialog
          open={pullConfirmOpen}
          onOpenChange={setPullConfirmOpen}
          title="从云端同步？"
          description="将用 GitHub 仓库里的存档覆盖本机全部书、章节、Part、词组，以及设置（字体、背景、快捷键、阅读辅助），本机未保存到云端的改动会丢失。"
          confirmText="用云端覆盖本机"
          onConfirm={() => void doCloudPull()}
        />
        <SettingsDialog
          open={settingsOpen}
          onOpenChange={setSettingsOpen}
          settings={settings}
          onChange={patchSettings}
          onPickDir={pickExportDir}
        />
      </div>
      <Toaster theme={resolvedTheme(settings.themeMode)} position={isMobile ? 'top-center' : 'bottom-right'} />
    </TooltipProvider>
  )
}

function EmptyState({ onCreate }: { onCreate: () => void }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 text-muted-foreground">
      <FilePlus2 className="h-10 w-10 opacity-40" />
      <p className="text-sm">这本书还没有章节</p>
      <button onClick={onCreate} className="text-xs text-amber-500 hover:underline">
        新建第一章
      </button>
    </div>
  )
}
