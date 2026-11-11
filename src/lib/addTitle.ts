import { fetchRemoteImage } from './image'
import { fetchDetail, type TmdbSearchHit } from './tmdb'
import type { SettingsShape } from '../store/settings'
import type { MediaKind, TitleItem, WatchStatus } from '../types'
import { newId } from '../types'
import { getPosterBlob, type Zone } from './db'
import { zoneStore } from '../store/zone'
import { useCollections } from '../store/collections'

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
  const { item: detail, posterRemote, backdrop, stills } = await fetchDetail(settings, hit.tmdbId, hit.kind)
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
    stills: stills.length ? stills : undefined,
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

/** 把一部影片（含其本地海报）复制进另一个区域，常用于「公开片库 → 隐私保险箱」 */
export async function duplicateToZone(src: TitleItem, dstZone: Zone, posterBlob?: Blob | null): Promise<TitleItem> {
  const now = new Date().toISOString()
  const item: TitleItem = { ...src, id: newId(), createdAt: now, updatedAt: now }
  await zoneStore(dstZone).getState().upsert(item, posterBlob ?? null)
  return item
}

/**
 * 把一部影片「移动」到另一个区域：以新 id 写入目标区（含本地海报、剧照等字段），
 * 再清掉原区里的片单引用、演员关联与记录/封面。两区数据始终物理隔离，不跨区读取。
 */
export async function moveToZone(
  srcZone: Zone,
  dstZone: Zone,
  src: TitleItem,
  posterBlob?: Blob | null
): Promise<TitleItem> {
  const poster = posterBlob ?? (src.hasLocalPoster ? (await getPosterBlob(srcZone, src.id)) ?? null : null)
  const moved = await duplicateToZone(src, dstZone, poster)
  await useCollections.getState().removeTitleEverywhere(src.id, srcZone)
  await zoneStore(srcZone).getState().remove(src.id)
  return moved
}
