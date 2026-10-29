#!/usr/bin/env node
/**
 * 番号刮削内核（零依赖，Node 18+ / Cloudflare Workers 通用）
 *
 * 思路参考 AVDC（jav321/javbus/javdb/avsox/dmm/mgstage/fc2 多站刮削）与
 * OpenAver（多家互相补位、只填空字段）：
 *
 *  1. 番号规范化：SSNI-589 / ssni00589 / SSNI589 / FC2-PPV-1234567 / 素人 259LUXU-1111
 *  2. 多数据源按链路抓取，各自解析，字段互相补位
 *  3. 只取元数据，不含任何播放/下载链接
 *
 * 各站在境内/境外可达性不同，结果里会带上每个源的状态，方便排查。
 */

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36'

export const SOURCES = [
  { id: 'javdb', label: 'JavDB', cn: true, note: '数据最全、封面清晰，国内多可直连' },
  { id: 'jav321', label: 'Jav321', cn: true, note: '国内可直连，封面走 DMM 图床' },
  { id: 'dmm', label: 'DMM / FANZA', cn: false, note: '有日文简介，通常需要日本/海外节点' },
  { id: 'avsox', label: 'AVSOX', cn: false, note: '境外节点' },
  { id: 'mgstage', label: 'MGS（素人）', cn: false, note: '境外节点，素人番号命中率高' },
  { id: 'fc2', label: 'FC2', cn: false, note: '境外节点，FC2 番号专用' }
]

export const DEFAULT_CHAIN = ['javdb', 'jav321', 'dmm', 'avsox', 'mgstage', 'fc2']

/* ------------------------------ HTTP ------------------------------ */

export async function httpGet(
  url,
  {
    cookie = '',
    timeout = 12_000,
    accept = 'text/html,application/xhtml+xml,application/xml;q=0.9',
    lang = 'zh-CN,zh;q=0.9'
  } = {}
) {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), timeout)
  try {
    const res = await fetch(url, {
      signal: ctrl.signal,
      redirect: 'follow',
      headers: {
        'User-Agent': UA,
        Accept: accept,
        'Accept-Language': lang,
        ...(cookie ? { Cookie: cookie } : {})
      }
    })
    return { ok: res.ok, status: res.status, text: await res.text(), url: res.url || url }
  } finally {
    clearTimeout(timer)
  }
}

/* --------------------------- HTML 小工具 --------------------------- */

const ENTITIES = {
  '&amp;': '&',
  '&lt;': '<',
  '&gt;': '>',
  '&quot;': '"',
  '&nbsp;': ' ',
  '&hellip;': '…',
  '&#39;': "'",
  '&#x27;': "'"
}

