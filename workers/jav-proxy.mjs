#!/usr/bin/env node
/**
 * 番号刮削代理（零依赖，Node 18+）
 *
 *   node workers/jav-proxy.mjs             # 默认监听 8787
 *   PORT=9000 node workers/jav-proxy.mjs
 *
 * 浏览器直连 javdb / DMM 会被 CORS 拦住，所以 App 只跟这个代理通信。
 * 建议部署在境外 VPS（日本 / 新加坡 / 美西），DMM 源在日本成功率更高。
 *
 * 接口：
 *   GET /?code=SSNI-589[&src=javdb|dmm]  → 元数据 JSON
 *   GET /health                          → { ok: true }
 */

import { createServer } from 'node:http'
import { scrape } from './jav-scraper.mjs'

const PORT = Number(process.env.PORT ?? 8787)
const TOKEN = process.env.JAV_TOKEN ?? '' // 可选：设了之后请求要带 ?token=xxx

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type'
}

function send(res, status, body) {
  const payload = JSON.stringify(body)
  res.writeHead(status, {
    ...CORS,
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store'
  })
  res.end(payload)
}

const server = createServer(async (req, res) => {
  if (req.method === 'OPTIONS') {
    res.writeHead(204, CORS)
    res.end()
    return
  }

  const url = new URL(req.url ?? '/', `http://localhost:${PORT}`)

  if (url.pathname === '/health') {
    send(res, 200, { ok: true, service: 'jav-scraper' })
    return
  }

  if (TOKEN && url.searchParams.get('token') !== TOKEN) {
    send(res, 401, { error: 'token 无效' })
    return
  }

  const code = url.searchParams.get('code')
  if (!code) {
    send(res, 400, { error: '缺少 code 参数，例如 /?code=SSNI-589' })
    return
  }

  const src = url.searchParams.get('src') ?? 'auto'
  if (!['auto', 'javdb', 'dmm'].includes(src)) {
    send(res, 400, { error: 'src 只能是 auto / javdb / dmm' })
    return
  }

  const started = Date.now()
  try {
    const data = await scrape(code, src)
    send(res, 200, { ...data, elapsed: Date.now() - started })
  } catch (err) {
    send(res, 502, {
      error: err instanceof Error ? err.message : '刮削失败',
      code,
      src
    })
  }
})

server.listen(PORT, () => {
  console.log(`番号刮削代理已启动： http://localhost:${PORT}`)
  console.log(`自检： http://localhost:${PORT}/health`)
  console.log(`示例： http://localhost:${PORT}/?code=SSNI-589`)
  console.log(TOKEN ? '访问令牌：已启用' : '访问令牌：未启用（任何人都能用，建议设 JAV_TOKEN）')
})
