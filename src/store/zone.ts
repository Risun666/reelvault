import { create, type StoreApi, type UseBoundStore } from 'zustand'
import { listTitles, putPoster, putTitle, removePoster, removeTitle, type Zone } from '../lib/db'
import type { TitleItem } from '../types'
import { peopleStore } from './people'

export interface ZoneState {
  zone: Zone
  items: TitleItem[]
  ready: boolean
  refresh: () => Promise<void>
  upsert: (item: TitleItem, poster?: Blob | null) => Promise<void>
  patch: (id: string, patch: Partial<TitleItem>) => Promise<void>
  remove: (id: string) => Promise<void>
  clearMemory: () => void
}

export type ZoneStore = UseBoundStore<StoreApi<ZoneState>>

function createZoneStore(zone: Zone): ZoneStore {
  return create<ZoneState>((set, get) => ({
    zone,
    items: [],
    ready: false,
    async refresh() {
      const items = await listTitles(zone)
      set({ items, ready: true })
    },
    async upsert(item, poster) {
      const next: TitleItem = { ...item, updatedAt: new Date().toISOString() }
      await putTitle(zone, next)
      if (poster) {
        await putPoster(zone, next.id, poster)
        next.hasLocalPoster = true
      } else if (poster === null) {
        await removePoster(zone, next.id)
        next.hasLocalPoster = false
      }
      const items = get().items.filter((i) => i.id !== next.id)
      set({ items: [next, ...items], ready: true })
      void peopleStore(zone).getState().syncFromTitle(next)
    },
    async patch(id, patch) {
      const current = get().items.find((i) => i.id === id) ?? (await listTitles(zone)).find((i) => i.id === id)
      if (!current) return
      const next: TitleItem = { ...current, ...patch, id, updatedAt: new Date().toISOString() }
      await putTitle(zone, next)
      const items = get().items.some((i) => i.id === id)
        ? get().items.map((i) => (i.id === id ? next : i))
        : [next, ...get().items]
      set({ items })
      void peopleStore(zone).getState().syncFromTitle(next)
    },
    async remove(id) {
      await removeTitle(zone, id)
      set({ items: get().items.filter((i) => i.id !== id) })
      void peopleStore(zone).getState().dropTitle(id)
    },
    clearMemory() {
      set({ items: [], ready: false })
    }
  }))
}

export const libraryStore = createZoneStore('library')
export const vaultStore = createZoneStore('vault')

/** 按区域取 store（普通函数，非 hook） */
export function zoneStore(zone: Zone): ZoneStore {
  return zone === 'vault' ? vaultStore : libraryStore
}

export const useLibraryStore = libraryStore
export const useVaultStore = vaultStore
