/**
 * 零依赖 Node 反代：给有一台能连外网的机器（境外 VPS 最常见）的人用
 *
 *   node workers/node-proxy.mjs            # 默认监听 8787
 *   PORT=9000 node workers/node-proxy.mjs
 *
 * 然后把 App「设置 → 数据来源」里
 *   API 地址  填 http://<服务器IP>:8787/3
 *   图片地址  填 http://<服务器IP>:8787/t/p
 *
 * 注意：http 明文地址在 HTTPS 页面里会被浏览器拦截（混合内容），
 * 生产环境请用 nginx/Caddy 套一层 HTTPS，或只在局域网内临时使用。
 */
import http from 'node:http'
import https from 'node:https'

const PORT = Number(process.env.PORT || 8787)
const UPSTREAM_API = 'https://api.tmdb.org'
const UPSTREAM_IMAGE = 'https://image.tmdb.org'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET,OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Max-Age': '86400'
}

const server = http.createServer((req, res) => {
  if (req.method === 'OPTIONS') {
    res.writeHead(204, CORS)
    res.end()
    return
  }
  if (req.method !== 'GET') {
    res.writeHead(405, CORS)
    res.end('Method Not Allowed')
    return
  }

  const isApi = req.url.startsWith('/3/')
  const isImage = req.url.startsWith('/t/p/')
  if (!isApi && !isImage) {
    res.writeHead(404, CORS)
    res.end('Not Found')
    return
  }

  const target = new URL(req.url, isApi ? UPSTREAM_API : UPSTREAM_IMAGE)
  https
    .get(
      target,
      { headers: { Accept: '*/*', 'User-Agent': 'ReelVault/1.0' } },
      (up) => {
        const headers = { ...up.headers, ...CORS }
        delete headers['content-encoding']
        delete headers['content-length']
        res.writeHead(up.statusCode || 502, headers)
        up.pipe(res)
      }
    )
    .on('error', () => {
      res.writeHead(502, CORS)
      res.end('Upstream unreachable')
    })
})

server.listen(PORT, () => {
  console.log(`TMDB 反代已启动: http://0.0.0.0:${PORT}`)
  console.log(`  API   → ${UPSTREAM_API}/3/*`)
  console.log(`  图片  → ${UPSTREAM_IMAGE}/t/p/*`)
})
