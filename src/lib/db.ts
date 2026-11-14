import { openDB, type DBSchema, type IDBPDatabase } from 'idb'
import type { Collection, Person, TitleItem } from '../types'

interface RVDB extends DBSchema {
  titles: {
    key: string
    value: TitleItem
    indexes: { 'by-status': string; 'by-kind': string; 'by-updated': string }
  }
  posters: { key: string; value: Blob }
  meta: { key: string; value: unknown }
  collections: {
    key: string
    value: Collection
    indexes: { 'by-updated': string; 'by-zone': string }
  }
  people: {
    key: string
    value: Person
    indexes: { 'by-name': string; 'by-updated': string }
  }
  avatars: { key: string; value: Blob }

  vtitles: {
    key: string
    value: TitleItem
    indexes: { 'by-status': string; 'by-kind': string; 'by-updated': string }
  }
  vposters: { key: string; value: Blob }
  vmeta: { key: string; value: unknown }
  vpeople: {
    key: string
    value: Person
    indexes: { 'by-name': string; 'by-updated': string }
  }
  vavatars: { key: string; value: Blob }
}

const DB_NAME = 'reelvault'
const DB_VERSION = 3

let dbPromise: Promise<IDBPDatabase<RVDB>> | null = null

export function db() {
  if (!dbPromise) {
    dbPromise = openDB<RVDB>(DB_NAME, DB_VERSION, {
      upgrade(database) {
        if (!database.objectStoreNames.contains('titles')) {
          const s = database.createObjectStore('titles', { keyPath: 'id' })
          s.createIndex('by-status', 'status')
          s.createIndex('by-kind', 'kind')
          s.createIndex('by-updated', 'updatedAt')
        }
        if (!database.objectStoreNames.contains('vtitles')) {
          const s = database.createObjectStore('vtitles', { keyPath: 'id' })
          s.createIndex('by-status', 'status')
          s.createIndex('by-kind', 'kind')
          s.createIndex('by-updated', 'updatedAt')
        }
        if (!database.objectStoreNames.contains('posters')) {
          database.createObjectStore('posters')
        }
        if (!database.objectStoreNames.contains('vposters')) {
          database.createObjectStore('vposters')
        }
        if (!database.objectStoreNames.contains('meta')) {
          database.createObjectStore('meta')
        }
        if (!database.objectStoreNames.contains('vmeta')) {
          database.createObjectStore('vmeta')
        }
        if (!database.objectStoreNames.contains('collections')) {
          const s = database.createObjectStore('collections', { keyPath: 'id' })
          s.createIndex('by-updated', 'updatedAt')
          s.createIndex('by-zone', 'zone')
        }
        // 演员：公开区与隐私区各一套，物理隔离
        for (const [store, avatarStore] of [
          ['people', 'avatars'],
          ['vpeople', 'vavatars']
        ] as const) {
          if (!database.objectStoreNames.contains(store)) {
            const s = database.createObjectStore(store, { keyPath: 'id' })
            s.createIndex('by-name', 'name')
            s.createIndex('by-updated', 'updatedAt')
          }
          if (!database.objectStoreNames.contains(avatarStore)) {
            database.createObjectStore(avatarStore)
          }
        }
      }
    })
  }
  return dbPromise
}

/** 两个完全隔离的存储区：公开片库 / 隐私保险箱 */
export type Zone = 'library' | 'vault'

const ZONE_MAP = {
  library: {
    title: 'titles',
    poster: 'posters',
    meta: 'meta',
    person: 'people',
    avatar: 'avatars'
  },
  vault: {
    title: 'vtitles',
    poster: 'vposters',
    meta: 'vmeta',
    person: 'vpeople',
    avatar: 'vavatars'
  }
} as const

export async function listTitles(zone: Zone): Promise<TitleItem[]> {
  const database = await db()
  const rows = await database.getAll(ZONE_MAP[zone].title as 'titles')
  return rows.sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1))
}