function decodeEntities(s) {
  return String(s).replace(/&(?:amp|lt|gt|quot|nbsp|hellip|#39|#x27);/g, (m) => ENTITIES[m] ?? m)
}

function stripTags(s) {
  return decodeEntities(String(s).replace(/<[^>]*>/g, ' '))
    .replace(/\s+/g, ' ')
    .trim()
}

function one(html, re) {
  const m = html.match(re)
  return m ? stripTags(m[1]) : ''
}

function all(html, re) {
  const out = []
  const r = new RegExp(re.source, re.flags.includes('g') ? re.flags : `${re.flags}g`)
  let m
  while ((m = r.exec(html))) out.push(stripTags(m[1]))
  return out
}

function uniq(list) {
  const seen = new Set()
  const out = []
  for (const v of list) {
    const k = String(v).trim()
    if (!k || seen.has(k)) continue
    seen.add(k)
    out.push(k)
  }
  return out
}

/* --------------------------- 番号规范化 --------------------------- */

/**
 * 把各种写法统一成 { code, sku, kind }
 *  code —— 展示用番号，如 SSNI-589
 *  sku  —— DMM 品番，如 ssni00589（jav321 / dmm / avsox 直接用）
 *  kind —— standard | fc2 | amateur | heyzo | unknown
 */
export function normalizeCode(raw) {
  const rawText = String(raw ?? '').trim()
  if (!rawText) return { code: '', sku: '', kind: 'unknown' }

  const s = rawText
    .toUpperCase()
    .replace(/\s+/g, '')
    .replace(/\.(MP4|MKV|AVI|RMVB|WMV|MOV|FLV|WEBM|ISO)$/i, '')
    .replace(/[-_]+$/, '')

  let m

  // FC2-PPV-1234567 / FC2-1234567 / fc21234567
  if ((m = s.match(/^FC2[-_]?(?:PPV[-_]?)?(\d{6,7})$/))) {
    return { code: `FC2-${m[1]}`, sku: `fc2-ppv-${m[1]}`, kind: 'fc2' }
  }

  // 素人：259LUXU-1111 / 259LUXU1111
  if ((m = s.match(/^(\d{2,3})([A-Z]{3,6})[-_]?(\d{3,5})$/))) {
    const letters = `${m[1]}${m[2]}`
    return {
      code: `${letters}-${m[3]}`,
      sku: `${letters.toLowerCase()}${m[3].padStart(5, '0')}`,
      kind: 'amateur'
    }
  }

  // 标准：SSNI-589 / SSNI589 / SSNI00589 / HEYZO-1234
  if ((m = s.match(/^([A-Z]{2,8})[-_]?(\d{2,7})$/))) {
    const letters = m[1]
    const digits = m[2]
    // DMM 品番数字固定 5 位：SSNI00589 → SSNI-589
    const short = digits.replace(/^0+/, '')
    return {
      code: `${letters}-${short || digits}`,
      sku: `${letters.toLowerCase()}${digits.padStart(5, '0')}`,
      kind: /^HEYZO/.test(letters) ? 'heyzo' : 'standard'
    }
  }

  return { code: s, sku: s.toLowerCase(), kind: 'unknown' }
}

const TOKEN_RE =
  /(?:FC2[-_]?PPV[-_]?\d{6,7}|FC2[-_]?\d{6,7}|\d{2,3}[A-Za-z]{3,6}[-_]?\d{3,5}|[A-Za-z]{2,8}[-_ ]?\d{2,7})/g

/** 从文本里提取全部番号（去重、保留顺序） */
export function extractCodes(text) {
  const s = String(text ?? '').toUpperCase()
  const out = []
  const re = new RegExp(TOKEN_RE.source, 'g')
  let m
  while ((m = re.exec(s))) {
    const norm = normalizeCode(m[0])
    if (norm.code && !out.includes(norm.code)) out.push(norm.code)
  }
  return out
}

/** 从文本里提取第一个番号 */
export function extractCodeToken(text) {
  const hits = extractCodes(text)
  return hits.length ? hits[0] : null
}

/** 先当纯文本处理：从一段文字里抠出番号再规范化（如整个文件名） */
export function parseCode(raw) {
  return normalizeCode(extractCodeToken(String(raw ?? '')) || String(raw ?? ''))
}

/** 两个番号是否指同一部（忽略大小写、分隔符、DMM 前导零） */
export function sameCode(a, b) {
  const norm = (v) => String(v ?? '').toUpperCase().replace(/[-_\s]/g, '')
  const x = norm(a)
  const y = norm(b)
  if (!x || !y) return false
  if (x === y) return true
  const pad = (v) => {
    const m = v.match(/^(.*?)(\d{1,7})$/)
    if (!m) return v
    return `${m[1]}${String(Number(m[2])).padStart(5, '0')}`
  }
  return pad(x) === pad(y)
}

/* ------------------------------ 数据源 ------------------------------ */

class SourceError extends Error {
  constructor(message) {
    super(message)
    this.name = 'SourceError'
  }
}

async function javdb(code, _sku, opts = {}) {
  const list = await httpGet(`https://javdb.com/search?q=${encodeURIComponent(code)}&f=all`, {
    cookie: 'over18=1; lang=zh',
    timeout: opts.timeout
  })
  if (!list.ok) throw new SourceError(`JavDB 搜索页 HTTP ${list.status}`)
  if (/Just a moment|cf-browser-verification|__cf_chl/i.test(list.text)) {
    throw new SourceError('JavDB 要求通过 Cloudflare 校验')
  }

  const itemRe =
    /<a href="(\/v\/[A-Za-z0-9]+)" class="box"[^>]*>[\s\S]*?<img[^>]*src="([^"]+)"[\s\S]*?<div class="video-title"><strong>([^<]*)<\/strong>([\s\S]*?)<\/div>/g
  const items = []
  let m
  while ((m = itemRe.exec(list.text))) {
    items.push({ path: m[1], cover: m[2], code: stripTags(m[3]), title: stripTags(m[4]) })
  }

  let hit = items.find((it) => sameCode(it.code, code))
  if (!hit) hit = items.find((it) => it.code.toUpperCase().startsWith(code.split('-')[0]))
  if (!hit) throw new SourceError('JavDB 没找到这个番号')

  const page = await httpGet(`https://javdb.com${hit.path}`, {
    cookie: 'over18=1; lang=zh',
    timeout: opts.timeout
  })
  if (!page.ok) throw new SourceError(`JavDB 详情页 HTTP ${page.status}`)
  const html = page.text

  // value 里可能是纯文本，也可能包着 <a>，所以整段取出来再去标签
  const label = (key) => {
    const m = html.match(
      new RegExp(`<strong>(?:${key}):<\\/strong>[\\s\\S]{0,120}?<span class="value">([\\s\\S]*?)<\\/span>`)
    )
    return m ? stripTags(m[1]) : ''
  }
  const actors = all(html, /<a class="actor-(?:female|male)"[^>]*href="\/actors\/[^"]*"[^>]*>([^<]*)<\/a>/i)
  const genres = all(html, /<a href="\/tags\?c\d+=\d+"[^>]*>([^<]*)<\/a>/i)
  const cover = one(html, /<img class="video-cover"[^>]*src="([^"]+)"/i) || hit.cover
  const previews = uniq(
    all(html, /<a class="tile-item[^"]*"[^>]*href="(https:\/\/[^"]+\.(?:jpg|jpeg|png|webp))"/i)
  ).slice(0, 8)

  return {
    code: one(html, /<h2 class="title is-4">[\s\S]*?<strong>([^<]*)<\/strong>/i) || hit.code,
    title: one(html, /<strong class="current-title">([^<]*)<\/strong>/i) || hit.title,
    titleOriginal: one(html, /class="origin-title">([^<]*)</i),
    overview: '',
    cover,
    thumb: cover,
    previewImages: previews,
    actors,
    maker: label('片商|製作商'),
    publisher: label('發行|发行'),
    series: label('系列'),
    director: label('導演|导演'),
    genres,
    releaseDate: label('日期').slice(0, 10),
    runtime: parseInt(label('時長|时长'), 10) || undefined,
    score: (() => {
      const raw = one(html, /<strong>(?:評分|评分):<\/strong>[\s\S]{0,300}?([\d.]+)分/)
      const v = Number(raw)
      return v > 0 ? v : undefined
    })(),
    homepage: `https://javdb.com${hit.path}`,
    provider: 'javdb'
  }
}

