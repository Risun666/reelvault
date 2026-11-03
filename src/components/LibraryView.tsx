import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import clsx from 'clsx'
import { zoneStore } from '../store/zone'
import { useSettings } from '../store/settings'
import { gapOf, useTheme } from '../store/theme'
import type { Zone } from '../lib/db'
import type { TitleItem, WatchStatus } from '../types'
import { KIND_LABEL, STATUS_LABEL } from '../types'
import Poster from '../components/Poster'
import Icon from '../components/Icon'
import PeopleGrid from '../components/PeopleGrid'
import { Button, Chip, EmptyState, IconButton, Segmented, Skeleton } from '../components/ui'

const STATUS_TABS: Array<{ value: WatchStatus | 'all'; label: string }> = [
  { value: 'all', label: '全部' },
  { value: 'wish', label: '想看' },
  { value: 'watching', label: '在看' },
  { value: 'done', label: '看过' },
  { value: 'dropped', label: '弃坑' }
]

type SortKey = 'updated' | 'rating' | 'year' | 'title'

const SORTS: Array<{ value: SortKey; label: string }> = [
  { value: 'updated', label: '最近更新' },
  { value: 'rating', label: '我的评分' },
  { value: 'year', label: '发行年份' },
  { value: 'title', label: '名称' }
]

