/**
 * 番号刮削核心逻辑（零依赖，Node 18+ / Cloudflare Workers 通用）
 *
 * 只抓取元数据：番號 / 标题 / 封面 / 发行日 / 片長 / 導演 / 片商 / 發行 / 系列 / 類別 / 演員。
 * 不含任何下载链接、磁力、播放地址。
 *
 * 站点随时可能改版，解析规则放在这里，改了重部署即可，不用重新打包 App。
 */

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36'

/** 归一化番号用于比对：SSNI-589 / ssni589 / SSNI 589 → SSNI589 */
export function normalizeCode(input) {
  return String(input || '')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
}

async function get(url, fetchImpl, timeoutMs = 15000) {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), timeoutMs)
  try {
    const res = await fetchImpl(url, {
      signal: ctrl.signal,
      headers: { 'User-Agent': UA, 'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8' }
    })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    return await res.text()
  } finally {
    clearTimeout(timer)
  }
}

function stripTags(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ')
    .trim()
}

/** 取 info 面板里某个字段（番號 / 日期 / 片商 …） */
function panelValue(html, label) {
  const re = new RegExp(`<strong>${label}:?</strong>[\\s\\S]{0,1200}?<span class="value">([\\s\\S]*?)</span>`, 'i')
  const m = html.match(re)
  if (!m) return ''
  return stripTags(m[1])
}

function panelLinks(html, label) {
  const raw = panelValue(html, label)
  return raw
    .split(/[,，]/)
    .map((s) => s.trim())
    .filter(Boolean)
}

/* ------------------------------- javdb ------------------------------- */

const JAVDB = 'https://javdb.com'

async function javdbSearch(code, fetchImpl) {
  const html = await get(`${JAVDB}/search?q=${encodeURIComponent(code)}&f=all`, fetchImpl)
  const target = normalizeCode(code)
  const items = html.split('<div class="item">').slice(1)
  for (const raw of items) {
    const href = raw.match(/<a href="(\/v\/[^"]+)"/)
    const strong = raw.match(/<div class="video-title">\s*<strong>([\s\S]*?)<\/strong>[\s\S]*?<\/div>/)
    const title = raw.match(/<div class="video-title">([\s\S]*?)<\/div>/)
    const cover = raw.match(/<img[^>]+src="([^"]+)"/)
    const meta = raw.match(/<div class="meta">\s*([\s\S]*?)\s*<\/div>/)
    if (!href) continue
    const cardCode = strong ? normalizeCode(stripTags(strong[1])) : ''
    if (target && cardCode && cardCode !== target) continue
    return {
      path: href[1],
      code: strong ? stripTags(strong[1]) : code,
      title: title ? stripTags(title[1]).replace(/^\S+\s*/, '').trim() : '',
      cover: cover ? cover[1] : '',
      date: meta ? stripTags(meta[1]) : ''
    }
  }
  return null
}

async function javdbDetail(path, fetchImpl) {
  const html = await get(`${JAVDB}${path}`, fetchImpl)
  const cover =
    html.match(/<img class="video-cover"[^>]+src="([^"]+)"/)?.[1] ??
    html.match(/data-movie-detail-target="cover"[^>]+src="([^"]+)"/)?.[1] ??
    ''
  const titleMatch = html.match(/<title>\s*([\s\S]*?)\s*\|\s*JavDB/i)
  const fullTitle = titleMatch ? stripTags(titleMatch[1]) : ''
  // 详情页里番號被拆成 <a>SSNI</a>-589，去掉标签留下的空格
  const code = (panelValue(html, '番號') || '').replace(/\s+/g, '')
  // 标题去掉开头番号，只留描述部分
  const title = fullTitle.replace(/^\s*[A-Za-z0-9-_]+\s+/, '').trim() || fullTitle

  return {
    code,
    title,
    cover,
    overview: '', // javdb 本身不提供剧情简介
    actors: panelLinks(html, '演員'),
    maker: panelValue(html, '片商'),
    label: panelValue(html, '發行'),
    series: panelValue(html, '系列'),
    director: panelValue(html, '導演'),
    genres: panelLinks(html, '類別'),
    releaseDate: panelValue(html, '日期'),
    runtimeText: panelValue(html, '時長'),
    scoreText: panelValue(html, '評分'),
    url: `${JAVDB}${path}`
  }
}

/* -------------------------------- dmm -------------------------------- */

/**
 * DMM 官方详情页（含剧情简介）。
 * 注意：DMM 对机房 IP 与非日本地区有风控，代理部署在日本 / 海外 VPS 时成功率更高。
 */
