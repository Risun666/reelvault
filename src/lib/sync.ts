import { cloud } from './cloud'
import {
  getMeta,
  listCollections,
  listTitles,
  putCollection,
  putPoster,
  putTitles,
  removeCollection,
  removeTitle,
  setMeta,
  getPosterBlob
} from './db'
import type { Collection, TitleItem } from '../types'

const LAST_SYNC_KEY = 'sync.lastAt'
const POSTER_SYNC_KEY = 'sync.posters'
const TOMBSTONE_KEY = 'sync.tombstones'

export interface SyncResult {
  pushed: number
  pulled: number
  deleted: number
  postersUp: number
  postersDown: number
  collectionsUp: number
  collectionsDown: number
  error?: string
}

async function requireUser() {
  const { data: session, error } = await cloud.auth.getSession()
  if (error || !session?.user) throw new Error('尚未登录')
  return session.user
}

/* ------------------------------- 影片 ------------------------------- */

async function pushTitles(local: TitleItem[], lastSync: string): Promise<number> {
  const dirty = local.filter((i) => !lastSync || i.updatedAt > lastSync)
  if (dirty.length === 0) return 0
  const rows = dirty.map((item) => ({
    id: item.id,
    payload: item as unknown as Record<string, unknown>,
    updated_at: item.updatedAt,
    deleted: false
  }))
  const { error } = await cloud.database.from('titles').upsert(rows, { onConflict: 'id' }).select()
  if (error) throw new Error(error.message)
  return dirty.length
}

async function pushTombstones(): Promise<number> {
  const tombstones = await getMeta<string[]>('library', TOMBSTONE_KEY, [])
  if (tombstones.length === 0) return 0
  const rows = tombstones.map((id) => ({
    id,
    payload: {},
    updated_at: new Date().toISOString(),
    deleted: true
  }))
  const { error } = await cloud.database.from('titles').upsert(rows, { onConflict: 'id' }).select()
  if (error) throw new Error(error.message)
  await setMeta('library', TOMBSTONE_KEY, [])
  return tombstones.length
}

async function pullTitles(local: TitleItem[]): Promise<{ pulled: number; deleted: number }> {
  const { data, error } = await cloud.database
    .from('titles')
    .select('id, payload, updated_at, deleted')
    .limit(1000)
  if (error) throw new Error(error.message)

  const rows = (data ?? []) as Array<{
    id: string
    payload: TitleItem
    updated_at: string
    deleted: boolean
  }>
  const localMap = new Map(local.map((i) => [i.id, i]))
  const incoming: TitleItem[] = []
  const toDelete: string[] = []
  let deleted = 0

  for (const row of rows) {
    const current = localMap.get(row.id)
    if (row.deleted) {
      if (current) toDelete.push(row.id)
      continue
    }
    if (!current) {
      incoming.push({ ...(row.payload as TitleItem), id: row.id })
      continue
    }
    // 远端更新则覆盖本地
    if (row.updated_at > current.updatedAt) {
      incoming.push({ ...(row.payload as TitleItem), id: row.id })
    }
  }

  if (incoming.length > 0) await putTitles('library', incoming)
  for (const id of toDelete) {
    await removeTitle('library', id)
    deleted++
  }
  return { pulled: incoming.length, deleted }
}

/* ------------------------------- 封面 ------------------------------- */

async function syncPosters(local: TitleItem[]): Promise<{ up: number; down: number }> {
  const user = await requireUser()
  const record = await getMeta<Record<string, string>>('library', POSTER_SYNC_KEY, {})
  let up = 0
  let down = 0
  const next = { ...record }

  for (const item of local) {
    const path = cloud.storage.userPath(user.id, `posters/${item.id}.jpg`)
    if (!item.hasLocalPoster) continue
    const changed = record[item.id] !== item.updatedAt
    if (!changed) continue
    const blob = await getPosterBlob('library', item.id)
    if (!blob) continue
    try {
      const res = await cloud.storage.upload(path, blob, { contentType: 'image/jpeg', upsert: true })
      if (res.error) continue
      next[item.id] = item.updatedAt
      up++
    } catch {
      /* 单个封面失败不影响整轮同步 */
    }
  }

  // 只在本地没有封面、云端声明有的情况下补齐
  for (const item of local) {
    if (!item.hasLocalPoster) continue
    const existing = await getPosterBlob('library', item.id)
    if (existing) continue
    const path = cloud.storage.userPath(user.id, `posters/${item.id}.jpg`)
    try {
      const res = await cloud.storage.download(path)
      if (res.error || !res.data) continue
      if (typeof (res.data as Blob).arrayBuffer !== 'function') continue
      await putPoster('library', item.id, res.data as Blob)
      next[item.id] = item.updatedAt
      down++
    } catch {
      /* 云端缺失则跳过 */
    }
  }

  await setMeta('library', POSTER_SYNC_KEY, next)
  return { up, down }
}

/* ------------------------------- 片单 ------------------------------- */

