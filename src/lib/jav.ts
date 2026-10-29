/**
 * 番号刮削客户端
 *
 * 浏览器有 CORS 限制，抓不了 javdb / DMM，所以真正抓取发生在自托管代理里
 * （见 workers/jav-proxy.mjs 与 workers/jav-worker.js）。
 *
 * ⚠️ 隐私提示：启用后，输入的番号会发送到你所配置的服务地址。
 *    请只用自己部署的代理，地址在「设置 → 番号刮削」里改。
 */

export interface JavResult {
  code: string
  title: string
  overview: string
  cover: string
  actors: string[]
  maker: string
  label: string
  series: string
  director: string
  genres: string[]
  releaseDate: string
  runtime?: number
  score?: number
  source: string
  url: string
  elapsed?: number
}

export type JavSource = 'auto' | 'javdb' | 'dmm'

export interface JavSettings {
  enabled: boolean
  endpoint: string
  source: JavSource
  token?: string
}

function buildUrl(settings: JavSettings, code: string): string {
  const base = settings.endpoint.trim().replace(/\/+$/, '')
  const url = new URL(base)
  url.searchParams.set('code', code.trim())
  url.searchParams.set('src', settings.source)
  if (settings.token?.trim()) url.searchParams.set('token', settings.token.trim())
  return url.toString()
}

export class JavError extends Error {}

/** 按番号刮削元数据 */
export async function scrapeJav(settings: JavSettings, code: string): Promise<JavResult> {
  const clean = code.trim()
  if (!clean) throw new JavError('请先填写番号')
  if (!settings.endpoint.trim()) {
    throw new JavError('还没配置刮削服务地址，去「设置 → 番号刮削」里填一个')
  }

  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), 25_000)
  try {
    const res = await fetch(buildUrl(settings, clean), { signal: ctrl.signal })
    const text = await res.text()
    let data: Record<string, unknown>
    try {
      data = JSON.parse(text) as Record<string, unknown>
    } catch {
      throw new JavError(`返回的不是 JSON（HTTP ${res.status}），检查服务地址是否正确`)
    }
    if (!res.ok || data.error) {
      throw new JavError(String(data.error ?? `HTTP ${res.status}`))
    }
    return normalize(data)
  } catch (err) {
    if (err instanceof JavError) throw err
    if (err instanceof DOMException && err.name === 'AbortError') {
      throw new JavError('请求超时，代理可能没启动或地址填错了')
    }
    throw new JavError('连不上刮削服务，检查地址与网络')
  } finally {
    clearTimeout(timer)
  }
}

/** 测试服务地址是否可用（用一个不存在的番号打过去，只看能不能通） */
export async function testJav(
  settings: JavSettings
): Promise<{ ok: boolean; ms: number; message: string }> {
  const started = Date.now()
  try {
    await scrapeJav(settings, '__ping__')
    return { ok: true, ms: Date.now() - started, message: '服务可用' }
  } catch (err) {
    const msg = err instanceof Error ? err.message : '未知错误'
    // 能返回「没找到这个番号」说明服务本身是通的
    if (/没有找到|未返回内容|不存在/i.test(msg)) {
      return { ok: true, ms: Date.now() - started, message: '服务可用' }
    }
    return { ok: false, ms: Date.now() - started, message: msg }
  }
}

function asString(v: unknown): string {
  return typeof v === 'string' ? v : v == null ? '' : String(v)
}

function asList(v: unknown): string[] {
  if (!Array.isArray(v)) return []
  return v.map(asString).filter(Boolean)
}

function normalize(data: Record<string, unknown>): JavResult {
  return {
    code: asString(data.code),
    title: asString(data.title),
    overview: asString(data.overview),
    cover: asString(data.cover),
    actors: asList(data.actors),
    maker: asString(data.maker),
    label: asString(data.label),
    series: asString(data.series),
    director: asString(data.director),
    genres: asList(data.genres),
    releaseDate: asString(data.releaseDate),
    runtime: typeof data.runtime === 'number' ? data.runtime : undefined,
    score: typeof data.score === 'number' ? data.score : undefined,
    source: asString(data.source),
    url: asString(data.url),
    elapsed: typeof data.elapsed === 'number' ? data.elapsed : undefined
  }
}

/** 用刮削结果补全一部影片的字段 */
export function javToTitlePatch(result: JavResult) {
  const year = result.releaseDate ? result.releaseDate.slice(0, 4) : undefined
  return {
    title: result.title || result.code,
    originalTitle: result.title || undefined,
    posterRemote: result.cover || undefined,
    overview: result.overview || undefined,
    year,
    releasedAt: result.releaseDate || undefined,
    runtime: result.runtime,
    director: result.director || undefined,
    cast: result.actors.length ? result.actors : undefined,
    genres: result.genres.length ? result.genres : undefined,
    tags: result.series ? [result.series] : undefined
  }
}
