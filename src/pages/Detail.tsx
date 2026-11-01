import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import clsx from 'clsx'
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
import {
  Button,
  Card,
  Chip,
  Confirm,
  EmptyState,
  Field,
  IconButton,
  Section as UiSection,
  Sheet,
  Skeleton,
  Stars,
  inputCls,
  textareaCls
} from '../components/ui'
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
        <EmptyState icon="eyeOff" title="内容不存在或不可访问" />
      </div>
    )
  }

  if (!item) {
    return (
      <div className="mx-auto max-w-[560px] px-4 pt-safe">
        <div className="flex flex-col items-center pt-6">
          <Skeleton className="h-8 w-24 rounded-xl" />
          <Skeleton className="mt-5 aspect-[2/3] w-[200px] rounded-2xl" />
        </div>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-[560px] pb-10">
      <div className="relative">
        {/* hero 背板：海报虚化铺底，向下渐隐融进页底色（深浅主题都不留白） */}
        <div className="pointer-events-none absolute inset-x-0 top-0 h-[300px] overflow-hidden">
          <div className="absolute -top-20 left-1/2 w-[320px] -translate-x-1/2 opacity-40 blur-2xl">
            <Poster zone={zone} item={item} />
          </div>
          <div className="absolute inset-0 bg-gradient-to-b from-paper/45 via-paper/75 to-paper" />
        </div>

        <div className="relative">
          <BackBar
            zone={zone}
            right={
              <div className="flex items-center gap-2">
                <Link to={`/edit/${zone}/${item.id}`} className="shrink-0">
                  <IconButton icon="edit" label="编辑" size={44} />
                </Link>
                <IconButton
                  icon="trash"
                  label="删除"
                  size={44}
                  className="border-danger/30 text-danger hover:border-danger/50 hover:text-danger"
                  onClick={() => setConfirmDelete(true)}
                />
              </div>
            }
          />

          <div className="px-4">
            {/* ---------------------------------------------------------- hero */}
            <div className="animate-fadeIn pt-2">
              <div className="flex justify-center">
                <button
                  onClick={() => setPosterSheet(true)}
                  className="pressable w-[196px] overflow-hidden rounded-2xl shadow-lift"
                >
                  <Poster zone={zone} item={item} />
                </button>
              </div>

              <div className="mt-5 text-center">
                <h1 className="text-balance font-display text-page font-semibold leading-tight tracking-tight text-ink">
                  {item.title}
                </h1>
                {item.originalTitle && item.originalTitle !== item.title && (
                  <p className="mt-1.5 text-caption leading-relaxed text-ink-faint">
                    {item.originalTitle}
                  </p>
                )}

                <div className="mt-2.5 flex flex-wrap items-center justify-center gap-x-2 gap-y-1 text-caption text-ink-soft">
                  <span>{item.year || '未知年份'}</span>
                  <span aria-hidden>·</span>
                  <span>{KIND_LABEL[item.kind]}</span>
                  {item.country && item.country.length > 0 && (
                    <>
                      <span aria-hidden>·</span>
                      <span>{item.country.join(' / ')}</span>
                    </>
                  )}
                  {item.kind === 'movie' && item.runtime ? (
                    <>
                      <span aria-hidden>·</span>
                      <span>{item.runtime} 分钟</span>
                    </>
                  ) : null}
                  {item.kind === 'tv' && totalEp ? (
                    <>
                      <span aria-hidden>·</span>
                      <span>全 {totalEp} 集</span>
                    </>
                  ) : null}
                  {item.kind === 'tv' && item.episodeRuntime ? (
                    <>
                      <span aria-hidden>·</span>
                      <span>单集约 {item.episodeRuntime} 分钟</span>
                    </>
                  ) : null}
                </div>

                {(item.tmdbScore || (item.genres && item.genres.length > 0)) && (
                  <div className="mt-3 flex flex-wrap items-center justify-center gap-2">
                    {item.tmdbScore ? (
                      <span className="rounded-full border border-paper-line bg-paper-card px-2.5 py-1 text-caption font-medium text-ink-soft">
                        TMDB {item.tmdbScore.toFixed(1)}
                      </span>
                    ) : null}
                    {(item.genres ?? []).map((g, i) => (
                      <span
                        key={g}
                        className="animate-staggerIn"
                        style={{ animationDelay: `${Math.min(i, 10) * 28}ms` }}
                      >
                        <Chip>{g}</Chip>
                      </span>
                    ))}
                  </div>
                )}

                <div className="mt-4 flex justify-center">
                  <Button variant="tonal" onClick={() => setPosterSheet(true)}>
                    <Icon name="image" size={16} /> 更换封面
                  </Button>
                </div>
              </div>
            </div>

            {/* ------------------------------------------------- 我的三个数据 */}
            <Card className="mt-6 p-4">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-caption text-ink-faint">我的评分</div>
                  <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1">
                    <Stars
                      value={item.rating}
                      onChange={(v) => void save({ rating: v || undefined })}
                      size={24}
                    />
                    <span className="text-label text-ink-faint">
                      {item.rating ? `${(item.rating / 2).toFixed(1)} 分` : '未评分'}
                    </span>
                  </div>
                </div>
                {item.rating ? (
                  <button
                    onClick={() => void save({ rating: undefined })}
                    className="min-h-touch shrink-0 rounded-lg px-2 text-label text-ink-faint transition-colors ease-standard duration-2 hover:text-danger"
                  >
                    清除
                  </button>
                ) : null}
              </div>

              <div className="my-4 hairline" />

              <div>
                <div className="text-caption text-ink-faint">观看状态</div>
                <div className="mt-2 flex flex-wrap gap-2">
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
              </div>

              {item.kind === 'tv' && (
                <>
                  <div className="my-4 hairline" />
                  <div>
                    <div className="text-caption text-ink-faint">追剧进度</div>
                    <div className="mt-2 flex gap-3">
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
                    <div className="mt-3 flex items-center justify-between rounded-xl bg-paper-sunken px-3.5 py-2.5 text-caption text-ink-soft">
                      <span>累计已看 {watched} 集</span>
                      <span className="font-medium tabular-nums text-ink">
                        {formatMinutes(minutesOf(item))}
                      </span>
                    </div>
                    <Button
                      className="mt-3 w-full"
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
                  </div>
                </>
              )}
            </Card>

            {/* -------------------------------------------------------- 简介 */}
            {item.overview && (
              <Section title="简介">
                <Card variant="filled" className="p-4">
                  <p className="text-body leading-relaxed text-ink-soft">{item.overview}</p>
                </Card>
              </Section>
            )}

            {/* ------------------------------------------------------ 演职员 */}
            {(item.director || (item.cast && item.cast.length > 0)) && (
              <Section title="演职员">
                <Card variant="outlined" className="px-4 py-1.5">
                  {item.director && <InfoRow label="导演" value={item.director} />}
                  {item.cast && item.cast.length > 0 && (
                    <InfoRow label="主演" value={item.cast.join('、')} />
                  )}
                </Card>
              </Section>
            )}

            {/* -------------------------------------------------------- 短评 */}
            <Section title="短评">
              <textarea
                value={reviewDraft}
                onChange={(e) => setReviewDraft(e.target.value)}
                onBlur={() => reviewDraft !== (item.review ?? '') && void save({ review: reviewDraft })}
                rows={4}
                placeholder="随手记两句（失焦自动保存）"
                className={textareaCls}
              />
            </Section>

            {/* -------------------------------------------------------- 标签 */}
            <Section
              title="标签"
              action={
                <button
                  onClick={() => { setTagDraft((item.tags ?? []).join('、')); setTagSheet(true) }}
                  className="min-h-touch rounded-lg px-2 text-label font-medium text-reel-dark active:opacity-60"
                >
                  编辑
                </button>
              }
            >
              <div className="flex flex-wrap items-center gap-2">
                {(item.tags ?? []).length === 0 && (
                  <span className="text-body-sm text-ink-faint">暂无标签</span>
                )}
                {item.tags.map((t, i) => (
                  <span
                    key={t}
                    className="animate-staggerIn"
                    style={{ animationDelay: `${Math.min(i, 10) * 28}ms` }}
                  >
                    <Chip>#{t}</Chip>
                  </span>
                ))}
              </div>
            </Section>

            {/* ---------------------------------------------------- 所属片单 */}
            <Section
              title="所属片单"
              action={
                <button
                  onClick={() => setCollectionSheet(true)}
                  className="min-h-touch rounded-lg px-2 text-label font-medium text-reel-dark active:opacity-60"
                >
                  管理
                </button>
              }
            >
              <div className="flex flex-wrap items-center gap-2">
                {memberOf.length === 0 ? (
                  <span className="text-body-sm text-ink-faint">未加入任何片单</span>
                ) : (
                  memberOf.map((c, i) => (
                    <span
                      key={c.id}
                      className="animate-staggerIn"
                      style={{ animationDelay: `${Math.min(i, 10) * 28}ms` }}
                    >
                      <Chip tone="reel">#{c.title}</Chip>
                    </span>
                  ))
                )}
              </div>
            </Section>

            {/* ------------------------------------------------------ 操作区 */}
            <div className="flex flex-col gap-2.5 border-t border-paper-line pt-5">
              <Button className="w-full" onClick={() => setCollectionSheet(true)}>
                <Icon name="plus" size={16} /> 加入片单
              </Button>
              {item.tmdbId && (
                <Button
                  variant="outline"
                  className="w-full"
                  disabled={busy}
                  onClick={() => void onRefreshMeta()}
                >
                  <Icon name="refresh" size={16} /> 刷新元数据
                </Button>
              )}
              <Button
                variant="ghost"
                className="w-full text-danger"
                onClick={() => setConfirmDelete(true)}
              >
                <Icon name="trash" size={16} /> 删除
              </Button>
            </div>
          </div>
        </div>
      </div>

      <Sheet open={posterSheet} onClose={() => setPosterSheet(false)} title="封面">
        <div className="flex flex-col gap-2.5">
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
          <p className="mt-1 rounded-xl bg-paper-sunken p-3 text-caption leading-relaxed text-ink-faint">
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
                className={clsx(
                  'pressable flex w-full min-h-touch items-center justify-between gap-2 rounded-xl border px-3.5 py-2.5 text-left',
                  inside
                    ? 'border-reel/35 bg-reel-soft'
                    : 'border-paper-line bg-paper-card hover:border-paper-lineStrong'
                )}
              >
                <span className="min-w-0 flex-1 truncate text-body-sm text-ink">{c.title}</span>
                <span className={insideClass(inside)}>{inside ? '已加入' : '加入'}</span>
              </button>
            )
          })}
          {zoneCollections.length === 0 && (
            <p className="py-4 text-center text-body-sm text-ink-faint">
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
    'ml-2 shrink-0 rounded-full px-2.5 py-1 text-micro ' +
    (inside ? 'bg-reel-soft text-reel-dark' : 'bg-paper-sunken text-ink-faint')
  )
}

