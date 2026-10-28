import clsx from 'clsx'
import {
  ACCENT_OPTIONS,
  THEME_OPTIONS,
  gapOf,
  useTheme,
  type AccentKey,
  type RadiusKey,
  type ScaleKey,
  type ThemeMode
} from '../store/theme'
import { Button } from './ui'

function Row({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="py-2.5">
      <div className="mb-2 text-[0.75rem] text-ink-faint">{title}</div>
      {children}
    </div>
  )
}

function Option({
  active,
  onClick,
  children
}: {
  active: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      onClick={onClick}
      className={clsx(
        'rounded-xl border px-3 py-2 transition-colors',
        active ? 'border-ink bg-ink text-white' : 'border-paper-line bg-white text-ink-soft'
      )}
    >
      {children}
    </button>
  )
}

export default function AppearancePanel() {
  const theme = useTheme()

  return (
    <section className="mt-5 rounded-2xl border border-paper-line bg-white p-4">
      <h2 className="mb-1 text-[0.75rem] font-medium uppercase tracking-wide text-ink-faint">外观</h2>

      <Row title="主题">
        <div className="flex gap-2">
          {THEME_OPTIONS.map((o) => (
            <button
              key={o.value}
              onClick={() => theme.set({ mode: o.value as ThemeMode })}
              className={clsx(
                'flex-1 overflow-hidden rounded-xl border p-1.5 transition-colors',
                theme.mode === o.value ? 'border-ink' : 'border-paper-line'
              )}
            >
              <span
                className="block h-10 w-full rounded-lg"
                style={{ background: o.swatch }}
              />
              <span className="mt-1.5 block text-center text-[0.75rem]">{o.label}</span>
            </button>
          ))}
        </div>
      </Row>

      <Row title="强调色">
        <div className="flex gap-2">
          {ACCENT_OPTIONS.map((a) => (
            <button
              key={a.value}
              onClick={() => theme.set({ accent: a.value as AccentKey })}
              className={clsx(
                'flex h-9 w-9 items-center justify-center rounded-full border text-[0.6875rem]',
                theme.accent === a.value ? 'border-ink ring-2 ring-ink/15' : 'border-paper-line'
              )}
              style={{ background: a.color }}
            >
              {theme.accent === a.value && (
                <span className="text-white">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6">
                    <path d="M5 13l4 4L19 7" strokeLinecap="round" />
                  </svg>
                </span>
              )}
            </button>
          ))}
        </div>
      </Row>

      <Row title="字号">
        <div className="flex gap-2">
          {(['sm', 'md', 'lg', 'xl'] as ScaleKey[]).map((s, i) => (
            <Option key={s} active={theme.scale === s} onClick={() => theme.set({ scale: s })}>
              {['小', '标准', '大', '超大'][i]}
            </Option>
          ))}
        </div>
      </Row>

      <Row title="圆角">
        <div className="flex gap-2">
          {(['sharp', 'default', 'round'] as RadiusKey[]).map((r, i) => (
            <Option key={r} active={theme.radius === r} onClick={() => theme.set({ radius: r })}>
              <span
                className="block h-5 w-8 border border-current"
                style={{ borderRadius: r === 'sharp' ? '4px' : r === 'default' ? '10px' : '16px' }}
              />
              <span className="mt-1 block text-center text-[0.6875rem]">
                {['利落', '标准', '圆润'][i]}
              </span>
            </Option>
          ))}
        </div>
      </Row>

      <Row title="列表密度">
        <div className="flex gap-2">
          <Option active={theme.density === 'compact'} onClick={() => theme.set({ density: 'compact' })}>
            紧凑
          </Option>
          <Option active={theme.density === 'cozy'} onClick={() => theme.set({ density: 'cozy' })}>
            舒适
          </Option>
        </div>
        <p className="mt-1.5 text-[0.6875rem] text-ink-faint">
          当前卡片间距 {gapOf(theme.density)}px
        </p>
      </Row>

      <Row title="片库列数">
        <div className="flex gap-2">
          {([2, 3, 4] as const).map((n) => (
            <Option key={n} active={theme.columns === n} onClick={() => theme.set({ columns: n })}>
              {n} 列
            </Option>
          ))}
        </div>
      </Row>

      <Row title="卡片显示">
        <div className="space-y-2">
          <Toggle
            label="显示评分角标"
            value={theme.badgeRating}
            onChange={(v) => theme.set({ badgeRating: v })}
          />
          <Toggle
            label="显示片名"
            value={theme.cardTitle}
            onChange={(v) => theme.set({ cardTitle: v })}
          />
        </div>
      </Row>

      <Button variant="ghost" size="sm" className="w-full" onClick={() => theme.reset()}>
        恢复默认外观
      </Button>
    </section>
  )
}

function Toggle({
  label,
  value,
  onChange
}: {
  label: string
  value: boolean
  onChange: (v: boolean) => void
}) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-[0.875rem]">{label}</span>
      <button
        onClick={() => onChange(!value)}
        className={clsx(
          'h-6 w-11 shrink-0 rounded-full p-0.5 transition-colors',
          value ? 'bg-moss' : 'bg-paper-line'
        )}
      >
        <span
          className={clsx(
            'block h-5 w-5 rounded-full bg-white shadow transition-transform',
            value && 'translate-x-5'
          )}
        />
      </button>
    </div>
  )
}
