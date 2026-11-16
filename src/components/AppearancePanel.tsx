import clsx from 'clsx'
import {
  ACCENT_OPTIONS,
  MOTION_OPTIONS,
  PRESET_OPTIONS,
  RADIUS_OPTIONS,
  THEME_OPTIONS,
  describeTheme,
  gapOf,
  matchPreset,
  useTheme,
  type AccentKey,
  type DensityKey,
  type ModePreview,
  type MotionKey,
  type RadiusKey,
  type ScaleKey,
  type ThemeMode
} from '../store/theme'
import Icon from './Icon'
import { Button, Segmented } from './ui'

/* ==========================================================================
   外观设置面板
   - 顶部：成套预设（底色 + 强调色 + 圆角 + 密度 一次到位）
   - 其余：底色 / 强调色 / 版面 / 动效 / 卡片显示 五组，逐项微调
   所有色值都取自主题 token，换成深色底一样成立
   ========================================================================== */

function GroupLabel({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="mb-2.5 flex items-baseline justify-between gap-3">
      <h3 className="text-label font-semibold text-ink-faint">{title}</h3>
      {hint && <span className="shrink-0 text-micro text-ink-faint">{hint}</span>}
    </div>
  )
}

function Divider() {
  return <div className="my-4 h-px bg-paper-line" />
}

/** 迷你界面预览：顶栏 + 三张海报 + 强调色，用真实 token 值 */
function ModePreviewBox({ p }: { p: ModePreview }) {
  return (
    <span
      className="relative block h-[58px] w-full overflow-hidden rounded-lg p-2"
      style={{ background: p.bg }}
    >
      {/* 顶栏：标题条 + 强调色按钮 */}
      <span className="flex items-center gap-1.5">
        <span
          className="block h-1.5 w-1.5 shrink-0 rounded-full"
          style={{ background: p.accent }}
        />
        <span
          className="block h-1 w-7 rounded-full"
          style={{ background: p.ink, opacity: 0.5 }}
        />
        <span
          className="ml-auto block h-3 w-6 rounded-full"
          style={{ background: p.ink, opacity: 0.12 }}
        />
      </span>
      {/* 三张海报：一张带强调色的主图 + 两张卡面 */}
      <span className="mt-1.5 flex items-end gap-1">
        <span
          className="block h-7 w-[18px] rounded-[3px]"
          style={{ background: `linear-gradient(160deg, ${p.accent}, ${p.ink})` }}
        />
        <span
          className="block h-8 w-[18px] rounded-[3px]"
          style={{ background: p.card, boxShadow: `inset 0 0 0 1px ${p.line}` }}
        />
        <span className="block h-7 w-[18px] rounded-[3px]" style={{ background: p.line }} />
      </span>
    </span>
  )
}

function Switch({ value }: { value: boolean }) {
  return (
    <span
      aria-hidden
      className={clsx(
        'flex h-7 w-12 shrink-0 items-center rounded-full border transition-colors ease-spring duration-2',
        value ? 'border-reel bg-reel' : 'border-paper-lineStrong bg-paper-sunken'
      )}
    >
      <span
        className={clsx(
          'ml-0.5 block h-5 w-5 rounded-full bg-paper-card shadow-e1 ring-1 ring-ink/10',
          'transition-transform ease-spring duration-2',
          value && 'translate-x-5'
        )}
      />
    </span>
  )
}

