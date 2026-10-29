import type { MediaKind, TitleItem } from '../types'

/** 默认走官方短域名：国内对 themoviedb.org 的干扰远多于 tmdb.org */
export const DEFAULT_API_BASE = 'https://api.tmdb.org/3'
export const DEFAULT_IMAGE_BASE = 'https://image.tmdb.org/t/p'

/**
 * 内置 API Key：开箱即用，不用自己去申请。
 * 万一哪天失效，在「设置 → 数据来源」关掉「使用内置 Key」换成自己的即可。
 */
export const BUILT_IN_API_KEY = '2e1228fac65f9bd3789920ff4bdbb20f'

/** 实际生效的 Key：内置优先；关掉内置后用自定义，自定义为空时回退内置 */
export function resolveApiKey(settings: TmdbSettings): string {
  if (settings.useBuiltInKey !== false) return BUILT_IN_API_KEY
  return settings.apiKey.trim() || BUILT_IN_API_KEY
}

/** 当前是否在使用内置 Key */
export function isUsingBuiltInKey(settings: TmdbSettings): boolean {
  return resolveApiKey(settings) === BUILT_IN_API_KEY
}

export interface TmdbSettings {
  apiKey: string
  /** 使用内置 Key；false 时用 apiKey 字段 */
  useBuiltInKey?: boolean
  apiBase?: string
  imageBase?: string
  includeAdult?: boolean
  /** 自动在候选节点间降级，默认开启 */
  autoEndpoint?: boolean
}

/** 官方同时提供两组域名，内容完全一致，可互为备份 */
export const TMDB_ENDPOINTS = [
  {
    id: 'tmdb',
    label: '官方短域名 api.tmdb.org',
    hint: '国内通常可直连，默认',
    api: 'https://api.tmdb.org/3',
    image: 'https://image.tmdb.org/t/p'
  },
  {
    id: 'themoviedb',
    label: '官方长域名 api.themoviedb.org',
    hint: '部分地区被干扰时的备选',
    api: 'https://api.themoviedb.org/3',
    image: 'https://image.themoviedb.org/t/p'
  }
] as const

export interface TmdbSearchHit {
  tmdbId: number
  kind: MediaKind
  title: string
  originalTitle: string
  year: string
  overview: string
  poster: string | null
  score?: number
}

export class TmdbError extends Error {}

function norm(base: string | undefined, fallback: string): string {
  return (base || fallback).replace(/\/+$/, '')
}

function get(settings: TmdbSettings) {
  const key = resolveApiKey(settings)
  if (!key) throw new TmdbError('未配置 TMDB API Key')
  return { imageBase: norm(settings.imageBase, DEFAULT_IMAGE_BASE), key }
}

/* --------------------------- 网络层：超时 + 多节点降级 --------------------------- */

/** 当前可用的节点清单：手填地址优先，其次官方两组（自动模式下） */
export function candidateBases(settings: TmdbSettings): string[] {
  const out: string[] = []
  const push = (b?: string) => {
    const v = (b || '').replace(/\/+$/, '')
    if (v && !out.includes(v)) out.push(v)
  }
  push(settings.apiBase)
  if (settings.autoEndpoint !== false) {
    push(DEFAULT_API_BASE)
    for (const e of TMDB_ENDPOINTS) push(e.api)
  }
  if (!out.length) push(DEFAULT_API_BASE)
  return out
}

/** 上次请求成功的节点，进程内记住，下次优先用 */
let workingBase: string | null = null
export function currentBase(): string | null {
  return workingBase
}
export function forgetBase(): void {
  workingBase = null
}

async function fetchJson<T>(url: string, timeoutMs = 12_000): Promise<T> {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), timeoutMs)
  try {
    const res = await fetch(url, { signal: ctrl.signal })
    if (res.status === 401) throw new TmdbError('API Key 无效，请在设置中检查')
    if (res.status === 429) throw new TmdbError('请求过于频繁，请稍后再试')
    if (!res.ok) throw new TmdbError(`TMDB 请求失败（${res.status}）`)
    return (await res.json()) as T
  } finally {
    clearTimeout(timer)
  }
}

/** 排序后的候选节点：上次成功的排最前 */
function orderedBases(settings: TmdbSettings): string[] {
  const list = candidateBases(settings)
  if (workingBase) {
    const i = list.indexOf(workingBase)
    if (i > 0) list.unshift(...list.splice(i, 1))
  }
  return list
}

/**
 * 串行尝试 + 对冲：先打第一个节点，1.8 秒内没回来就并行发第二个，
 * 谁先成功用谁。这样单个节点被墙时不会让用户干等 12 秒。
 * Key 无效 / 限流这类错误不换节点（换地址也没用）。
 */
