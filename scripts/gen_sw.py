# /// 构建后生成 Service Worker（把 dist 里所有静态资产预缓存，支持 iPad 离线写作）
# /// 用法：python scripts/gen_sw.py   （在 vite build 之后运行）
import hashlib
import json
import sys
from pathlib import Path

DIST = Path(__file__).resolve().parent.parent / 'dist'

if not DIST.is_dir():
    sys.exit('dist 不存在，请先运行 vite build')

files = []
digest = hashlib.sha256()
for p in sorted(DIST.rglob('*')):
    if not p.is_file() or p.name == 'sw.js':
        continue
    rel = p.relative_to(DIST).as_posix()
    # preview.html 只是设计预览页，不进预缓存
    if rel == 'preview.html':
        continue
    files.append(rel)
    digest.update(rel.encode())
    digest.update(p.read_bytes())

cache_name = 'maoxie-' + digest.hexdigest()[:16]
assets = json.dumps(['./' + f for f in files], ensure_ascii=False, indent=2)

sw = """// 码字工坊 Service Worker：构建时由 scripts/gen_sw.py 生成，请勿手改
const CACHE = '%s'
const ASSETS = %s

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting())
  )
})

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((ks) => Promise.all(ks.filter((k) => k.startsWith('maoxie-') && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  )
})

self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return
  const url = new URL(e.request.url)
  // 只接管本站静态资源；GitHub API 等跨域请求一律走网络
  if (url.origin !== self.location.origin) return
  // 页面导航：网络优先，离线回退缓存的首页
  if (e.request.mode === 'navigate') {
    e.respondWith(
      fetch(e.request)
        .then((res) => {
          const copy = res.clone()
          caches.open(CACHE).then((c) => c.put('./index.html', copy))
          return res
        })
        .catch(() => caches.match('./index.html'))
    )
    return
  }
  // 其余资源：缓存优先，未命中再取网络并回填
  e.respondWith(
    caches.match(e.request, { ignoreSearch: true }).then(
      (hit) =>
        hit ||
        fetch(e.request).then((res) => {
          const copy = res.clone()
          caches.open(CACHE).then((c) => c.put(e.request, copy))
          return res
        })
    )
  )
})
""" % (cache_name, assets)

(DIST / 'sw.js').write_text(sw, encoding='utf-8')
print(f'sw.js 生成完成：缓存 {len(files)} 个文件，版本 {cache_name}')
