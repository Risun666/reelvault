/**
 * MetaTube 适配层
 *
 * MetaTube（https://github.com/metatube-community/metatube-sdk-go）自带 20+ 家
 * provider，给别人用的就是一套 REST API：
 *
 *   GET  /v1/movies/search?q={番号}&fallback=true[&provider=javdb]
 *   GET  /v1/movies/{provider}/{id}?lazy=true
 *   GET  /v1/images/primary/{provider}/{id}
 *   GET  /v1/providers
 *
 * 这里把它的返回翻译成我们自己的统一契约，这样 App 端不关心后面接的是谁。
 */

/** 把 MetaTube 各种返回形态统一成数组 */
function toArray(payload) {
  if (!payload) return []
  if (Array.isArray(payload)) return payload
  if (Array.isArray(payload.results)) return payload.results
  if (Array.isArray(payload.data)) return payload.data
  if (payload.data && typeof payload.data === 'object') return [payload.data]
  if (typeof payload === 'object') return [payload]
  return []
}

function pick(list, code) {
  if (!list.length) return null
  const norm = (v) => String(v ?? '').toUpperCase().replace(/[-_\s]/g, '')
  const target = norm(code)
  return (
    list.find((r) => norm(r.number) === target) ??
    list.find((r) => norm(r.number).replace(/^0+/, '') === target.replace(/^0+/, '')) ??
    list[0]
  )
}

async function getJson(url, { token = '', timeout = 15_000 } = {}) {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), timeout)
  try {
    const res = await fetch(url, {
      signal: ctrl.signal,
      headers: {
        Accept: 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {})
      }
    })
    const text = await res.text()
    let data
    try {
      data = JSON.parse(text)
    } catch {
      throw new Error(`返回不是 JSON（HTTP ${res.status}）`)
    }
    if (!res.ok) throw new Error(String(data?.message ?? data?.error ?? `HTTP ${res.status}`))
    return data
  } finally {
    clearTimeout(timer)
  }
}

function baseOf(base) {
  return String(base ?? '').trim().replace(/\/+$/, '')
}

/** 列出可用 provider（公开接口，不需要 token） */
export async function listProviders({ base, token, timeout }) {
  const data = await getJson(`${baseOf(base)}/v1/providers`, { token, timeout })
  return toArray(data)
}

/**
 * 按番号查一部片子，返回统一契约。
 * @param {{base:string, token?:string, code:string, provider?:string, detail?:boolean, timeout?:number}} opts
 */
export async function metatubeScrape({ base, token = '', code, provider = '', detail = true, timeout = 15_000 }) {
  const root = baseOf(base)
  if (!root) throw new Error('还没填 MetaTube 服务地址')

  const searchUrl = new URL(`${root}/v1/movies/search`)
  searchUrl.searchParams.set('q', code)
  searchUrl.searchParams.set('fallback', 'true')
  if (provider) searchUrl.searchParams.set('provider', provider)

  const started = Date.now()
  const searched = await getJson(searchUrl.toString(), { token, timeout })
  const hit = pick(toArray(searched), code)
  if (!hit) throw new Error('MetaTube 没找到这个番号')

  const pid = hit.provider
  const mid = hit.id
  const sources = [{ id: pid || 'metatube', ok: true, ms: Date.now() - started }]

  let info = hit
  if (detail && pid && mid) {
    const infoUrl = new URL(`${root}/v1/movies/${encodeURIComponent(pid)}/${encodeURIComponent(mid)}`)
    infoUrl.searchParams.set('lazy', 'false')
    try {
      info = (await getJson(infoUrl.toString(), { token, timeout })) || hit
    } catch {
      /* 详情拿不到就用搜索结果凑合，字段少一点而已 */
    }
  }

  return {
    code: String(info.number ?? hit.number ?? code).toUpperCase(),
    title: String(info.title ?? hit.title ?? ''),
    titleOriginal: String(info.title ?? ''),
    overview: String(info.summary ?? ''),
    cover: pid && mid ? `${root}/v1/images/primary/${pid}/${mid}` : String(info.cover_url ?? ''),
    thumb: pid && mid ? `${root}/v1/images/thumb/${pid}/${mid}` : String(info.thumb_url ?? ''),
    previewImages: Array.isArray(info.preview_images)
      ? info.preview_images.slice(0, 10).map((u) => String(u).replace(/^http:\/\//i, 'https://'))
      : [],
    actors: (Array.isArray(info.actors) ? info.actors : []).map((a) => String(a)).filter(Boolean),
    maker: String(info.maker ?? ''),
    publisher: '',
    series: String(info.series ?? ''),
    director: String(info.director ?? ''),
    genres: (Array.isArray(info.genres) ? info.genres : []).map((g) => String(g)).filter(Boolean),
    releaseDate: String(info.release_date ?? '').slice(0, 10),
    runtime: Number(info.runtime) > 0 ? Number(info.runtime) : undefined,
    score: Number(info.score) > 0 ? Number(info.score) : undefined,
    homepage: String(info.homepage ?? hit.homepage ?? ''),
    provider: pid || 'metatube',
    elapsed: Date.now() - started,
    sources
  }
}
