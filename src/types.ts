export type MediaKind = 'movie' | 'tv'
export type WatchStatus = 'wish' | 'watching' | 'done' | 'dropped'
export type SourceKind = 'tmdb' | 'manual'

/** 剧集观看进度 */
export interface EpisodeProgress {
  season: number
  episode: number
  totalSeasons?: number
  /** 每季总集数，key 为季序号 */
  episodesInSeason?: Record<number, number>
  /** 总集数（用于统计） */
  watchedEpisodes?: number
}

export interface TitleItem {
  id: string
  kind: MediaKind
  title: string
  originalTitle?: string
  year?: string
  overview?: string
  /** TMDB 远程海报地址（作为离线 blob 丢失时的兜底） */
  posterRemote?: string
  backdrop?: string
  genres?: string[]
  country?: string[]
  /** 电影片长（分钟） */
  runtime?: number
  /** 剧集单集片长（分钟） */
  episodeRuntime?: number
  director?: string
  cast?: string[]
  tmdbId?: number
  tmdbScore?: number
  source: SourceKind
  /** 是否有本地自定义/缓存封面 */
  hasLocalPoster?: boolean

  tags: string[]
  status: WatchStatus
  /** 用户评分 0~10（UI 为 5 星，半星计） */
  rating?: number
  review?: string
  watchedAt?: string
  releasedAt?: string
  progress?: EpisodeProgress
  createdAt: string
  updatedAt: string
}

/** 豆瓣式片单合集 */
export interface Collection {
  id: string
  title: string
  note?: string
  /** 归属区域；隐私区的片单不参与云同步 */
  zone: 'library' | 'vault'
  /** 成员影片 id，数组顺序即片单内顺序 */
  itemIds: string[]
  /** 指定以哪部影片的海报作为封面，缺省自动取第一部 */
  coverTitleId?: string
  /** 是否有自定义上传的封面 */
  hasLocalCover?: boolean
  createdAt: string
  updatedAt: string
}

export const STATUS_LABEL: Record<WatchStatus, string> = {
  wish: '想看',
  watching: '在看',
  done: '看过',
  dropped: '弃坑'
}

export const STATUS_ORDER: WatchStatus[] = ['wish', 'watching', 'done', 'dropped']

export const KIND_LABEL: Record<MediaKind, string> = {
  movie: '电影',
  tv: '剧集'
}

export function newId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID()
  }
  return Math.random().toString(36).slice(2) + Date.now().toString(36)
}
