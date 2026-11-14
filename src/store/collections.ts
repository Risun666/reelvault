import { create } from 'zustand'
import {
  listCollections,
  putCollection,
  removeCollection
} from '../lib/db'
import type { Collection, TitleItem } from '../types'
import { newId } from '../types'

interface CollectionState {
  items: Collection[]
  ready: boolean
  refresh: () => Promise<void>
  /** 仅载入公开区域的片单（未解锁时调用） */
  refreshPublic: () => Promise<void>
  create: (title: string, zone: 'library' | 'vault', note?: string) => Promise<Collection>
  save: (item: Collection) => Promise<void>
  remove: (id: string) => Promise<void>
  toggleItem: (collectionId: string, titleId: string) => Promise<void>
  setOrder: (collectionId: string, itemIds: string[]) => Promise<void>
  /** 清掉某影片在片单里的引用；传 zone 则只处理该区域，绝不跨区改动 */
  removeTitleEverywhere: (titleId: string, zone?: 'library' | 'vault') => Promise<void>
  clearMemory: () => void
}

export const useCollections = create<CollectionState>((set, get) => ({
  items: [],
  ready: false,

  async refresh() {
    const items = await listCollections()
    set({ items, ready: true })
  },

  async refreshPublic() {
    const items = await listCollections()
    set({ items: items.filter((c) => c.zone !== 'vault'), ready: true })
  },

  async create(title, zone, note) {
    const now = new Date().toISOString()
    const item: Collection = {
      id: newId(),
      title,
      note,
      zone,
      itemIds: [],
      createdAt: now,
      updatedAt: now
    }
    await putCollection(item)
    set({ items: [item, ...get().items] })
    return item
  },

  async save(item) {
    const next: Collection = { ...item, updatedAt: new Date().toISOString() }
    await putCollection(next)
    set({ items: get().items.map((i) => (i.id === next.id ? next : i)) })
  },

  async remove(id) {
    await removeCollection(id)
    set({ items: get().items.filter((i) => i.id !== id) })
  },

  async toggleItem(collectionId, titleId) {
    const current = get().items.find((i) => i.id === collectionId)
    if (!current) return
    const has = current.itemIds.includes(titleId)
    await get().setOrder(
      collectionId,
      has ? current.itemIds.filter((t) => t !== titleId) : [...current.itemIds, titleId]
    )
  },

  async setOrder(collectionId, itemIds) {
    const current = get().items.find((i) => i.id === collectionId)
    if (!current) return
    await get().save({ ...current, itemIds })
  },

  async removeTitleEverywhere(titleId, zone) {
    // 直接从数据库读取：启动时内存里只有公开区片单，未解锁时隐私区片单
    // 并不在内存中，只看内存会留下悬空引用。指定 zone 时只改该区域的片单。
    const all = await listCollections()
    const touched = all.filter(
      (c) => (c.itemIds ?? []).includes(titleId) && (!zone || c.zone === zone)
    )
    const now = new Date().toISOString()
    for (const c of touched) {
      const next: Collection = {
        ...c,
        itemIds: c.itemIds.filter((t) => t !== titleId),
        updatedAt: now
      }
      await putCollection(next)
      // 只同步内存里已经加载过的片单，不把隐私区数据带进内存
      if (get().items.some((i) => i.id === c.id)) {
        set({ items: get().items.map((i) => (i.id === c.id ? next : i)) })
      }
    }
  },

  clearMemory() {
    set({ items: [], ready: false })
  }
}))

/** 计算片单的封面：指定封面 > 自定义上传 > 第一部影片海报 */
export function pickCoverTitle(collection: Collection, titles: TitleItem[]): TitleItem | undefined {
  if (collection.coverTitleId) {
    const picked = titles.find((t) => t.id === collection.coverTitleId)
    if (picked) return picked
  }
  for (const id of collection.itemIds) {
    const hit = titles.find((t) => t.id === id)
    if (hit) return hit
  }
  return undefined
}

export function membershipOf(collections: Collection[], zone: 'library' | 'vault', titleId: string) {
  return collections.filter((c) => c.zone === zone && (c.itemIds ?? []).includes(titleId))
}
