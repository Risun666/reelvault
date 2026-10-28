import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { TmdbError, fetchChart, searchTitles, type TmdbSearchHit } from '../lib/tmdb'
import { fetchTitleCandidate } from '../lib/addTitle'
import { useSettings } from '../store/settings'
import { useLibraryStore, useVaultStore, zoneStore } from '../store/zone'
import { useVaultSession } from '../store/vaultSession'
import type { Zone } from '../lib/db'
import type { TitleItem, WatchStatus } from '../types'
import { KIND_LABEL, STATUS_LABEL, STATUS_ORDER } from '../types'
import Icon from '../components/Icon'
import { Button, Chip, EmptyState, Segmented, Sheet } from '../components/ui'
import { toast } from '../components/Toast'
import { MyRanking, RemoteRow, TrendingCard, YearDigest } from '../components/Charts'

type Tab = 'search' | 'trending' | 'ranking'

export default function Discover() {
  const settings = useSettings()
  const vaultSession = useVaultSession()
  const lib = useLibraryStore((s) => s.items)
  const vault = useVaultStore((s) => s.items)

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
  const [zone, setZone] = useState<Zone>('library')
  const [status, setStatus] = useState<WatchStatus>('wish')
  const [saving, setSaving] = useState(false)

  const collected = useMemo(() => {
    const ids = new Set<number>()
    lib.forEach((i) => i.tmdbId && ids.add(i.tmdbId))
    vault.forEach((i) => i.tmdbId && ids.add(i.tmdbId))
    return ids
  }, [lib, vault])

  const runSearch = useCallback(
    async (kw: string, k: 'all' | 'movie' | 'tv') => {
      if (!kw.trim()) {
        setResults([])
        setSearchError(null)
        return
      }
      if (!settings.apiKey) {
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
    if (!settings.apiKey) {
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
    if (!settings.apiKey) return
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

  return (
    <div className="mx-auto max-w-[560px] px-4 pb-10 pt-safe">
      <header className="pb-3 pt-2">
        <h1 className="text-[1.5rem] font-semibold tracking-tight">发现</h1>
        <p className="mt-0.5 text-[0.75rem] text-ink-faint">
          搜索入库 · 看看最近大家在追什么
        </p>
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

      {!settings.apiKey && (
        <div className="mb-3 rounded-2xl border border-reel/25 bg-reel-soft p-3 text-[0.8125rem] leading-relaxed text-reel-dark">
          还没有填写 TMDB API Key。填一次就能自动拉封面、简介、演员表，也能看热门和榜单；也可以完全手动录入。
          <div className="mt-2 flex gap-2">
            <Link to="/settings">
              <Button size="sm">去设置 API Key</Button>
            </Link>
            <Link to="/add/library">
              <Button size="sm" variant="outline">
                手动添加
              </Button>
            </Link>
          </div>
        </div>
      )}

      {tab === 'search' && (
        <>
          <div className="relative mb-3">
            <Icon
              name="search"
              size={17}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-faint"
            />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="搜索电影或剧集…"
              className="w-full rounded-xl border border-paper-line bg-white py-3 pl-9 pr-3 text-[0.9375rem] outline-none placeholder:text-ink-faint/80 focus:border-ink/25"
            />
          </div>

          <div className="mb-4">
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

          {searching && (
            <div className="space-y-2">
              {[0, 1, 2, 3].map((i) => (
                <div key={i} className="skeleton h-[92px] rounded-2xl" />
              ))}
            </div>
          )}

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
                <Link to="/add/library">
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
            {results.map((hit) => {
              const done = collected.has(hit.tmdbId)
              return (
                <button
                  key={`${hit.kind}-${hit.tmdbId}`}
                  onClick={() => void openHit(hit)}
                  className="flex w-full gap-3 rounded-2xl border border-paper-line bg-white p-3 text-left active:bg-paper"
                >
                  <div className="w-[62px] shrink-0">
                    {hit.poster ? (
                      <img
                        src={hit.poster}
                        alt=""
                        loading="lazy"
                        className="aspect-[2/3] w-full rounded-lg object-cover"
                      />
                    ) : (
                      <div className="aspect-[2/3] w-full rounded-lg bg-paper-line" />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="truncate text-[0.875rem] font-medium">{hit.title}</div>
                        <div className="mt-0.5 truncate text-[0.75rem] text-ink-faint">
                          {hit.originalTitle !== hit.title ? `${hit.originalTitle} · ` : ''}
                          {hit.year || '未知年份'} · {KIND_LABEL[hit.kind]}
                        </div>
                      </div>
                      {done && (
                        <span className="shrink-0 rounded-md bg-moss/10 px-1.5 py-0.5 text-[0.6875rem] text-moss">
                          已收藏
                        </span>
                      )}
                    </div>
                    <p className="mt-1.5 line-clamp-2 text-[0.75rem] leading-relaxed text-ink-soft">
                      {hit.overview || '暂无简介'}
                    </p>
                  </div>
                </button>
              )
            })}
          </div>
        </>
      )}

      {tab === 'trending' && (
        <>
          <div className="mb-4">
            <Segmented
              value={chartKind}
              onChange={(v) => setChartKind(v as typeof chartKind)}
              options={[
                { value: 'movie', label: '热门电影' },
                { value: 'tv', label: '热门剧集' }
              ]}
            />
          </div>

          {chartLoading && (
            <div className="grid grid-cols-3 gap-3">
              {[0, 1, 2, 3, 4, 5].map((i) => (
                <div key={i} className="skeleton aspect-[2/3] rounded-xl" />
              ))}
            </div>
          )}

          {!chartLoading && chartError && (
            <EmptyState icon="refresh" title="加载失败" desc={chartError} />
          )}

          {!chartLoading && !chartError && chartHits.length > 0 && (
            <>
              <div className="no-scrollbar -mx-4 mb-5 flex gap-3 overflow-x-auto px-4">
                {chartHits.slice(0, 8).map((hit) => (
                  <TrendingCard key={hit.tmdbId} hit={hit} onClick={() => void openHit(hit)} />
                ))}
              </div>
              <h2 className="mb-2 text-[0.75rem] font-medium uppercase tracking-wide text-ink-faint">
                本周热榜 · 前 {chartHits.length} 名
              </h2>
              <div className="space-y-2">
                {chartHits.map((hit, i) => (
                  <RemoteRow
                    key={`${hit.kind}-${hit.tmdbId}`}
                    rank={i + 1}
                    hit={hit}
                    onClick={() => void openHit(hit)}
                  />
                ))}
              </div>
            </>
          )}
        </>
      )}

      {tab === 'ranking' && (
        <>
          <h2 className="mb-2 text-[0.75rem] font-medium uppercase tracking-wide text-ink-faint">
            我的年度排行
          </h2>
          <MyRanking items={lib} />
          <div className="mt-3">
            <YearDigest items={lib} />
          </div>

          {settings.apiKey ? (
            <>
              <h2 className="mb-2 mt-6 text-[0.75rem] font-medium uppercase tracking-wide text-ink-faint">
                TMDB 高分电影榜
              </h2>
              {topLoading && (
                <div className="space-y-2">
                  {[0, 1, 2, 3].map((i) => (
                    <div key={i} className="skeleton h-[62px] rounded-xl" />
                  ))}
                </div>
              )}
              <div className="space-y-2">
                {topMovie.map((hit, i) => (
                  <RemoteRow key={hit.tmdbId} rank={i + 1} hit={hit} onClick={() => void openHit(hit)} />
                ))}
              </div>

              <h2 className="mb-2 mt-6 text-[0.75rem] font-medium uppercase tracking-wide text-ink-faint">
                TMDB 高分剧集榜
              </h2>
              <div className="space-y-2">
                {topTv.map((hit, i) => (
                  <RemoteRow key={hit.tmdbId} rank={i + 1} hit={hit} onClick={() => void openHit(hit)} />
                ))}
              </div>
            </>
          ) : (
            <p className="mt-4 text-center text-[0.75rem] text-ink-faint">
              填写 TMDB API Key 后可查看高分电影与剧集榜
            </p>
          )}
        </>
      )}

      <Sheet
        open={Boolean(target)}
        onClose={() => !saving && setTarget(null)}
        title="加入收藏"
        footer={
          <div className="space-y-3">
            <div>
              <div className="mb-1.5 text-[0.75rem] font-medium text-ink-faint">存放位置</div>
              <div className="flex gap-2">
                <Chip active={zone === 'library'} onClick={() => setZone('library')}>
                  公开片库
                </Chip>
                {vaultSession.active && (
                  <Chip active={zone === 'vault'} onClick={() => setZone('vault')} tone="reel">
                    隐私保险箱
                  </Chip>
                )}
              </div>
            </div>
            <div>
              <div className="mb-1.5 text-[0.75rem] font-medium text-ink-faint">观看状态</div>
              <div className="flex gap-2">
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
          <div className="space-y-2 py-2">
            <div className="skeleton h-[180px] rounded-xl" />
            <div className="skeleton h-4 w-3/4 rounded" />
            <div className="skeleton h-4 w-1/2 rounded" />
          </div>
        )}
        {candidateError && (
          <div className="py-6 text-center text-[0.8125rem] text-reel">{candidateError}</div>
        )}
        {candidate && target && (
          <div className="flex gap-3">
            <div className="w-[104px] shrink-0">
              {target.poster ? (
                <img src={target.poster} alt="" className="aspect-[2/3] w-full rounded-xl object-cover" />
              ) : (
                <div className="aspect-[2/3] w-full rounded-xl bg-paper-line" />
              )}
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-[1rem] font-semibold leading-tight">{candidate.item.title}</div>
              <div className="mt-0.5 text-[0.75rem] text-ink-faint">
                {candidate.item.originalTitle} · {candidate.item.year}
              </div>
              <div className="mt-2 flex flex-wrap gap-1">
                {candidate.item.genres?.map((g) => (
                  <span key={g} className="rounded bg-paper px-1.5 py-0.5 text-[0.6875rem] text-ink-soft">
                    {g}
                  </span>
                ))}
              </div>
              {candidate.item.director && (
                <div className="mt-2 text-[0.75rem] text-ink-soft">导演 / {candidate.item.director}</div>
              )}
              {candidate.item.cast && candidate.item.cast.length > 0 && (
                <div className="mt-1 text-[0.75rem] text-ink-soft">
                  主演 / {candidate.item.cast.slice(0, 5).join('、')}
                </div>
              )}
              <p className="mt-2 max-h-40 overflow-y-auto text-[0.78125rem] leading-relaxed text-ink-soft">
                {candidate.item.overview || '暂无简介'}
              </p>
            </div>
          </div>
        )}
      </Sheet>
    </div>
  )
}