export default function AppearancePanel() {
  const theme = useTheme()
  const isDark = theme.mode === 'dark' || theme.mode === 'noir'
  const activePreset = matchPreset(theme)

  return (
    <section
      className="animate-staggerIn mb-4 overflow-hidden rounded-2xl border border-paper-line bg-paper-card shadow-e1"
      style={{ animationDelay: `${4 * 28}ms` }}
    >
      {/* ------------------------------------------------ 面板头 */}
      <div className="flex items-center gap-3 border-b border-paper-line px-4 py-3">
        <span className="flex h-8 w-8 items-center justify-center rounded-full bg-reel-soft text-reel-dark">
          <Icon name="palette" size={17} />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="text-label font-semibold text-ink">外观</h2>
          <p className="mt-0.5 truncate text-micro text-ink-faint">{describeTheme(theme)}</p>
        </div>
      </div>

      <div className="px-4 py-4">
        {/* ------------------------------------------------ 成套预设 */}
        <GroupLabel title="预设" hint="底色 + 强调色一起换" />
        <div className="grid grid-cols-2 gap-2.5">
          {PRESET_OPTIONS.map((p) => {
            const mode = THEME_OPTIONS.find((m) => m.value === p.patch.mode) ?? THEME_OPTIONS[0]
            const accent =
              ACCENT_OPTIONS.find((a) => a.value === p.patch.accent) ?? ACCENT_OPTIONS[0]
            const active = activePreset === p.key
            const accentHex =
              p.patch.mode === 'dark' || p.patch.mode === 'noir' ? accent.onDark : accent.color
            return (
              <button
                key={p.key}
                type="button"
                onClick={() => theme.set(p.patch)}
                aria-pressed={active}
                className={clsx(
                  'pressable group relative rounded-xl border p-2 text-left',
                  'transition-colors ease-standard duration-2',
                  active
                    ? 'border-reel bg-reel-soft/40 ring-1 ring-reel'
                    : 'border-paper-line bg-paper-card hover:border-paper-lineStrong'
                )}
              >
                <ModePreviewBox p={{ ...mode.preview, accent: accentHex }} />
                <span className="mt-2 flex items-center justify-between gap-1">
                  <span className="truncate text-caption font-semibold text-ink">{p.label}</span>
                  {active && <Icon name="check" size={13} className="shrink-0 text-reel-dark" />}
                </span>
                <span className="mt-0.5 block truncate text-micro text-ink-faint">{p.desc}</span>
              </button>
            )
          })}
        </div>

        <Divider />

        {/* ------------------------------------------------ 主题底色 */}
        <GroupLabel title="底色" hint="四档" />
        <div className="grid grid-cols-2 gap-2.5">
          {THEME_OPTIONS.map((o) => {
            const active = theme.mode === o.value
            return (
              <button
                key={o.value}
                type="button"
                onClick={() => theme.set({ mode: o.value as ThemeMode })}
                aria-pressed={active}
                className={clsx(
                  'pressable rounded-xl border p-2 text-left',
                  'transition-colors ease-standard duration-2',
                  active
                    ? 'border-reel bg-reel-soft/40 ring-1 ring-reel'
                    : 'border-paper-line bg-paper-card hover:border-paper-lineStrong'
                )}
              >
                <ModePreviewBox p={o.preview} />
                <span className="mt-2 flex items-center justify-between gap-1">
                  <span className="text-caption font-semibold text-ink">{o.label}</span>
                  {active && <Icon name="check" size={13} className="shrink-0 text-reel-dark" />}
                </span>
                <span className="mt-0.5 block truncate text-micro text-ink-faint">{o.desc}</span>
              </button>
            )
          })}
        </div>

        <Divider />

        {/* ------------------------------------------------ 强调色 */}
        <GroupLabel title="强调色" hint={ACCENT_OPTIONS.find((a) => a.value === theme.accent)?.label} />
        <div className="flex flex-wrap gap-x-1 gap-y-2">
          {ACCENT_OPTIONS.map((a) => {
            const active = theme.accent === a.value
            const hex = isDark ? a.onDark : a.color
            return (
              <button
                key={a.value}
                type="button"
                onClick={() => theme.set({ accent: a.value as AccentKey })}
                aria-label={a.label}
                aria-pressed={active}
                className="pressable flex w-[calc(100%/4)] flex-col items-center gap-1.5 rounded-lg py-1"
              >
                <span
                  className={clsx(
                    'flex h-9 w-9 items-center justify-center rounded-full shadow-e1',
                    'transition-all ease-spring duration-2',
                    active ? 'ring-2 ring-reel ring-offset-2 ring-offset-paper-card' : 'ring-1 ring-ink/10'
                  )}
                  style={{ background: hex }}
                >
                  {active && (
                    <Icon
                      name="check"
                      size={16}
                      weight={2.6}
                      className={isDark ? 'text-ink' : 'text-ink-inverse'}
                    />
                  )}
                </span>
                <span
                  className={clsx(
                    'text-micro',
                    active ? 'font-semibold text-ink' : 'text-ink-faint'
                  )}
                >
                  {a.label}
                </span>
              </button>
            )
          })}
        </div>

        <Divider />

        {/* ------------------------------------------------ 版面 */}
        <GroupLabel title="版面" />
        <div className="space-y-3">
          <div>
            <div className="mb-1.5 flex items-baseline justify-between">
              <span className="text-caption text-ink-soft">字号</span>
              <span className="text-micro text-ink-faint">
                {{ sm: '小', md: '标准', lg: '大', xl: '超大' }[theme.scale]}
              </span>
            </div>
            <Segmented
              value={theme.scale}
              onChange={(v) => theme.set({ scale: v as ScaleKey })}
              options={[
                { value: 'sm', label: '小' },
                { value: 'md', label: '标准' },
                { value: 'lg', label: '大' },
                { value: 'xl', label: '超大' }
              ]}
            />
          </div>
          <div>
            <div className="mb-1.5 flex items-baseline justify-between">
              <span className="text-caption text-ink-soft">圆角</span>
              <span className="text-micro text-ink-faint">
                {RADIUS_OPTIONS.find((r) => r.value === theme.radius)?.desc}
              </span>
            </div>
            <Segmented
              value={theme.radius}
              onChange={(v) => theme.set({ radius: v as RadiusKey })}
              options={RADIUS_OPTIONS.map((r) => ({ value: r.value, label: r.label }))}
            />
          </div>
          <div>
            <div className="mb-1.5 flex items-baseline justify-between">
              <span className="text-caption text-ink-soft">排列密度</span>
              <span className="text-micro text-ink-faint">间距 {gapOf(theme.density)}px</span>
            </div>
            <Segmented
              value={theme.density}
              onChange={(v) => theme.set({ density: v as DensityKey })}
              options={[
                { value: 'compact', label: '紧凑' },
                { value: 'cozy', label: '舒适' }
              ]}
            />
          </div>
          <div>
            <div className="mb-1.5 flex items-baseline justify-between">
              <span className="text-caption text-ink-soft">宫格列数</span>
            </div>
            <Segmented
              value={String(theme.columns)}
              onChange={(v) => theme.set({ columns: Number(v) as 2 | 3 | 4 })}
              options={[
                { value: '2', label: '2 列' },
                { value: '3', label: '3 列' },
                { value: '4', label: '4 列' }
              ]}
            />
          </div>
        </div>

        <Divider />

        {/* ------------------------------------------------ 动效 */}
        <GroupLabel title="动效" hint={MOTION_OPTIONS.find((m) => m.value === theme.motion)?.desc} />
        <Segmented
          value={theme.motion}
          onChange={(v) => theme.set({ motion: v as MotionKey })}
          options={MOTION_OPTIONS.map((m) => ({ value: m.value, label: m.label }))}
        />
        <button
          type="button"
          onClick={() => theme.set({ jelly: !theme.jelly })}
          aria-pressed={theme.jelly}
          className="pressable mt-1 flex min-h-touch w-full items-center justify-between gap-4 text-left"
        >
          <span className="min-w-0 flex-1">
            <span className="block text-body-sm font-medium text-ink">果冻手感</span>
            <span className="mt-0.5 block text-caption leading-relaxed text-ink-faint">
              按下去会回弹，书架翻页有软弹落位
            </span>
          </span>
          <Switch value={theme.jelly} />
        </button>

        <Divider />

        {/* ------------------------------------------------ 卡片显示 */}
        <GroupLabel title="卡片显示" />
        <div className="space-y-0.5">
          <button
            type="button"
            onClick={() => theme.set({ badgeRating: !theme.badgeRating })}
            aria-pressed={theme.badgeRating}
            className="pressable flex min-h-touch w-full items-center justify-between gap-4 text-left"
          >
            <span className="text-body-sm font-medium text-ink">显示评分角标</span>
            <Switch value={theme.badgeRating} />
          </button>
          <button
            type="button"
            onClick={() => theme.set({ cardTitle: !theme.cardTitle })}
            aria-pressed={theme.cardTitle}
            className="pressable flex min-h-touch w-full items-center justify-between gap-4 text-left"
          >
            <span className="text-body-sm font-medium text-ink">显示片名</span>
            <Switch value={theme.cardTitle} />
          </button>
        </div>
      </div>

      <div className="border-t border-paper-line px-4 py-3">
        <Button variant="ghost" className="w-full" onClick={() => theme.reset()}>
          <Icon name="refresh" size={15} />
          恢复默认外观
        </Button>
      </div>
    </section>
  )
}