function requestPath<T>(settings: TmdbSettings, path: string): Promise<T> {
  const list = orderedBases(settings)
  let lastError: unknown = null

  return new Promise<T>((resolve, reject) => {
    let settled = false
    const launched = new Array(list.length).fill(false)
    const timers: ReturnType<typeof setTimeout>[] = []

    const clearTimers = () => timers.forEach(clearTimeout)
    const settleOk = (base: string, data: T) => {
      if (settled) return
      settled = true
      workingBase = base
      clearTimers()
      resolve(data)
    }
    const settleErr = (err: unknown) => {
      if (settled) return
      settled = true
      clearTimers()
      reject(err)
    }

    const run = (i: number) => {
      if (settled || i >= list.length || launched[i]) return
      launched[i] = true
      fetchJson<T>(`${list[i]}${path}`)
        .then((data) => settleOk(list[i], data))
        .catch((err: unknown) => {
          if (settled) return
          lastError = err
          if (err instanceof TmdbError) {
            settleErr(err)
            return
          }
          run(i + 1)
        })
    }

    run(0)
    timers.push(setTimeout(() => run(1), 1800))
    timers.push(
      setTimeout(
        () =>
          settleErr(
            new TmdbError(
              `连不上 TMDB（${(lastError as Error)?.message ?? '网络不可达'}）。可在设置里测速换节点，或自建反代。`
            )
          ),
        20_000
      )
    )
  })
}

/* --------------------------- 节点测速 --------------------------- */

export interface ProbeResult {
  base: string
  label: string
  ok: boolean
  ms: number | null
  note?: string
}

export async function probeEndpoint(base: string, key: string): Promise<Omit<ProbeResult, 'label'>> {
  const url = `${base.replace(/\/+$/, '')}/configuration?api_key=${key.trim()}`
  const started = Date.now()
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), 8000)
  try {
    const res = await fetch(url, { signal: ctrl.signal })
    const ms = Date.now() - started
    if (res.status === 401) return { base, ok: true, ms, note: '可达，但 Key 无效' }
    if (!res.ok) return { base, ok: false, ms, note: `HTTP ${res.status}` }
    return { base, ok: true, ms }
  } catch (err) {
    return {
      base,
      ok: false,
      ms: null,
      note: (err as Error)?.name === 'AbortError' ? '超时' : '无法连接'
    }
  } finally {
    clearTimeout(timer)
  }
}

/** 并发测所有候选节点，返回按耗时升序的结果 */
export async function probeAll(settings: TmdbSettings): Promise<ProbeResult[]> {
  const key = resolveApiKey(settings)
  if (!key) throw new TmdbError('请先填写 API Key 再测速')
  const bases = candidateBases(settings)
  const results = await Promise.all(bases.map((b) => probeEndpoint(b, key)))
  const labelOf = (b: string) => {
    const hit = TMDB_ENDPOINTS.find((e) => e.api === b)
    if (hit) return hit.label
    return b === DEFAULT_API_BASE ? '官方短域名' : '自定义地址'
  }
  return results
    .map((r) => ({ ...r, label: labelOf(r.base) }))
    .sort((a, b) => (a.ok ? (a.ms ?? 9e9) : 9e9) - (b.ok ? (b.ms ?? 9e9) : 9e9))
}

/** 挑出最快的可达节点；全不可达返回 null */
export async function pickFastest(settings: TmdbSettings): Promise<ProbeResult | null> {
  const all = await probeAll(settings)
  return all.find((r) => r.ok) ?? null
}

/* --------------------------- 业务接口 --------------------------- */

export async function searchTitles(
  settings: TmdbSettings,
  query: string,
  kind: MediaKind | 'all'
): Promise<TmdbSearchHit[]> {
  const { imageBase, key } = get(settings)
  const lang = 'zh-CN'
  const endpoint = kind === 'tv' ? 'tv' : 'movie'
  const q = encodeURIComponent(query.trim())
  const adult = settings.includeAdult === false ? 'false' : 'true'
  const data = await requestPath<{ results: Array<Record<string, unknown>> }>(
    settings,
    `/search/${endpoint}?api_key=${key}&language=${lang}&query=${q}&include_adult=${adult}`
  )

  let hits = (data.results ?? []).map((r) => normalize(r, kind === 'tv' ? 'tv' : 'movie', imageBase))

  if (kind === 'all') {
    try {
      const tv = await requestPath<{ results: Array<Record<string, unknown>> }>(
        settings,
        `/search/tv?api_key=${key}&language=${lang}&query=${q}&include_adult=${adult}`
      )
      hits = hits.concat((tv.results ?? []).map((r) => normalize(r, 'tv', imageBase)))
    } catch {
      /* 剧集搜索失败不影响电影结果 */
    }
  }
  return hits.filter((h) => h.title)
}