async function syncCollections(lastSync: string): Promise<{ up: number; down: number }> {
  const local = (await listCollections()).filter((c) => c.zone !== 'vault')
  const dirty = local.filter((c) => !lastSync || c.updatedAt > lastSync)

  let up = 0
  if (dirty.length > 0) {
    const rows = dirty.map((c) => ({
      id: c.id,
      title: c.title,
      note: c.note ?? null,
      cover: JSON.stringify({ coverTitleId: c.coverTitleId, hasLocalCover: c.hasLocalCover }),
      item_ids: c.itemIds,
      updated_at: c.updatedAt,
      deleted: false
    }))
    const { error } = await cloud.database
      .from('collections')
      .upsert(rows, { onConflict: 'id' })
      .select()
    if (error) throw new Error(error.message)
    up = dirty.length
  }

  const { data, error } = await cloud.database
    .from('collections')
    .select('id, title, note, cover, item_ids, updated_at, deleted')
    .limit(500)
  if (error) throw new Error(error.message)

  const rows = (data ?? []) as Array<{
    id: string
    title: string
    note: string | null
    cover: string | null
    item_ids: string[]
    updated_at: string
    deleted: boolean
  }>

  const localMap = new Map(local.map((c) => [c.id, c]))
  let down = 0
  for (const row of rows) {
    const current = localMap.get(row.id)
    if (row.deleted) {
      if (current) {
        await removeCollection(row.id)
        down++
      }
      continue
    }
    if (current && row.updated_at <= current.updatedAt) continue
    let coverTitleId: string | undefined
    let hasLocalCover: boolean | undefined
    try {
      const parsed = row.cover ? JSON.parse(row.cover) : null
      coverTitleId = parsed?.coverTitleId ?? undefined
      hasLocalCover = parsed?.hasLocalCover ?? undefined
    } catch {
      /* ignore */
    }
    const merged: Collection = {
      id: row.id,
      title: row.title,
      note: row.note ?? undefined,
      zone: 'library',
      itemIds: row.item_ids ?? [],
      coverTitleId,
      hasLocalCover,
      createdAt: current?.createdAt ?? row.updated_at,
      updatedAt: row.updated_at
    }
    await putCollection(merged)
    down++
  }
  return { up, down }
}

/* ------------------------------- 入口 ------------------------------- */

export async function runSync(): Promise<SyncResult> {
  const result: SyncResult = {
    pushed: 0,
    pulled: 0,
    deleted: 0,
    postersUp: 0,
    postersDown: 0,
    collectionsUp: 0,
    collectionsDown: 0
  }
  await requireUser()

  const local = await listTitles('library')
  const lastSync = await getMeta<string>('library', LAST_SYNC_KEY, '')
  const now = new Date().toISOString()

  const pushed = await pushTitles(local, lastSync)
  await pushTombstones()
  const pulled = await pullTitles(local)

  result.pushed = pushed
  result.pulled = pulled.pulled
  result.deleted = pulled.deleted

  const { data: after } = await cloud.auth.getSession()
  if (after?.user) {
    const posters = await syncPosters(await listTitles('library'))
    result.postersUp = posters.up
    result.postersDown = posters.down
  }

  const cols = await syncCollections(lastSync)
  result.collectionsUp = cols.up
  result.collectionsDown = cols.down

  await setMeta('library', LAST_SYNC_KEY, now)
  return result
}

/** 本地删除时记录墓碑，确保下次同步能把这个删除推到云端 */
export async function markDeleted(id: string) {
  const tombstones = await getMeta<string[]>('library', TOMBSTONE_KEY, [])
  if (!tombstones.includes(id)) {
    tombstones.push(id)
    await setMeta('library', TOMBSTONE_KEY, tombstones)
  }
}

export async function lastSyncAt(): Promise<string> {
  return getMeta<string>('library', LAST_SYNC_KEY, '')
}

export async function resetSyncState() {
  await setMeta('library', LAST_SYNC_KEY, '')
  await setMeta('library', POSTER_SYNC_KEY, {})
  await setMeta('library', TOMBSTONE_KEY, [])
}

/** 删除云端全部影片与片单（危险操作，需要用户二次确认） */
export async function wipeCloud(): Promise<number> {
  await requireUser()
  let removed = 0
  const rows = await cloud.database.from('titles').select('id').limit(1000)
  const ids = ((rows.data ?? []) as Array<{ id: string }>).map((r) => r.id)
  if (ids.length > 0) {
    const { data } = await cloud.database.from('titles').delete().in('id', ids).select()
    removed += Array.isArray(data) ? data.length : 0
  }
  const cols = await cloud.database.from('collections').select('id').limit(500)
  const colIds = ((cols.data ?? []) as Array<{ id: string }>).map((r) => r.id)
  if (colIds.length > 0) {
    await cloud.database.from('collections').delete().in('id', colIds).select()
  }
  await resetSyncState()
  return removed
}

/** 片单被本地删除时，把云端对应行标记为删除 */
export async function markCollectionDeleted(id: string) {
  try {
    const { data: session } = await cloud.auth.getSession()
    if (!session?.user) return
    await cloud.database
      .from('collections')
      .update({ deleted: true, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
  } catch {
    /* 离线或未登录时忽略，下次同步会补上 */
  }
}
