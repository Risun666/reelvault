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
  /** 果冻手感：按下回弹、卡片落位时的软弹动效 */
  jelly: boolean
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
  jelly: true,
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
  el.dataset.jelly = t.jelly ? 'on' : 'off'
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

/** 模式色板：面板里的迷你预览用真实 token 值，切主题时所见即所得 */
export interface ModePreview {
  bg: string
  card: string
  line: string
  ink: string
  accent: string
}

export const THEME_OPTIONS: Array<{
  value: ThemeMode
  label: string
  desc: string
  swatch: string
  preview: ModePreview
}> = [
  {
    value: 'light',
    label: '米纸',
    desc: '暖白纸面，日常最好读',
    swatch: 'linear-gradient(135deg,#fffdfa,#f0ebe3)',
    preview: { bg: '#F7F4EF', card: '#FFFFFF', line: '#E4DDD2', ink: '#1B1917', accent: '#B8372B' }
  },
  {
    value: 'sepia',
    label: '胶片',
    desc: '偏黄纸质，久看不累',
    swatch: 'linear-gradient(135deg,#fdfaf4,#e2d7c5)',
    preview: { bg: '#F4EEE4', card: '#FDFAF4', line: '#E2D7C5', ink: '#2D241A', accent: '#B04A28' }
  },
  {
    value: 'dark',
    label: '影院',
    desc: '褐黑底，海报更跳',
    swatch: 'linear-gradient(135deg,#1d1a17,#141210)',
    preview: { bg: '#141210', card: '#1D1A17', line: '#302C26', ink: '#F5F1EA', accent: '#F0874F' }
  },
  {
    value: 'noir',
    label: '熄灯',
    desc: '纯黑底，沉浸浏览',
    swatch: 'linear-gradient(135deg,#151517,#0a0a0b)',
    preview: { bg: '#0A0A0B', card: '#151517', line: '#28282C', ink: '#F4F3F1', accent: '#E88A5C' }
  }
]

export const ACCENT_OPTIONS: Array<{
  value: AccentKey
  label: string
  /** 浅色主题下的色点 */
  color: string
  /** 深色主题下提亮后的色点 */
  onDark: string
}> = [
  { value: 'reel', label: '朱红', color: '#B8372B', onDark: '#F0874F' },
  { value: 'amber', label: '琥珀', color: '#B0741A', onDark: '#E4B462' },
  { value: 'moss', label: '松绿', color: '#2F6B4F', onDark: '#7ABD95' },
  { value: 'teal', label: '青瓷', color: '#287472', onDark: '#82CBC8' },
  { value: 'indigo', label: '靛蓝', color: '#3F509E', onDark: '#94A4E2' },
  { value: 'plum', label: '绛紫', color: '#7B4B94', onDark: '#C798DB' },
  { value: 'ink', label: '墨黑', color: '#202126', onDark: '#E2E4E9' }
]

/** 成套预设：一键把底色 / 强调色 / 圆角 / 密度调到位 */
export const PRESET_OPTIONS: Array<{
  key: string
  label: string
  desc: string
  patch: Partial<ThemeShape>
}> = [
  {
    key: 'film',
    label: '胶片日常',
    desc: '米纸底 · 朱红',
    patch: { mode: 'light', accent: 'reel', radius: 'default', density: 'cozy' }
  },
  {
    key: 'cinema',
    label: '午夜影院',
    desc: '褐黑底 · 琥珀',
    patch: { mode: 'dark', accent: 'amber', radius: 'default', density: 'cozy' }
  },
  {
    key: 'noir',
    label: '熄灯极简',
    desc: '纯黑底 · 墨白',
    patch: { mode: 'noir', accent: 'ink', radius: 'sharp', density: 'compact' }
  },
  {
    key: 'porcelain',
    label: '青瓷静谧',
    desc: '胶片黄 · 青瓷',
    patch: { mode: 'sepia', accent: 'teal', radius: 'round', density: 'cozy' }
  }
]

/** 当前外观命中了哪个预设（命中才在面板里打勾） */
export function matchPreset(t: ThemeShape): string | null {
  const hit = PRESET_OPTIONS.find((p) =>
    Object.entries(p.patch).every(([k, v]) => t[k as keyof ThemeShape] === v)
  )
  return hit?.key ?? null
}

/** 当前外观的一句话描述，如「影院 · 琥珀 · 标准」 */
export function describeTheme(t: ThemeShape): string {
  const mode = THEME_OPTIONS.find((m) => m.value === t.mode)?.label ?? t.mode
  const accent = ACCENT_OPTIONS.find((a) => a.value === t.accent)?.label ?? t.accent
  const radius = RADIUS_OPTIONS.find((r) => r.value === t.radius)?.label ?? t.radius
  return `${mode} · ${accent} · ${radius}`
}

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