async function jav321(code, sku, opts = {}) {
  const page = await httpGet(`https://www.jav321.com/video/${encodeURIComponent(sku)}`, {
    timeout: opts.timeout
  })
  if (!page.ok) throw new SourceError(`Jav321 HTTP ${page.status}`)
  const html = page.text
  if (!/<b>品番<\/b>/.test(html)) throw new SourceError('Jav321 没有这个番号的页面')

  const segment = (key) => {
    const m = html.match(new RegExp(`<b>${key}</b>:([\\s\\S]*?)<br>`))
    return m ? m[1] : ''
  }
  const links = (seg) => all(seg, /<a[^>]*>([^<]*)<\/a>/)

  return {
    code: one(html, /<b>品番<\/b>: ?([^<]*)</i).toUpperCase() || code,
    title: (() => {
      const m = html.match(/<h3>([\s\S]*?)<small>/i)
      return m ? stripTags(m[1]) : ''
    })(),
    titleOriginal: '',
    overview: '',
    cover: `https://pics.dmm.co.jp/digital/video/${sku}/${sku}pl.jpg`,
    thumb: `https://pics.dmm.co.jp/digital/video/${sku}/${sku}ps.jpg`,
    previewImages: uniq(
      all(html, /src="(https?:\/\/pics\.dmm\.co\.jp\/digital\/video\/[^"]+\/[^"]+jp-\d+\.jpg)"/i)
    ).slice(0, 8),
    actors: links(segment('出演者')),
    maker: links(segment('メーカー'))[0] ?? '',
    publisher: '',
    series: '',
    director: '',
    genres: links(segment('ジャンル')),
    releaseDate: one(html, /<b>配信開始日<\/b>: ?([^<]*)</i).slice(0, 10),
    runtime: parseInt(one(html, /<b>収録時間<\/b>: ?([^<]*)</i), 10) || undefined,
    score: (() => {
      const v = Number(one(html, /<b>平均評価<\/b>: ?([^<]*)</i))
      return v > 0 ? v : undefined
    })(),
    homepage: `https://www.jav321.com/video/${sku}`,
    provider: 'jav321'
  }
}

