import { Link, useLocation } from 'react-router-dom'
import clsx from 'clsx'
import Icon, { type IconName } from './Icon'

const ITEMS: Array<{ to: string; label: string; icon: IconName }> = [
  { to: '/', label: '片库', icon: 'home' },
  { to: '/discover', label: '发现', icon: 'compass' },
  { to: '/collections', label: '片单', icon: 'list' },
  { to: '/stats', label: '统计', icon: 'chart' },
  { to: '/settings', label: '设置', icon: 'gear' }
]

export default function BottomNav() {
  const { pathname } = useLocation()
  return (
    <nav className="sticky bottom-0 z-40 border-t border-paper-line bg-paper-card/95 backdrop-blur">
      <div className="mx-auto flex max-w-[560px]">
        {ITEMS.map((it) => {
          const active = pathname === it.to
          return (
            <Link
              key={it.to}
              to={it.to}
              className={clsx(
                'relative flex flex-1 flex-col items-center gap-1 py-2.5 pb-safe transition-colors',
                active ? 'text-ink' : 'text-ink-faint'
              )}
            >
              {active && (
                <span className="absolute left-1/2 top-0 h-[3px] w-6 -translate-x-1/2 rounded-full bg-reel" />
              )}
              <Icon name={it.icon} size={21} />
              <span className="text-[0.6875rem] font-medium">{it.label}</span>
            </Link>
          )
        })}
      </div>
    </nav>
  )
}