function BackBar({ zone, right }: { zone: Zone; right?: React.ReactNode }) {
  return (
    <div className="sticky top-0 z-30 flex items-center justify-between gap-2 bg-paper/80 px-2 py-2 pt-safe backdrop-blur-md">
      <button
        onClick={() => (history.length > 1 ? history.back() : (location.hash = zone === 'vault' ? '#/vault' : '#/'))}
        className="flex min-h-touch items-center gap-1 rounded-xl px-2 text-ink-soft transition-colors ease-standard duration-2 hover:bg-paper-sunken active:bg-paper-line"
      >
        <Icon name="chevronLeft" size={20} />
        <span className="text-label">返回</span>
      </button>
      {right}
    </div>
  )
}

function Section({ title, children, action }: { title: string; children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <UiSection title={title} action={action}>
      {children}
    </UiSection>
  )
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex gap-3 border-b border-paper-line py-2.5 last:border-b-0">
      <span className="w-12 shrink-0 text-label text-ink-faint">{label}</span>
      <span className="flex-1 text-body-sm leading-relaxed text-ink">{value}</span>
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
    <Card variant="filled" className="flex-1 px-3 py-2.5">
      <div className="text-caption text-ink-faint">{label}</div>
      <div className="mt-1 flex items-center justify-between">
        <Button variant="ghost" onClick={() => onChange(clamp(value - 1))}>
          −
        </Button>
        <span className="w-12 text-center text-title font-semibold tabular-nums text-ink">{value}</span>
        <Button variant="ghost" onClick={() => onChange(clamp(value + 1))}>
          +
        </Button>
      </div>
      <div className="mt-1 text-center text-micro text-ink-faint">上限 {max}</div>
    </Card>
  )
}
