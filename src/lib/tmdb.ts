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

/**
 * 当前是否有一个能用的 Key。
 * 页面判断「能不能用 TMDB」必须走这里，而不是去看用户手填的那个字段
 * —— 内置 Key 生效时用户字段是空的，直接判空会把内置 Key 也一起判死。
 */
export function hasApiKey(settings: TmdbSettings): boolean {
  return Boolean(resolveApiKey(settings))
}

/** Key 出问题时的提示文案，内置 Key 是共享的，提示里要说清楚怎么换 */
const KEY_INVALID_MSG = 'API Key 无效。内置 Key 是共享的，可能已被吊销：关掉「使用内置 API Key」换成自己的'
const KEY_LIMITED_MSG = '请求过于频繁（内置 Key 与别人共用，额度容易被打满）。稍后再试，或换成自己的 Key'

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
    if (res.status === 401) throw new TmdbError(KEY_INVALID_MSG)
    if (res.status === 429) throw new TmdbError(KEY_LIMITED_MSG)
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
    if (res.status === 401) return { base, ok: true, ms, note: 'Key 无效' }
    if (res.status === 429) return { base, ok: true, ms, note: 'Key 已被限流' }
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

/* --------------------------- 一键诊断 --------------------------- */

export interface KeyCheck {
  ok: boolean
  status: number | null
  note: string
}

/**
 * 验证 Key 本身：逐个节点问过去，只要有一个节点给出明确答复就有结论。
 * 网络全断时不会误判成「Key 无效」。
 */
export async function checkKey(settings: TmdbSettings): Promise<KeyCheck> {
  const key = resolveApiKey(settings)
  if (!key) return { ok: false, status: null, note: '还没有可用的 API Key' }

  for (const base of orderedBases(settings)) {
    const r = await probeEndpoint(base, key)
    if (r.note === 'Key 无效') {
      return {
        ok: false,
        status: 401,
        note: isUsingBuiltInKey(settings)
          ? '内置 Key 已失效，请关掉「使用内置 API Key」换成自己的'
          : '这个 Key 无效，检查有没有复制全'
      }
    }
    if (r.note === 'Key 已被限流') {
      return {
        ok: false,
        status: 429,
        note: '内置 Key 与别人共用，额度容易被打满。稍后再试，或换成自己的 Key'
      }
    }
    if (r.ok) return { ok: true, status: 200, note: `Key 有效（${r.ms}ms · ${base}）` }
  }
  return { ok: false, status: null, note: '所有节点都连不上，无法验证 Key —— 多半是网络问题' }
}

/** 图片 CDN 可达性：拿一张确定存在的海报去试 */
const IMAGE_PROBE_PATH = '/w500/8ZTVqvKDQ8emSGUEMjsS4yHAwrp.jpg'

export interface ImageProbe {
  base: string
  ok: boolean
  ms: number | null
}

export async function checkImage(base: string): Promise<ImageProbe> {
  const url = `${base.replace(/\/+$/, '')}${IMAGE_PROBE_PATH}`
  const started = Date.now()
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), 8000)
  try {
    const res = await fetch(url, { signal: ctrl.signal })
    return { base, ok: res.ok, ms: Date.now() - started }
  } catch {
    return { base, ok: false, ms: null }
  } finally {
    clearTimeout(timer)
  }
}

export interface Diagnosis {
  key: KeyCheck
  api: ProbeResult[]
  images: ImageProbe[]
  usingBuiltIn: boolean
}

export function pickImageBase(images: ImageProbe[]): string | null {
  const usable = images.filter((i) => i.ok).sort((a, b) => (a.ms ?? 9e9) - (b.ms ?? 9e9))
  return usable[0]?.base ?? null
}

/** 一次性把「Key 状态 + API 节点 + 图片 CDN」都查清楚 */
export async function diagnose(settings: TmdbSettings): Promise<Diagnosis> {
  const candidates = Array.from(
    new Set(
      [settings.imageBase, DEFAULT_IMAGE_BASE, ...IMAGE_HOSTS.map((h) => `https://${h}/t/p`)].filter(
        Boolean
      ) as string[]
    )
  )
  const [key, api, images] = await Promise.all([
    checkKey(settings),
    probeAll(settings).catch(() => [] as ProbeResult[]),
    Promise.all(candidates.map((b) => checkImage(b)))
  ])
  return { key, api, images, usingBuiltIn: isUsingBuiltInKey(settings) }
}

/**
 * 自动挑选最快的 API 节点与可用的图片 CDN。
 * 返回值给调用方写回设置，避免在 lib 里直接依赖 store。
 */
export async function autoTune(settings: TmdbSettings): Promise<{ api?: string; image?: string }> {
  const d = await diagnose(settings)
  const api = d.api.find((p) => p.ok && !p.note)
  const image = pickImageBase(d.images)
  return { ...(api ? { api: api.base } : {}), ...(image ? { image } : {}) }
}

/* --------------------------- 结果缓存 --------------------------- */

/**
 * 内置 Key 是跟大家共用的，额度有限：同样的请求 5 分钟内直接走缓存，
 * 既省额度也让页面来回切换时更快。
 */
const CACHE_TTL = 5 * 60 * 1000
const CACHE_MAX = 120
const resultCache = new Map<string, { at: number; data: unknown }>()

async function cached<T>(key: string, producer: () => Promise<T>): Promise<T> {
  const hit = resultCache.get(key)
  if (hit && Date.now() - hit.at < CACHE_TTL) return hit.data as T
  const data = await producer()
  if (resultCache.size >= CACHE_MAX) {
    const oldest = resultCache.keys().next().value
    if (oldest) resultCache.delete(oldest)
  }
  resultCache.set(key, { at: Date.now(), data })
  return data
}

/** 换了 Key 或节点后清空缓存 */
export function clearResultCache(): void {
  resultCache.clear()
  workingBase = null
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
  const cacheKey = `search|${key}|${kind}|${adult}|${q}`
  const data = await cached(cacheKey, () =>
    requestPath<{ results: Array<Record<string, unknown>> }>(
      settings,
      `/search/${endpoint}?api_key=${key}&language=${lang}&query=${q}&include_adult=${adult}`
    )
  )

  let hits = (data.results ?? []).map((r) => normalize(r, kind === 'tv' ? 'tv' : 'movie', imageBase))

  if (kind === 'all') {
    try {
      const tv = await cached(`${cacheKey}|tv`, () =>
        requestPath<{ results: Array<Record<string, unknown>> }>(
          settings,
          `/search/tv?api_key=${key}&language=${lang}&query=${q}&include_adult=${adult}`
        )
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
  const data = await cached(`chart|${key}|${path}`, () =>
    requestPath<{ results: Array<Record<string, unknown>> }>(
      settings,
      `/${path}?api_key=${key}&language=zh-CN&page=1`
    )
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
  const data = await cached(`detail|${key}|${kind}|${tmdbId}`, () =>
    requestPath<Record<string, any>>(
      settings,
      `/${kind === 'tv' ? 'tv' : 'movie'}/${tmdbId}?api_key=${key}&language=zh-CN&append_to_response=credits`
    )
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
