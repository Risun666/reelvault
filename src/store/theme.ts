import { create } from 'zustand'

export type ThemeMode = 'light' | 'sepia' | 'dark'
export type AccentKey = 'reel' | 'ink' | 'moss' | 'indigo' | 'amber'
export type RadiusKey = 'sharp' | 'default' | 'round'
export type ScaleKey = 'sm' | 'md' | 'lg' | 'xl'
export type DensityKey = 'compact' | 'cozy'

export interface ThemeShape {
  mode: ThemeMode
  accent: AccentKey
  radius: RadiusKey
  scale: ScaleKey
  density: DensityKey
  /** 宫格列数 */
  columns: 2 | 3 | 4
  /** 网格卡片是否显示评分角标 */
  badgeRating: boolean
  /** 网格卡片是否显示片名 */
  cardTitle: boolean
}

const KEY = 'rv.theme.v1'

const DEFAULTS: ThemeShape = {
  mode: 'light',
  accent: 'reel',
  radius: 'default',
  scale: 'md',
  density: 'cozy',
  columns: 3,
  badgeRating: true,
  cardTitle: true
}

function load(): ThemeShape {
  try {
    const raw = localStorage.getItem(KEY)
    return raw ? { ...DEFAULTS, ...(JSON.parse(raw) as Partial<ThemeShape>) } : DEFAULTS
  } catch {
    return DEFAULTS
  }
}

interface ThemeStore extends ThemeShape {
  set: (patch: Partial<ThemeShape>) => void
  reset: () => void
}

function apply(t: ThemeShape) {
  const el = document.documentElement
  el.dataset.theme = t.mode
  el.dataset.accent = t.accent
  el.dataset.radius = t.radius === 'default' ? 'default' : t.radius
  el.dataset.scale = t.scale
  const meta = document.querySelector('meta[name="theme-color"]')
  const bg = getComputedStyle(el).getPropertyValue('--rv-bg').trim() || '247 246 243'
  if (meta) meta.setAttribute('content', `rgb(${bg.replace(/\s+/g, ',')})`)
}

export const useTheme = create<ThemeStore>((set) => ({
  ...load(),
  set(patch) {
    const next = { ...load(), ...patch }
    set(patch)
    try {
      localStorage.setItem(KEY, JSON.stringify(next))
    } catch {
      /* noop */
    }
    apply(next)
  },
  reset() {
    set(DEFAULTS)
    apply(DEFAULTS)
  }
}))

/** 首次加载时立即套用，避免闪白 */
export function initTheme() {
  apply(useTheme.getState())
}

export const THEME_OPTIONS: Array<{ value: ThemeMode; label: string; swatch: string }> = [
  { value: 'light', label: '浅色', swatch: 'linear-gradient(135deg,#f7f6f3,#e7e4de)' },
  { value: 'sepia', label: '胶片', swatch: 'linear-gradient(135deg,#f4eee4,#e2d7c5)' },
  { value: 'dark', label: '深色', swatch: 'linear-gradient(135deg,#1b1c1f,#111214)' }
]

export const ACCENT_OPTIONS: Array<{ value: AccentKey; label: string; color: string }> = [
  { value: 'reel', label: '朱红', color: '#c0453a' },
  { value: 'ink', label: '墨黑', color: '#27292e' },
  { value: 'moss', label: '松绿', color: '#3f7054' },
  { value: 'indigo', label: '靛蓝', color: '#4254a8' },
  { value: 'amber', label: '琥珀', color: '#ba7a20' }
]

/** 密度 → 网格间距 / 区块间距 */
export function gapOf(d: DensityKey): number {
  return d === 'compact' ? 8 : 14
}
