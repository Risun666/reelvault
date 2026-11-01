import clsx from 'clsx'
import {
  ACCENT_OPTIONS,
  MOTION_OPTIONS,
  RADIUS_OPTIONS,
  THEME_OPTIONS,
  gapOf,
  useTheme,
  type AccentKey,
  type DensityKey,
  type MotionKey,
  type RadiusKey,
  type ScaleKey,
  type ThemeMode
} from '../store/theme'
import Icon from './Icon'
import { Button, Segmented } from './ui'

function Row({
  title,
  desc,
  children
}: {
  title: string
  desc?: string
  children: React.ReactNode
}) {
  return (
    <div className="border-b border-paper-line py-3.5 last:border-b-0">
      <div className="mb-2.5 flex items-baseline justify-between gap-3">
        <h3 className="text-label font-semibold text-ink-faint">{title}</h3>
        {desc && <span className="shrink-0 text-micro text-ink-faint">{desc}</span>}
      </div>
      {children}
    </div>
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

  return (
    <section
      className="animate-staggerIn mb-4 overflow-hidden rounded-2xl border border-paper-line bg-paper-card shadow-e1"
      style={{ animationDelay: `${4 * 28}ms` }}
    >
      <div className="border-b border-paper-line px-4 py-3">
        <h2 className="text-label font-semibold text-ink-faint">外观</h2>
      </div>

      <div className="px-4 py-1">
        {/* ------------------------------------------------ 主题模式 */}
        <Row title="主题模式" desc="四档底色">
          <div className="grid grid-cols-2 gap-2.5">
            {THEME_OPTIONS.map((o) => {
              const active = theme.mode === o.value
              return (
                <button
                  key={o.value}
                  onClick={() => theme.set({ mode: o.value as ThemeMode })}
                  aria-pressed={active}
                  className={clsx(
                    'pressable rounded-xl border p-2.5 text-left',
                    'transition-all ease-standard duration-2',
                    active
                      ? 'border-reel bg-reel-soft ring-2 ring-reel'
                      : 'border-paper-line bg-paper-sunken hover:border-paper-lineStrong'
                  )}
                >
                  <span
                    className="block h-12 w-full rounded-lg border border-ink/10"
                    style={{ background: o.swatch }}
                  />
                  <span className="mt-2 block text-label font-medium text-ink">{o.label}</span>
                  <span className="mt-0.5 block text-caption leading-snug text-ink-faint">
                    {o.desc}
                  </span>
                </button>
              )
            })}
          </div>
        </Row>

        {/* -------------------------------------------------- 强调色 */}
        <Row
          title="强调色"
          desc={ACCENT_OPTIONS.find((a) => a.value === theme.accent)?.label}
        >
          <div className="flex flex-wrap gap-2.5">
            {ACCENT_OPTIONS.map((a) => {
              const active = theme.accent === a.value
              return (
                <button
                  key={a.value}
                  onClick={() => theme.set({ accent: a.value as AccentKey })}
                  aria-label={a.label}
                  aria-pressed={active}
                  className={clsx(
                    'flex h-11 w-11 items-center justify-center rounded-full shadow-e1',
                    'transition-all ease-spring duration-2 active:scale-90',
                    active
                      ? 'ring-2 ring-reel ring-offset-2 ring-offset-paper-card'
                      : 'ring-1 ring-ink/10'
                  )}
                  style={{ background: a.color }}
                >
                  {active && <Icon name="check" size={18} className="text-reel-on" />}
                </button>
              )
            })}
          </div>
        </Row>

        {/* ---------------------------------------------------- 字号 */}
        <Row title="字号">
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
        </Row>

        {/* ---------------------------------------------------- 圆角 */}
        <Row title="圆角" desc={RADIUS_OPTIONS.find((r) => r.value === theme.radius)?.desc}>
          <Segmented
            value={theme.radius}
            onChange={(v) => theme.set({ radius: v as RadiusKey })}
            options={RADIUS_OPTIONS.map((r) => ({ value: r.value, label: r.label }))}
          />
        </Row>

        {/* ---------------------------------------------------- 动效 */}
        <Row title="动效" desc={MOTION_OPTIONS.find((m) => m.value === theme.motion)?.desc}>
          <Segmented
            value={theme.motion}
            onChange={(v) => theme.set({ motion: v as MotionKey })}
            options={MOTION_OPTIONS.map((m) => ({ value: m.value, label: m.label }))}
          />
        </Row>

        {/* ------------------------------------------------ 列表密度 */}
        <Row title="列表密度" desc={`当前卡片间距 ${gapOf(theme.density)}px`}>
          <Segmented
            value={theme.density}
            onChange={(v) => theme.set({ density: v as DensityKey })}
            options={[
              { value: 'compact', label: '紧凑' },
              { value: 'cozy', label: '舒适' }
            ]}
          />
        </Row>

        {/* ------------------------------------------------ 片库列数 */}
        <Row title="片库列数">
          <Segmented
            value={String(theme.columns)}
            onChange={(v) => theme.set({ columns: Number(v) as 2 | 3 | 4 })}
            options={[
              { value: '2', label: '2 列' },
              { value: '3', label: '3 列' },
              { value: '4', label: '4 列' }
            ]}
          />
        </Row>

        {/* ------------------------------------------------ 卡片显示 */}
        <Row title="卡片显示">
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
        </Row>
      </div>

      <div className="border-t border-paper-line px-4 py-3">
        <Button variant="ghost" className="w-full" onClick={() => theme.reset()}>
          恢复默认外观
        </Button>
      </div>
    </section>
  )
}
