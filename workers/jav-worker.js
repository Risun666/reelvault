/**
 * Cloudflare Worker 版番号刮削代理（接口与 workers/jav-proxy.mjs 完全一致）
 *
 *   cd workers && npx wrangler deploy --config wrangler-jav.toml
 *
 * 注意：*.workers.dev 在大陆同样不稳定，务必绑定自己的域名。
 *
 * 可选环境变量（在 wrangler.toml 的 [vars] 或 secrets 里配）：
 *   JAV_TOKEN        访问口令
 *   METATUBE_URL    接 MetaTube 服务，自动切到 metatube 后端
 *   METATUBE_TOKEN  MetaTube 的 token
 */

import { scrape, SOURCES, DEFAULT_CHAIN, extractCodes } from './jav-scraper.mjs'
import { metatubeScrape, listProviders } from './jav-metatube.mjs'

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

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...CORS,
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store'
    }
  })
}

function authorized(url, request, env) {
  const token = env.JAV_TOKEN ?? ''
  if (!token) return true
  const q = url.searchParams.get('token')
  if (q && q === token) return true
  const header = request.headers.get('Authorization') ?? ''
  return header.replace(/^Bearer\s+/i, '').trim() === token
}

export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: CORS })
    }

    const url = new URL(request.url)
    const mt = String(env.METATUBE_URL ?? '').trim().replace(/\/+$/, '')

    if (url.pathname === '/health') {
      return json({
        ok: true,
        service: 'reelvault-jav-scraper',
        backend: mt ? 'metatube' : 'direct',
        sources: SOURCES.map((s) => s.id)
      })
    }

    if (!authorized(url, request, env)) return json({ error: 'token 无效' }, 401)

    if (url.pathname === '/sources') {
      return json({ ok: true, chain: DEFAULT_CHAIN, sources: SOURCES, backend: mt ? 'metatube' : 'direct' })
    }

    if (url.pathname === '/providers') {
      if (!mt) return json({ ok: true, backend: 'direct', providers: SOURCES })
      try {
        const providers = await listProviders({ base: mt, token: env.METATUBE_TOKEN ?? '' })
        return json({ ok: true, backend: 'metatube', providers })
      } catch (err) {
        return json({ error: err instanceof Error ? err.message : '取 provider 失败' }, 502)
      }
    }

    // 图片代理：外面拿到的图床链接在浏览器里要么被防盗链拦，要么不能存进 IndexedDB
    if (url.pathname === '/image') {
      const target = url.searchParams.get('url')
      if (!target) return json({ error: '缺少 url 参数' }, 400)
      let parsed
      try {
        parsed = new URL(target)
      } catch {
        return json({ error: 'url 参数不是合法地址' }, 400)
      }
      const extra = String(env.JAV_IMAGE_HOSTS ?? '')
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean)
      const hosts = [...DEFAULT_IMAGE_HOSTS, ...extra, ...(mt ? [new URL(mt).host] : [])]
      const host = parsed.host.toLowerCase()
      if (!hosts.some((a) => host === a || host.endsWith(`.${a}`))) {
        return json({ error: `图片域名不在白名单里：${parsed.host}` }, 400)
      }
      try {
        const res = await fetch(target.replace(/^http:\/\//i, 'https://'), {
          headers: {
            'User-Agent':
              'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
            Referer: `${parsed.protocol}//${parsed.host}/`,
            Accept: 'image/avif,image/webp,image/apng,image/*,*/*;q=0.8'
          }
        })
        if (!res.ok) return json({ error: `取图失败 HTTP ${res.status}` }, 502)
        const out = new Response(res.body, {
          status: 200,
          headers: {
            ...CORS,
            'Content-Type': res.headers.get('content-type') ?? 'image/jpeg',
            'Cache-Control': 'public, max-age=86400'
          }
        })
        return out
      } catch (err) {
        return json({ error: err instanceof Error ? err.message : '取图失败' }, 502)
      }
    }

    if (url.pathname === '/scrape' || url.pathname === '/') {
      const raw = (url.searchParams.get('code') ?? '').trim()
      if (!raw) return json({ error: '缺少 code 参数，例如 /scrape?code=SSNI-589' }, 400)

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
      const backend = url.searchParams.get('backend') ?? (mt ? 'metatube' : 'direct')

      if (backend === 'metatube' && !mt) {
        return json({ error: '这个 Worker 没有接 MetaTube，后端只能用 direct' }, 400)
      }

      try {
        if (backend === 'metatube') {
          const data = await metatubeScrape({
            base: mt,
            token: env.METATUBE_TOKEN ?? '',
            code,
            provider,
            detail: true
          })
          return json({ ...data, backend: 'metatube' })
        }
        const data = await scrape(code, { sources, enrich })
        return json({ ...data, backend: 'direct' })
      } catch (err) {
        return json(
          { error: err instanceof Error ? err.message : '刮削失败', code, backend },
          502
        )
      }
    }

    return json({ error: '没有这个接口', usage: '/scrape?code=SSNI-589 · /image?url=... · /sources' }, 404)
  }
}
