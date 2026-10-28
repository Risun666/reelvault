import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import clsx from 'clsx'
import type { TmdbSearchHit } from '../lib/tmdb'
import type { TitleItem } from '../types'
import Poster from './Poster'
import Icon from './Icon'

export function RemoteRow({
  rank,
  hit,
  onClick
}: {
  rank: number
  hit: TmdbSearchHit
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      className="flex w-full items-center gap-3 rounded-xl border border-paper-line bg-white p-2.5 text-left active:bg-paper"
    >
      <span
        className={clsx(
          'w-6 shrink-0 text-center text-[1rem] font-semibold tabular-nums',
          rank <= 3 ? 'text-reel' : 'text-ink-faint'
        )}
      >
        {rank}
      </span>
      <div className="w-[42px] shrink-0">
        {hit.poster ? (
          <img src={hit.poster} alt="" loading="lazy" className="aspect-[2/3] w-full rounded-md object-cover" />
        ) : (
          <div className="aspect-[2/3] w-full rounded-md bg-paper-line" />
        )}
      </div>
      <div className="min-w-0 flex-1">
        <div className="truncate text-[0.875rem] font-medium">{hit.title}</div>
        <div className="mt-0.5 truncate text-[0.6875rem] text-ink-faint">
          {hit.year || '—'} · {hit.kind === 'tv' ? '剧集' : '电影'}
        </div>
      </div>
      {hit.score ? (
        <span className="shrink-0 rounded bg-reel-soft px-1.5 py-0.5 text-[0.6875rem] font-semibold text-reel-dark">
          {hit.score.toFixed(1)}
        </span>
      ) : null}
    </button>
  )
}

export function TrendingCard({ hit, onClick }: { hit: TmdbSearchHit; onClick: () => void }) {
  return (
    <button onClick={onClick} className="w-[104px] shrink-0 text-left">
      <div className="relative overflow-hidden rounded-xl bg-paper-line">
        {hit.poster ? (
          <img src={hit.poster} alt="" loading="lazy" className="aspect-[2/3] w-full object-cover" />
        ) : (
          <div className="aspect-[2/3] w-full" />
        )}
        {hit.score ? (
          <span className="absolute right-1 top-1 rounded bg-white/90 px-1 py-0.5 text-[0.625rem] font-semibold text-reel">
            {hit.score.toFixed(1)}
          </span>
        ) : null}
      </div>
      <div className="mt-1 truncate text-[0.75rem] font-medium">{hit.title}</div>
      <div className="text-[0.625rem] text-ink-faint">{hit.year || '—'}</div>
    </button>
  )
}

/** 我的观影排行榜：按自己的评分排序 */
export function MyRanking({ items }: { items: TitleItem[] }) {
  const top = useMemo(
    () =>
      [...items]
        .filter((i) => (i.rating ?? 0) > 0)
        .sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0))
        .slice(0, 10),
    [items]
  )
  const [first, second, third] = top

  if (top.length === 0) {
    return (
      <p className="py-4 text-center text-[0.8125rem] text-ink-faint">
        还没有给影片打过分，去片库随手标个星级吧
      </p>
    )
  }

  return (
    <div>
      {first && (
        <Link to={`/title/library/${first.id}`} className="mb-2 flex gap-3 rounded-2xl border border-paper-line bg-white p-3">
          <div className="w-[72px] shrink-0">
            <Poster zone="library" item={first} />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5">
              <span className="rounded bg-reel-soft px-1.5 py-0.5 text-[0.625rem] font-semibold text-reel-dark">
                年度 No.1
              </span>
              <span className="text-[0.6875rem] text-ink-faint">
                {(first.rating ?? 0) / 2} ★
              </span>
            </div>
            <div className="mt-1 truncate text-[0.9375rem] font-semibold">{first.title}</div>
            <p className="mt-1 line-clamp-2 text-[0.75rem] leading-relaxed text-ink-soft">
              {first.review || first.overview || '暂无短评'}
            </p>
          </div>
        </Link>
      )}
      <div className="grid grid-cols-2 gap-2">
        {[second, third].map((it, idx) =>
          it ? (
            <Link
              key={it.id}
              to={`/title/library/${it.id}`}
              className="flex gap-2 rounded-xl border border-paper-line bg-white p-2"
            >
              <div className="w-[38px] shrink-0">
                <Poster zone="library" item={it} rounded="rounded-md" />
              </div>
              <div className="min-w-0 flex-1">
                <span className="text-[0.625rem] text-ink-faint">No.{idx + 2}</span>
                <div className="truncate text-[0.8125rem] font-medium">{it.title}</div>
                <div className="text-[0.625rem] text-ink-faint">{(it.rating ?? 0) / 2} ★</div>
              </div>
            </Link>
          ) : null
        )}
      </div>
      {top.length > 3 && (
        <div className="mt-2 space-y-1">
          {top.slice(3).map((it, idx) => (
            <Link
              key={it.id}
              to={`/title/library/${it.id}`}
              className="flex items-center gap-2.5 rounded-lg px-2 py-1.5 active:bg-paper"
            >
              <span className="w-4 shrink-0 text-center text-[0.75rem] text-ink-faint">
                {idx + 4}
              </span>
              <Icon name="film" size={12} className="shrink-0 text-ink-faint" />
              <span className="min-w-0 flex-1 truncate text-[0.8125rem]">{it.title}</span>
              <span className="shrink-0 text-[0.6875rem] text-reel">
                {(it.rating ?? 0) / 2}
              </span>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}

/** 年度观影小结 */
export function YearDigest({ items }: { items: TitleItem[] }) {
  const year = new Date().getFullYear()
  const done = items.filter((i) => i.status === 'done' && (i.watchedAt ?? '').startsWith(String(year)))
  const directorCount = new Map<string, number>()
  items.forEach((i) => {
    if (i.director) directorCount.set(i.director, (directorCount.get(i.director) ?? 0) + 1)
  })
  const topDirectors = [...directorCount.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3)

  return (
    <div className="rounded-2xl border border-paper-line bg-white p-3">
      <div className="flex items-baseline gap-2">
        <span className="text-[0.875rem] font-semibold">{year} 年</span>
        <span className="text-[0.75rem] text-ink-faint">
          看完了 {done.length} 部
        </span>
      </div>
      {topDirectors.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {topDirectors.map(([name, count]) => (
            <span key={name} className="rounded-full bg-paper px-2 py-1 text-[0.6875rem] text-ink-soft">
              {name} · {count}
            </span>
          ))}
        </div>
      )}
    </div>
  )
}
