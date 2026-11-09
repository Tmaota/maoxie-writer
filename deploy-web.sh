#!/usr/bin/env bash
# 码字工坊 iPad 网页版一键部署
# 用法：双击本文件，或在 Git Bash 里运行  bash deploy-web.sh
# 作用：构建网页版 → 生成离线缓存 → 推到你的 GitHub 仓库 maoxie-web → 开启 Pages
# 之后每次软件更新，再跑一遍这个脚本，iPad 上刷新即可（离线缓存会自动更新）
set -uo pipefail
cd "$(dirname "$0")"

STEP=""
pause() {
  echo ""
  read -r -p "按回车键关闭窗口…" _
}
trap 'echo ""; echo "✗ 部署中断：${STEP}（可能是网络抖动，关掉梯子或稍后重试，再跑一遍本脚本即可）"; pause; exit 1' ERR

echo "==> 0/5 检查网络…"
STEP="网络检查（访问 GitHub）"
curl -sf --max-time 20 -o /dev/null https://api.github.com
echo "    网络正常"

echo "==> 1/5 构建网页版…"
STEP="构建（vite build）"
./node_modules/.bin/vite build

echo "==> 2/5 生成离线缓存（iPad 没网也能写）…"
STEP="生成离线缓存（sw.js）"
cd dist
CACHE_NAME="maoxie-$(find . -type f ! -name 'sw.js' ! -name 'preview.html' -exec sha256sum {} + | sha256sum | cut -c1-16)"
ASSETS_JSON="[$(find . -type f ! -name 'sw.js' ! -name 'preview.html' -printf '%P\n' | sort | sed 's|.*|"./&",|' | tr -d '\n' | sed 's|,$||')]"
cat > sw.js <<EOF
// 码字工坊 Service Worker：deploy-web.sh 自动生成，请勿手改
const CACHE = '${CACHE_NAME}'
const ASSETS = ${ASSETS_JSON}

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
  if (url.origin !== self.location.origin) return
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
EOF
cd ..
echo "    缓存版本：${CACHE_NAME}"

echo "==> 3/5 连接 GitHub…"
STEP="验证 GitHub 令牌"
printf "请粘贴 GitHub 访问令牌（ghp_ 开头，需要 repo 权限；就是软件云端登录用的那种。输入时不显示）: "
read -rs TOKEN
echo ""
if [ -z "${TOKEN}" ]; then
  echo "没有输入令牌，已退出。"
  pause
  exit 1
fi
USER_JSON=$(curl -sf --max-time 30 -H "Authorization: Bearer ${TOKEN}" https://api.github.com/user)
LOGIN=$(echo "${USER_JSON}" | grep -o '"login": *"[^"]*"' | head -1 | sed 's/.*"\([^"]*\)"$/\1/')
if [ -z "${LOGIN}" ]; then
  echo "令牌验证失败：网络不通，或令牌已失效/没有 repo 权限。"
  pause
  exit 1
fi
echo "    账号：${LOGIN}"

REPO=maoxie-web
echo "==> 4/5 准备仓库 ${LOGIN}/${REPO}…"
STEP="创建/检查云端仓库"
CODE=$(curl -s --max-time 30 -o /dev/null -w "%{http_code}" -H "Authorization: Bearer ${TOKEN}" "https://api.github.com/repos/${LOGIN}/${REPO}")
if [ "${CODE}" = "404" ]; then
  CREATE=$(curl -s --max-time 30 -X POST -H "Authorization: Bearer ${TOKEN}" -H "Content-Type: application/json" \
    -d '{"name":"maoxie-web","private":false,"description":"码字工坊 iPad 网页版（仅程序文件，书稿存在私有仓库）"}' \
    https://api.github.com/user/repos)
  if echo "${CREATE}" | grep -q '"full_name"'; then
    echo "    已创建公开仓库 ${REPO}（只含程序文件，你的书稿在安全私有的云端仓库里，互不相干）"
  else
    echo "    创建仓库失败，GitHub 返回："
    echo "${CREATE}" | head -c 300
    echo ""
    pause
    exit 1
  fi
elif [ "${CODE}" != "200" ]; then
  echo "    仓库访问异常（HTTP ${CODE}），继续尝试推送…"
fi

echo "==> 5/5 推送并开启 Pages…"
STEP="推送文件到 GitHub"
cd dist
rm -rf .git
git init -q
git add -A
git -c user.name="${LOGIN}" -c user.email="${LOGIN}@users.noreply.github.com" commit -qm "deploy $(date '+%Y-%m-%d %H:%M')"
git branch -M main
git push -qf "https://x-access-token:${TOKEN}@github.com/${LOGIN}/${REPO}.git" main
cd ..
rm -rf dist/.git   # 令牌不落盘
STEP="开启 Pages"
curl -s -o /dev/null --max-time 30 -X POST -H "Authorization: Bearer ${TOKEN}" -H "Content-Type: application/json" \
  -d '{"source":{"branch":"main","path":"/"}}' "https://api.github.com/repos/${LOGIN}/${REPO}/pages"

echo ""
echo "=============================================="
echo " 部署完成！首次生效需要 1-3 分钟，之后打开："
echo ""
echo "   https://${LOGIN}.github.io/maoxie-web/"
echo ""
echo " iPad 用法：Safari 打开 → 分享 → 添加到主屏幕"
echo " 以后软件更新后重跑本脚本即可，iPad 上刷新一次就更新"
echo "=============================================="
pause