async function dmmDetail(code, fetchImpl) {
  const raw = normalizeCode(code)
  // DMM 的内容 ID 形如 ssni00589：字母小写 + 数字补零到 5 位
  const m = raw.match(/^([A-Z]+)(\d+)$/)
  const cid = m ? `${m[1].toLowerCase()}${m[2].padStart(5, '0')}` : raw.toLowerCase()
  const url = `https://www.dmm.co.jp/digital/videoa/-/detail/=/cid=${cid}/`
  const html = await get(url, fetchImpl)

  const title =
    stripTags(html.match(/<h1 id="title"[^>]*>([\s\S]*?)<\/h1>/)?.[1] ?? '') ||
    stripTags(html.match(/<title>([\s\S]*?)<\/title>/)?.[1] ?? '')
  const cover = html.match(/<img[^>]+class="[^"]*tdmm[^"]*"[^>]+src="([^"]+)"/)?.[1] ?? ''
  const overview = stripTags(
    html.match(/<div class="mg-b20 lh4"[\s\S]*?>([\s\S]*?)<\/div>/)?.[1] ?? ''
  )
  const t = stripTags(html)

  const pick = (label) => {
    const re = new RegExp(`${label}[：:]\\s*([^\\s]+)`)
    return t.match(re)?.[1] ?? ''
  }

  return {
    code: raw,
    title,
    cover,
    overview,
    actors: [],
    maker: pick('メーカー'),
    label: pick('レーベル'),
    series: pick('シリーズ'),
    director: pick('監督'),
    genres: (t.match(/ジャンル：[\s\S]{0,300}?/) ?? [''])[0]
      .split(/[、,]/)
      .map((s) => s.trim())
      .filter(Boolean),
    releaseDate: pick('発売日'),
    runtimeText: pick('収録時間'),
    scoreText: '',
    url
  }
}

/* ------------------------------ 对外入口 ------------------------------ */

function toRuntime(text) {
  const m = String(text || '').match(/(\d+)/)
  return m ? Number(m[1]) : undefined
}

function toScore(text) {
  const m = String(text || '').match(/([\d.]+)\s*分/)
  return m ? Number(m[1]) : undefined
}

function emptyResult(code) {
  return {
    code: normalizeCode(code),
    title: '',
    overview: '',
    cover: '',
    actors: [],
    maker: '',
    label: '',
    series: '',
    director: '',
    genres: [],
    releaseDate: '',
    runtime: undefined,
    score: undefined,
    source: '',
    url: ''
  }
}

/**
 * 按番号刮削元数据
 * @param {string} code 番号，如 SSNI-589
 * @param {'auto'|'javdb'|'dmm'} source 数据源
 * @param {typeof fetch} fetchImpl
 */
export async function scrape(code, source = 'auto', fetchImpl = globalThis.fetch) {
  const clean = String(code || '').trim()
  if (!clean) throw new Error('番号不能为空')
  const want = source === 'auto' ? ['javdb', 'dmm'] : [source]
  let lastError = null

  for (const name of want) {
    try {
      let raw
      if (name === 'javdb') {
        const hit = await javdbSearch(clean, fetchImpl)
        if (!hit) throw new Error('没有找到这个番号')
        raw = await javdbDetail(hit.path, fetchImpl)
        // 搜索卡片上的封面/日期在详情页缺失时补上
        if (!raw.cover && hit.cover) raw.cover = hit.cover
        if (!raw.releaseDate && hit.date) raw.releaseDate = hit.date
        if (!raw.title && hit.title) raw.title = hit.title
        if (!raw.code) raw.code = hit.code
      } else if (name === 'dmm') {
        raw = await dmmDetail(clean, fetchImpl)
        if (!raw.title) throw new Error('DMM 未返回内容（可能受地区风控）')
      } else {
        throw new Error(`未知数据源：${name}`)
      }

      return {
        ...emptyResult(clean),
        code: raw.code || clean,
        title: raw.title,
        overview: raw.overview || '',
        cover: raw.cover || '',
        actors: raw.actors ?? [],
        maker: raw.maker ?? '',
        label: raw.label ?? '',
        series: raw.series ?? '',
        director: raw.director ?? '',
        genres: raw.genres ?? [],
        releaseDate: raw.releaseDate ?? '',
        runtime: toRuntime(raw.runtimeText),
        score: toScore(raw.scoreText),
        source: name,
        url: raw.url ?? ''
      }
    } catch (err) {
      lastError = err
      if (source !== 'auto') throw err
    }
  }
  throw lastError ?? new Error('刮削失败')
}
