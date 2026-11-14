import { create } from 'zustand'
import { DEFAULT_API_BASE, DEFAULT_IMAGE_BASE } from '../lib/tmdb'

export interface SettingsShape {
  apiKey: string
  apiBase: string
  imageBase: string
  /** 官方多个域名之间自动降级，网络不通时不用手动改地址 */
  autoEndpoint: boolean
  /** 详情页是否自动缓存 TMDB 远程海报到本地 */
  cacheRemotePoster: boolean
  /** 片库视图：grid 宫格 | list 列表 | shelf 3D 书架（默认） */
  view: 'grid' | 'list' | 'shelf'
  /** 搜索结果是否包含成人分级条目 */
  includeAdult: boolean

  /** 是否使用内置 API Key（关掉则用下面自定义的那一个） */
  useBuiltInKey: boolean
}

const KEY = 'rv.settings.v1'
/** 一次性迁移标记：v1.4.5 起所有老用户首次启动强制切到 3D 书架（之后可自行切回） */
const SHELF_MIGRATION = 'rv.migrated.shelf-default'

const DEFAULTS: SettingsShape = {
  apiKey: '',
  apiBase: DEFAULT_API_BASE,
  imageBase: DEFAULT_IMAGE_BASE,
  autoEndpoint: true,
  cacheRemotePoster: true,
  view: 'shelf',
  includeAdult: true,

  useBuiltInKey: true
}

function load(): SettingsShape {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return DEFAULTS
    const parsed = JSON.parse(raw) as Record<string, unknown>
    for (const k of Object.keys(parsed)) if (k.startsWith('jav')) delete parsed[k]
    const merged = { ...DEFAULTS, ...(parsed as Partial<SettingsShape>) }
    // 一次性迁移：老用户的视图选择早于书架视图存在，升级后强制看一次 3D 书架
    if (!localStorage.getItem(SHELF_MIGRATION)) {
      merged.view = 'shelf'
      try {
        localStorage.setItem(SHELF_MIGRATION, '1')
        localStorage.setItem(KEY, JSON.stringify(merged))
      } catch {
        /* 隐私模式下忽略，退化为仅本次生效 */
      }
    }
    return merged
  } catch {
    return DEFAULTS
  }
}

interface SettingsStore extends SettingsShape {
  set: (patch: Partial<SettingsShape>) => void
  reset: () => void
}

export const useSettings = create<SettingsStore>((set) => ({
  ...load(),
  set(patch) {
    set(patch)
    const next = { ...load(), ...patch }
    try {
      localStorage.setItem(KEY, JSON.stringify(next))
    } catch {
      /* 隐私模式下忽略 */
    }
  },
  reset() {
    set(DEFAULTS)
    try {
      localStorage.removeItem(KEY)
    } catch {
      /* noop */
    }
  }
}))
