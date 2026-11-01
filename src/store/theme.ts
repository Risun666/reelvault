import { create } from 'zustand'

export type ThemeMode = 'light' | 'sepia' | 'dark' | 'noir'
export type AccentKey = 'reel' | 'ink' | 'moss' | 'indigo' | 'amber' | 'plum' | 'teal'
export type RadiusKey = 'sharp' | 'default' | 'round'
export type ScaleKey = 'sm' | 'md' | 'lg' | 'xl'
export type DensityKey = 'compact' | 'cozy'
export type MotionKey = 'full' | 'reduced'

export interface ThemeShape {
  mode: ThemeMode
  accent: AccentKey
  radius: RadiusKey
  scale: ScaleKey
  density: DensityKey
  /** 动效：full 全开 / reduced 降低（跟随系统偏好或手动） */
  motion: MotionKey
  /** 宫格列数 */
  columns: 2 | 3 | 4
  /** 网格卡片是否显示评分角标 */
  badgeRating: boolean
  /** 网格卡片是否显示片名 */
  cardTitle: boolean
}

const KEY = 'rv.theme.v2'
const LEGACY_KEY = 'rv.theme.v1'

const DEFAULTS: ThemeShape = {
  mode: 'light',
  accent: 'reel',
  radius: 'default',
  scale: 'md',
  density: 'cozy',
  motion: 'full',
  columns: 3,
  badgeRating: true,
  cardTitle: true
}

function load(): ThemeShape {
  try {
    const raw = localStorage.getItem(KEY) ?? localStorage.getItem(LEGACY_KEY)
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
  el.dataset.radius = t.radius
  el.dataset.scale = t.scale
  el.dataset.motion = t.motion
  const meta = document.querySelector('meta[name="theme-color"]')
  const bg = getComputedStyle(el).getPropertyValue('--rv-bg').trim() || '247 244 239'
  if (meta) meta.setAttribute('content', `rgb(${bg.replace(/\s+/g, ',')})`)
}

export const useTheme = create<ThemeStore>((set) => ({
  ...load(),
  set(patch) {
    const next = { ...load(), ...patch }
    set(patch)
    try {
      localStorage.setItem(KEY, JSON.stringify(next))
      localStorage.removeItem(LEGACY_KEY)
    } catch {
      /* noop */
    }
    apply(next)
  },
  reset() {
    set(DEFAULTS)
    apply(DEFAULTS)
    try {
      localStorage.setItem(KEY, JSON.stringify(DEFAULTS))
    } catch {
      /* noop */
    }
  }
}))

/** 首次加载时立即套用，避免闪白 */
export function initTheme() {
  apply(useTheme.getState())
}

export const THEME_OPTIONS: Array<{ value: ThemeMode; label: string; desc: string; swatch: string }> = [
  { value: 'light', label: '米纸', desc: '暖白，日常最好读', swatch: 'linear-gradient(135deg,#fffdfa,#f0ebe3)' },
  { value: 'sepia', label: '胶片', desc: '偏黄纸质，久看不累', swatch: 'linear-gradient(135deg,#fdfaf4,#e2d7c5)' },
  { value: 'dark', label: '影院', desc: '褐黑底，海报更跳', swatch: 'linear-gradient(135deg,#1d1a17,#141210)' },
  { value: 'noir', label: '熄灯', desc: '纯黑底，沉浸浏览', swatch: 'linear-gradient(135deg,#151517,#0a0a0b)' }
]

export const ACCENT_OPTIONS: Array<{ value: AccentKey; label: string; color: string }> = [
  { value: 'reel', label: '朱红', color: '#b8372b' },
  { value: 'amber', label: '琥珀', color: '#b0741a' },
  { value: 'moss', label: '松绿', color: '#2f6b4f' },
  { value: 'teal', label: '青瓷', color: '#287472' },
  { value: 'indigo', label: '靛蓝', color: '#3f509e' },
  { value: 'plum', label: '绛紫', color: '#7b4b94' },
  { value: 'ink', label: '墨黑', color: '#202126' }
]

export const RADIUS_OPTIONS: Array<{ value: RadiusKey; label: string; desc: string }> = [
  { value: 'sharp', label: '利落', desc: '小圆角，信息密度高' },
  { value: 'default', label: '标准', desc: '均衡，推荐' },
  { value: 'round', label: '圆润', desc: '大圆角，更柔和' }
]

export const MOTION_OPTIONS: Array<{ value: MotionKey; label: string; desc: string }> = [
  { value: 'full', label: '完整动效', desc: '转场、退弹、交错淡入' },
  { value: 'reduced', label: '降低动效', desc: '更快、更省电、更不晕' }
]

/** 密度 → 网格间距 / 区块间距 */
export function gapOf(d: DensityKey): number {
  return d === 'compact' ? 8 : 14
}

/** 密度 → 垂直节奏 */
export function padOf(d: DensityKey): string {
  return d === 'compact' ? 'p-3' : 'p-4'
}
