import { useMemo } from 'react'
import clsx from 'clsx'
import { useLibraryStore } from '../store/zone'
import { computeStats, formatMinutes } from '../lib/stats'
import { STATUS_LABEL, STATUS_ORDER } from '../types'
import { EmptyState, Section } from '../components/ui'
import { Link } from 'react-router-dom'
import { useCollections } from '../store/collections'

export default function Stats() {
  const items = useLibraryStore((s) => s.items)
  const ready = useLibraryStore((s) => s.ready)
  const stats = useMemo(() => computeStats(items), [items])
  const collections = useCollections((s) => s.items)

  if (ready && items.length === 0) {
    return (
      <div className="mx-auto max-w-[560px] px-4 pb-10 pt-safe">
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

      <section className="mb-6 grid grid-cols-2 gap-3">
        <StatCard
          index={0}
          label="收藏总数"
          value={String(stats.total)}
          sub={`电影 ${stats.movies} · 剧集 ${stats.tvs}`}
        />
        <StatCard
          index={1}
          label="累计观看时长"
          value={formatMinutes(stats.minutes)}
          sub={`剧集已看 ${stats.episodes} 集`}
        />
        <StatCard
          index={2}
          label="已看完"
          value={String(stats.byStatus.done)}
          sub={`在看 ${stats.byStatus.watching} · 想看 ${stats.byStatus.wish}`}
        />
        <StatCard
          index={3}
          label="平均评分"
          value={stats.avgRating ? stats.avgRating.toFixed(2) : '—'}
          sub={`${stats.rated} 部已评分`}
        />
      </section>

      <Section title="快捷入口">
        <div className="grid grid-cols-2 gap-3">
          <Link
            to="/collections"
            className="animate-staggerIn rounded-2xl border border-paper-line bg-paper-card p-4 shadow-e1 pressable"
          >
            <div className="text-caption text-ink-faint">片单合集</div>
            <div className="mt-1.5 font-display text-headline font-semibold leading-none tabular-nums text-ink">
              {collections.length}
            </div>
            <div className="mt-2 text-caption font-medium text-reel-dark">去整理 →</div>
          </Link>
          <Link
            to="/discover"
            className="animate-staggerIn rounded-2xl border border-paper-line bg-paper-card p-4 shadow-e1 pressable"
            style={{ animationDelay: '28ms' }}
          >
            <div className="text-caption text-ink-faint">发现与榜单</div>
            <div className="mt-1.5 font-display text-headline font-semibold leading-none text-ink">
              TMDB
            </div>
            <div className="mt-2 text-caption font-medium text-reel-dark">找片 →</div>
          </Link>
        </div>
      </Section>

      <Panel title="观看状态分布">
        <div className="space-y-3">
          {STATUS_ORDER.map((s, i) => (
            <Bar
              key={s}
              index={i}
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
          <p className="text-body-sm text-ink-faint">还没有给任何影片打过分。</p>
        ) : (
          <div className="space-y-3">
            {[...stats.ratingDist].reverse().map((d, i) => (
              <Bar
                key={d.stars}
                index={i}
                label={`${d.stars} 星`}
                value={d.count}
                max={Math.max(1, ...stats.ratingDist.map((x) => x.count))}
                tone="reel"
              />
            ))}
          </div>
        )}
      </Panel>

      {stats.topGenres.length > 0 && (
        <Panel title="偏爱类型">
          <div className="space-y-3">
            {stats.topGenres.map(([g, c], i) => (
              <Bar key={g} index={i} label={g} value={c} max={maxGenre} tone="ink" />
            ))}
          </div>
        </Panel>
      )}

      {stats.monthly.length > 1 && (
        <Panel title="近 12 个月记录趋势">
          <div className="rounded-xl bg-paper-sunken p-3">
            <div className="flex h-24 items-end gap-1.5">
              {stats.monthly.map((m, i) => (
                <div key={m.month} className="flex h-full flex-1 flex-col justify-end">
                  <div
                    className="animate-staggerIn w-full rounded-t-lg bg-reel"
                    style={{
                      height: `${Math.max(4, (m.count / maxMonth) * 88)}px`,
                      animationDelay: `${Math.min(i, 10) * 28}ms`
                    }}
                  />
                </div>
              ))}
            </div>
            <div className="mt-1.5 flex gap-1.5 border-t border-paper-line pt-1.5">
              {stats.monthly.map((m) => (
                <span
                  key={m.month}
                  className="flex-1 text-center text-micro tabular-nums text-ink-faint"
                >
                  {m.month.slice(5)}
                </span>
              ))}
            </div>
          </div>
        </Panel>
      )}

      {stats.topTags.length > 0 && (
        <Panel title="常用标签">
          <div className="flex flex-wrap gap-2">
            {stats.topTags.map(([t, c]) => (
              <span
                key={t}
                className="rounded-full bg-paper-sunken px-2.5 py-1 text-caption text-ink-soft"
              >
                #{t} <span className="tabular-nums text-ink-faint">{c}</span>
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
    <header className="pb-5 pt-3">
      <h1 className="font-display text-page font-semibold leading-tight tracking-tight text-ink">
        观影统计
      </h1>
      <p className="mt-1 text-caption text-ink-faint">只统计公开片库的数据</p>
    </header>
  )
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Section title={title}>
      <div className="rounded-2xl border border-paper-line bg-paper-card p-4 shadow-e1">
        {children}
      </div>
    </Section>
  )
}

function StatCard({
  index,
  label,
  value,
  sub
}: {
  index: number
  label: string
  value: string
  sub?: string
}) {
  return (
    <div
      className="animate-staggerIn rounded-2xl border border-paper-line bg-paper-card p-4 shadow-e1"
      style={{ animationDelay: `${Math.min(index, 10) * 28}ms` }}
    >
      <div className="text-caption text-ink-faint">{label}</div>
      <div className="mt-1.5 break-words font-display text-display tabular-nums leading-tight text-ink">
        {value}
      </div>
      {sub && <div className="mt-2 text-micro text-ink-faint">{sub}</div>}
    </div>
  )
}

function Bar({
  label,
  value,
  max,
  tone,
  index = 0
}: {
  label: string
  value: number
  max: number
  tone: 'ink' | 'reel'
  index?: number
}) {
  const pct = max ? (value / max) * 100 : 0
  return (
    <div className="flex items-center gap-3">
      <span className="w-14 shrink-0 truncate text-caption text-ink-soft">{label}</span>
      <div className="h-2 flex-1 overflow-hidden rounded-full bg-paper-sunken">
        <div
          className={clsx(
            'animate-fadeIn h-full rounded-full',
            tone === 'reel' ? 'bg-reel' : 'bg-ink/70'
          )}
          style={{
            width: `${Math.max(pct, value > 0 ? 6 : 0)}%`,
            animationDelay: `${Math.min(index, 10) * 28}ms`
          }}
        />
      </div>
      <span className="w-6 shrink-0 text-right text-caption tabular-nums text-ink-faint">{value}</span>
    </div>
  )
}
