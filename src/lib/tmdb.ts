import type { MediaKind, TitleItem } from '../types'

export const DEFAULT_API_BASE = 'https://api.themoviedb.org/3'
export const DEFAULT_IMAGE_BASE = 'https://image.tmdb.org/t/p'

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

function get(settings: { apiKey: string; apiBase?: string; imageBase?: string }) {
  if (!settings.apiKey) throw new TmdbError('未配置 TMDB API Key')
  const base = (settings.apiBase || DEFAULT_API_BASE).replace(/\/$/, '')
  const imageBase = (settings.imageBase || DEFAULT_IMAGE_BASE).replace(/\/$/, '')
  return { base, imageBase, key: settings.apiKey.trim() }
}

async function request<T>(url: string): Promise<T> {
  const res = await fetch(url)
  if (res.status === 401) throw new TmdbError('API Key 无效，请在设置中检查')
  if (res.status === 429) throw new TmdbError('请求过于频繁，请稍后再试')
  if (!res.ok) throw new TmdbError(`TMDB 请求失败（${res.status}）`)
  return (await res.json()) as T
}

export async function searchTitles(
  settings: { apiKey: string; apiBase?: string; imageBase?: string; includeAdult?: boolean },
  query: string,
  kind: MediaKind | 'all'
): Promise<TmdbSearchHit[]> {
  const { base, imageBase, key } = get(settings)
  const lang = 'zh-CN'
  const endpoint = kind === 'tv' ? 'tv' : 'movie'
  const q = encodeURIComponent(query.trim())
  const adult = settings.includeAdult === false ? 'false' : 'true'
  const data = await request<{
    results: Array<Record<string, unknown>>
  }>(`${base}/search/${endpoint}?api_key=${key}&language=${lang}&query=${q}&include_adult=${adult}`)

  let hits = (data.results ?? []).map((r) => normalize(r, kind === 'tv' ? 'tv' : 'movie', imageBase))

  if (kind === 'all') {
    try {
      const tv = await request<{ results: Array<Record<string, unknown>> }>(
        `${base}/search/tv?api_key=${key}&language=${lang}&query=${q}&include_adult=${adult}`
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
  settings: { apiKey: string; apiBase?: string; imageBase?: string; includeAdult?: boolean },
  kind: MediaKind,
  mode: 'trending' | 'top'
): Promise<TmdbSearchHit[]> {
  const { base, imageBase, key } = get(settings)
  const path = mode === 'trending' ? `trending/${kind}/week` : `${kind}/top_rated`
  const data = await request<{ results: Array<Record<string, unknown>> }>(
    `${base}/${path}?api_key=${key}&language=zh-CN&page=1`
  )
  return (data.results ?? []).slice(0, 20).map((r) => normalize(r, kind, imageBase))
}

/** 拉取完整详情，用于入库提升信息密度 */
export async function fetchDetail(
  settings: { apiKey: string; apiBase?: string; imageBase?: string },
  tmdbId: number,
  kind: MediaKind
): Promise<{
  item: Partial<TitleItem>
  posterRemote: string | null
  backdrop: string | null
}> {
  const { base, imageBase, key } = get(settings)
  const data = await request<Record<string, any>>(
    `${base}/${kind === 'tv' ? 'tv' : 'movie'}/${tmdbId}?api_key=${key}&language=zh-CN&append_to_response=credits`
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
