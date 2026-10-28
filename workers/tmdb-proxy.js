/**
 * Cloudflare Worker：TMDB 反向代理
 *
 * 用途：当你所在网络无法直连 api.tmdb.org / image.tmdb.org 时，
 * 把它部署到 Cloudflare，再把「设置 → 数据来源 → API 地址」填成
 *   https://<你的域名>/3
 * 「图片地址」填成
 *   https://<你的域名>/t/p
 *
 * 部署：
 *   cd workers
 *   npx wrangler deploy          # 首次会要求登录 Cloudflare
 *   # 之后在 CF 控制台给这个 Worker 绑一个自己的域名
 *   # （*.workers.dev 在大陆访问不稳定，务必绑定自定义域名）
 *
 * 安全：只放行 /3/ 和 /t/p/ 两条路径，且只允许转发到 TMDB 官方域名，
 * 不会被当成开放代理滥用。
 */

const UPSTREAM_API = 'https://api.tmdb.org'
const UPSTREAM_IMAGE = 'https://image.tmdb.org'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET,OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Max-Age': '86400'
}

function withCors(res) {
  const headers = new Headers(res.headers)
  for (const [k, v] of Object.entries(CORS)) headers.set(k, v)
  return new Response(res.body, { status: res.status, statusText: res.statusText, headers })
}

export default {
  async fetch(request) {
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: CORS })
    }
    if (request.method !== 'GET') {
      return new Response('Method Not Allowed', { status: 405, headers: CORS })
    }

    const url = new URL(request.url)
    const isApi = url.pathname.startsWith('/3/')
    const isImage = url.pathname.startsWith('/t/p/')
    if (!isApi && !isImage) {
      return new Response('Not Found', { status: 404, headers: CORS })
    }

    const upstream = isApi ? UPSTREAM_API : UPSTREAM_IMAGE
    const target = `${upstream}${url.pathname}${url.search}`

    // 图片体积大且几乎不变，走 CF 边缘缓存；接口结果不缓存，避免拿到过期数据
    const cacheKey = new Request(target, { method: 'GET' })
    const cache = caches.default
    if (isImage) {
      const hit = await cache.match(cacheKey)
      if (hit) return withCors(hit)
    }

    let upstreamResponse
    try {
      upstreamResponse = await fetch(target, {
        headers: {
          Accept: request.headers.get('Accept') || '*/*',
          'User-Agent': request.headers.get('User-Agent') || 'ReelVault/1.0'
        },
        cf: { cacheTtl: isImage ? 86400 * 30 : 0 }
      })
    } catch {
      return new Response('Upstream unreachable', { status: 502, headers: CORS })
    }

    const res = withCors(upstreamResponse)
    if (isImage && upstreamResponse.ok) {
      // 边缘缓存写入不能阻塞响应
      void cache.put(cacheKey, res.clone())
    }
    return res
  }
}
