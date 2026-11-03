import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import clsx from 'clsx'
import { TmdbError, fetchChart, hasApiKey, searchTitles, type TmdbSearchHit } from '../lib/tmdb'
import { fetchTitleCandidate } from '../lib/addTitle'
import { useSettings } from '../store/settings'
import { useLibraryStore, useVaultStore, zoneStore } from '../store/zone'
import { useVaultSession } from '../store/vaultSession'
import type { Zone } from '../lib/db'
import type { TitleItem, WatchStatus } from '../types'
import { KIND_LABEL, STATUS_LABEL, STATUS_ORDER } from '../types'
import Icon from '../components/Icon'
import { Button, Chip, EmptyState, Section, Segmented, Sheet, Skeleton, inputCls } from '../components/ui'
import { toast } from '../components/Toast'
import { MyRanking, YearDigest } from '../components/Charts'

type Tab = 'search' | 'trending' | 'ranking'

export default function Discover() {
  const settings = useSettings()
  const vaultSession = useVaultSession()
  const lib = useLibraryStore((s) => s.items)
  const vault = useVaultStore((s) => s.items)

  // 从隐私保险箱点「添加」进来时带上 state.toVault，进入「保险箱模式」：搜索结果默认/仅可存入隐私保险箱
  const loc = useLocation()
  const toVault = Boolean((loc.state as { toVault?: boolean } | null)?.toVault)

  const [tab, setTab] = useState<Tab>('search')
  const [kind, setKind] = useState<'all' | 'movie' | 'tv'>('all')
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<TmdbSearchHit[]>([])
  const [searching, setSearching] = useState(false)
  const [searchError, setSearchError] = useState<string | null>(null)

  const [chartKind, setChartKind] = useState<'movie' | 'tv'>('movie')
  const [chartHits, setChartHits] = useState<TmdbSearchHit[]>([])
  const [chartLoading, setChartLoading] = useState(false)
  const [chartError, setChartError] = useState<string | null>(null)
  const [topMovie, setTopMovie] = useState<TmdbSearchHit[]>([])
  const [topTv, setTopTv] = useState<TmdbSearchHit[]>([])
  const [topLoading, setTopLoading] = useState(false)

  const [target, setTarget] = useState<TmdbSearchHit | null>(null)
  const [candidate, setCandidate] = useState<{ item: TitleItem; posterBlob: Blob | null } | null>(null)
  const [candidateError, setCandidateError] = useState<string | null>(null)
  const [zone, setZone] = useState<Zone>(toVault ? 'vault' : 'library')
  const [status, setStatus] = useState<WatchStatus>('wish')
  const [saving, setSaving] = useState(false)

  // 手动添加的落点：保险箱模式进 /add/vault，否则进 /add/library
  const addPath = toVault ? '/add/vault' : '/add/library'

  const collected = useMemo(() => {
    const ids = new Set<number>()
    lib.forEach((i) => i.tmdbId && ids.add(i.tmdbId))
    vault.forEach((i) => i.tmdbId && ids.add(i.tmdbId))
    return ids
  }, [lib, vault])

  const vaultIds = useMemo(() => {
    const ids = new Set<number>()
    vault.forEach((i) => i.tmdbId && ids.add(i.tmdbId))
    return ids
  }, [vault])

  const runSearch = useCallback(
    async (kw: string, k: 'all' | 'movie' | 'tv') => {
      if (!kw.trim()) {
        setResults([])
        setSearchError(null)
        return
      }
      if (!hasApiKey(settings)) {
        setSearchError('尚未配置 TMDB API Key')
        return
      }
      setSearching(true)
      setSearchError(null)
      try {
        const hits = await searchTitles(settings, kw, k)
        setResults(hits)
      } catch (e) {
        setResults([])
        setSearchError(e instanceof TmdbError ? e.message : '网络异常，稍后再试')
      } finally {
        setSearching(false)
      }
    },
    [settings]
  )

  const timer = useRef<number | undefined>(undefined)
  useEffect(() => {
    window.clearTimeout(timer.current)
    timer.current = window.setTimeout(() => void runSearch(query, kind), 420)
    return () => window.clearTimeout(timer.current)
  }, [query, kind, runSearch])

  useEffect(() => {
    if (tab !== 'trending') return
    if (!hasApiKey(settings)) {
      setChartError('尚未配置 TMDB API Key')
      return
    }
    setChartLoading(true)
    setChartError(null)
    void fetchChart(settings, chartKind, 'trending')
      .then(setChartHits)
      .catch((e: unknown) => setChartError(e instanceof TmdbError ? e.message : '加载失败'))
      .finally(() => setChartLoading(false))
  }, [tab, chartKind, settings])

  useEffect(() => {
    if (tab !== 'ranking') return
    if (!hasApiKey(settings)) return
    setTopLoading(true)
    void Promise.all([fetchChart(settings, 'movie', 'top'), fetchChart(settings, 'tv', 'top')])
      .then(([movie, tv]) => {
        setTopMovie(movie)
        setTopTv(tv)
      })
      .catch(() => undefined)
      .finally(() => setTopLoading(false))
  }, [tab, settings])

  async function openHit(hit: TmdbSearchHit) {
    setTarget(hit)
    setCandidate(null)
    setCandidateError(null)
    setZone('library')
    setStatus('wish')
    try {
      setCandidate(await fetchTitleCandidate(settings, hit))
    } catch (e) {
      setCandidateError(e instanceof TmdbError ? e.message : '详情获取失败')
    }
  }

  async function confirmAdd() {
    if (!candidate) return
    setSaving(true)
    try {
      const store = zoneStore(zone).getState()
      const poster = settings.cacheRemotePoster ? candidate.posterBlob : null
      await store.upsert({ ...candidate.item, status }, poster)
      setTarget(null)
      toast(zone === 'vault' ? '已存入隐私保险箱' : '已加入片库', 'good')
    } catch (e) {
      toast(e instanceof Error ? e.message : '保存失败', 'bad')
    } finally {
      setSaving(false)
    }
  }

  async function addToVault(hit: TmdbSearchHit) {
    try {
      const { item, posterBlob } = await fetchTitleCandidate(settings, hit)
      const poster = settings.cacheRemotePoster ? posterBlob : null
      await zoneStore('vault').getState().upsert({ ...item, status: 'wish' }, poster)
      toast('已加入隐私保险箱', 'good')
    } catch (e) {
      toast(e instanceof Error ? e.message : '加入失败', 'bad')
    }
  }

  return (
    <div className="mx-auto max-w-[560px] px-4 pb-10 pt-safe">
      <header className="flex items-end justify-between gap-3 pb-5 pt-3">
        <div className="min-w-0">
          <h1 className="font-display text-page font-semibold leading-tight tracking-tight text-ink">
            发现
          </h1>
          <p className="mt-1 text-caption text-ink-faint">搜索入库 · 看看最近大家在追什么</p>
        </div>
        <Link to={addPath} className="shrink-0">
          <Button size="sm" variant="outline">
            <Icon name="plus" size={15} /> 手动添加
          </Button>
        </Link>
      </header>

      <div className="mb-4">
        <Segmented
          value={tab}
          onChange={(v) => setTab(v as Tab)}
          options={[
            { value: 'search', label: '搜索' },
            { value: 'trending', label: '热门' },
            { value: 'ranking', label: '榜单' }
          ]}
        />
      </div>

      {/* TMDB 引导：一张有呼吸感的说明卡，强调色只落在图标上 */}
      {!hasApiKey(settings) && (
        <div className="mb-4 flex gap-3 rounded-2xl border border-paper-line bg-paper-sunken p-4">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-reel-soft text-reel-dark">
            <Icon name="lock" size={19} />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-body-sm leading-relaxed text-ink-soft">
              还没有填写 TMDB API Key。填一次就能自动拉封面、简介、演员表，也能看热门和榜单；也可以完全手动录入。
            </p>
            <div className="mt-3 flex gap-2">
              <Link to="/settings">
                <Button size="sm">去设置 API Key</Button>
              </Link>
              <Link to={addPath}>
                <Button size="sm" variant="outline">
                  手动添加
                </Button>
              </Link>
            </div>
          </div>
        </div>
      )}

      {tab === 'search' && (
        <>
          {/* 搜索是这个页的主角：占满整行的独立搜索区 */}
          <div className="mb-4 rounded-2xl border border-paper-line bg-paper-card p-3">
            <div className="relative">
              <Icon
                name="search"
                size={18}
                className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-faint"
              />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="搜索电影或剧集…"
                className={clsx(inputCls, 'h-11 pl-11')}
              />
            </div>
          </div>

          <div className="mb-5">
            <Segmented
              value={kind}
              onChange={(v) => setKind(v as typeof kind)}
              options={[
                { value: 'all', label: '全部' },
                { value: 'movie', label: '电影' },
                { value: 'tv', label: '剧集' }
              ]}
            />
          </div>

          {searching && <RowSkeleton count={4} />}

          {!searching && searchError && (
            <EmptyState
              icon="refresh"
              title="搜索失败"
              desc={searchError}
              action={
                <Button variant="outline" onClick={() => void runSearch(query, kind)}>
                  重试
                </Button>
              }
            />
          )}

          {!searching && !searchError && query.trim() && results.length === 0 && (
            <EmptyState
              icon="search"
              title="没有找到"
              desc="换个关键词试试，或者直接手动录入这部影片。"
              action={
                <Link to={addPath}>
                  <Button>手动添加</Button>
                </Link>
              }
            />
          )}

          {!searching && !searchError && results.length === 0 && !query.trim() && (
            <EmptyState
              icon="compass"
              title="开始搜一部吧"
              desc="输入片名，例如「花样年华」「漫长的季节」，支持中英文。"
            />
          )}

          <div className="space-y-2">
            {results.map((hit, i) => (
              <HitRow
                key={`${hit.kind}-${hit.tmdbId}`}
                hit={hit}
                index={i}
                done={collected.has(hit.tmdbId)}
                canAddVault={vaultSession.active}
                inVault={vaultIds.has(hit.tmdbId)}
                onAddVault={() => void addToVault(hit)}
                onClick={() => void openHit(hit)}
              />
            ))}
          </div>
        </>
      )}

      {tab === 'trending' && (
        <>
          <div className="mb-5">
            <Segmented
              value={chartKind}
              onChange={(v) => setChartKind(v as typeof chartKind)}
              options={[
                { value: 'movie', label: '热门电影' },
                { value: 'tv', label: '热门剧集' }
              ]}
            />
          </div>

          {chartLoading && <RowSkeleton count={6} />}

          {!chartLoading && chartError && (
            <EmptyState icon="refresh" title="加载失败" desc={chartError} />
          )}

          {!chartLoading && !chartError && chartHits.length > 0 && (
            <Section title={`本周热榜 · 前 ${chartHits.length} 名`}>
              <div className="space-y-2">
                {chartHits.map((hit, i) => (
                  <HitRow
                    key={`${hit.kind}-${hit.tmdbId}`}
                    hit={hit}
                    rank={i + 1}
                    index={i}
                    done={collected.has(hit.tmdbId)}
                    canAddVault={vaultSession.active}
                    inVault={vaultIds.has(hit.tmdbId)}
                    onAddVault={() => void addToVault(hit)}
                    onClick={() => void openHit(hit)}
                  />
                ))}
              </div>
            </Section>
          )}
        </>
      )}

      {tab === 'ranking' && (
        <>
          <Section title="我的年度排行">
            <MyRanking items={lib} />
            <div className="mt-4">
              <YearDigest items={lib} />
            </div>
          </Section>

          {hasApiKey(settings) ? (
            <>
              <Section title="TMDB 高分电影榜">
                {topLoading && <RowSkeleton count={4} />}
                {!topLoading && (
                  <div className="space-y-2">
                    {topMovie.map((hit, i) => (
                      <HitRow
                        key={hit.tmdbId}
                        hit={hit}
                        rank={i + 1}
                        index={i}
                        done={collected.has(hit.tmdbId)}
                        canAddVault={vaultSession.active}
                        inVault={vaultIds.has(hit.tmdbId)}
                        onAddVault={() => void addToVault(hit)}
                        onClick={() => void openHit(hit)}
                      />
                    ))}
                  </div>
                )}
              </Section>

              <Section title="TMDB 高分剧集榜">
                <div className="space-y-2">
                  {topTv.map((hit, i) => (
                    <HitRow
                      key={hit.tmdbId}
                      hit={hit}
                      rank={i + 1}
                      index={i}
                      done={collected.has(hit.tmdbId)}
                      onClick={() => void openHit(hit)}
                    />
                  ))}
                </div>
              </Section>
            </>
          ) : (
            <EmptyState icon="chart" title="填写 TMDB API Key 后可查看高分电影与剧集榜" />
          )}
        </>
      )}

      <Sheet
        open={Boolean(target)}
        onClose={() => !saving && setTarget(null)}
        title="加入收藏"
        footer={
          <div className="space-y-4">
            <div>
              <div className="mb-2 text-caption font-medium text-ink-faint">存放位置</div>
              <div className="flex gap-2">
                {!toVault && (
                  <Chip active={zone === 'library'} onClick={() => setZone('library')}>
                    公开片库
                  </Chip>
                )}
                {vaultSession.active && (
                  <Chip active={zone === 'vault'} onClick={() => setZone('vault')} tone="reel">
                    隐私保险箱
                  </Chip>
                )}
              </div>
            </div>
            <div>
              <div className="mb-2 text-caption font-medium text-ink-faint">观看状态</div>
              <div className="flex flex-wrap gap-2">
                {STATUS_ORDER.map((s) => (
                  <Chip key={s} active={status === s} onClick={() => setStatus(s)}>
                    {STATUS_LABEL[s]}
                  </Chip>
                ))}
              </div>
            </div>
            <Button className="w-full" disabled={!candidate || saving} onClick={() => void confirmAdd()}>
              {saving ? '保存中…' : '确认添加'}
            </Button>
          </div>
        }
      >
        {!candidate && !candidateError && (
          <div className="flex gap-3 py-1">
            <Skeleton className="aspect-[2/3] w-[104px] shrink-0 rounded-xl" />
            <div className="min-w-0 flex-1 space-y-2">
              <Skeleton className="h-5 w-3/4" />
              <Skeleton className="h-3 w-2/5" />
              <Skeleton className="h-3 w-full" />
              <Skeleton className="h-3 w-5/6" />
              <Skeleton className="h-3 w-4/6" />
            </div>
          </div>
        )}
        {candidateError && (
          <div className="flex items-center justify-center gap-2 py-8 text-center text-body-sm text-reel">
            <Icon name="refresh" size={16} />
            {candidateError}
          </div>
        )}
        {candidate && target && (
          <div className="flex gap-3.5">
            <div className="w-[104px] shrink-0">
              {target.poster ? (
                <img
                  src={target.poster}
                  alt=""
                  className="aspect-[2/3] w-full rounded-xl object-cover shadow-e2"
                />
              ) : (
                <div className="flex aspect-[2/3] w-full items-center justify-center rounded-xl bg-paper-sunken text-ink-faint">
                  <Icon name="image" size={22} />
                </div>
              )}
            </div>
            <div className="min-w-0 flex-1">
              <div className="font-display text-headline font-semibold leading-tight text-ink">
                {candidate.item.title}
              </div>
              <div className="mt-1 text-caption text-ink-faint">
                {candidate.item.originalTitle} · {candidate.item.year}
              </div>
              <div className="mt-2.5 flex flex-wrap gap-1.5">
                {candidate.item.genres?.map((g) => (
                  <span
                    key={g}
                    className="rounded-full bg-paper-sunken px-2 py-0.5 text-micro text-ink-soft"
                  >
                    {g}
                  </span>
                ))}
              </div>
              {candidate.item.director && (
                <div className="mt-2.5 text-caption text-ink-soft">
                  导演 / {candidate.item.director}
                </div>
              )}
              {candidate.item.cast && candidate.item.cast.length > 0 && (
                <div className="mt-1 text-caption text-ink-soft">
                  主演 / {candidate.item.cast.slice(0, 5).join('、')}
                </div>
              )}
              <div className="my-3 h-px bg-paper-line" />
              <p className="max-h-40 overflow-y-auto text-body-sm leading-relaxed text-ink-soft">
                {candidate.item.overview || '暂无简介'}
              </p>
            </div>
          </div>
        )}
      </Sheet>
    </div>
  )
}

