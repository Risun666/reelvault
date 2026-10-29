/**
 * 番号刮削客户端
 *
 * 浏览器的 CORS 限制决定了：抓站这件事必须发生在你自己部署的服务里。
 * 这里支持两种后端：
 *
 *   proxy     —— 本项目自带的服务（workers/jav-proxy.mjs 或 Cloudflare Worker），
 *                内置 javdb / jav321 / dmm / avsox / mgstage / fc2 六个数据源，
 *                拿到 JavDB 一家就收工（也可开 enrich 让 DMM 补简介）。
 *   metatube  —— MetaTube（metatube-sdk-go），自带 20+ 家 provider，
 *                无码 / 小众片商命中率更高，需要你自己跑一个。
 *
 * ⚠️ 隐私提示：启用后，输入的番号会发送到你所配置的服务地址。
 *    请只用自己部署的服务，地址在「设置 → 番号刮削」里改。
 */

export interface JavResult {
  code: string
  title: string
  titleOriginal: string
  overview: string
  cover: string
  thumb: string
  previewImages: string[]
  actors: string[]
  maker: string
  publisher: string
  series: string
  director: string
  genres: string[]
  releaseDate: string
  runtime?: number
  score?: number
  homepage: string
  provider: string
  backend: string
  elapsed?: number
  cached?: boolean
  sources?: JavSourceState[]
}

export interface JavSourceState {
  id: string
  ok: boolean
  ms?: number
  note?: string
}

export type JavBackend = 'proxy' | 'metatube'

export interface JavSettings {
  enabled: boolean
  backend: JavBackend
  endpoint: string
  token?: string
  /** proxy 后端：使用哪些数据源（按优先级） */
  sources: string[]
  /** metatube 后端：指定 provider，留空则由它自己挑 */
  provider?: string
  /** proxy 后端：继续问其它站，用来补简介（需要对方节点能出网） */
  enrich: boolean
  /** 标题用中文翻译名还是日文原名 */
  titleLang: 'translated' | 'original'
  /** 封面走代理下载后存本地（存本地才能离线看、才能跟备份一起导出） */
  imageProxy: boolean
}

export const JAV_SOURCES = [
  { id: 'javdb', label: 'JavDB', cn: true, note: '数据最全、封面清晰' },
  { id: 'jav321', label: 'Jav321', cn: true, note: '封面走 DMM 图床' },
  { id: 'dmm', label: 'DMM / FANZA', cn: false, note: '有日文简介，需境外节点' },
  { id: 'avsox', label: 'AVSOX', cn: false, note: '需境外节点' },
  { id: 'mgstage', label: 'MGS（素人）', cn: false, note: '素人番号命中率高' },
  { id: 'fc2', label: 'FC2', cn: false, note: 'FC2 番号专用' }
] as const

export class JavError extends Error {}

function root(base: string): string {
  return base.trim().replace(/\/+$/, '')
}

function asString(v: unknown): string {
  return typeof v === 'string' ? v : v == null ? '' : String(v)
}

function asList(v: unknown): string[] {
  if (!Array.isArray(v)) return []
  return v.map(asString).filter(Boolean)
}

function httpsUrl(u: string): string {
  return String(u || '').replace(/^http:\/\//i, 'https://')
}

/** 从一段文本（文件名 / 粘贴的一串名字）里抠出番号 */
export function extractCodes(text: string): string[] {
  const s = String(text ?? '').toUpperCase()
  const re =
    /(?:FC2[-_]?PPV[-_]?\d{6,7}|FC2[-_]?\d{6,7}|\d{2,3}[A-Za-z]{3,6}[-_]?\d{3,5}|[A-Za-z]{2,8}[-_ ]?\d{2,7})/g
  const out: string[] = []
  let m: RegExpExecArray | null
  while ((m = re.exec(s))) {
    const token = m[0].replace(/[-_ ]+/g, '-')
    const code = normalizeCode(token)
    if (code && !out.includes(code)) out.push(code)
  }
  return out
}

/** 规范化番号：SSNI589 / ssni00589 → SSNI-589 */
export function normalizeCode(raw: string): string {
  const s = String(raw ?? '')
    .toUpperCase()
    .replace(/\s+/g, '')
  let m: RegExpMatchArray | null
  if ((m = s.match(/^FC2[-_]?(?:PPV[-_]?)?(\d{6,7})$/))) return `FC2-${m[1]}`
  if ((m = s.match(/^(\d{2,3})([A-Z]{3,6})[-_]?(\d{3,5})$/))) return `${m[1]}${m[2]}-${m[3]}`
  if ((m = s.match(/^([A-Z]{2,8})[-_]?(\d{2,7})$/))) {
    const short = m[2].replace(/^0+/, '')
    return `${m[1]}-${short || m[2]}`
  }
  return s
}

async function getJson(url: string, token: string | undefined, timeoutMs = 25_000): Promise<any> {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), timeoutMs)
  try {
    const res = await fetch(url, {
      signal: ctrl.signal,
      headers: {
        Accept: 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {})
      }
    })
    const text = await res.text()
    let data: unknown
    try {
      data = JSON.parse(text)
    } catch {
      throw new JavError(`返回的不是 JSON（HTTP ${res.status}），检查服务地址对不对`)
    }
    if (Array.isArray(data)) return data as Record<string, unknown>[]
    const obj = (data ?? {}) as Record<string, any>
    if (!res.ok || obj.error) {
      throw new JavError(String(obj.error ?? obj.message ?? `HTTP ${res.status}`))
    }
    return obj
  } catch (err) {
    if (err instanceof JavError) throw err
    if (err instanceof DOMException && err.name === 'AbortError') {
      throw new JavError('请求超时，服务可能没启动或地址填错了')
    }
    throw new JavError('连不上刮削服务，检查地址与网络')
  } finally {
    clearTimeout(timer)
  }
}

