import { useEffect, type ReactNode } from 'react'
import clsx from 'clsx'
import Icon from './Icon'

/* ------------------------------- 底部抽屉 ------------------------------- */

export function Sheet({
  open,
  onClose,
  title,
  children,
  footer
}: {
  open: boolean
  onClose: () => void
  title?: ReactNode
  children: ReactNode
  footer?: ReactNode
}) {
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null
  return (
    <div className="fixed inset-0 z-[70] flex items-end justify-center">
      <div className="fade-in absolute inset-0 bg-ink/30 backdrop-blur-[2px]" onClick={onClose} />
      <div className="slide-up relative max-h-[88vh] w-full max-w-[560px] overflow-hidden rounded-t-[22px] bg-paper-card shadow-lift">
        <div className="flex items-center justify-between border-b border-paper-line px-4 py-3">
          <div className="text-[0.9375rem] font-semibold">{title}</div>
          <button onClick={onClose} className="rounded-full p-1.5 text-ink-faint active:bg-paper-line">
            <Icon name="close" size={18} />
          </button>
        </div>
        <div className="max-h-[68vh] overflow-y-auto overscroll-contain px-4 py-4">{children}</div>
        {footer && <div className="border-t border-paper-line px-4 py-3 pb-safe">{footer}</div>}
      </div>
    </div>
  )
}

/* ------------------------------- 按钮 ------------------------------- */

export function Button({
  children,
  onClick,
  variant = 'primary',
  size = 'md',
  disabled,
  className,
  type = 'button'
}: {
  children: ReactNode
  onClick?: () => void
  variant?: 'primary' | 'ghost' | 'outline' | 'danger' | 'soft'
  size?: 'sm' | 'md' | 'lg'
  disabled?: boolean
  className?: string
  type?: 'button' | 'submit'
}) {
  const sizes = {
    sm: 'px-3 py-1.5 text-[0.8125rem]',
    md: 'px-4 py-2.5 text-[0.875rem]',
    lg: 'px-5 py-3 text-[0.9375rem]'
  }
  const variants = {
    primary: 'bg-ink text-white active:bg-ink/90',
    soft: 'bg-reel-soft text-reel-dark active:bg-reel-soft/70',
    outline: 'border border-paper-line bg-white text-ink active:bg-paper',
    ghost: 'text-ink-soft active:bg-paper-line',
    danger: 'bg-reel text-white active:bg-reel-dark'
  }
  return (
    <button
      type={type}
      disabled={disabled}
      onClick={onClick}
      className={clsx(
        'inline-flex items-center justify-center gap-1.5 rounded-xl font-medium transition-colors disabled:opacity-40',
        sizes[size],
        variants[variant],
        className
      )}
    >
      {children}
    </button>
  )
}

/* ------------------------------- 星级评分 ------------------------------- */

export function Stars({
  value,
  onChange,
  size = 22
}: {
  value?: number
  onChange?: (v: number) => void
  size?: number
}) {
  const v = value ?? 0
  const stars = [1, 2, 3, 4, 5]
  return (
    <div className="flex items-center gap-1">
      {stars.map((s) => {
        const half = v >= s * 2 - 1 && v < s * 2
        const full = v >= s * 2
        const active = half || full
        return (
          <button
            key={s}
            type="button"
            disabled={!onChange}
            onClick={() => {
              if (!onChange) return
              // 同一颗重复点击 -> 在半星/整星间切换；再点一次降星
              const next = !half && !full ? s * 2 - 1 : half ? s * 2 : v === s * 2 ? 0 : s * 2 - 1
              onChange(next)
            }}
            className={clsx('relative', onChange && 'active:scale-95')}
            style={{ width: size, height: size }}
          >
            <div className="absolute inset-0 text-paper-line">
              <Icon name="star" size={size} />
            </div>
            {active && (
              <div
                className="absolute inset-0 overflow-hidden text-reel"
                style={{ width: half ? '50%' : '100%' }}
              >
                <Icon name="starFill" size={size} />
              </div>
            )}
          </button>
        )
      })}
    </div>
  )
}