/** 海报主导的结果行：海报 + 三层信息（片名 / 年份·类型 / 简介） */
function HitRow({
  hit,
  rank,
  index,
  done,
  onClick,
  canAddVault,
  inVault,
  onAddVault
}: {
  hit: TmdbSearchHit
  rank?: number
  index: number
  done?: boolean
  onClick: () => void
  canAddVault?: boolean
  inVault?: boolean
  onAddVault?: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="animate-staggerIn pressable flex w-full gap-3 rounded-2xl border border-paper-line bg-paper-card p-3 text-left transition-colors ease-standard duration-2 hover:bg-paper-sunken active:bg-paper-sunken"
      // 交错淡入，最多错开前 10 个，避免长列表后面等待太久
      style={{ animationDelay: `${Math.min(index, 10) * 28}ms` }}
    >
      {rank !== undefined && (
        <span
          className={clsx(
            'w-6 shrink-0 pt-0.5 text-center font-display text-title font-semibold tabular-nums',
            rank <= 3 ? 'text-reel-dark' : 'text-ink-faint'
          )}
        >
          {rank}
        </span>
      )}
      <div className="w-[60px] shrink-0">
        {hit.poster ? (
          <img
            src={hit.poster}
            alt=""
            loading="lazy"
            className="aspect-[2/3] w-full rounded-lg object-cover shadow-e1"
          />
        ) : (
          <div className="flex aspect-[2/3] w-full items-center justify-center rounded-lg bg-paper-sunken text-ink-faint">
            <Icon name="film" size={20} />
          </div>
        )}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-start gap-2">
          <div className="min-w-0 flex-1">
            <div className="truncate text-body font-medium text-ink">{hit.title}</div>
            <div className="mt-0.5 truncate text-caption text-ink-faint">
              {hit.originalTitle !== hit.title ? `${hit.originalTitle} · ` : ''}
              {hit.year || '未知年份'} · {KIND_LABEL[hit.kind]}
            </div>
          </div>
          <div className="flex shrink-0 flex-col items-end gap-1">
            {hit.score ? (
              <span className="flex items-center gap-0.5 rounded-full bg-reel-soft px-1.5 py-0.5 text-micro font-semibold text-reel-dark">
                <Icon name="starFill" size={9} />
                {hit.score.toFixed(1)}
              </span>
            ) : null}
          {done && (
            <span className="rounded-full bg-moss/10 px-1.5 py-0.5 text-micro text-moss">
              已收藏
            </span>
          )}
          {canAddVault && !inVault && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation()
                onAddVault?.()
              }}
              title="添加到隐私空间"
              className="flex h-7 w-7 items-center justify-center rounded-full bg-reel-soft text-reel-dark transition-opacity ease-standard duration-2 active:opacity-60"
            >
              <Icon name="lock" size={14} />
            </button>
          )}
        </div>
        </div>
        <p className="mt-1.5 line-clamp-2 text-caption leading-relaxed text-ink-faint">
          {hit.overview || '暂无简介'}
        </p>
      </div>
    </button>
  )
}

function RowSkeleton({ count = 4 }: { count?: number }) {
  return (
    <div className="space-y-2">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="flex gap-3 rounded-2xl border border-paper-line bg-paper-card p-3">
          <Skeleton className="aspect-[2/3] w-[60px] shrink-0 rounded-lg" />
          <div className="min-w-0 flex-1">
            <Skeleton className="h-4 w-3/5" />
            <Skeleton className="mt-2 h-3 w-2/5" />
            <Skeleton className="mt-2.5 h-3 w-full" />
            <Skeleton className="mt-1.5 h-3 w-4/6" />
          </div>
        </div>
      ))}
    </div>
  )
}
