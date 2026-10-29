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
import { Button, Chip, EmptyState, Segmented } from '../components/ui'
import PeopleGrid from '../components/PeopleGrid'

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

  return (
    <div className="mx-auto max-w-[560px] px-4 pb-8 pt-safe">
      <header className="flex items-end justify-between pb-3 pt-2">
        <div>
          <h1
            className={clsx(
              'text-[1.5rem] font-semibold tracking-tight',
              accent ? 'text-reel-dark' : 'text-ink'
            )}
          >
            {title}
          </h1>
          <p className="mt-0.5 text-[0.75rem] text-ink-faint">
            {ready
              ? `共 ${items.length} 条记录${filtered.length !== items.length ? ` · 筛出 ${filtered.length} 条` : ''}`
              : '载入中…'}
          </p>
        </div>
        <Link to={`/add/${zone}`}>
          <Button size="sm">
            <Icon name="plus" size={16} /> 手动添加
          </Button>
        </Link>
      </header>

      <div className="pb-3">
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
      <div className="flex items-center gap-2 pb-3">
        <div className="relative flex-1">
          <Icon name="search" size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-faint" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="搜索片名、演员、标签…"
            className="w-full rounded-xl border border-paper-line bg-white py-2.5 pl-9 pr-3 text-[0.875rem] outline-none placeholder:text-ink-faint/80 focus:border-ink/25"
          />
        </div>
        <button
          onClick={() => setShowFilter((v) => !v)}
          className={clsx(
            'rounded-xl border p-2.5',
            showFilter ? 'border-ink bg-ink text-white' : 'border-paper-line bg-white text-ink-soft'
          )}
        >
          <Icon name="filter" size={17} />
        </button>
        <button
          onClick={() => settings.set({ view: settings.view === 'grid' ? 'list' : 'grid' })}
          className="rounded-xl border border-paper-line bg-white p-2.5 text-ink-soft"
        >
          <Icon name={settings.view === 'grid' ? 'list' : 'grid'} size={17} />
        </button>
      </div>

      {showFilter && (
        <div className="fade-in mb-3 rounded-2xl border border-paper-line bg-white p-3">
          <div className="mb-2 text-[0.75rem] font-medium text-ink-faint">类型</div>
          <div className="mb-3 flex gap-2">
            {(['all', 'movie', 'tv'] as const).map((k) => (
              <Chip key={k} active={kind === k} onClick={() => setKind(k)}>
                {k === 'all' ? '全部' : KIND_LABEL[k]}
              </Chip>
            ))}
          </div>
          <div className="mb-2 text-[0.75rem] font-medium text-ink-faint">排序</div>
          <div className="mb-3 flex flex-wrap gap-2">
            {SORTS.map((s) => (
              <Chip key={s.value} active={sort === s.value} onClick={() => setSort(s.value)}>
                {s.label}
              </Chip>
            ))}
          </div>
          {tags.length > 0 && (
            <>
              <div className="mb-2 text-[0.75rem] font-medium text-ink-faint">标签</div>
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
        </div>
      )}

      <div className="no-scrollbar -mx-4 mb-3 flex gap-2 overflow-x-auto px-4">
        {STATUS_TABS.map((s) => (
          <Chip key={s.value} active={status === s.value} onClick={() => setStatus(s.value)}>
            {s.label}
          </Chip>
        ))}
      </div>

      {ready && filtered.length === 0 ? (
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
              <Link to="/discover">
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
          {filtered.map((it) => (
            <Card
              key={it.id}
              zone={zone}
              item={it}
              badgeRating={theme.badgeRating}
              showTitle={theme.cardTitle}
            />
          ))}
        </div>
      ) : (
        <div className="divide-y divide-paper-line overflow-hidden rounded-2xl border border-paper-line bg-white">
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

function Card({
  zone,
  item,
  badgeRating,
  showTitle
}: {
  zone: Zone
  item: TitleItem
  badgeRating: boolean
  showTitle: boolean
}) {
  return (
    <Link to={`/title/${zone}/${item.id}`} className="block transition-transform active:scale-[0.97]">
      <div className="relative">
        <Poster zone={zone} item={item} />
        <span className="absolute left-1.5 top-1.5 rounded-md bg-ink/70 px-1.5 py-0.5 text-[0.625rem] font-medium text-white backdrop-blur">
          {STATUS_LABEL[item.status]}
        </span>
        {badgeRating && item.rating ? (
          <span className="absolute right-1.5 top-1.5 flex items-center gap-0.5 rounded-md bg-white/90 px-1.5 py-0.5 text-[0.625rem] font-semibold text-reel">
            <Icon name="star" size={10} />
            {(item.rating / 2).toFixed(1)}
          </span>
        ) : null}
        {item.kind === 'tv' && item.progress && item.progress.episode > 0 ? (
          <span className="absolute inset-x-1.5 bottom-1.5 rounded-md bg-white/90 px-1.5 py-0.5 text-center text-[0.625rem] font-medium text-ink">
            S{item.progress.season}E{item.progress.episode}
          </span>
        ) : null}
      </div>
      {showTitle && (
        <>
          <div className="mt-1.5 truncate text-[0.8125rem] font-medium leading-tight">
            {item.title}
          </div>
          <div className="text-[0.6875rem] text-ink-faint">
            {item.year || '—'}
            {item.kind === 'tv' ? ' · 剧集' : ''}
          </div>
        </>
      )}
    </Link>
  )
}

function Row({ zone, item }: { zone: Zone; item: TitleItem }) {
  return (
    <Link to={`/title/${zone}/${item.id}`} className="flex gap-3 p-3 active:bg-paper">
      <div className="w-14 shrink-0">
        <Poster zone={zone} item={item} rounded="rounded-lg" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-2">
          <span className="truncate text-[0.875rem] font-medium">{item.title}</span>
          <span className="shrink-0 text-[0.6875rem] text-ink-faint">{item.year || '—'}</span>
        </div>
        <div className="mt-1 flex items-center gap-2 text-[0.6875rem] text-ink-faint">
          <span>{KIND_LABEL[item.kind]}</span>
          <span>·</span>
          <span>{STATUS_LABEL[item.status]}</span>
          {item.progress && item.kind === 'tv' && item.progress.episode > 0 ? (
            <>
              <span>·</span>
              <span>
                S{item.progress.season}E{item.progress.episode}
              </span>
            </>
          ) : null}
          {item.rating ? (
            <span className="text-reel">{(item.rating / 2).toFixed(1)}★</span>
          ) : null}
        </div>
        {(item.tags ?? []).length > 0 && (
          <div className="mt-1.5 flex gap-1 overflow-hidden">
            {item.tags.slice(0, 3).map((t) => (
              <span key={t} className="rounded bg-paper px-1.5 py-0.5 text-[0.625rem] text-ink-soft">
                {t}
              </span>
            ))}
          </div>
        )}
      </div>
    </Link>
  )
}
