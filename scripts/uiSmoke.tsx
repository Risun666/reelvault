/** UI 冒烟：在 jsdom 中真实挂载 App，检查各路由首屏是否渲染成功、有无运行时报错 */
import 'fake-indexeddb/auto'
import { JSDOM } from 'jsdom'

const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', {
  url: 'http://localhost:4173/',
  pretendToBeVisual: true
})
const g = globalThis as Record<string, unknown>
const w = dom.window as unknown as Record<string, unknown>

function safeSet(name: string, value: unknown) {
  try {
    g[name] = value
  } catch {
    try {
      Object.defineProperty(g, name, { value, configurable: true, writable: true })
    } catch {
      /* 只读全局（如 navigator/location），跳过即可 */
    }
  }
}

safeSet('window', dom.window)
safeSet('document', dom.window.document)
for (const key of [
  'HTMLElement',
  'HTMLInputElement',
  'Element',
  'Node',
  'Event',
  'CustomEvent',
  'MouseEvent',
  'KeyboardEvent',
  'NodeFilter',
  'customElements',
  'localStorage',
  'getComputedStyle'
]) {
  safeSet(key, (dom.window as unknown as Record<string, unknown>)[key])
}
safeSet('requestAnimationFrame', (cb: FrameRequestCallback) => setTimeout(() => cb(Date.now()), 0) as unknown as number)
safeSet('cancelAnimationFrame', (id: number) => clearTimeout(id))
w.globalThis = globalThis

const errors: string[] = []
process.on('unhandledRejection', (e) => errors.push('unhandledRejection: ' + String(e)))
const origError = console.error
console.error = (...args: unknown[]) => {
  const text = args.map(String).join(' ')
  if (!text.includes('Not implemented')) errors.push('console.error: ' + text.slice(0, 300))
  origError(...args)
}

function assert(cond: unknown, msg: string) {
  if (!cond) throw new Error('断言失败：' + msg)
  console.log('  ✓', msg)
}

const tick = (ms = 220) => new Promise((r) => setTimeout(r, ms))

async function main() {
  // 预置一部影片与一个片单，便于验证详情页
  const { putTitle, putCollection } = await import('../src/lib/db')
  const titleId = 'smoke-title-1'
  const colId = 'smoke-col-1'
  await putTitle('library', {
    id: titleId,
    kind: 'movie',
    title: '冒烟测试影片',
    year: '2024',
    overview: '这是一段用于冒烟测试的简介',
    tags: ['冒烟'],
    status: 'done',
    rating: 8,
    runtime: 110,
    source: 'manual',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  })
  await putCollection({
    id: colId,
    title: '夏日补完计划',
    note: '把没看完的补齐',
    zone: 'library',
    itemIds: [titleId],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  })

  const { createElement } = await import('react')
  const { createRoot } = await import('react-dom/client')
  const App = (await import('../src/App')).default

  // 用假数据模拟 GitHub Releases，验证「检查更新」链路
  safeSet(
    'fetch',
    (async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        tag_name: 'v9.9.9',
        name: 'v9.9.9',
        html_url: 'https://github.com/Risun666/reelvault/releases/tag/v9.9.9',
        body: '冒烟测试用的更新说明',
        published_at: new Date().toISOString(),
        assets: [
          {
            name: 'app-release.apk',
            browser_download_url: 'https://example.com/app-release.apk',
            size: 3_000_000
          }
        ]
      })
    })) as unknown as typeof fetch
  )

  const root = createRoot(document.getElementById('root')!)
  root.render(createElement(App))
  await tick(400)

  const body = () => document.body.textContent ?? ''

  console.log('1) 首屏 / 片库')
  assert(body().includes('我的片库'), '片库标题渲染')
  assert(body().includes('冒烟测试影片'), '片库渲染预置影片')
  assert(body().includes('片库') && body().includes('设置'), '底部导航渲染')

  console.log('2) 路由切换 /discover')
  window.location.hash = '#/discover'
  await tick()
  assert(body().includes('发现'), '发现页渲染')
  assert(body().includes('开始搜一部吧'), '搜索空态渲染')

  console.log('3) 路由切换 /stats')
  window.location.hash = '#/stats'
  await tick()
  assert(body().includes('观影统计'), '统计页渲染')

  console.log('4) 路由切换 /settings')
  window.location.hash = '#/settings'
  await tick()
  assert(body().includes('TMDB API Key'), '设置页渲染')
  assert(body().includes('导出 JSON 备份'), '备份入口渲染')
  assert(body().includes('创建隐私空间'), '隐私空间引导渲染')
  assert(body().includes('检查更新'), '检查更新区块渲染')
  assert(body().includes('百度网盘'), '百度网盘下载渠道渲染')
  assert(body().includes('夸克网盘'), '夸克网盘下载渠道渲染')
  assert(body().includes('外观'), '外观设置区块渲染')

  await tick(800)
  assert(body().includes('v9.9.9'), '检查更新识别到新版本')
  assert(body().includes('app-release.apk'), '新版本 APK 信息渲染')
  assert(body().includes('2.86 MB'), 'APK 体积格式化正确')

  console.log('5) 路由切换 /vault（未配置 PIN）')
  window.location.hash = '#/vault'
  await tick(300)
  assert(body().includes('设置 4-8 位 PIN'), 'PIN 设置界面渲染')
  assert(!body().includes('我的片库'), '隐私页不含片库内容')

  console.log('6) 片单列表页')
  window.location.hash = '#/collections'
  await tick(300)
  assert(body().includes('片单'), '片单页渲染')

  console.log('7) 片单详情页')
  window.location.hash = `#/collection/${colId}`
  await tick(300)
  assert(body().includes('夏日补完计划'), '片单详情渲染标题')
  assert(body().includes('部影片'), '片单详情显示成员数量')

  console.log('8) 影片详情页')
  window.location.hash = `#/title/library/${titleId}`
  await tick(300)
  assert(body().includes('我的评分'), '详情页渲染评分区')
  assert(body().includes('所属片单'), '详情页渲染片单区')

  console.log('9) 主题切换')
  const { useTheme } = await import('../src/store/theme')
  useTheme.getState().set({ mode: 'dark', accent: 'moss' })
  assert(document.documentElement.dataset.theme === 'dark', '深色主题写到了根元素')
  assert(document.documentElement.dataset.accent === 'moss', '强调色切换生效')
  useTheme.getState().set({ mode: 'light', accent: 'reel' })
  assert(document.documentElement.dataset.theme === 'light', '可切回浅色')

  console.log('10) 手动添加页')
  window.location.hash = '#/add/library'
  await tick()
  assert(body().includes('片名'), '手动录入表单渲染')

  console.log('\n渲染冒烟通过 ✅  运行时错误：' + (errors.length ? JSON.stringify(errors, null, 2) : '无'))
  if (errors.length) process.exitCode = 1
  process.exit(errors.length ? 1 : 0)
}

main().catch((e) => {
  console.error('❌ UI 冒烟失败', e)
  process.exit(1)
})