async function dmm(code, sku, opts = {}) {
  const page = await httpGet(`https://www.dmm.co.jp/digital/videoa/-/detail/=/cid=${encodeURIComponent(sku)}/`, {
    cookie: 'age_check_done=1; ckcy=1',
    timeout: opts.timeout
  })
  if (!page.ok) throw new SourceError(`DMM HTTP ${page.status}（多半被地域限制挡了）`)
  const html = page.text
  if (!/digital\/videoa/.test(html)) throw new SourceError('DMM 返回的不是影片页')

  const og = (prop) => one(html, new RegExp(`<meta property="og:${prop}" content="([^"]*)"`, 'i'))

  return {
    code,
    title: og('title') || one(html, /<h1[^>]*class="item-name"[^>]*>([\s\S]*?)<\/h1>/i),
    titleOriginal: '',
    overview: og('description'),
    cover: `https://pics.dmm.co.jp/digital/video/${sku}/${sku}pl.jpg`,
    thumb: `https://pics.dmm.co.jp/digital/video/${sku}/${sku}ps.jpg`,
    previewImages: [],
    actors: all(
      html,
      /href="https?:\/\/www\.dmm\.co\.jp\/mono\/digital\/videoa\/-?\/actress\/[\s\S]*?>([^<]*)</i
    ),
    maker: one(html, /<a href="[^"]*article=maker[^"]*"[^>]*>([\s\S]*?)<\/a>/i),
    publisher: '',
    series: one(html, /<a href="[^"]*article=series[^"]*"[^>]*>([\s\S]*?)<\/a>/i),
    director: one(html, /<a href="[^"]*article=director[^"]*"[^>]*>([\s\S]*?)<\/a>/i),
    genres: all(html, /<a href="[^"]*article=keyword[^"]*"[^>]*>([\s\S]*?)<\/a>/i),
    releaseDate: (() => {
      const m = html.match(/(\d{4})[\/年](\d{1,2})[\/月](\d{1,2})/i)
      return m ? `${m[1]}-${String(m[2]).padStart(2, '0')}-${String(m[3]).padStart(2, '0')}` : ''
    })(),
    runtime: parseInt(one(html, />(\d{2,3})分</i), 10) || undefined,
    score: undefined,
    homepage: `https://www.dmm.co.jp/digital/videoa/-/detail/=/cid=${sku}/`,
    provider: 'dmm'
  }
}

async function avsox(code, sku, opts = {}) {
  const page = await httpGet(`https://avsox.net/jp/${encodeURIComponent(sku)}`, { timeout: opts.timeout })
  if (!page.ok) throw new SourceError(`AVSOX HTTP ${page.status}`)
  const html = page.text
  if (!/品番/.test(html)) throw new SourceError('AVSOX 没有这个番号')

  const info = (key) => {
    const m = html.match(new RegExp(`<span class="header">${key}[:：]</span>([\\s\\S]*?)</p>`))
    return m ? stripTags(m[1]) : ''
  }
  const links = (seg) => all(seg, /<a[^>]*>([^<]*)<\/a>/)

  return {
    code: info('品番').toUpperCase() || code,
    title: (() => {
      const m = html.match(/<h3>([\s\S]*?)<\/h3>/i)
      return m ? stripTags(m[1]) : ''
    })(),
    titleOriginal: '',
    overview: '',
    cover: one(html, /<a class="bigImage"[^>]*href="([^"]+)"/i),
    thumb: one(html, /<a class="bigImage"[^>]*href="([^"]+)"/i),
    previewImages: uniq(all(html, /<a class="sample-box"[^>]*href="([^"]+)"/i)).slice(0, 8),
    actors: links(info('出演者')),
    maker: info('メーカー'),
    publisher: '',
    series: info('シリーズ'),
    director: info('監督'),
    genres: links(info('ジャンル')),
    releaseDate: info('発売日').replace(/[年月]/g, '-').replace(/日/g, '').slice(0, 10),
    runtime: parseInt(info('収録時間'), 10) || undefined,
    score: undefined,
    homepage: `https://avsox.net/jp/${sku}`,
    provider: 'avsox'
  }
}