/** proxy 后端：GET /scrape?code=... */
async function scrapeByProxy(settings: JavSettings, code: string) {
  const base = root(settings.endpoint)
  const url = new URL(`${base}/scrape`)
  url.searchParams.set('code', code)
  if (settings.sources?.length) url.searchParams.set('src', settings.sources.join(','))
  if (settings.enrich) url.searchParams.set('enrich', '1')
  if (settings.token?.trim()) url.searchParams.set('token', settings.token.trim())
  const data = await getJson(url.toString(), undefined)
  return normalize(data, 'proxy')
}

/** metatube 后端：搜索 + 详情 + 图片端点 */
async function scrapeByMetatube(settings: JavSettings, code: string) {
  const base = root(settings.endpoint)
  const token = settings.token?.trim() || undefined
  const searchUrl = new URL(`${base}/v1/movies/search`)
  searchUrl.searchParams.set('q', code)
  searchUrl.searchParams.set('fallback', 'true')
  if (settings.provider) searchUrl.searchParams.set('provider', settings.provider)

  const searched = await getJson(searchUrl.toString(), token)
  const list = Array.isArray(searched)
    ? searched
    : Array.isArray(searched?.results)
      ? searched.results
      : Array.isArray(searched?.data)
        ? searched.data
        : [searched]
  const hit =
    list.find((r: any) => String(r?.number ?? '').toUpperCase() === code) ??
    list.find((r: any) => String(r?.number ?? '').toUpperCase().replace(/[-_]/g, '') === code.replace(/[-_]/g, '')) ??
    list[0]
  if (!hit) throw new JavError('没找到这个番号')

  const provider = asString((hit as any).provider)
  const id = asString((hit as any).id)
  let info: Record<string, unknown> = hit as Record<string, unknown>
  if (provider && id) {
    try {
      const infoUrl = new URL(`${base}/v1/movies/${encodeURIComponent(provider)}/${encodeURIComponent(id)}`)
      infoUrl.searchParams.set('lazy', 'false')
      info = (await getJson(infoUrl.toString(), token)) as Record<string, unknown>
    } catch {
      /* 详情拿不到就用搜索结果，字段少一点而已 */
    }
  }

  const data = {
    ...info,
    number: asString(info.number) || code,
    title: asString(info.title),
    summary: asString(info.summary),
    cover: provider && id ? `${base}/v1/images/primary/${provider}/${id}` : asString(info.cover_url),
    thumb: provider && id ? `${base}/v1/images/thumb/${provider}/${id}` : asString(info.thumb_url),
    homepage: asString(info.homepage) || asString((hit as any).homepage),
    provider,
    backend: 'metatube'
  }
  return normalize(data, 'metatube')
}

