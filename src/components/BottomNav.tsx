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
    <nav className="sticky bottom-0 z-40 border-t border-paper-line bg-paper-card/85 backdrop-blur-xl">
      <div className="mx-auto flex max-w-[560px] px-1">
        {ITEMS.map((it) => {
          const active = pathname === it.to
          return (
            <Link
              key={it.to}
              to={it.to}
              aria-current={active ? 'page' : undefined}
              className={clsx(
                'group relative flex flex-1 flex-col items-center gap-1 py-2 pt-2.5 pb-safe',
                'transition-colors ease-standard duration-2'
              )}
            >
              {/* 胶囊指示：选中时以弹簧曲线展开 */}
              <span
                className={clsx(
                  'absolute top-1.5 h-8 w-14 rounded-full transition-all ease-spring duration-3',
                  active ? 'scale-100 bg-reel-soft opacity-100' : 'scale-50 opacity-0'
                )}
              />
              <span className="relative">
                <Icon
                  name={it.icon}
                  size={22}
                  weight={active ? 2.1 : 1.7}
                  className={clsx(
                    'transition-all ease-spring duration-3',
                    active ? 'text-reel-dark' : 'text-ink-faint group-hover:text-ink-soft'
                  )}
                />
              </span>
              <span
                className={clsx(
                  'relative text-micro font-medium transition-colors ease-standard duration-2',
                  active ? 'text-reel-dark' : 'text-ink-faint group-hover:text-ink-soft'
                )}
              >
                {it.label}
              </span>
            </Link>
          )
        })}
      </div>
    </nav>
  )
}