async function mgstage(code, _sku, opts = {}) {
  const page = await httpGet(`https://www.mgstage.com/product_detail.php?sku=${encodeURIComponent(code)}`, {
    cookie: 'adc=1',
    timeout: opts.timeout
  })
  if (!page.ok) throw new SourceError(`MGS HTTP ${page.status}`)
  const html = page.text
  if (!/品番/.test(html)) throw new SourceError('MGS 没有这个番号')

  const info = (key) => {
    const m = html.match(new RegExp(`${key}[\\s\\S]{0,40}?<td[^>]*>([\\s\\S]*?)</td>`, 'i'))
    return m ? stripTags(m[1]) : ''
  }

  return {
    code: info('品番').toUpperCase() || code,
    title: one(html, /<h1[^>]*>([\s\S]*?)<\/h1>/i),
    titleOriginal: '',
    overview: one(html, /<p class="txt introduction"[^>]*>([\s\S]*?)<\/p>/i),
    cover: one(html, /<a id="sample-imageEnlarge"[^>]*href="([^"]+)"/i),
    thumb: '',
    previewImages: [],
    actors: all(html, /href="[^"]*\/search\/[^"]*actress[^"]*"[^>]*>([^<]*)<\/a>/i),
    maker: info('メーカー'),
    publisher: '',
    series: info('シリーズ'),
    director: '',
    genres: all(html, /href="[^"]*\/search\/[^"]*genre[^"]*"[^>]*>([^<]*)<\/a>/i),
    releaseDate: info('配信開始日').replace(/[年月]/g, '-').replace(/日/g, '').slice(0, 10),
    runtime: parseInt(info('収録時間'), 10) || undefined,
    score: undefined,
    homepage: `https://www.mgstage.com/product_detail.php?sku=${code}`,
    provider: 'mgstage'
  }
}

async function fc2(code, _sku, opts = {}) {
  const id = code.replace(/^FC2[-_]?(?:PPV[-_]?)?/i, '')
  if (!/^\d{6,7}$/.test(id)) throw new SourceError('FC2 番号格式不对（应为 FC2-1234567）')

  const page = await httpGet(`https://fc2club.net/html/FC2-${id}.html`, { timeout: opts.timeout })
  if (!page.ok) throw new SourceError(`FC2 源 HTTP ${page.status}`)
  const html = page.text

  return {
    code: `FC2-${id}`,
    title: one(html, /<h1[^>]*>([\s\S]*?)<\/h1>/i) || one(html, /<title>([\s\S]*?)<\/title>/i),
    titleOriginal: '',
    overview: one(html, /<div class="movie_info"[^>]*>([\s\S]*?)<\/div>/i),
    cover: one(html, /<img[^>]*class="[^"]*cover[^"]*"[^>]*src="([^"]+)"/i),
    thumb: '',
    previewImages: [],
    actors: all(html, /href="\/actor\/[^"]*"[^>]*>([^<]*)<\/a>/i),
    maker: 'FC2 业余',
    publisher: '',
    series: '',
    director: '',
    genres: all(html, /href="\/genre\/[^"]*"[^>]*>([^<]*)<\/a>/i),
    releaseDate: one(html, /<span[^>]*class="[^"]*date[^"]*"[^>]*>([\d-]{8,10})</i),
    runtime: undefined,
    score: undefined,
    homepage: `https://fc2club.net/html/FC2-${id}.html`,
    provider: 'fc2'
  }
}

const IMPL = {
  javdb: (code, sku, opts) => javdb(code, sku, opts),
  jav321: (code, sku, opts) => jav321(code, sku, opts),
  dmm: (code, sku, opts) => dmm(code, sku, opts),
  avsox: (code, sku, opts) => avsox(code, sku, opts),
  mgstage: (code, sku, opts) => mgstage(code, sku, opts),
  fc2: (code, sku, opts) => fc2(code, sku, opts)
}

