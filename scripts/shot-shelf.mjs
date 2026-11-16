/* 临时脚本：播种测试数据 + 截图书架视图（浅色/滑动/深色），用完删除 */
import { chromium } from 'playwright-core'
import { mkdirSync } from 'node:fs'

const BASE = process.env.BASE ?? 'http://localhost:5173'
const OUT = new URL('../shots/', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')
mkdirSync(OUT, { recursive: true })

const svgPoster = (title, sub, c1, c2) => {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="600">
  <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
    <stop offset="0" stop-color="${c1}"/><stop offset="1" stop-color="${c2}"/>
  </linearGradient></defs>
  <rect width="400" height="600" fill="url(#g)"/>
  <circle cx="330" cy="120" r="90" fill="rgba(255,255,255,0.14)"/>
  <circle cx="70" cy="500" r="130" fill="rgba(0,0,0,0.12)"/>
  <text x="34" y="500" font-size="34" font-weight="700" fill="rgba(255,255,255,0.95)" font-family="sans-serif">${title}</text>
  <text x="34" y="534" font-size="19" fill="rgba(255,255,255,0.75)" font-family="sans-serif">${sub}</text>
</svg>`
  return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg)
}

const MOVIES = [
  ['沙丘：第二部', 'DUNE: PART TWO', '2024', 'movie', 'watching', 9, '#8a6a4f', '#4a3a55', ['科幻', '冒险', '剧情']],
  ['奥本海默', 'OPPENHEIMER', '2023', 'movie', 'watching', 8, '#6b4a3a', '#2e2a26', ['剧情', '历史']],
  ['繁花', 'BLOSSOMS SHANGHAI', '2023', 'tv', 'watching', 9, '#8a3a3a', '#4d2430', ['剧情', '爱情']],
  ['三体', '3 BODY PROBLEM', '2024', 'tv', 'watching', 7, '#2e4a6b', '#141e33', ['科幻', '悬疑', '剧情']],
  ['沙丘', 'DUNE', '2021', 'movie', 'wish', 8, '#b08a5a', '#5c4630', ['科幻', '冒险']],
  ['星际穿越', 'INTERSTELLAR', '2014', 'movie', 'wish', 10, '#1f2b4d', '#0d1220', ['科幻', '冒险', '剧情']],
  ['流浪地球2', 'WANDERING EARTH II', '2023', 'movie', 'wish', 8, '#33507a', '#101c2e', ['科幻', '冒险', '动作']],
  ['漫长的季节', 'THE LONG SEASON', '2023', 'tv', 'wish', 9, '#5a6b3a', '#2e3324', ['剧情', '犯罪', '悬疑']],
  ['让子弹飞', 'LET THE BULLETS FLY', '2010', 'movie', 'done', 10, '#7a5a2e', '#33240f', ['喜剧', '动作', '犯罪']],
  ['楚门的世界', 'THE TRUMAN SHOW', '1998', 'movie', 'done', 9, '#3a6b8a', '#132b38', ['剧情', '喜剧']],
  ['海上钢琴师', 'THE LEGEND OF 1900', '1998', 'movie', 'done', 9, '#2e5a4a', '#10221c', ['剧情', '音乐']],
  ['权游 第八季', 'GAME OF THRONES S8', '2019', 'tv', 'dropped', 5, '#4a4a5a', '#23232e', ['剧情', '奇幻', '冒险']],
  ['西部世界 第四季', 'WESTWORLD S4', '2022', 'tv', 'dropped', 6, '#5a4632', '#2b2118', ['科幻', '西部', '剧情']]
].map((m, i) => ({
  id: `t${i + 1}`,
  kind: m[3],
  title: m[0],
  originalTitle: m[1],
  year: m[2],
  genres: m[8],
  posterRemote: svgPoster(m[0], m[1], m[4] === 'dropped' ? '#777' : m[6], m[7]),
  hasLocalPoster: false,
  tags: [],
  status: m[4],
  rating: m[5],
  source: 'manual',
  progress: m[3] === 'tv' ? { season: 2, episode: 5 } : undefined,
  createdAt: `2026-1${i % 3}-0${(i % 9) + 1}T10:00:00Z`,
  updatedAt: `2026-11-1${i % 4}T1${i % 9}:00:00Z`
}))

const seed = async (page, themeMode) => {
  await page.evaluate(
    async ({ items, themeMode }) => {
      await new Promise((resolve, reject) => {
        const req = indexedDB.open('reelvault')
        req.onsuccess = () => {
          const db = req.result
          const tx = db.transaction('titles', 'readwrite')
          const store = tx.objectStore('titles')
          items.forEach((it) => store.put(it))
          tx.oncomplete = () => {
            db.close()
            resolve()
          }
          tx.onerror = () => reject(tx.error)
        }
        req.onerror = () => reject(req.error)
      })
      localStorage.setItem('rv.theme.v2', JSON.stringify({ mode: themeMode }))
      localStorage.setItem('rv.settings.v1', JSON.stringify({ view: 'shelf' }))
    },
    { items: MOVIES, themeMode }
  )
}

const launch = async () => {
  for (const opt of [
    { channel: 'msedge' },
    { channel: 'chrome' },
    { executablePath: 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe' },
    { executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe' }
  ]) {
    try {
      return await chromium.launch({ ...opt, headless: true })
    } catch {
      /* try next */
    }
  }
  throw new Error('no chromium-based browser found')
}

const browser = await launch()
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 })
const page = await ctx.newPage()

// 1. 初始化 DB + 播种（浅色）
await page.goto(BASE, { waitUntil: 'networkidle' })
await seed(page, 'light')
await page.reload({ waitUntil: 'networkidle' })
await page.waitForSelector('.deck-card', { timeout: 15000 })
await page.waitForTimeout(1800)
await page.screenshot({ path: `${OUT}shelf-light.png` })
console.log('ok: shelf-light.png')

// 2. 滑动翻页：滚到第 4 张（模拟用户 swipe 后的 snap 状态）
await page.evaluate(() => {
  const el = document.querySelector('.deck-track')
  const slot = el?.firstElementChild
  const w = slot ? slot.getBoundingClientRect().width : 150
  el?.scrollTo({ left: 3 * w, behavior: 'smooth' })
})
await page.waitForTimeout(1300)
await page.screenshot({ path: `${OUT}shelf-swiped.png` })
console.log('ok: shelf-swiped.png')

// 3. 深色（影院）模式
await seed(page, 'dark')
await page.reload({ waitUntil: 'networkidle' })
await page.waitForSelector('.deck-card', { timeout: 15000 })
await page.waitForTimeout(1800)
await page.screenshot({ path: `${OUT}shelf-dark.png` })
console.log('ok: shelf-dark.png')

// 4. 筛选面板：题材分类
await page.getByRole('button', { name: '筛选' }).click()
await page.waitForTimeout(600)
await page.screenshot({ path: `${OUT}filter-genres.png` })
console.log('ok: filter-genres.png')

// 5. 设置页外观面板
await seed(page, 'light')
await page.goto(`${BASE}/#/settings`, { waitUntil: 'networkidle' })
await page.reload({ waitUntil: 'networkidle' })
await page.waitForTimeout(1400)
await page.evaluate(() => {
  const h = [...document.querySelectorAll('h2')].find((e) => e.textContent?.trim() === '外观')
  h?.scrollIntoView({ block: 'start' })
})
await page.waitForTimeout(900)
await page.screenshot({ path: `${OUT}appearance.png` })
console.log('ok: appearance.png')

await browser.close()
console.log('done')