function normalize(r: Record<string, unknown>, kind: MediaKind, imageBase: string): TmdbSearchHit {
  const dateKey = kind === 'movie' ? 'release_date' : 'first_air_date'
  const origKey = kind === 'movie' ? 'original_title' : 'original_name'
  const titleKey = kind === 'movie' ? 'title' : 'name'
  const posterPath = r.poster_path as string | null
  const date = (r[dateKey] as string) || ''
  return {
    tmdbId: Number(r.id),
    kind,
    title: String((r[titleKey] as string) || (r[origKey] as string) || ''),
    originalTitle: String((r[origKey] as string) || ''),
    year: date.slice(0, 4),
    overview: String((r.overview as string) || ''),
    poster: posterPath ? `${imageBase}/w500${posterPath}` : null,
    score: typeof r.vote_average === 'number' ? r.vote_average : undefined
  }
}

/** 榜单类接口：本周热门 / 高分榜 */
export async function fetchChart(
  settings: TmdbSettings,
  kind: MediaKind,
  mode: 'trending' | 'top'
): Promise<TmdbSearchHit[]> {
  const { imageBase, key } = get(settings)
  const path = mode === 'trending' ? `trending/${kind}/week` : `${kind}/top_rated`
  const data = await requestPath<{ results: Array<Record<string, unknown>> }>(
    settings,
    `/${path}?api_key=${key}&language=zh-CN&page=1`
  )
  return (data.results ?? []).slice(0, 20).map((r) => normalize(r, kind, imageBase))
}

/** 拉取完整详情，用于入库提升信息密度 */
export async function fetchDetail(
  settings: TmdbSettings,
  tmdbId: number,
  kind: MediaKind
): Promise<{
  item: Partial<TitleItem>
  posterRemote: string | null
  backdrop: string | null
}> {
  const { imageBase, key } = get(settings)
  const data = await requestPath<Record<string, any>>(
    settings,
    `/${kind === 'tv' ? 'tv' : 'movie'}/${tmdbId}?api_key=${key}&language=zh-CN&append_to_response=credits`
  )

  const credits = (data.credits ?? {}) as Record<string, any>
  const cast: string[] = (credits.cast ?? []).slice(0, 10).map((c: any) => String(c.name))
  const crew = (credits.crew ?? []) as any[]
  const director =
    crew.find((c) => c.job === 'Director')?.name ??
    (kind === 'tv' ? (data.created_by ?? [])[0]?.name : undefined)

  const posterPath = data.poster_path as string | null
  const backdropPath = data.backdrop_path as string | null
  const dateKey = kind === 'tv' ? 'first_air_date' : 'release_date'

  const seasons = (data.seasons ?? []) as Array<{ season_number: number; episode_count: number }>
  const episodesInSeason: Record<number, number> = {}
  for (const s of seasons) {
    if (s.season_number >= 0) episodesInSeason[s.season_number] = s.episode_count
  }

  const item: Partial<TitleItem> = {
    kind,
    title: String(data.title ?? data.name ?? ''),
    originalTitle: String(data.original_title ?? data.original_name ?? ''),
    year: String(data[dateKey] ?? '').slice(0, 4),
    releasedAt: data[dateKey] ?? undefined,
    overview: String(data.overview ?? ''),
    genres: (data.genres ?? []).map((g: any) => String(g.name)),
    country: (data.production_countries ?? data.origin_country ?? [])
      .map((c: any) => (typeof c === 'string' ? c : c.iso_3166_1 ?? c.name))
      .slice(0, 3),
    runtime: typeof data.runtime === 'number' ? data.runtime : undefined,
    episodeRuntime: (data.episode_run_time ?? [])[0],
    director: director ? String(director) : undefined,
    cast,
    tmdbId,
    tmdbScore: typeof data.vote_average === 'number' ? data.vote_average : undefined,
    source: 'tmdb'
  }

  if (kind === 'tv') {
    item.progress = {
      season: 1,
      episode: 0,
      totalSeasons: seasons.filter((s) => s.season_number > 0).length,
      episodesInSeason,
      watchedEpisodes: 0
    }
  }

  return {
    item,
    posterRemote: posterPath ? `${imageBase}/w500${posterPath}` : null,
    backdrop: backdropPath ? `${imageBase}/w780${backdropPath}` : null
  }
}

/* --------------------------- 图片域名兜底 --------------------------- */

const IMAGE_HOSTS = ['image.tmdb.org', 'image.themoviedb.org']

/** 海报加载失败时，换到另一组官方图片域名再试一次 */
export function fallbackImageUrl(url: string | undefined | null): string | null {
  if (!url) return null
  try {
    const u = new URL(url)
    const idx = IMAGE_HOSTS.indexOf(u.host)
    if (idx < 0) return null
    u.host = IMAGE_HOSTS[(idx + 1) % IMAGE_HOSTS.length]
    return u.toString()
  } catch {
    return null
  }
}
