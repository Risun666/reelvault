import { useEffect, type ReactNode } from 'react'
import clsx from 'clsx'
import Icon, { type IconName } from './Icon'

/* ==========================================================================
   Sheet —— 底部抽屉
   ========================================================================== */

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
      <div
        className="animate-fadeIn absolute inset-0 bg-ink/35 backdrop-blur-[3px]"
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        className="animate-slideUp relative flex max-h-[90vh] w-full max-w-[560px] flex-col overflow-hidden rounded-t-2xl bg-paper-card shadow-pop"
      >
        {/* 抓握条 */}
        <div className="flex justify-center pt-2.5">
          <div className="h-1 w-10 rounded-full bg-paper-lineStrong" />
        </div>

        <div className="flex items-center justify-between gap-3 px-5 pb-2 pt-3">
          <div className="text-title font-semibold text-ink">{title}</div>
          <button
            onClick={onClose}
            aria-label="关闭"
            className="rounded-full bg-paper-sunken p-2 text-ink-faint transition ease-spring duration-2 hover:bg-paper-line hover:text-ink active:scale-95"
          >
            <Icon name="close" size={17} />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 pb-5 pt-2">
          {children}
        </div>

        {footer && (
          <div className="border-t border-paper-line bg-paper-card px-5 py-3 pb-safe">{footer}</div>
        )}
      </div>
    </div>
  )
}

/* ==========================================================================
   Button —— Filled > Tonal > Outline > Ghost > Text > Danger
   统一 44px 触控高度、完整状态、焦点环
   ========================================================================== */

export function Button({
  children,
  onClick,
  variant = 'primary',
  size = 'md',
  disabled,
  loading,
  className,
  type = 'button'
}: {
  children: ReactNode
  onClick?: () => void
  variant?: 'primary' | 'tonal' | 'outline' | 'ghost' | 'text' | 'danger'
  size?: 'sm' | 'md' | 'lg'
  disabled?: boolean
  loading?: boolean
  className?: string
  type?: 'button' | 'submit'
}) {
  const sizes = {
    sm: 'h-9 min-w-9 gap-1 rounded-lg px-3.5 text-label',
    md: 'h-11 min-w-11 gap-1.5 rounded-xl px-4 text-body-sm',
    lg: 'h-12 gap-2 rounded-xl px-5 text-subtitle'
  }

  // 所有变体都走 CSS 变量，深色模式下不会残留白底
  const variants = {
    primary:
      'bg-ink text-ink-inverse shadow-e1 hover:shadow-e2 active:shadow-none hover:brightness-110',
    tonal: 'bg-reel-soft text-reel-dark hover:bg-reel/15 active:bg-reel/20',
    outline:
      'border border-paper-lineStrong bg-transparent text-ink hover:border-ink hover:bg-paper-sunken active:bg-paper-line',
    ghost: 'text-ink-soft hover:bg-paper-sunken hover:text-ink active:bg-paper-line',
    text: 'text-reel-dark hover:bg-reel-soft px-2',
    danger: 'bg-danger text-danger-on shadow-e1 hover:shadow-e2 hover:brightness-110 active:shadow-none'
  }

  return (
    <button
      type={type}
      disabled={disabled || loading}
      onClick={onClick}
      className={clsx(
        'inline-flex shrink-0 items-center justify-center font-medium',
        'transition-all ease-standard duration-2 active:scale-[0.97]',
        'disabled:pointer-events-none disabled:opacity-40',
        '[&>*]:shrink-0',
        sizes[size],
        variants[variant],
        className
      )}
    >
      {loading ? <span className="animate-pulseSoft">· · ·</span> : children}
    </button>
  )
}

/** 纯图标按钮，保证 44px 触控区 */
export function IconButton({
  icon,
  label,
  onClick,
  active,
  className,
  size = 40
}: {
  icon: IconName
  label: string
  onClick?: () => void
  active?: boolean
  className?: string
  size?: number
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className={clsx(
        'inline-flex items-center justify-center rounded-xl border transition ease-standard duration-2',
        'active:scale-[0.94]',
        active
          ? 'border-transparent bg-ink text-ink-inverse'
          : 'border-paper-line bg-transparent text-ink-soft hover:border-ink hover:text-ink',
        className
      )}
      style={{ width: size, height: size }}
    >
      <Icon name={icon} size={size <= 34 ? 17 : 19} />
    </button>
  )
}

/* ==========================================================================
   Card —— 三变体
   ========================================================================== */

export function Card({
  children,
  variant = 'elevated',
  className,
  onClick
}: {
  children: ReactNode
  variant?: 'elevated' | 'filled' | 'outlined'
  className?: string
  onClick?: () => void
}) {
  const V = {
    elevated: onClick ? 'card-elevated pressable cursor-pointer' : 'card-elevated',
    filled: 'card-filled',
    outlined: 'card-outlined'
  }
  const Comp = onClick ? 'button' : 'div'
  return (
    <Comp
      onClick={onClick}
      className={clsx(V[variant], 'text-left', className)}
      {...(onClick ? { type: 'button' as const } : {})}
    >
      {children}
    </Comp>
  )
}

/* ==========================================================================
   Section —— 区块标题的统一节奏
   ========================================================================== */

