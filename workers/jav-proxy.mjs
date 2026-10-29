#!/usr/bin/env node
/**
 * 番号刮削代理（零依赖，Node 18+）
 *
 *   node workers/jav-proxy.mjs                      # 默认监听 8787
 *   PORT=9000 node workers/jav-proxy.mjs
 *   METATUBE_URL=http://127.0.0.1:8080 node workers/jav-proxy.mjs   # 后端换成 MetaTube
 *
 * 浏览器直连 javdb / DMM 会被 CORS 拦住，所以 App 只跟这个代理通信。
 * 部署建议：能直连 javdb / jav321 的节点即可；想拿 DMM 简介就放境外（日本更佳）。
 *
 * 对外接口（App 只认这一套）：
 *   GET /health                          → 存活自检
 *   GET /sources                         → 数据源清单与境内可达性
 *   GET /providers                       → 可用 provider（MetaTube 后端时为它的 20+ 家）
 *   GET /scrape?code=SSNI-589&src=javdb,jav321[&enrich=1][&provider=javdb]
 *   GET /image?url=<图片直链>             → 图片字节（带 CORS，供 App 存本地）
 *   GET /?code=...                       → 同 /scrape（旧地址兼容）
 *
 * 可选环境变量：
 *   JAV_TOKEN           访问口令（设了之后请求要带 ?token= 或 Authorization: Bearer）
 *   METATUBE_URL        接 MetaTube 服务（自带 20+ provider，覆盖无码 / 小众片商）
 *   METATUBE_TOKEN      MetaTube 的 token
 *   JAV_IMAGE_HOSTS     额外允许代理的图片域名，逗号分隔
 */

import { createServer } from 'node:http'
import { scrape, SOURCES, DEFAULT_CHAIN, extractCodes } from './jav-scraper.mjs'
import { metatubeScrape, listProviders } from './jav-metatube.mjs'

const PORT = Number(process.env.PORT ?? 8787)
const TOKEN = process.env.JAV_TOKEN ?? ''
const MT_URL = String(process.env.METATUBE_URL ?? '').trim().replace(/\/+$/, '')
const MT_TOKEN = process.env.METATUBE_TOKEN ?? ''

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Max-Age': '86400'
}

const DEFAULT_IMAGE_HOSTS = [
  'c0.jdbstatic.com',
  'c1.jdbstatic.com',
  'jdbstatic.com',
  'pics.dmm.co.jp',
  'image.dmm.co.jp',
  'www.jav321.com',
  'jav321.com',
  'avsox.net',
  'img.mgstage.com',
  'www.mgstage.com',
  'fc2club.net'
]

const IMAGE_HOSTS = [
  ...DEFAULT_IMAGE_HOSTS,
  ...String(process.env.JAV_IMAGE_HOSTS ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean),
  ...(MT_URL ? [new URL(MT_URL).host] : [])
]

/* ------------------------------ 结果缓存 ------------------------------ */

const CACHE_TTL = 6 * 60 * 60 * 1000
const CACHE_MAX = 300
const cache = new Map()

function cacheKey(kind, key) {
  return `${kind}:${key}`
}

async function withCache(kind, key, producer) {
  const k = cacheKey(kind, key)
  const hit = cache.get(k)
  if (hit && Date.now() - hit.at < CACHE_TTL) return { ...hit.value, cached: true }
  const value = await producer()
  if (cache.size >= CACHE_MAX) cache.delete(cache.keys().next().value)
  cache.set(k, { at: Date.now(), value })
  return { ...value, cached: false }
}

/* ------------------------------ 工具 ------------------------------ */

function send(res, status, body) {
  res.writeHead(status, {
    ...CORS,
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store'
  })
  res.end(JSON.stringify(body))
}

function authorized(url, req) {
  if (!TOKEN) return true
  const q = url.searchParams.get('token')
  if (q && q === TOKEN) return true
  const header = req.headers.authorization ?? ''
  return header.replace(/^Bearer\s+/i, '').trim() === TOKEN
}

function hostAllowed(host) {
  const h = String(host ?? '').toLowerCase()
  if (!h) return false
  return IMAGE_HOSTS.some((allow) => h === allow || h.endsWith(`.${allow}`))
}

/* ------------------------------ 业务 ------------------------------ */

async function doScrape({ code, sources, enrich, backend, provider }) {
  const key = `${backend}|${code}|${sources.join(',')}|${enrich ? 1 : 0}|${provider}`
  return withCache('scrape', key, async () => {
    if (backend === 'metatube') {
      const data = await metatubeScrape({
        base: MT_URL,
        token: MT_TOKEN,
        code,
        provider,
        detail: true
      })
      return { ...data, backend: 'metatube' }
    }
    const data = await scrape(code, { sources, enrich })
    return { ...data, backend: 'direct' }
  })
}

