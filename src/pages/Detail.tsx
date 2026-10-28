import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { getTitle, removePoster, putPoster, type Zone } from '../lib/db'
import { compressImage, fetchRemoteImage } from '../lib/image'
import { pickImage } from '../lib/dom'
import { fetchTitleCandidate } from '../lib/addTitle'
import { zoneStore } from '../store/zone'
import { useSettings } from '../store/settings'
import { useVaultSession } from '../store/vaultSession'
import { useCollections } from '../store/collections'
import { watchedEpisodesOf, totalEpisodesOf, minutesOf, formatMinutes } from '../lib/stats'
import type { EpisodeProgress, TitleItem } from '../types'
import { KIND_LABEL, STATUS_LABEL, STATUS_ORDER } from '../types'
import Poster from '../components/Poster'
import Icon from '../components/Icon'
import { Button, Chip, Confirm, Field, Sheet, Stars, inputCls } from '../components/ui'
import { toast } from '../components/Toast'

export default function Detail() {
  const { zone = 'library', id = '' } = useParams<{ zone: Zone; id: string }>()
  const navigate = useNavigate()
  const settings = useSettings()
  const vaultSession = useVaultSession()
  const store = zoneStore(zone).getState()

  const [item, setItem] = useState<TitleItem | null>(null)
  const [loaded, setLoaded] = useState(false)
  const [posterSheet, setPosterSheet] = useState(false)
  const [tagSheet, setTagSheet] = useState(false)
  const [tagDraft, setTagDraft] = useState('')
  const [reviewDraft, setReviewDraft] = useState('')
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [busy, setBusy] = useState(false)
  const [collectionSheet, setCollectionSheet] = useState(false)
  const [collectionDraft, setCollectionDraft] = useState('')
  const collections = useCollections()

  const accessible = zone !== 'vault' || vaultSession.active

  useEffect(() => {
    let alive = true
    void getTitle(zone, id).then((t) => {
      if (!alive) return
      setItem(t ?? null)
      setReviewDraft(t?.review ?? '')
      setLoaded(true)
    })
    return () => {
      alive = false
    }
  }, [zone, id])

  useEffect(() => {
    if (zone === 'vault') void useVaultSession.getState().touch()
  }, [zone])

  const save = async (patch: Partial<TitleItem>) => {
    if (!item) return
    setItem({ ...item, ...patch })
    await store.patch(id, patch)
  }

  const onPickPoster = async () => {
    const file = await pickImage()
    if (!file || !item) return
    setBusy(true)
    try {
      const blob = await compressImage(file)
      await putPoster(zone, item.id, blob)
      setPosterSheet(false)
      await save({ hasLocalPoster: true })
      toast('已更新封面', 'good')
    } catch {
      toast('图片处理失败', 'bad')
    } finally {
      setBusy(false)
    }
  }

  const onUseRemote = async () => {
    if (!item?.posterRemote) return
    setBusy(true)
    try {
      const blob = await fetchRemoteImage(item.posterRemote)
      if (!blob) throw new Error('fetch failed')
      await putPoster(zone, item.id, blob)
      setPosterSheet(false)
      await save({ hasLocalPoster: true })
      toast('已缓存远程封面', 'good')
    } catch {
      toast('远程封面不可用，可手动上传', 'bad')
    } finally {
      setBusy(false)
    }
  }

  const onRemovePoster = async () => {
    if (!item) return
    await removePoster(zone, item.id)
    setPosterSheet(false)
    await save({ hasLocalPoster: false, posterRemote: undefined })
    toast('已移除封面')
  }

  const onRefreshMeta = async () => {
    if (!item?.tmdbId) return
    setBusy(true)
    try {
      const c = await fetchTitleCandidate(settings, { tmdbId: item.tmdbId, kind: item.kind })
      const keep: Partial<TitleItem> = {
        title: c.item.title || item.title,
        originalTitle: c.item.originalTitle,
        year: c.item.year,
        releasedAt: c.item.releasedAt,
        overview: c.item.overview,
        genres: c.item.genres,
        country: c.item.country,
        runtime: c.item.runtime,
        episodeRuntime: c.item.episodeRuntime,
        director: c.item.director,
        cast: c.item.cast,
        tmdbScore: c.item.tmdbScore,
        posterRemote: c.item.posterRemote,
        backdrop: c.item.backdrop,
        progress: c.item.progress ?? item.progress,
        hasLocalPoster: item.hasLocalPoster ?? Boolean(c.item.posterRemote)
      }
      if (c.posterBlob && settings.cacheRemotePoster) {
        await putPoster(zone, item.id, c.posterBlob)
        keep.hasLocalPoster = true
      }
      await save(keep)
      toast('元数据已刷新', 'good')
    } catch (e) {
      toast(e instanceof Error ? e.message : '刷新失败', 'bad')
    } finally {
      setBusy(false)
    }
  }

  const bump = async (patch: Partial<EpisodeProgress>) => {
    if (!item?.progress) return
    await save({ progress: { ...item.progress, ...patch } })
  }

  const watched = useMemo(() => watchedEpisodesOf(item?.progress), [item?.progress])
  const totalEp = useMemo(() => totalEpisodesOf(item?.progress), [item?.progress])

  const zoneCollections = useMemo(
    () => collections.items.filter((c) => c.zone === zone),
    [collections.items, zone]
  )
  const memberOf = useMemo(
    () => (item ? zoneCollections.filter((c) => c.itemIds.includes(item.id)) : []),
    [zoneCollections, item]
  )

  if (loaded && (!item || !accessible)) {
    return (
      <div className="mx-auto max-w-[560px] px-4 pt-safe">
        <BackBar zone={zone} />
        <div className="py-20 text-center text-[0.875rem] text-ink-faint">内容不存在或不可访问</div>
      </div>
    )
  }

  if (!item) {
    return (
      <div className="mx-auto max-w-[560px] px-4 pt-safe">
        <div className="space-y-2 pt-4">
          <div className="skeleton h-8 w-24 rounded" />
          <div className="skeleton h-[320px] rounded-2xl" />
        </div>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-[560px] pb-10">
      <BackBar zone={zone} right={
        <div className="flex items-center gap-1">
          <Link to={`/edit/${zone}/${item.id}`} className="rounded-full p-2 text-ink-soft active:bg-paper-line">
            <Icon name="edit" size={19} />
          </Link>
          <button
            onClick={() => setConfirmDelete(true)}
            className="rounded-full p-2 text-ink-soft active:bg-paper-line"
          >
            <Icon name="trash" size={19} />
          </button>
        </div>
      } />

      <div className="px-4">
        <div className="flex gap-4">
          <div className="w-[122px] shrink-0">
            <button onClick={() => setPosterSheet(true)} className="block w-full">
              <Poster zone={zone} item={item} />
            </button>
            <button
              onClick={() => setPosterSheet(true)}
              className="mt-2 flex w-full items-center justify-center gap-1 rounded-lg border border-paper-line bg-white py-1.5 text-[0.6875rem] text-ink-soft"
            >
              <Icon name="image" size={13} /> 更换封面
            </button>
          </div>
          <div className="min-w-0 flex-1">
            <h1 className="text-[1.25rem] font-semibold leading-tight">{item.title}</h1>
            {item.originalTitle && item.originalTitle !== item.title && (
              <p className="mt-0.5 text-[0.75rem] leading-tight text-ink-faint">{item.originalTitle}</p>
            )}
            <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-[0.75rem] text-ink-soft">
              <span>{item.year || '未知年份'}</span>
              <span>·</span>
              <span>{KIND_LABEL[item.kind]}</span>
              {item.country && item.country.length > 0 && (
                <>
                  <span>·</span>
                  <span>{item.country.join(' / ')}</span>
                </>
              )}
            </div>
            {item.kind === 'movie' && item.runtime ? (
              <div className="mt-1 text-[0.75rem] text-ink-soft">{item.runtime} 分钟</div>
            ) : null}
            {item.kind === 'tv' && (
              <div className="mt-1 text-[0.75rem] text-ink-soft">
                {totalEp ? `全 ${totalEp} 集` : ''}
                {item.episodeRuntime ? ` · 单集约 ${item.episodeRuntime} 分钟` : ''}
              </div>
            )}
            {item.tmdbScore ? (
              <div className="mt-2 inline-flex items-center gap-1 rounded-md bg-paper px-1.5 py-0.5 text-[0.6875rem] text-ink-soft">
                TMDB {item.tmdbScore.toFixed(1)}
              </div>
            ) : null}
            {item.genres && item.genres.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1">
                {item.genres.map((g) => (
                  <span key={g} className="rounded bg-paper px-1.5 py-0.5 text-[0.6875rem] text-ink-soft">
                    {g}
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* 状态 */}
        <Section title="观看状态">
          <div className="flex gap-2">
            {STATUS_ORDER.map((s) => (
              <Chip key={s} active={item.status === s} onClick={() => void save({ status: s })}>
                {STATUS_LABEL[s]}
              </Chip>
            ))}
          </div>
          {item.status === 'done' && (
            <div className="mt-3">
              <Field label="观看日期">
                <input
                  type="date"
                  value={item.watchedAt?.slice(0, 10) ?? ''}
                  onChange={(e) => void save({ watchedAt: e.target.value ? `${e.target.value}T12:00:00.000Z` : undefined })}
                  className={inputCls}
                />
              </Field>
            </div>
          )}
        </Section>

        {/* 剧集进度 */}
        {item.kind === 'tv' && (
          <Section title="追剧进度">
            <div className="flex gap-3">
              <Stepper
                label="季"
                value={item.progress?.season ?? 1}
                max={item.progress?.totalSeasons || 99}
                onChange={(v) => void bump({ season: v, watchedEpisodes: 0 })}
              />
              <Stepper
                label="集"
                value={item.progress?.episode ?? 0}
                max={item.progress?.episodesInSeason?.[item.progress?.season ?? 1] ?? 99}
                min={0}
                onChange={(v) => void bump({ episode: v })}
              />
            </div>
            <div className="mt-3 flex items-center justify-between rounded-xl bg-paper px-3 py-2 text-[0.75rem] text-ink-soft">
              <span>累计已看 {watched} 集</span>
              <span>{formatMinutes(minutesOf(item))}</span>
            </div>
            <Button
              className="mt-2 w-full"
              variant="outline"
              onClick={() =>
                void save({
                  status: 'done',
                  progress: {
                    ...(item.progress as EpisodeProgress),
                    watchedEpisodes: totalEp || watched
                  }
                })
              }
            >
              <Icon name="check" size={15} /> 标记整部看完
            </Button>
          </Section>
        )}

        {/* 我的评分 */}
        <Section title="我的评分">
          <div className="flex items-center gap-3">
            <Stars value={item.rating} onChange={(v) => void save({ rating: v || undefined })} size={26} />
            <span className="text-[0.8125rem] text-ink-faint">
              {item.rating ? `${(item.rating / 2).toFixed(1)} 分` : '未评分'}
            </span>
            {item.rating ? (
              <button onClick={() => void save({ rating: undefined })} className="text-[0.75rem] text-ink-faint">
                清除
              </button>
            ) : null}
          </div>
        </Section>

        {/* 短评 */}
        <Section title="短评">
          <textarea
            value={reviewDraft}
            onChange={(e) => setReviewDraft(e.target.value)}
            onBlur={() => reviewDraft !== (item.review ?? '') && void save({ review: reviewDraft })}
            rows={4}
            placeholder="随手记两句（失焦自动保存）"
            className={inputCls}
          />
        </Section>

        {/* 标签 */}
        <Section
          title="标签"
          action={
            <button onClick={() => { setTagDraft((item.tags ?? []).join('、')); setTagSheet(true) }} className="text-[0.75rem] text-reel">
              编辑
            </button>
          }
        >
          <div className="flex flex-wrap gap-2">
            {(item.tags ?? []).length === 0 && <span className="text-[0.8125rem] text-ink-faint">暂无标签</span>}
            {item.tags.map((t) => (
              <span key={t} className="rounded-full bg-paper px-2.5 py-1 text-[0.75rem] text-ink-soft">
                #{t}
              </span>
            ))}
          </div>
        </Section>

        {/* 所属片单 */}
        <Section
          title="所属片单"
          action={
            <button onClick={() => setCollectionSheet(true)} className="text-[0.75rem] text-reel">
              管理
            </button>
          }
        >
          <div className="flex flex-wrap gap-2">
            {memberOf.length === 0 ? (
              <span className="text-[0.8125rem] text-ink-faint">未加入任何片单</span>
            ) : (
              memberOf.map((c) => (
                <span
                  key={c.id}
                  className="rounded-full bg-paper px-2.5 py-1 text-[0.75rem] text-ink-soft"
                >
                  #{c.title}
                </span>
              ))
            )}
          </div>
        </Section>

        {/* 详情 */}
        {item.overview && (
          <Section title="简介">
            <p className="text-[0.8438rem] leading-relaxed text-ink-soft">{item.overview}</p>
          </Section>
        )}
        {(item.director || (item.cast && item.cast.length > 0)) && (
          <Section title="演职员">
            {item.director && <InfoRow label="导演" value={item.director} />}
            {item.cast && item.cast.length > 0 && <InfoRow label="主演" value={item.cast.join('、')} />}
          </Section>
        )}

        <div className="mt-4 flex gap-2">
          {item.tmdbId && (
            <Button variant="outline" className="flex-1" disabled={busy} onClick={() => void onRefreshMeta()}>
              <Icon name="refresh" size={15} /> 刷新元数据
            </Button>
          )}
        </div>
      </div>

      <Sheet open={posterSheet} onClose={() => setPosterSheet(false)} title="封面">
        <div className="space-y-2">
          <Button className="w-full" variant="outline" disabled={busy} onClick={() => void onPickPoster()}>
            <Icon name="upload" size={16} /> 上传自定义封面
          </Button>
          {item.posterRemote && (
            <Button className="w-full" variant="outline" disabled={busy} onClick={() => void onUseRemote()}>
              <Icon name="download" size={16} /> 使用 TMDB 封面
            </Button>
          )}
          <Button className="w-full" variant="ghost" disabled={busy || !item.hasLocalPoster} onClick={() => void onRemovePoster()}>
            <Icon name="trash" size={16} /> 移除当前封面
          </Button>
          <p className="pt-1 text-[0.75rem] leading-relaxed text-ink-faint">
            封面会压缩后存进本地数据库，离线也能看；备份时可选择一并导出。
          </p>
        </div>
      </Sheet>

      <Sheet
        open={tagSheet}
        onClose={() => setTagSheet(false)}
        title="编辑标签"
        footer={
          <Button
            className="w-full"
            onClick={() => {
              const tags = tagDraft.split(/[、,，\s]+/).map((t) => t.replace(/^#/, '').trim()).filter(Boolean)
              void save({ tags })
              setTagSheet(false)
            }}
          >
            保存
          </Button>
        }
      >
        <Field label="标签（用空格或顿号分隔）">
          <input value={tagDraft} onChange={(e) => setTagDraft(e.target.value)} className={inputCls} placeholder="治愈 悬疑 二刷" />
        </Field>
      </Sheet>

      <Sheet open={collectionSheet} onClose={() => setCollectionSheet(false)} title="加入片单">
        <div className="space-y-2">
          {zoneCollections.map((c) => {
            const inside = memberOf.some((m) => m.id === c.id)
            return (
              <button
                key={c.id}
                onClick={() => item && void collections.toggleItem(c.id, item.id)}
                className="flex w-full items-center justify-between rounded-xl border border-paper-line bg-white px-3 py-2.5 text-left active:bg-paper"
              >
                <span className="min-w-0 flex-1 truncate text-[0.875rem]">{c.title}</span>
                <span className={insideClass(inside)}>{inside ? '已加入' : '加入'}</span>
              </button>
            )
          })}
          {zoneCollections.length === 0 && (
            <p className="py-4 text-center text-[0.8125rem] text-ink-faint">
              还没有片单，先新建一个
            </p>
          )}
        </div>
        <div className="mt-3 flex gap-2">
          <input
            value={collectionDraft}
            onChange={(e) => setCollectionDraft(e.target.value)}
            placeholder="新建片单名称"
            className={inputCls}
          />
          <Button
            onClick={async () => {
              const title = collectionDraft.trim()
              if (!title || !item) return
              const created = await collections.create(title, zone)
              await collections.toggleItem(created.id, item.id)
              setCollectionDraft('')
              toast('已新建并加入', 'good')
            }}
          >
            创建
          </Button>
        </div>
      </Sheet>

      <Confirm
        open={confirmDelete}
        title={`删除《${item.title}》？`}
        desc="本地记录与封面会一并删除，同时会从所有片单中移除，此操作不可撤销。"
        danger
        confirmText="删除"
        onCancel={() => setConfirmDelete(false)}
        onConfirm={() => {
          void collections.removeTitleEverywhere(item.id)
          void store.remove(item.id)
          setConfirmDelete(false)
          toast('已删除')
          navigate(zone === 'vault' ? '/vault' : '/')
        }}
      />
    </div>
  )
}

function insideClass(inside: boolean): string {
  return (
    'ml-2 shrink-0 rounded-full px-2 py-1 text-[0.6875rem] ' +
    (inside ? 'bg-reel-soft text-reel-dark' : 'bg-paper text-ink-faint')
  )
}

function BackBar({ zone, right }: { zone: Zone; right?: React.ReactNode }) {
  return (
    <div className="sticky top-0 z-30 flex items-center justify-between bg-paper/95 px-2 py-2 pt-safe backdrop-blur">
      <button
        onClick={() => (history.length > 1 ? history.back() : (location.hash = zone === 'vault' ? '#/vault' : '#/'))}
        className="flex items-center gap-1 rounded-full px-2 py-1.5 text-ink-soft active:bg-paper-line"
      >
        <Icon name="chevronLeft" size={20} />
        <span className="text-[0.8125rem]">返回</span>
      </button>
      {right}
    </div>
  )
}

function Section({
  title,
  children,
  action
}: {
  title: string
  children: React.ReactNode
  action?: React.ReactNode
}) {
  return (
    <section className="mt-5">
      <div className="mb-2 flex items-center justify-between">
        <h2 className="text-[0.75rem] font-medium uppercase tracking-wide text-ink-faint">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  )
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex gap-3 py-1 text-[0.8125rem]">
      <span className="w-10 shrink-0 text-ink-faint">{label}</span>
      <span className="flex-1 text-ink-soft">{value}</span>
    </div>
  )
}

function Stepper({
  label,
  value,
  min = 1,
  max = 99,
  onChange
}: {
  label: string
  value: number
  min?: number
  max?: number
  onChange: (v: number) => void
}) {
  const clamp = (v: number) => Math.min(max, Math.max(min, v))
  return (
    <div className="flex-1 rounded-xl border border-paper-line bg-white px-3 py-2">
      <div className="mb-1.5 text-[0.6875rem] text-ink-faint">{label}</div>
      <div className="flex items-center justify-between">
        <button
          onClick={() => onChange(clamp(value - 1))}
          className="h-8 w-8 rounded-lg bg-paper text-ink-soft active:bg-paper-line"
        >
          −
        </button>
        <span className="w-14 text-center text-[1.125rem] font-semibold tabular-nums">{value}</span>
        <button
          onClick={() => onChange(clamp(value + 1))}
          className="h-8 w-8 rounded-lg bg-paper text-ink-soft active:bg-paper-line"
        >
          +
        </button>
      </div>
      <div className="mt-1 text-center text-[0.6875rem] text-ink-faint">上限 {max}</div>
    </div>
  )
}