export async function getTitle(zone: Zone, id: string): Promise<TitleItem | undefined> {
  const database = await db()
  return database.get(ZONE_MAP[zone].title as 'titles', id)
}

export async function putTitle(zone: Zone, item: TitleItem): Promise<void> {
  const database = await db()
  await database.put(ZONE_MAP[zone].title as 'titles', item)
}

export async function putTitles(zone: Zone, items: TitleItem[]): Promise<void> {
  const database = await db()
  const tx = database.transaction(ZONE_MAP[zone].title as 'titles', 'readwrite')
  await Promise.all(items.map((i) => tx.store.put(i)))
  await tx.done
}

export async function removeTitle(zone: Zone, id: string): Promise<void> {
  const database = await db()
  const store = ZONE_MAP[zone].title as 'titles'
  const tx = database.transaction([store, ZONE_MAP[zone].poster as 'posters'], 'readwrite')
  await tx.objectStore(store).delete(id)
  await tx.objectStore(ZONE_MAP[zone].poster as 'posters').delete(id)
  await tx.done
  releasePosterUrl(id)
}

export async function getMeta<T>(zone: Zone, key: string, fallback: T): Promise<T> {
  const database = await db()
  const v = await database.get(ZONE_MAP[zone].meta as 'meta', key)
  return (v as T) ?? fallback
}

export async function setMeta(zone: Zone, key: string, value: unknown): Promise<void> {
  const database = await db()
  await database.put(ZONE_MAP[zone].meta as 'meta', value, key)
}

/* ----------------------------- 封面图片 ----------------------------- */

const posterUrlCache = new Map<string, string>()

export async function putPoster(zone: Zone, id: string, blob: Blob): Promise<void> {
  const database = await db()
  await database.put(ZONE_MAP[zone].poster as 'posters', blob, id)
  releasePosterUrl(id)
}

export async function getPosterBlob(zone: Zone, id: string): Promise<Blob | undefined> {
  const database = await db()
  return database.get(ZONE_MAP[zone].poster as 'posters', id)
}

export async function removePoster(zone: Zone, id: string): Promise<void> {
  const database = await db()
  await database.delete(ZONE_MAP[zone].poster as 'posters', id)
  releasePosterUrl(id)
}

/** 返回可直接用于 <img src> 的 URL，内部缓存并在替换时回收 */
export async function posterUrl(zone: Zone, id: string): Promise<string | null> {
  const cached = posterUrlCache.get(id)
  if (cached) return cached
  const blob = await getPosterBlob(zone, id)
  if (!blob) return null
  const url = URL.createObjectURL(blob)
  posterUrlCache.set(id, url)
  return url
}

function releasePosterUrl(id: string) {
  const url = posterUrlCache.get(id)
  if (url) {
    URL.revokeObjectURL(url)
    posterUrlCache.delete(id)
  }
}

/* ----------------------------- 片单合集 ----------------------------- */

export async function listCollections(): Promise<Collection[]> {
  const database = await db()
  const rows = await database.getAll('collections')
  return rows.sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1))
}

export async function getCollection(id: string): Promise<Collection | undefined> {
  const database = await db()
  return database.get('collections', id)
}

export async function putCollection(item: Collection): Promise<void> {
  const database = await db()
  await database.put('collections', item)
}

export async function removeCollection(id: string): Promise<void> {
  const current = await getCollection(id)
  const zone = current?.zone ?? 'library'
  const posterKey = collectionCoverKey(id)
  const database = await db()
  await database.delete('collections', id)
  await database.delete(ZONE_MAP[zone].poster as 'posters', posterKey)
  releasePosterUrl(posterKey)
}

/** 片单封面在海报库里的 key */
export function collectionCoverKey(id: string): string {
  return `col:${id}`
}

export async function countZone(zone: Zone): Promise<number> {
  const database = await db()
  return database.count(ZONE_MAP[zone].title as 'titles')
}