/* ------------------------------ 合并 ------------------------------ */

const ARRAY_KEYS = ['actors', 'genres', 'previewImages']
const SCALAR_KEYS = [
  'title',
  'titleOriginal',
  'overview',
  'cover',
  'thumb',
  'maker',
  'publisher',
  'series',
  'director',
  'releaseDate',
  'runtime',
  'score'
]

const EMPTY = {
  code: '',
  title: '',
  titleOriginal: '',
  overview: '',
  cover: '',
  thumb: '',
  previewImages: [],
  actors: [],
  maker: '',
  publisher: '',
  series: '',
  director: '',
  genres: [],
  releaseDate: '',
  runtime: undefined,
  score: undefined,
  homepage: '',
  provider: ''
}

/**
 * 把各源结果合并成一条：先出现的源先填空位，后面的源只补空缺
 * （同一个思路：AVDC 多站刮削 + OpenAver 的「只填空字段，不覆盖已有资料」）。
 */
export function mergeResults(raws) {
  const merged = { ...EMPTY, previewImages: [], actors: [], genres: [] }
  let first = null
  for (const r of raws) {
    if (!r) continue
    if (!first) {
      first = r
      merged.code = r.code || merged.code
      merged.homepage = r.homepage || merged.homepage
      merged.provider = r.provider || merged.provider
    }
    for (const k of SCALAR_KEYS) {
      const cur = merged[k]
      if (cur === '' || cur === undefined) {
        const v = r[k]
        if (v !== '' && v !== undefined && v !== null) merged[k] = v
      }
    }
    for (const k of ARRAY_KEYS) {
      if (Array.isArray(r[k]) && r[k].length) merged[k] = uniq([...merged[k], ...r[k]])
    }
  }
  return merged
}

/**
 * 主入口：按链路抓取并合并结果。
 * @param {string} input 番号或含番号的文件名
 * @param {{sources?: string[], concurrency?: number, timeout?: number}} opts
 */
export async function scrape(
  input,
  { sources = DEFAULT_CHAIN, concurrency = 2, timeout = 9_000, enrich = false } = {}
) {
  const { code, sku, kind } = parseCode(input)
  if (!code) throw new Error('番号为空')

  const chain = (sources?.length ? sources : DEFAULT_CHAIN).filter((id) => IMPL[id])
  const usable = kind === 'fc2' ? chain.filter((id) => id === 'fc2') : chain.filter((id) => id !== 'fc2')

  const started = Date.now()
  const states = []
  const raws = []
  let index = 0
  let stop = false

  const worker = async () => {
    while (!stop && index < usable.length) {
      const id = usable[index++]
      const t0 = Date.now()
      try {
        const data = await IMPL[id](code, sku, { timeout })
        raws.push(data)
        states.push({ id, ok: true, ms: Date.now() - t0 })
        // JavDB 一家就能给出标题/封面/演员/片商，默认拿它一个就收工（省对方站点资源）
        if (!enrich && id === 'javdb') stop = true
      } catch (err) {
        states.push({
          id,
          ok: false,
          ms: Date.now() - t0,
          note: err instanceof Error ? err.message : String(err)
        })
      }
    }
  }

  await Promise.all(
    Array.from({ length: Math.max(1, Math.min(concurrency, usable.length || 1)) }, () => worker())
  )

  // 合并顺序固定为配置的链路顺序，不跟着网络快慢变
  const ordered = usable.map((id) => raws.find((r) => r.provider === id)).filter(Boolean)
  const merged = mergeResults(ordered)
  if (!merged.title && !merged.cover) {
    const reason = states
      .filter((s) => !s.ok)
      .map((s) => `${s.id}: ${s.note ?? '无结果'}`)
      .join(' · ')
    throw new Error(reason || '所有数据源都没有结果')
  }

  // 图床有 http 链接，App 跑在 https 里会被混合内容拦掉，统一升到 https
  const https = (u) => String(u || '').replace(/^http:\/\//i, 'https://')

  return {
    ...merged,
    code: merged.code || code,
    cover: https(merged.cover),
    thumb: https(merged.thumb),
    previewImages: merged.previewImages.map(https).slice(0, 10),
    elapsed: Date.now() - started,
    sources: states
  }
}

export default scrape