export default function LibraryView({
  zone,
  title,
  accent
}: {
  zone: Zone
  title: string
  accent?: boolean
}) {
  const store = zoneStore(zone)
  const items = store((s) => s.items)
  const ready = store((s) => s.ready)
  const settings = useSettings()
  const theme = useTheme()

  const [q, setQ] = useState('')
  const [status, setStatus] = useState<WatchStatus | 'all'>('all')
  const [kind, setKind] = useState<'all' | 'movie' | 'tv'>('all')
  const [tag, setTag] = useState<string | null>(null)
  const [sort, setSort] = useState<SortKey>('updated')
  const [showFilter, setShowFilter] = useState(false)
  const [tab, setTab] = useState<'titles' | 'people'>('titles')

  const tags = useMemo(() => {
    const set = new Set<string>()
    items.forEach((i) => i.tags?.forEach((t) => set.add(t)))
    return [...set].sort()
  }, [items])

  const filtered = useMemo(() => {
    const kw = q.trim().toLowerCase()
    let list = items.filter((i) => {
      if (status !== 'all' && i.status !== status) return false
      if (kind !== 'all' && i.kind !== kind) return false
      if (tag && !(i.tags ?? []).includes(tag)) return false
      if (!kw) return true
      return [i.title, i.originalTitle, i.year, i.director, i.overview, (i.tags ?? []).join(' ')]
        .concat(i.cast ?? [])
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(kw))
    })
    const collator = new Intl.Collator('zh-Hans-CN')
    list = [...list].sort((a, b) => {
      switch (sort) {
        case 'rating':
          return (b.rating ?? -1) - (a.rating ?? -1)
        case 'year':
          return (Number(b.year) || 0) - (Number(a.year) || 0)
        case 'title':
          return collator.compare(a.title, b.title)
        default:
          return a.updatedAt < b.updatedAt ? 1 : -1
      }
    })
    return list
  }, [items, q, status, kind, tag, sort])

  const filtersOn = status !== 'all' || kind !== 'all' || tag !== null || sort !== 'updated'

  return (
    <div className="mx-auto max-w-[560px] px-4 pb-10 pt-safe">
      {/* ---------------------------------------------------------- 页头 */}
      <header className="flex items-end justify-between gap-3 pb-5 pt-3">
        <div className="min-w-0">
          <h1
            className={clsx(
              'font-display text-page font-semibold leading-tight tracking-tight',
              accent ? 'text-reel-dark' : 'text-ink'
            )}
          >
            {title}
          </h1>
          <p className="mt-1 text-caption text-ink-faint">
            {ready
              ? `共 ${items.length} 部${
                  filtered.length !== items.length ? ` · 筛出 ${filtered.length} 部` : ''
                }`
              : '载入中…'}
          </p>
        </div>
        <Link
          to="/discover"
          state={zone === 'vault' ? { toVault: true } : undefined}
          className="shrink-0"
        >
          <Button>
            <Icon name={zone === 'vault' ? 'plus' : 'compass'} size={17} weight={2.2} />
            {zone === 'vault' ? '添加' : '发现'}
          </Button>
        </Link>
      </header>

      <div className="pb-4">
        <Segmented
          value={tab}
          onChange={(v) => setTab(v as 'titles' | 'people')}
          options={[
            { value: 'titles', label: '影片' },
            { value: 'people', label: '演员' }
          ]}
        />
      </div>

      {tab === 'people' ? (
        <PeopleGrid zone={zone} />
      ) : (
        <>
          {/* -------------------------------------------------- 搜索与工具 */}
          <div className="flex items-center gap-2 pb-4">
            <div className="relative flex-1">
              <Icon
                name="search"
                size={17}
                className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-faint"
              />
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="搜索片名、演员、标签…"
                className="h-11 w-full rounded-xl border border-paper-line bg-paper-card pl-10 pr-3 text-body-sm text-ink outline-none transition ease-standard duration-2 placeholder:text-ink-faint/85 hover:border-paper-lineStrong focus:border-reel focus:ring-2 focus:ring-reel/15"
              />
            </div>
            <IconButton
              icon="filter"
              label="筛选"
              size={44}
              active={filtersOn}
              onClick={() => setShowFilter((v) => !v)}
            />
            <IconButton
              icon={settings.view === 'grid' ? 'list' : 'grid'}
              label={settings.view === 'grid' ? '切到列表' : '切到宫格'}
              size={44}
              onClick={() => settings.set({ view: settings.view === 'grid' ? 'list' : 'grid' })}
            />
          </div>

          {/* ------------------------------------------------------ 筛选面板 */}
          {showFilter && (
            <div className="animate-slideUp mb-4 rounded-2xl border border-paper-line bg-paper-card p-4 shadow-e1">
              <div className="mb-2 text-label font-semibold text-ink-faint">类型</div>
              <div className="mb-4 flex gap-2">
                {(['all', 'movie', 'tv'] as const).map((k) => (
                  <Chip key={k} active={kind === k} onClick={() => setKind(k)}>
                    {k === 'all' ? '全部' : KIND_LABEL[k]}
                  </Chip>
                ))}
              </div>

              <div className="mb-2 text-label font-semibold text-ink-faint">排序</div>
              <div className="mb-4 flex flex-wrap gap-2">
                {SORTS.map((s) => (
                  <Chip key={s.value} active={sort === s.value} onClick={() => setSort(s.value)}>
                    {s.label}
                  </Chip>
                ))}
              </div>

              {tags.length > 0 && (
                <>
                  <div className="mb-2 text-label font-semibold text-ink-faint">标签</div>
                  <div className="flex flex-wrap gap-2">
                    <Chip active={!tag} onClick={() => setTag(null)}>
                      全部
                    </Chip>
                    {tags.map((t) => (
                      <Chip key={t} active={tag === t} onClick={() => setTag(t)} tone="reel">
                        {t}
                      </Chip>
                    ))}
                  </div>
                </>
              )}

              {filtersOn && (
                <button
                  onClick={() => {
                    setStatus('all')
                    setKind('all')
                    setTag(null)
                    setSort('updated')
                  }}
                  className="mt-4 text-label font-medium text-reel-dark active:opacity-60"
                >
                  重置筛选
                </button>
              )}
            </div>
          )}

          {/* ------------------------------------------------------ 状态筛选 */}
          <div className="no-scrollbar -mx-4 mb-4 flex gap-2 overflow-x-auto px-4 pb-1">
            {STATUS_TABS.map((s) => (
              <Chip key={s.value} active={status === s.value} onClick={() => setStatus(s.value)}>
                {s.label}
              </Chip>
            ))}
          </div>

          {/* ---------------------------------------------------------- 内容 */}
          {!ready ? (
            <GridSkeleton cols={theme.columns} gap={gapOf(theme.density)} count={6} />
          ) : filtered.length === 0 ? (
            <EmptyState
              icon={items.length === 0 ? 'film' : 'search'}
              title={items.length === 0 ? '还没有收藏' : '没有匹配的结果'}
              desc={
                items.length === 0
                  ? '到「添加」页搜索 TMDB 资料库，或手动录入一部喜欢的影片。'
                  : '换个关键词，或者把筛选条件放宽一些。'
              }
              action={
                items.length === 0 ? (
                  <Link to="/discover" state={zone === 'vault' ? { toVault: true } : undefined}>
                    <Button>去添加第一部</Button>
                  </Link>
                ) : null
              }
            />
          ) : settings.view === 'grid' ? (
            <div
              className="grid"
              style={{
                gridTemplateColumns: `repeat(${theme.columns}, minmax(0, 1fr))`,
                gap: gapOf(theme.density)
              }}
            >
              {filtered.map((it, idx) => (
                <Card
                  key={it.id}
                  zone={zone}
                  item={it}
                  badgeRating={theme.badgeRating}
                  showTitle={theme.cardTitle}
                  index={idx}
                />
              ))}
            </div>
          ) : (
            <div className="divide-y divide-paper-line overflow-hidden rounded-2xl border border-paper-line bg-paper-card">
              {filtered.map((it) => (
                <Row key={it.id} zone={zone} item={it} />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  )
}

function GridSkeleton({ cols, gap, count }: { cols: number; gap: number; count: number }) {
  return (
    <div className="grid" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`, gap }}>
      {Array.from({ length: count }).map((_, i) => (
        <div key={i}>
          <Skeleton className="aspect-[2/3] w-full rounded-xl" />
          <Skeleton className="mt-2 h-3.5 w-4/5" />
          <Skeleton className="mt-1.5 h-3 w-1/3" />
        </div>
      ))}
    </div>
  )
}

function Card({
  zone,
  item,
  badgeRating,
  showTitle,
  index
}: {
  zone: Zone
  item: TitleItem
  badgeRating: boolean
  showTitle: boolean
  index: number
}) {
  return (
    <Link
      to={`/title/${zone}/${item.id}`}
      className="animate-staggerIn pressable block"
      // 交错淡入，最多错开前 10 个，避免长列表后面等待太久
      style={{ animationDelay: `${Math.min(index, 10) * 28}ms` }}
    >
      <div className="relative">
        <Poster zone={zone} item={item} />
        <div className="pointer-events-none absolute inset-x-0 top-0 flex items-start justify-between p-1.5">
          <StatusPill status={item.status} />
          {badgeRating && item.rating ? (
            <span className="flex items-center gap-0.5 rounded-full bg-paper-card/92 px-1.5 py-0.5 text-micro font-semibold text-reel-dark shadow-e1 backdrop-blur-sm">
              <Icon name="starFill" size={9} />
              {(item.rating / 2).toFixed(1)}
            </span>
          ) : (
            <span />
          )}
        </div>
        {item.kind === 'tv' && item.progress && item.progress.episode > 0 && (
          <span className="pointer-events-none absolute inset-x-1.5 bottom-1.5 rounded-full bg-paper-card/92 px-1.5 py-0.5 text-center text-micro font-medium text-ink shadow-e1 backdrop-blur-sm">
            S{item.progress.season}E{item.progress.episode}
          </span>
        )}
      </div>
      {showTitle && (
        <div className="pt-2">
          <div className="truncate text-label font-medium leading-snug text-ink">{item.title}</div>
          <div className="mt-0.5 text-micro text-ink-faint">
            {item.year || '—'}
            {item.kind === 'tv' ? ' · 剧集' : ''}
          </div>
        </div>
      )}
    </Link>
  )
}

function StatusPill({ status }: { status: WatchStatus }) {
  if (status === 'done') return null
  const tone =
    status === 'watching'
      ? 'bg-reel text-reel-on'
      : status === 'wish'
        ? 'bg-paper-card/92 text-ink-soft'
        : 'bg-ink/70 text-ink-inverse'
  return (
    <span
      className={clsx(
        'rounded-full px-1.5 py-0.5 text-micro font-medium shadow-e1 backdrop-blur-sm',
        tone
      )}
    >
      {STATUS_LABEL[status]}
    </span>
  )
}

function Row({ zone, item }: { zone: Zone; item: TitleItem }) {
  return (
    <Link
      to={`/title/${zone}/${item.id}`}
      className="flex gap-3.5 p-3.5 transition-colors ease-standard duration-2 hover:bg-paper-sunken active:bg-paper-sunken"
    >
      <div className="w-[52px] shrink-0">
        <Poster zone={zone} item={item} rounded="rounded-lg" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-2">
          <span className="truncate text-body font-medium text-ink">{item.title}</span>
          <span className="shrink-0 text-caption text-ink-faint">{item.year || '—'}</span>
        </div>
        <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-caption text-ink-faint">
          <span>{KIND_LABEL[item.kind]}</span>
          <span aria-hidden>·</span>
          <span className={item.status === 'watching' ? 'text-reel-dark' : undefined}>
            {STATUS_LABEL[item.status]}
          </span>
          {item.progress && item.kind === 'tv' && item.progress.episode > 0 && (
            <>
              <span aria-hidden>·</span>
              <span>
                S{item.progress.season}E{item.progress.episode}
              </span>
            </>
          )}
          {item.rating ? (
            <span className="flex items-center gap-0.5 font-medium text-reel-dark">
              <Icon name="starFill" size={10} />
              {(item.rating / 2).toFixed(1)}
            </span>
          ) : null}
        </div>
        {(item.tags ?? []).length > 0 && (
          <div className="mt-2 flex gap-1.5 overflow-hidden">
            {item.tags.slice(0, 3).map((t) => (
              <span
                key={t}
                className="rounded-full bg-paper-sunken px-2 py-0.5 text-micro text-ink-soft"
              >
                {t}
              </span>
            ))}
          </div>
        )}
      </div>
    </Link>
  )
}