/* ------------------------------- 分段控件 ------------------------------- */

export function Segmented<T extends string>({
  value,
  options,
  onChange
}: {
  value: T
  options: Array<{ value: T; label: string }>
  onChange: (v: T) => void
}) {
  return (
    <div className="flex gap-1 rounded-xl bg-paper p-1">
      {options.map((o) => (
        <button
          key={o.value}
          onClick={() => onChange(o.value)}
          className={clsx(
            'flex-1 rounded-lg px-2 py-1.5 text-[0.8125rem] font-medium transition-colors',
            value === o.value ? 'bg-white text-ink shadow-sm' : 'text-ink-faint'
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

/* ------------------------------- 表单件 ------------------------------- */

export function Field({
  label,
  children,
  hint
}: {
  label: string
  children: ReactNode
  hint?: string
}) {
  return (
    <label className="mb-3 block">
      <span className="mb-1.5 block text-[0.75rem] font-medium uppercase tracking-wide text-ink-faint">
        {label}
      </span>
      {children}
      {hint && <span className="mt-1 block text-[0.75rem] text-ink-faint">{hint}</span>}
    </label>
  )
}

export const inputCls =
  'w-full rounded-xl border border-paper-line bg-white px-3 py-2.5 text-[0.9375rem] text-ink outline-none placeholder:text-ink-faint/70 focus:border-ink/25'

export function Chip({
  children,
  active,
  onClick,
  tone = 'default'
}: {
  children: ReactNode
  active?: boolean
  onClick?: () => void
  tone?: 'default' | 'reel'
}) {
  return (
    <button
      onClick={onClick}
      className={clsx(
        'shrink-0 rounded-full border px-3 py-1.5 text-[0.8125rem] transition-colors',
        active
          ? tone === 'reel'
            ? 'border-reel/30 bg-reel-soft text-reel-dark'
            : 'border-ink bg-ink text-white'
          : 'border-paper-line bg-white text-ink-soft'
      )}
    >
      {children}
    </button>
  )
}

/* ------------------------------- 空状态 ------------------------------- */

export function EmptyState({
  icon = 'film',
  title,
  desc,
  action
}: {
  icon?: Parameters<typeof Icon>[0]['name']
  title: string
  desc?: string
  action?: ReactNode
}) {
  return (
    <div className="flex flex-col items-center justify-center px-8 py-16 text-center">
      <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-paper-line/60 text-ink-faint">
        <Icon name={icon} size={28} />
      </div>
      <div className="text-[0.9375rem] font-semibold text-ink">{title}</div>
      {desc && <div className="mt-1.5 max-w-[280px] text-[0.8125rem] leading-relaxed text-ink-faint">{desc}</div>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  )
}

/* ------------------------------- 确认框 ------------------------------- */

export function Confirm({
  open,
  title,
  desc,
  confirmText = '确定',
  cancelText = '取消',
  danger,
  onConfirm,
  onCancel
}: {
  open: boolean
  title: string
  desc?: string
  confirmText?: string
  cancelText?: string
  danger?: boolean
  onConfirm: () => void
  onCancel: () => void
}) {
  if (!open) return null
  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center px-6">
      <div className="fade-in absolute inset-0 bg-ink/30" onClick={onCancel} />
      <div className="fade-in relative w-full max-w-[320px] rounded-2xl bg-white p-5 shadow-lift">
        <div className="text-[0.9375rem] font-semibold">{title}</div>
        {desc && <div className="mt-2 text-[0.8125rem] leading-relaxed text-ink-soft">{desc}</div>}
        <div className="mt-5 flex gap-2">
          <Button variant="outline" className="flex-1" onClick={onCancel}>
            {cancelText}
          </Button>
          <Button variant={danger ? 'danger' : 'primary'} className="flex-1" onClick={onConfirm}>
            {confirmText}
          </Button>
        </div>
      </div>
    </div>
  )
}
