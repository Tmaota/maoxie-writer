import { syncMergedEdit, buildMerged, effectiveChapters, chapterIndexAtCursor } from '../src/lib/merge.ts'
import type { Chapter } from '../src/types'

let pass = 0
let fail = 0

function ch(id: string, title: string, content: string): Chapter {
  return { id, title, content, status: 'draft', createdAt: 0, updatedAt: 0 }
}

function check(name: string, cond: boolean, extra?: unknown) {
  if (cond) {
    pass++
  } else {
    fail++
    console.log(`FAIL: ${name}`, extra ?? '')
  }
}

// 1. 在中间一章改一行
{
  const chapters = [ch('a', 'A', 'a1\na2\na3'), ch('b', 'B', 'b1\nb2'), ch('c', 'C', 'c1')]
  const oldM = buildMerged(chapters)
  const newM = oldM.replace('b2', 'b2改')
  const out = syncMergedEdit(chapters, oldM, newM)
  check('改B一章一行', out[1].content === 'b1\nb2改' && out[0].content === 'a1\na2\na3' && out[2].content === 'c1', out.map((c) => c.content))
  check('不回写时原数组不变', chapters[1].content === 'b1\nb2')
}

// 2. 在A末尾回车新增一行（不应跑进B）
{
  const chapters = [ch('a', 'A', 'a1\na2'), ch('b', 'B', 'b1')]
  const oldM = buildMerged(chapters)
  const newM = oldM.replace('a2\n\nb1', 'a2\n新行\n\nb1')
  const out = syncMergedEdit(chapters, oldM, newM)
  check('A末尾回车进A', out[0].content === 'a1\na2\n新行' && out[1].content === 'b1', out.map((c) => c.content))
}

// 3. 删除跨章内容（删掉 a3、分隔和 b1）
{
  const chapters = [ch('a', 'A', 'a1\na2\na3'), ch('b', 'B', 'b1\nb2')]
  const oldM = buildMerged(chapters)
  const newM = 'a1\na2\nb2'
  const out = syncMergedEdit(chapters, oldM, newM)
  const eff = effectiveChapters(out)
  // P 模型中章节之间恒以空行分隔，跨章删除后保留分隔
  check('跨章删除', buildMerged(eff) === 'a1\na2\n\nb2', out.map((c) => c.content))
}

// 4. 在P开头插入新行 → 归第一章开头
{
  const chapters = [ch('a', 'A', 'a1'), ch('b', 'B', 'b1')]
  const oldM = buildMerged(chapters)
  const newM = '新开头\na1\n\nb1'
  const out = syncMergedEdit(chapters, oldM, newM)
  check('开头插入进首章', out[0].content === '新开头\na1' && out[1].content === 'b1', out.map((c) => c.content))
}

// 5. 在P末尾追加 → 归最后一章
{
  const chapters = [ch('a', 'A', 'a1'), ch('b', 'B', 'b1')]
  const oldM = buildMerged(chapters)
  const newM = oldM + '\n追加一行'
  const out = syncMergedEdit(chapters, oldM, newM)
  check('末尾追加进末章', out[1].content === 'b1\n追加一行' && out[0].content === 'a1', out.map((c) => c.content))
}

// 6. 空章节不占P
{
  const chapters = [ch('a', 'A', 'a1'), ch('e', 'E', ''), ch('b', 'B', 'b1')]
  check('空章忽略', buildMerged(effectiveChapters(chapters)) === 'a1\n\nb1')
}

// 7. 大量行性能（2000行中间插入）
{
  const big = Array.from({ length: 2000 }, (_, i) => `行${i}`).join('\n')
  const chapters = [ch('a', 'A', big), ch('b', 'B', '结尾')]
  const oldM = buildMerged(chapters)
  const newM = oldM.replace('行1000', '行1000插入后')
  const t0 = Date.now()
  const out = syncMergedEdit(chapters, oldM, newM)
  check('大文本同步正确', out[0].content.includes('行1000插入后') && Date.now() - t0 < 1000, `${Date.now() - t0}ms`)
}

// 8. 整段替换（中间差异超限时退化为块替换）
{
  const chapters = [ch('a', 'A', 'x'), ch('b', 'B', 'y')]
  const oldM = buildMerged(chapters)
  const newM = '完全新的内容'
  const out = syncMergedEdit(chapters, oldM, newM)
  check('块替换可回写', buildMerged(effectiveChapters(out)) === newM, out.map((c) => c.content))
}

// 9. 光标定位
{
  const chapters = [ch('a', 'A', 'aaaa'), ch('b', 'B', 'bbbb')]
  check('光标章定位0', chapterIndexAtCursor(chapters, 0) === 0)
  check('光标章定位跨章', chapterIndexAtCursor(chapters, 6) === 1)
  check('光标章定位末尾', chapterIndexAtCursor(chapters, 999) === 1)
}

// 10. 粘贴一大段进某一章中间
{
  const chapters = [ch('a', 'A', 'a1\na2'), ch('b', 'B', 'b1\nb2')]
  const oldM = buildMerged(chapters)
  const newM = oldM.replace('b1', 'b1\n粘贴1\n粘贴2\n粘贴3')
  const out = syncMergedEdit(chapters, oldM, newM)
  check('中段粘贴', out[1].content === 'b1\n粘贴1\n粘贴2\n粘贴3\nb2', out.map((c) => c.content))
}

// 11. 删掉整章 B（连同分隔）
{
  const chapters = [ch('a', 'A', 'a1\na2'), ch('b', 'B', 'b1\nb2'), ch('c', 'C', 'c1')]
  const oldM = buildMerged(chapters)
  const newM = 'a1\na2\n\nc1'
  const out = syncMergedEdit(chapters, oldM, newM)
  check('整章删除', buildMerged(effectiveChapters(out)) === newM, out.map((c) => c.content))
}

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
