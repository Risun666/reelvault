import { fetchRemoteImage } from './image'
import { fetchDetail, type TmdbSearchHit } from './tmdb'
import type { SettingsShape } from '../store/settings'
import type { MediaKind, TitleItem, WatchStatus } from '../types'
import { newId } from '../types'
import type { Zone } from './db'
import { zoneStore } from '../store/zone'

export function blankTitle(kind: MediaKind): TitleItem {
  const now = new Date().toISOString()
  return {
    id: newId(),
    kind,
    title: '',
    overview: '',
    tags: [],
    status: 'wish',
    source: 'manual',
    createdAt: now,
    updatedAt: now,
    ...(kind === 'tv'
      ? { progress: { season: 1, episode: 0, totalSeasons: 1, episodesInSeason: {}, watchedEpisodes: 0 } }
      : {})
  }
}

/** 从 TMDB 拉取详情并缓存海报，返回可直接入库的对象 */
export async function fetchTitleCandidate(
  settings: Pick<SettingsShape, 'apiKey' | 'apiBase' | 'imageBase'>,
  hit: Pick<TmdbSearchHit, 'tmdbId' | 'kind'>
): Promise<{ item: TitleItem; posterBlob: Blob | null }> {
  const { item: detail, posterRemote, backdrop } = await fetchDetail(settings, hit.tmdbId, hit.kind)
  const now = new Date().toISOString()
  const item: TitleItem = {
    id: newId(),
    kind: hit.kind,
    title: detail.title || '',
    originalTitle: detail.originalTitle,
    year: detail.year,
    releasedAt: detail.releasedAt,
    overview: detail.overview,
    genres: detail.genres ?? [],
    country: detail.country,
    runtime: detail.runtime,
    episodeRuntime: detail.episodeRuntime,
    director: detail.director,
    cast: detail.cast ?? [],
    tmdbId: hit.tmdbId,
    tmdbScore: detail.tmdbScore,
    posterRemote: posterRemote ?? undefined,
    backdrop: backdrop ?? undefined,
    progress: detail.progress,
    source: 'tmdb',
    tags: [],
    status: 'wish',
    hasLocalPoster: Boolean(posterRemote),
    createdAt: now,
    updatedAt: now
  }
  const posterBlob = await fetchRemoteImage(posterRemote ?? undefined)
  return { item, posterBlob }
}

export async function upsertFromTmdb(
  zone: Zone,
  settings: Pick<SettingsShape, 'apiKey' | 'apiBase' | 'imageBase'> & { cacheRemotePoster?: boolean },
  hit: Pick<TmdbSearchHit, 'tmdbId' | 'kind'>,
  status: WatchStatus = 'wish'
): Promise<TitleItem> {
  const { item, posterBlob } = await fetchTitleCandidate(settings, hit)
  item.status = status
  const store = zoneStore(zone).getState()
  const poster = settings.cacheRemotePoster === false ? null : posterBlob
  await store.upsert(item, poster)
  return item
}