export function Section({
  title,
  desc,
  action,
  children,
  className
}: {
  title?: ReactNode
  desc?: ReactNode
  action?: ReactNode
  children?: ReactNode
  className?: string
}) {
  return (
    <section className={clsx('mb-6', className)}>
      {(title || action) && (
        <div className="mb-3 flex items-end justify-between gap-3">
          <div className="min-w-0">
            {title && <h2 className="truncate text-label font-semibold text-ink-faint">{title}</h2>}
            {desc && <p className="mt-0.5 text-caption text-ink-faint">{desc}</p>}
          </div>
          {action && <div className="shrink-0">{action}</div>}
        </div>
      )}
      {children}
    </section>
  )
}

/* ==========================================================================
   Stars —— 保持原有取值行为（半星↔整星切换），只重做观感
   ========================================================================== */

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
    <div className="flex items-center gap-1.5">
      {stars.map((s) => {
        const half = v >= s * 2 - 1 && v < s * 2
        const full = v >= s * 2
        const active = half || full
        return (
          <button
            key={s}
            type="button"
            disabled={!onChange}
            aria-label={`${s} 星`}
            onClick={() => {
              if (!onChange) return
              const next = !half && !full ? s * 2 - 1 : half ? s * 2 : v === s * 2 ? 0 : s * 2 - 1
              onChange(next)
            }}
            className={clsx(
              'relative transition ease-spring duration-2',
              onChange && 'active:scale-90 hover:scale-110'
            )}
            style={{ width: size, height: size }}
          >
            <div className="absolute inset-0 text-paper-lineStrong">
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

/* ==========================================================================
   Segmented —— 带指示块的分组控件
   ========================================================================== */

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
    <div className="flex gap-1 rounded-xl bg-paper-sunken p-1">
      {options.map((o) => {
        const active = value === o.value
        return (
          <button
            key={o.value}
            onClick={() => onChange(o.value)}
            aria-pressed={active}
            className={clsx(
              'flex-1 rounded-lg px-2 py-2 text-label font-medium',
              'transition-all ease-spring duration-2 active:scale-[0.97]',
              active
                ? 'bg-paper-card text-ink shadow-e1'
                : 'text-ink-faint hover:text-ink-soft'
            )}
          >
            {o.label}
          </button>
        )
      })}
    </div>
  )
}

/* ==========================================================================
   表单件
   ========================================================================== */

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
    <div className="mb-4">
      <span className="mb-1.5 block text-label font-medium text-ink-soft">{label}</span>
      <div className="[&>*]:w-full">{children}</div>
      {hint && <p className="mt-1.5 text-caption leading-relaxed text-ink-faint">{hint}</p>}
    </div>
  )
}

/** 输入框基础样式：56px 高、无边框填充式、聚焦有环 */
export const inputCls =
  'w-full rounded-xl border border-paper-line bg-paper-card px-4 py-3 text-body text-ink outline-none transition ease-standard duration-2 placeholder:text-ink-faint/85 hover:border-paper-lineStrong focus:border-reel focus:ring-2 focus:ring-reel/20 disabled:opacity-50'

export const textareaCls = clsx(inputCls, 'min-h-[88px] resize-y leading-relaxed')

export const selectCls = clsx(inputCls, 'appearance-none pr-9')

/* ==========================================================================
   Chip —— 标签 / 筛选
   ========================================================================== */

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
      aria-pressed={active}
      className={clsx(
        'shrink-0 rounded-full border px-3.5 py-2 text-label transition-all ease-standard duration-2 active:scale-[0.96]',
        active
          ? tone === 'reel'
            ? 'border-reel/35 bg-reel-soft text-reel-dark'
            : 'border-ink bg-ink text-ink-inverse'
          : 'border-paper-line bg-paper-card text-ink-soft hover:border-paper-lineStrong hover:text-ink'
      )}
    >
      {children}
    </button>
  )
}

/* ==========================================================================
   EmptyState —— 留白与呼吸感
   ========================================================================== */

export function EmptyState({
  icon = 'film',
  title,
  desc,
  action
}: {
  icon?: IconName
  title: string
  desc?: string
  action?: ReactNode
}) {
  return (
    <div className="flex flex-col items-center justify-center px-10 py-20 text-center">
      <div className="mb-5 flex h-20 w-20 items-center justify-center rounded-2xl bg-paper-sunken text-ink-faint">
        <Icon name={icon} size={32} />
      </div>
      <h3 className="text-title font-semibold text-ink">{title}</h3>
      {desc && (
        <p className="mt-2 max-w-[300px] text-body-sm leading-relaxed text-ink-faint text-balance">
          {desc}
        </p>
      )}
      {action && <div className="mt-6">{action}</div>}
    </div>
  )
}

/* ==========================================================================
   Skeleton / 加载占位
   ========================================================================== */

export function Skeleton({ className }: { className?: string }) {
  return <div className={clsx('skeleton', className)} />
}

export function PosterSkeleton() {
  return <div className="skeleton aspect-[2/3] w-full" />
}

/* ==========================================================================
   Confirm —— 居中确认框
   ========================================================================== */

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
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onCancel()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onCancel])

  if (!open) return null
  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center px-6">
      <div className="animate-fadeIn absolute inset-0 bg-ink/40 backdrop-blur-[2px]" onClick={onCancel} />
      <div
        role="alertdialog"
        aria-modal="true"
        className="animate-popIn relative w-full max-w-[340px] rounded-2xl bg-paper-card p-6 shadow-pop"
      >
        <h3 className="text-title font-semibold text-ink">{title}</h3>
        {desc && <p className="mt-2 text-body-sm leading-relaxed text-ink-soft">{desc}</p>}
        <div className="mt-6 flex gap-2.5">
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
