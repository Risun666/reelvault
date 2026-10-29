/**
 * Cloudflare Worker 版番号刮削代理
 *
 *   cd workers && npx wrangler deploy --config wrangler-jav.toml
 *
 * 注意：*.workers.dev 在大陆同样不稳定，务必绑定自己的域名。
 */

import { scrape } from './jav-scraper.mjs'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type'
}

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json; charset=utf-8' }
  })
}

export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: CORS })
    }

    const url = new URL(request.url)

    if (url.pathname === '/health') return json({ ok: true, service: 'jav-scraper' })

    // 可选：在 Worker 的环境变量里设 JAV_TOKEN，请求需带 ?token=xxx
    if (env.JAV_TOKEN && url.searchParams.get('token') !== env.JAV_TOKEN) {
      return json({ error: 'token 无效' }, 401)
    }

    const code = url.searchParams.get('code')
    if (!code) return json({ error: '缺少 code 参数，例如 /?code=SSNI-589' }, 400)

    const src = url.searchParams.get('src') ?? 'auto'
    if (!['auto', 'javdb', 'dmm'].includes(src)) {
      return json({ error: 'src 只能是 auto / javdb / dmm' }, 400)
    }

    const started = Date.now()
    try {
      const data = await scrape(code, src)
      return json({ ...data, elapsed: Date.now() - started })
    } catch (err) {
      return json({ error: err instanceof Error ? err.message : '刮削失败', code, src }, 502)
    }
  }
}