async function handleImage(res, target) {
  const url = new URL(target)
  if (!/^https?:$/.test(url.protocol)) {
    send(res, 400, { error: '只支持 http(s) 图片地址' })
    return
  }
  if (!hostAllowed(url.host)) {
    send(res, 400, { error: `图片域名不在白名单里：${url.host}` })
    return
  }
  const httpsUrl = target.replace(/^http:\/\//i, 'https://')
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), 15_000)
  try {
    const r = await fetch(httpsUrl, {
      signal: ctrl.signal,
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
        Referer: `${url.protocol}//${url.host}/`
      }
    })
    if (!r.ok) {
      send(res, 502, { error: `取图失败 HTTP ${r.status}` })
      return
    }
    const type = r.headers.get('content-type') ?? 'image/jpeg'
    const buf = Buffer.from(await r.arrayBuffer())
    res.writeHead(200, {
      ...CORS,
      'Content-Type': type,
      'Cache-Control': 'public, max-age=86400'
    })
    res.end(buf)
  } catch (err) {
    send(res, 502, { error: err instanceof Error ? err.message : '取图失败' })
  } finally {
    clearTimeout(timer)
  }
}

const server = createServer(async (req, res) => {
  if (req.method === 'OPTIONS') {
    res.writeHead(204, CORS)
    res.end()
    return
  }

  const url = new URL(req.url ?? '/', `http://localhost:${PORT}`)

  if (url.pathname === '/health') {
    send(res, 200, {
      ok: true,
      service: 'reelvault-jav-scraper',
      backend: MT_URL ? 'metatube' : 'direct',
      sources: SOURCES.map((s) => s.id)
    })
    return
  }

  if (!authorized(url, req)) {
    send(res, 401, { error: 'token 无效' })
    return
  }

  if (url.pathname === '/sources') {
    send(res, 200, {
      ok: true,
      chain: DEFAULT_CHAIN,
      sources: SOURCES,
      backend: MT_URL ? 'metatube' : 'direct'
    })
    return
  }

  if (url.pathname === '/providers') {
    if (!MT_URL) {
      send(res, 200, { ok: true, backend: 'direct', providers: SOURCES })
      return
    }
    try {
      const providers = await listProviders({ base: MT_URL, token: MT_TOKEN })
      send(res, 200, { ok: true, backend: 'metatube', providers })
    } catch (err) {
      send(res, 502, { error: err instanceof Error ? err.message : '取 provider 失败' })
    }
    return
  }

  if (url.pathname === '/image') {
    const target = url.searchParams.get('url')
    if (!target) {
      send(res, 400, { error: '缺少 url 参数，例如 /image?url=https://c0.jdbstatic.com/...' })
      return
    }
    await handleImage(res, target)
    return
  }

  if (url.pathname === '/scrape' || url.pathname === '/') {
    const raw = (url.searchParams.get('code') ?? '').trim()
    if (!raw) {
      send(res, 400, { error: '缺少 code 参数，例如 /scrape?code=SSNI-589' })
      return
    }
    const codes = extractCodes(raw)
    const code = codes[0] ?? raw
    const srcParam = url.searchParams.get('src')
    const sources = srcParam
      ? srcParam
          .split(',')
          .map((s) => s.trim())
          .filter((s) => SOURCES.some((x) => x.id === s))
      : DEFAULT_CHAIN
    const enrich = url.searchParams.get('enrich') === '1'
    const provider = (url.searchParams.get('provider') ?? '').trim()
    const backend = url.searchParams.get('backend') ?? (MT_URL ? 'metatube' : 'direct')

    if (backend === 'metatube' && !MT_URL) {
      send(res, 400, { error: '这个服务没有接 MetaTube，后端只能用 direct' })
      return
    }

    try {
      const data = await doScrape({ code, sources, enrich, backend, provider })
      send(res, 200, data)
    } catch (err) {
      send(res, 502, {
        error: err instanceof Error ? err.message : '刮削失败',
        code,
        backend
      })
    }
    return
  }

  send(res, 404, { error: '没有这个接口', usage: '/scrape?code=SSNI-589 · /image?url=... · /sources · /health' })
})

server.listen(PORT, () => {
  console.log(`番号刮削代理已启动： http://localhost:${PORT}`)
  console.log(`自检：   http://localhost:${PORT}/health`)
  console.log(`刮削：   http://localhost:${PORT}/scrape?code=SSNI-589`)
  console.log(`取图：   http://localhost:${PORT}/image?url=https://c0.jdbstatic.com/covers/ae/AE89m.jpg`)
  console.log(`后端：   ${MT_URL ? `metatube → ${MT_URL}` : 'direct（内置 javdb / jav321 / dmm / avsox / mgstage / fc2）'}`)
  console.log(`口令：   ${TOKEN ? '已启用' : '未启用（任何人都能用，建议设 JAV_TOKEN）'}`)
})
