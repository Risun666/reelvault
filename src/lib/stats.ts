import type { EpisodeProgress, TitleItem, WatchStatus } from '../types'

/** 推算剧集累计已看集数 */
export function watchedEpisodesOf(p?: EpisodeProgress): number {
  if (!p) return 0
  let n = 0
  if (p.episodesInSeason) {
    for (const [s, count] of Object.entries(p.episodesInSeason)) {
      const seasonNo = Number(s)
      if (seasonNo < p.season) n += count
    }
  }
  n += p.episode
  // 手动填写的总集数优先取较大值
  return Math.max(n, p.watchedEpisodes ?? 0)
}

export function totalEpisodesOf(p?: EpisodeProgress): number {
  if (!p?.episodesInSeason) return 0
  return Object.values(p.episodesInSeason).reduce((a, b) => a + b, 0)
}

/** 单部影片的观看时长（分钟） */
export function minutesOf(item: TitleItem): number {
  if (item.status === 'wish') return 0
  if (item.kind === 'movie') {
    return item.status === 'done' ? item.runtime ?? 0 : Math.round((item.runtime ?? 0) * 0.5)
  }
  const watched = watchedEpisodesOf(item.progress)
  return watched * (item.episodeRuntime ?? 30)
}

export function formatMinutes(min: number): string {
  if (min <= 0) return '—'
  if (min < 60) return `${min} 分钟`
  const h = Math.floor(min / 60)
  const m = min % 60
  return m ? `${h} 小时 ${m} 分` : `${h} 小时`
}

export interface StatsBundle {
  total: number
  movies: number
  tvs: number
  byStatus: Record<WatchStatus, number>
  minutes: number
  episodes: number
  rated: number
  avgRating: number
  ratingDist: { stars: number; count: number }[]
  topGenres: Array<[string, number]>
  topTags: Array<[string, number]>
  monthly: Array<{ month: string; count: number }>
}

export function computeStats(items: TitleItem[]): StatsBundle {
  const byStatus = { wish: 0, watching: 0, done: 0, dropped: 0 } as Record<WatchStatus, number>
  const genreCount = new Map<string, number>()
  const tagCount = new Map<string, number>()
  const monthCount = new Map<string, number>()
  const dist = [1, 2, 3, 4, 5].map((stars) => ({ stars, count: 0 }))
  let minutes = 0
  let episodes = 0
  let rated = 0
  let ratingSum = 0

  for (const it of items) {
    byStatus[it.status]++
    if (it.kind === 'tv') episodes += watchedEpisodesOf(it.progress)
    minutes += minutesOf(it)
    if (it.rating) {
      rated++
      ratingSum += it.rating
      const stars = Math.round(it.rating / 2)
      const slot = dist.find((d) => d.stars === stars)
      if (slot) slot.count++
    }
    it.genres?.forEach((g) => genreCount.set(g, (genreCount.get(g) ?? 0) + 1))
    it.tags?.forEach((t) => tagCount.set(t, (tagCount.get(t) ?? 0) + 1))
    const month = (it.watchedAt || it.updatedAt).slice(0, 7)
    monthCount.set(month, (monthCount.get(month) ?? 0) + 1)
  }

  return {
    total: items.length,
    movies: items.filter((i) => i.kind === 'movie').length,
    tvs: items.filter((i) => i.kind === 'tv').length,
    byStatus,
    minutes,
    episodes,
    rated,
    avgRating: rated ? ratingSum / rated / 2 : 0,
    ratingDist: dist,
    topGenres: [...genreCount.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8),
    topTags: [...tagCount.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10),
    monthly: [...monthCount.entries()]
      .sort((a, b) => (a[0] < b[0] ? -1 : 1))
      .slice(-12)
      .map(([month, count]) => ({ month, count }))
  }
}
