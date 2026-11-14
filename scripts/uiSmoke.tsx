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
  const { putTitle, putCollection, putPerson } = await import('../src/lib/db')
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
  const personId = 'smoke-person-1'
  await putPerson('library', {
    id: personId,
    name: '冒烟测试演员',
    note: '用于验证演员详情页',
    titleIds: [titleId],
    source: 'manual',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  })
  await putPerson('vault', {
    id: 'smoke-person-vault',
    name: '隐私区演员',
    titleIds: [],
    source: 'manual',
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
  assert(body().includes('数据来源'), '设置页渲染')
  assert(body().includes('连接诊断'), '连接诊断区块渲染')
  assert(body().includes('导出 JSON 备份'), '备份入口渲染')
  assert(body().includes('创建隐私空间'), '隐私空间引导渲染')
  assert(body().includes('检查更新'), '检查更新区块渲染')
  assert(body().includes('百度网盘'), '百度网盘下载渠道渲染')
  assert(body().includes('夸克网盘'), '夸克网盘下载渠道渲染')
  assert(body().includes('外观'), '外观设置区块渲染')
  assert(body().includes('使用内置 API Key'), '内置 Key 开关渲染')
  assert(body().includes('番号刮削'), '番号刮削区块渲染')
  assert(body().includes('GitHub'), '页脚 GitHub 入口渲染')
  assert(body().includes('by 赵大阳'), '作者信息渲染')

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

  console.log('10) 演员详情页')
  window.location.hash = `#/person/library/${personId}`
  await tick(300)
  assert(body().includes('冒烟测试演员'), '演员详情渲染姓名')
  assert(body().includes('部作品'), '演员详情显示作品数')
  assert(body().includes('冒烟测试影片'), '演员详情列出关联影片')
  assert(!body().includes('隐私区演员'), '演员详情不含隐私区演员')

  console.log('11) 片库演员栏目')
  window.location.hash = '#/'
  await tick(300)
  assert(body().includes('演员'), '片库出现演员栏目入口')

  console.log('12) 手动添加页 + 番号刮削')
  const { useSettings } = await import('../src/store/settings')
  useSettings.getState().set({
    javEnabled: true,
    javBackend: 'proxy',
    javEndpoint: 'https://example.com',
    javSources: ['javdb', 'jav321']
  })
  window.location.hash = '#/add/library'
  await tick(300)
  assert(body().includes('片名'), '手动录入表单渲染')
  assert(body().includes('按番号自动填充'), '番号刮削入口渲染')
  const codeInput = document.querySelector('input[placeholder^="如 SSNI"]')
  assert(Boolean(codeInput), '番号输入框渲染')

  console.log('13) 内置 Key 生效（发现页不该提示未配置）')
  useSettings.getState().set({ useBuiltInKey: true, apiKey: '' })
  window.location.hash = '#/discover'
  await tick(300)
  assert(!body().includes('还没有填写 TMDB API Key'), '内置 Key 生效时不再提示未配置')
  assert(!body().includes('尚未配置 TMDB API Key'), '热门/榜单不因内置 Key 被判死')

  console.log('14) 设置页刮削配置')
  window.location.hash = '#/settings'
  await tick(300)
  assert(body().includes('内置代理'), '刮削后端选项渲染')
  assert(body().includes('MetaTube'), 'MetaTube 后端选项渲染')
  assert(body().includes('数据源（按优先级，至少留一个）'), '数据源多选渲染')
  assert(body().includes('Jav321'), '数据源列表含 Jav321')
  assert(body().includes('诊断并择优'), '连接诊断入口渲染')
  useSettings.getState().set({ javEnabled: false })

  console.log('\n渲染冒烟通过 ✅  运行时错误：' + (errors.length ? JSON.stringify(errors, null, 2) : '无'))
  if (errors.length) process.exitCode = 1
  process.exit(errors.length ? 1 : 0)
}

main().catch((e) => {
  console.error('❌ UI 冒烟失败', e)
  process.exit(1)
})