export async function clearZone(zone: Zone): Promise<void> {
  const database = await db()
  const t = ZONE_MAP[zone].title as 'titles'
  const p = ZONE_MAP[zone].poster as 'posters'
  const pe = ZONE_MAP[zone].person as 'people'
  const av = ZONE_MAP[zone].avatar as 'avatars'
  const tx = database.transaction([t, p, pe, av], 'readwrite')
  await tx.objectStore(t).clear()
  await tx.objectStore(p).clear()
  await tx.objectStore(pe).clear()
  await tx.objectStore(av).clear()
  await tx.done
  for (const id of [...posterUrlCache.keys()]) releasePosterUrl(id)
  for (const id of [...avatarUrlCache.keys()]) releaseAvatarUrl(id)
}

/* ----------------------------- 演员 ----------------------------- */

export async function listPeople(zone: Zone): Promise<Person[]> {
  const database = await db()
  const rows = await database.getAll(ZONE_MAP[zone].person as 'people')
  return rows.sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1))
}

export async function getPerson(zone: Zone, id: string): Promise<Person | undefined> {
  const database = await db()
  return database.get(ZONE_MAP[zone].person as 'people', id)
}

export async function putPerson(zone: Zone, item: Person): Promise<void> {
  const database = await db()
  await database.put(ZONE_MAP[zone].person as 'people', item)
}

export async function removePerson(zone: Zone, id: string): Promise<void> {
  const database = await db()
  const store = ZONE_MAP[zone].person as 'people'
  const tx = database.transaction([store, ZONE_MAP[zone].avatar as 'avatars'], 'readwrite')
  await tx.objectStore(store).delete(id)
  await tx.objectStore(ZONE_MAP[zone].avatar as 'avatars').delete(id)
  await tx.done
  releaseAvatarUrl(id)
}

export async function putAvatar(zone: Zone, id: string, blob: Blob): Promise<void> {
  const database = await db()
  await database.put(ZONE_MAP[zone].avatar as 'avatars', blob, id)
  releaseAvatarUrl(id)
}

export async function getAvatarBlob(zone: Zone, id: string): Promise<Blob | undefined> {
  const database = await db()
  return database.get(ZONE_MAP[zone].avatar as 'avatars', id)
}

export async function removeAvatar(zone: Zone, id: string): Promise<void> {
  const database = await db()
  await database.delete(ZONE_MAP[zone].avatar as 'avatars', id)
  releaseAvatarUrl(id)
}

const avatarUrlCache = new Map<string, string>()

/** 头像的可直接展示 URL，内部缓存，替换时回收 */
export async function avatarUrl(zone: Zone, id: string): Promise<string | null> {
  const key = `av:${zone}:${id}`
  const cached = avatarUrlCache.get(key)
  if (cached) return cached
  const blob = await getAvatarBlob(zone, id)
  if (!blob) return null
  const url = URL.createObjectURL(blob)
  avatarUrlCache.set(key, url)
  return url
}

function releaseAvatarUrl(rawId: string) {
  // 入参可能是 `av:zone:id` 形式，也可能是纯 id
  if (rawId.startsWith('av:')) {
    const url = avatarUrlCache.get(rawId)
    if (url) {
      URL.revokeObjectURL(url)
      avatarUrlCache.delete(rawId)
    }
    return
  }
  for (const zone of ['library', 'vault'] as const) {
    const key = `av:${zone}:${rawId}`
    const url = avatarUrlCache.get(key)
    if (url) {
      URL.revokeObjectURL(url)
      avatarUrlCache.delete(key)
    }
  }
}

/** 按名字查找演员（同区去重用） */
export async function findPersonByName(zone: Zone, name: string): Promise<Person | undefined> {
  const target = name.trim().toLowerCase()
  if (!target) return undefined
  const rows = await listPeople(zone)
  return rows.find((p) => p.name.trim().toLowerCase() === target)
}
