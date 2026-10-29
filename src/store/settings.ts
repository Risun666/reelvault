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
  /** 网格视图：grid | list */
  view: 'grid' | 'list'
  /** 搜索结果是否包含成人分级条目 */
  includeAdult: boolean

  /** 是否使用内置 API Key（关掉则用下面自定义的那一个） */
  useBuiltInKey: boolean

  /** 番号刮削（隐私区用） */
  javEnabled: boolean
  javEndpoint: string
  javSource: 'auto' | 'javdb' | 'dmm'
  javToken: string
}

const KEY = 'rv.settings.v1'

const DEFAULTS: SettingsShape = {
  apiKey: '',
  apiBase: DEFAULT_API_BASE,
  imageBase: DEFAULT_IMAGE_BASE,
  autoEndpoint: true,
  cacheRemotePoster: true,
  view: 'grid',
  includeAdult: true,

  useBuiltInKey: true,

  javEnabled: false,
  javEndpoint: '',
  javSource: 'auto',
  javToken: ''
}

function load(): SettingsShape {
  try {
    const raw = localStorage.getItem(KEY)
    return raw ? { ...DEFAULTS, ...(JSON.parse(raw) as Partial<SettingsShape>) } : DEFAULTS
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
