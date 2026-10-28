import { useMemo } from 'react'
import { useLibraryStore } from '../store/zone'
import { computeStats, formatMinutes } from '../lib/stats'
import { STATUS_LABEL, STATUS_ORDER } from '../types'
import { EmptyState } from '../components/ui'
import { Link } from 'react-router-dom'
import { useCollections } from '../store/collections'

export default function Stats() {
  const items = useLibraryStore((s) => s.items)
  const ready = useLibraryStore((s) => s.ready)
  const stats = useMemo(() => computeStats(items), [items])
  const collections = useCollections((s) => s.items)

  if (ready && items.length === 0) {
    return (
      <div className="mx-auto max-w-[560px]">
        <Header />
        <EmptyState icon="chart" title="还没有数据" desc="收藏几部影片后，这里会生成你的观影统计。" />
      </div>
    )
  }

  const maxMonth = Math.max(1, ...stats.monthly.map((m) => m.count))
  const maxGenre = Math.max(1, ...stats.topGenres.map((g) => g[1]))
  const maxStatus = Math.max(1, ...STATUS_ORDER.map((s) => stats.byStatus[s]))

  return (
    <div className="mx-auto max-w-[560px] px-4 pb-10 pt-safe">
      <Header />

      <div className="grid grid-cols-2 gap-3">
        <StatCard label="收藏总数" value={String(stats.total)} sub={`电影 ${stats.movies} · 剧集 ${stats.tvs}`} />
        <StatCard label="累计观看时长" value={formatMinutes(stats.minutes)} sub={`剧集已看 ${stats.episodes} 集`} />
        <StatCard
          label="已看完"
          value={String(stats.byStatus.done)}
          sub={`在看 ${stats.byStatus.watching} · 想看 ${stats.byStatus.wish}`}
        />
        <StatCard
          label="平均评分"
          value={stats.avgRating ? stats.avgRating.toFixed(2) : '—'}
          sub={`${stats.rated} 部已评分`}
        />
      </div>

      <div className="mt-3 grid grid-cols-2 gap-3">
        <Link to="/collections" className="rounded-2xl border border-paper-line bg-white p-3.5 active:bg-paper">
          <div className="text-[0.6875rem] text-ink-faint">片单合集</div>
          <div className="mt-1 text-[1.25rem] font-semibold leading-none">{collections.length}</div>
          <div className="mt-1.5 text-[0.6875rem] text-reel">去整理 →</div>
        </Link>
        <Link to="/discover" className="rounded-2xl border border-paper-line bg-white p-3.5 active:bg-paper">
          <div className="text-[0.6875rem] text-ink-faint">发现与榜单</div>
          <div className="mt-1 text-[1.25rem] font-semibold leading-none">TMDB</div>
          <div className="mt-1.5 text-[0.6875rem] text-reel">找片 →</div>
        </Link>
      </div>

      <Panel title="观看状态分布">
        <div className="space-y-2.5">
          {STATUS_ORDER.map((s) => (
            <Bar
              key={s}
              label={STATUS_LABEL[s]}
              value={stats.byStatus[s]}
              max={maxStatus}
              tone={s === 'done' ? 'reel' : 'ink'}
            />
          ))}
        </div>
      </Panel>

      <Panel title="评分分布">
        {stats.rated === 0 ? (
          <p className="text-[0.8125rem] text-ink-faint">还没有给任何影片打过分。</p>
        ) : (
          <div className="space-y-2.5">
            {[...stats.ratingDist].reverse().map((d) => (
              <Bar key={d.stars} label={`${d.stars} 星`} value={d.count} max={Math.max(1, ...stats.ratingDist.map((x) => x.count))} tone="reel" />
            ))}
          </div>
        )}
      </Panel>

      {stats.topGenres.length > 0 && (
        <Panel title="偏爱类型">
          <div className="space-y-2.5">
            {stats.topGenres.map(([g, c]) => (
              <Bar key={g} label={g} value={c} max={maxGenre} tone="ink" />
            ))}
          </div>
        </Panel>
      )}

      {stats.monthly.length > 1 && (
        <Panel title="近 12 个月记录趋势">
          <div className="flex h-28 items-end gap-1.5">
            {stats.monthly.map((m) => (
              <div key={m.month} className="flex flex-1 flex-col items-center gap-1">
                <div
                  className="w-full rounded-t bg-ink/75"
                  style={{ height: `${Math.max(4, (m.count / maxMonth) * 88)}px` }}
                />
                <span className="text-[0.5625rem] text-ink-faint">{m.month.slice(5)}</span>
              </div>
            ))}
          </div>
        </Panel>
      )}

      {stats.topTags.length > 0 && (
        <Panel title="常用标签">
          <div className="flex flex-wrap gap-2">
            {stats.topTags.map(([t, c]) => (
              <span key={t} className="rounded-full bg-paper px-2.5 py-1 text-[0.75rem] text-ink-soft">
                #{t} <span className="text-ink-faint">{c}</span>
              </span>
            ))}
          </div>
        </Panel>
      )}
    </div>
  )
}

function Header() {
  return (
    <header className="pb-3 pt-2">
      <h1 className="text-[1.5rem] font-semibold tracking-tight">观影统计</h1>
      <p className="mt-0.5 text-[0.75rem] text-ink-faint">只统计公开片库的数据</p>
    </header>
  )
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-5 rounded-2xl border border-paper-line bg-white p-4">
      <h2 className="mb-3 text-[0.75rem] font-medium uppercase tracking-wide text-ink-faint">{title}</h2>
      {children}
    </section>
  )
}

function StatCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-2xl border border-paper-line bg-white p-3.5">
      <div className="text-[0.6875rem] text-ink-faint">{label}</div>
      <div className="mt-1 text-[1.25rem] font-semibold leading-none">{value}</div>
      {sub && <div className="mt-1.5 text-[0.6875rem] text-ink-faint">{sub}</div>}
    </div>
  )
}

function Bar({
  label,
  value,
  max,
  tone
}: {
  label: string
  value: number
  max: number
  tone: 'ink' | 'reel'
}) {
  const pct = max ? (value / max) * 100 : 0
  return (
    <div className="flex items-center gap-3">
      <span className="w-14 shrink-0 text-[0.75rem] text-ink-soft">{label}</span>
      <div className="h-2 flex-1 overflow-hidden rounded-full bg-paper">
        <div
          className={tone === 'reel' ? 'h-full rounded-full bg-reel' : 'h-full rounded-full bg-ink/70'}
          style={{ width: `${Math.max(pct, value > 0 ? 6 : 0)}%` }}
        />
      </div>
      <span className="w-6 shrink-0 text-right text-[0.75rem] tabular-nums text-ink-faint">{value}</span>
    </div>
  )
}