function normalize(data: Record<string, unknown>, backend: string): JavResult {
  return {
    code: asString(data.code ?? data.number),
    title: asString(data.title),
    titleOriginal: asString(data.titleOriginal ?? data.title),
    overview: asString(data.overview ?? data.summary),
    cover: httpsUrl(asString(data.cover ?? data.cover_url)),
    thumb: httpsUrl(asString(data.thumb ?? data.thumb_url)),
    previewImages: asList(data.previewImages ?? data.preview_images).map(httpsUrl),
    actors: asList(data.actors),
    maker: asString(data.maker),
    publisher: asString(data.publisher),
    series: asString(data.series),
    director: asString(data.director),
    genres: asList(data.genres),
    releaseDate: asString(data.releaseDate ?? data.release_date).slice(0, 10),
    runtime: Number(data.runtime) > 0 ? Number(data.runtime) : undefined,
    score: Number(data.score) > 0 ? Number(data.score) : undefined,
    homepage: asString(data.homepage),
    provider: asString(data.provider),
    backend,
    elapsed: typeof data.elapsed === 'number' ? data.elapsed : undefined,
    cached: data.cached === true,
    sources: Array.isArray(data.sources) ? (data.sources as JavSourceState[]) : undefined
  }
}

/** 按番号刮削元数据 */
export async function scrapeJav(settings: JavSettings, input: string): Promise<JavResult> {
  const raw = String(input ?? '').trim()
  if (!raw) throw new JavError('请先填写番号')
  if (!settings.endpoint?.trim()) {
    throw new JavError('还没配置刮削服务地址，去「设置 → 番号刮削」里填一个')
  }

  // 允许直接粘文件名：先抠出番号
  const code = extractCodes(raw)[0] ?? normalizeCode(raw)
  if (!code) throw new JavError('没能从输入里识别出番号')

  const result =
    settings.backend === 'metatube'
      ? await scrapeByMetatube(settings, code)
      : await scrapeByProxy(settings, code)

  return {
    ...result,
    code: result.code || code,
    title: settings.titleLang === 'original' ? result.titleOriginal || result.title : result.title
  }
}

/** 测试服务是否可用：能返回「没找到」也算通，说明服务活着 */
export async function testJav(
  settings: JavSettings
): Promise<{ ok: boolean; ms: number; message: string; providers: string[] }> {
  const started = Date.now()
  if (!settings.endpoint?.trim()) {
    return { ok: false, ms: 0, message: '先填服务地址', providers: [] }
  }
  try {
    const base = root(settings.endpoint)
    let providers: string[] = []
    if (settings.backend === 'metatube') {
      const data = await getJson(`${base}/v1/providers`, settings.token?.trim() || undefined, 12_000)
      const list = Array.isArray(data)
        ? data
        : Array.isArray((data as any)?.results)
          ? (data as any).results
          : []
      providers = list.map((p: unknown) => (typeof p === 'string' ? p : asString((p as any)?.name))).filter(Boolean)
    } else {
      const data = (await getJson(`${base}/sources`, settings.token?.trim() || undefined, 12_000)) as Record<
        string,
        any
      >
      providers = (data.sources ?? []).map((s: any) => `${s.id}${s.cn ? '' : '（需境外）'}`)
    }
    return {
      ok: true,
      ms: Date.now() - started,
      message: providers.length ? `可用 ${providers.length} 个数据源` : '服务可达',
      providers: providers.slice(0, 40)
    }
  } catch (err) {
    return {
      ok: false,
      ms: Date.now() - started,
      message: err instanceof Error ? err.message : '连不上',
      providers: []
    }
  }
}

/**
 * 封面落本地用的地址。
 * proxy 后端默认走 /image 代理，绕开防盗链与 CORS；存本地后离线也能看。
 */
export function javImageUrl(settings: JavSettings, remote: string): string {
  if (!remote) return ''
  if (settings.backend === 'metatube') return remote
  if (!settings.imageProxy) return remote
  return `${root(settings.endpoint)}/image?url=${encodeURIComponent(remote)}`
}

/** 用刮削结果补全一部影片的字段 */
export function javToTitlePatch(result: JavResult, opts: { titleLang?: 'translated' | 'original' } = {}) {
  const title =
    (opts.titleLang ?? 'translated') === 'original'
      ? result.titleOriginal || result.title
      : result.title || result.titleOriginal
  const year = result.releaseDate ? result.releaseDate.slice(0, 4) : undefined
  return {
    title: title || result.code,
    originalTitle: result.titleOriginal || undefined,
    posterRemote: result.cover || result.thumb || undefined,
    overview: result.overview || undefined,
    year,
    releasedAt: result.releaseDate || undefined,
    runtime: result.runtime,
    director: result.director || undefined,
    cast: result.actors.length ? result.actors : undefined,
    genres: result.genres.length ? result.genres : undefined,
    tags: [result.series, result.maker].filter(Boolean).length
      ? [result.series, result.maker].filter(Boolean)
      : undefined,
    note: result.homepage ? `来源：${result.provider}` : undefined
  }
}
