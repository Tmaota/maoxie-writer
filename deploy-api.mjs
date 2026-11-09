// 通过 api.github.com（git data API）推送 dist 到 maoxie-web，绕开被墙的 github.com
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

// 令牌从环境变量读（set GH_TOKEN=xxx 后运行），不写死在代码里
const TOKEN = process.env.GH_TOKEN ?? ''
const REPO = 'Tmaota/maoxie-web'
const DIST = process.argv[2] || 'dist'
const MESSAGE = process.argv[3] || 'deploy'
const API = 'https://api.github.com'

async function api(path, opts = {}) {
  const res = await fetch(`${API}${path}`, {
    ...opts,
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      'Content-Type': 'application/json',
      'User-Agent': 'maoxie-deploy',
      ...(opts.headers || {}),
    },
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`${opts.method || 'GET'} ${path} -> ${res.status}: ${text.slice(0, 300)}`)
  }
  return res.json()
}

function walk(dir, prefix = '') {
  const out = []
  for (const name of readdirSync(dir)) {
    if (name === '.git') continue
    const p = join(dir, name)
    const rel = prefix ? `${prefix}/${name}` : name
    if (statSync(p).isDirectory()) out.push(...walk(p, rel))
    else out.push({ abs: p, rel })
  }
  return out
}

const files = walk(DIST)
console.log(`files: ${files.length}`)

// 1. 当前 main 引用与基树
const ref = await api(`/repos/${REPO}/git/ref/heads/main`)
const parentSha = ref.object.sha
const parentCommit = await api(`/repos/${REPO}/git/commits/${parentSha}`)
const baseTree = parentCommit.tree.sha

// 2. 逐文件建 blob
const treeEntries = []
for (const f of files) {
  const content = readFileSync(f.abs)
  const blob = await api(`/repos/${REPO}/git/blobs`, {
    method: 'POST',
    body: JSON.stringify({ content: content.toString('base64'), encoding: 'base64' }),
  })
  treeEntries.push({ path: f.rel, mode: '100644', type: 'blob', sha: blob.sha })
  console.log(`blob: ${f.rel} (${content.length}B)`)
}

// 3. 建树（保持 base_tree 里 dist 没有的文件，比如旧文件会被覆盖/新增；dist 全量列出即可精确同步）
const tree = await api(`/repos/${REPO}/git/trees`, {
  method: 'POST',
  body: JSON.stringify({ base_tree: baseTree, tree: treeEntries }),
})
console.log(`tree: ${tree.sha}`)

// 4. 提交并移动 main
const commit = await api(`/repos/${REPO}/git/commits`, {
  method: 'POST',
  body: JSON.stringify({ message: MESSAGE, tree: tree.sha, parents: [parentSha] }),
})
await api(`/repos/${REPO}/git/refs/heads/main`, {
  method: 'PATCH',
  body: JSON.stringify({ sha: commit.sha, force: true }),
})
console.log(`PUSH_OK ${commit.sha}`)
