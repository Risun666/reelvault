import { create, type StoreApi, type UseBoundStore } from 'zustand'
import {
  listPeople,
  putPerson,
  putAvatar,
  removeAvatar,
  removePerson,
  type Zone
} from '../lib/db'
import type { Person, TitleItem } from '../types'
import { newId } from '../types'

export interface PeopleState {
  zone: Zone
  items: Person[]
  ready: boolean
  refresh: () => Promise<void>
  create: (input: { name: string; note?: string; birthday?: string; tags?: string[] }) => Promise<Person>
  save: (item: Person, avatar?: Blob | null) => Promise<void>
  remove: (id: string) => Promise<void>
  /** 从片库影片的演员表自动生成（只增不减，已有条目保留原样） */
  generate: (titles: TitleItem[]) => Promise<{ created: number; linked: number }>
  /** 影片保存后同步：保证演员表里出现它的每个演员 */
  syncFromTitle: (title: TitleItem) => Promise<void>
  /** 影片删除后把所有演员条目里的引用摘掉 */
  dropTitle: (titleId: string) => Promise<void>
  clearMemory: () => void
}

export type PeopleStore = UseBoundStore<StoreApi<PeopleState>>

function createPeopleStore(zone: Zone): PeopleStore {
  return create<PeopleState>((set, get) => ({
    zone,
    items: [],
    ready: false,

    async refresh() {
      const items = await listPeople(zone)
      set({ items, ready: true })
    },

    async create(input) {
      const now = new Date().toISOString()
      const item: Person = {
        id: newId(),
        name: input.name.trim(),
        note: input.note?.trim() || undefined,
        birthday: input.birthday?.trim() || undefined,
        tags: input.tags ?? [],
        titleIds: [],
        source: 'manual',
        createdAt: now,
        updatedAt: now
      }
      await putPerson(zone, item)
      set({ items: [item, ...get().items], ready: true })
      return item
    },

    async save(item, avatar) {
      const next: Person = { ...item, updatedAt: new Date().toISOString() }
      await putPerson(zone, next)
      if (avatar) {
        await putAvatar(zone, next.id, avatar)
        next.hasLocalAvatar = true
      } else if (avatar === null) {
        await removeAvatar(zone, next.id)
        next.hasLocalAvatar = false
      }
      set({ items: get().items.map((i) => (i.id === next.id ? next : i)) })
    },

    async remove(id) {
      await removePerson(zone, id)
      set({ items: get().items.filter((i) => i.id !== id) })
    },

    async generate(titles) {
      // 名字（忽略大小写）→ 原始写法 + 关联影片
      const byName = new Map<string, { name: string; ids: Set<string> }>()
      for (const title of titles) {
        for (const raw of title.cast ?? []) {
          const name = raw.trim()
          if (!name) continue
          const key = name.toLowerCase()
          const entry = byName.get(key) ?? { name, ids: new Set<string>() }
          entry.ids.add(title.id)
          byName.set(key, entry)
        }
      }

      const current = get().items
      const existing = new Map(current.map((p) => [p.name.trim().toLowerCase(), p]))
      const now = new Date().toISOString()
      let created = 0
      let linked = 0
      const nextItems = [...current]

      for (const [key, entry] of byName) {
        const hit = existing.get(key)
        const ids = [...entry.ids]
        if (hit) {
          const merged = [...new Set([...hit.titleIds, ...ids])]
          if (merged.length === hit.titleIds.length) continue
          const updated: Person = { ...hit, titleIds: merged, updatedAt: now }
          await putPerson(zone, updated)
          nextItems[nextItems.findIndex((i) => i.id === hit.id)] = updated
          linked += 1
          continue
        }
        const person: Person = {
          id: newId(),
          name: entry.name,
          titleIds: ids,
          source: 'auto',
          createdAt: now,
          updatedAt: now
        }
        await putPerson(zone, person)
        nextItems.unshift(person)
        existing.set(key, person)
        created += 1
      }

      set({ items: nextItems, ready: true })
      return { created, linked }
    },

    async syncFromTitle(title) {
      const names = (title.cast ?? []).map((c) => c.trim()).filter(Boolean)
      if (!names.length) return
      const current = get().items
      const now = new Date().toISOString()
      let changed = false
      const next = current.map((p) => ({ ...p }))

      for (const name of names) {
        const key = name.toLowerCase()
        const idx = next.findIndex((p) => p.name.trim().toLowerCase() === key)
        if (idx >= 0) {
          if (!next[idx].titleIds.includes(title.id)) {
            next[idx] = { ...next[idx], titleIds: [...next[idx].titleIds, title.id], updatedAt: now }
            changed = true
          }
          continue
        }
        const person: Person = {
          id: newId(),
          name,
          titleIds: [title.id],
          source: 'auto',
          createdAt: now,
          updatedAt: now
        }
        next.unshift(person)
        changed = true
      }

      if (!changed) return
      for (const p of next) {
        const before = current.find((c) => c.id === p.id)
        if (!before || before.titleIds.length !== p.titleIds.length) {
          await putPerson(zone, p)
        }
      }
      set({ items: next, ready: true })
    },

    async dropTitle(titleId) {
      const current = get().items
      const touched = current.filter((p) => p.titleIds.includes(titleId))
      if (!touched.length) return
      const now = new Date().toISOString()
      const updated = touched.map((p) => ({
        ...p,
        titleIds: p.titleIds.filter((t) => t !== titleId),
        updatedAt: now
      }))
      for (const p of updated) await putPerson(zone, p)
      set({ items: current.map((p) => updated.find((u) => u.id === p.id) ?? p) })
    },

    clearMemory() {
      set({ items: [], ready: false })
    }
  }))
}

export const libraryPeople = createPeopleStore('library')
export const vaultPeople = createPeopleStore('vault')

/** 按区域取演员 store（普通函数，非 hook） */
export function peopleStore(zone: Zone): PeopleStore {
  return zone === 'vault' ? vaultPeople : libraryPeople
}
