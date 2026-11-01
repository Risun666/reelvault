import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import clsx from 'clsx'
import { getTitle, type Zone } from '../lib/db'
import { compressImage, fetchRemoteImage } from '../lib/image'
import { pickImage } from '../lib/dom'
import { zoneStore } from '../store/zone'
import { useVaultSession } from '../store/vaultSession'
import { useSettings } from '../store/settings'
import { javImageUrl, javToTitlePatch, scrapeJav, type JavResult, type JavSettings } from '../lib/jav'
import { blankTitle } from '../lib/addTitle'
import type { MediaKind, TitleItem, WatchStatus } from '../types'
import { STATUS_LABEL, STATUS_ORDER, newId } from '../types'
import Icon from '../components/Icon'
import {
  Button,
  Chip,
  Field,
  Section,
  Segmented,
  Skeleton,
  Stars,
  inputCls,
  textareaCls
} from '../components/ui'
import { toast } from '../components/Toast'

export default function AddItem() {
  const { zone = 'library', id } = useParams<{ zone: Zone; id?: string }>()
  const navigate = useNavigate()
  const store = zoneStore(zone).getState()
  const vaultSession = useVaultSession()
  const editing = Boolean(id)

  const [kind, setKind] = useState<MediaKind>('movie')
  const [draft, setDraft] = useState<TitleItem>(blankTitle('movie'))
  const [posterBlob, setPosterBlob] = useState<Blob | null>(null)
  const [posterPreview, setPosterPreview] = useState<string | null>(null)
  const [remoteUrl, setRemoteUrl] = useState('')
  const [castText, setCastText] = useState('')
  const [genreText, setGenreText] = useState('')
  const [tagText, setTagText] = useState('')
  const [saving, setSaving] = useState(false)
  const [loaded, setLoaded] = useState(!editing)
  const settings = useSettings()
  const [javCode, setJavCode] = useState('')
  const [javBusy, setJavBusy] = useState(false)
  const [javResult, setJavResult] = useState<JavResult | null>(null)

  useEffect(() => {
    if (!id) return
    void getTitle(zone, id).then((t) => {
      if (!t) return
      setDraft(t)
      setKind(t.kind)
      setCastText((t.cast ?? []).join('、'))
      setGenreText((t.genres ?? []).join('、'))
      setTagText((t.tags ?? []).join('、'))
      setRemoteUrl(t.posterRemote ?? '')
      setLoaded(true)
    })
  }, [zone, id])

  useEffect(() => {
    return () => {
      if (posterPreview?.startsWith('blob:')) URL.revokeObjectURL(posterPreview)
    }
  }, [posterPreview])

  if (zone === 'vault' && !vaultSession.active) {
    return (
      <div className="mx-auto max-w-[560px] px-4 pt-safe">
        <div className="mt-10 rounded-2xl border border-paper-line bg-paper-card p-8 text-center shadow-e1">
          <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-paper-sunken text-ink-faint">
            <Icon name="lock" size={24} />
          </div>
          <p className="text-body text-ink-soft">无法访问该页面</p>
        </div>
      </div>
    )
  }

  const set = <K extends keyof TitleItem>(key: K, value: TitleItem[K]) =>
    setDraft((d) => ({ ...d, [key]: value }))

  const onPick = async () => {
    const file = await pickImage()
    if (!file) return
    const blob = await compressImage(file)
    setPosterBlob(blob)
    setPosterPreview((prev) => {
      if (prev) URL.revokeObjectURL(prev)
      return URL.createObjectURL(blob)
    })
  }

  const javSettings: JavSettings = {
    enabled: true,
    backend: settings.javBackend,
    endpoint: settings.javEndpoint,
    token: settings.javToken,
    sources: settings.javSources,
    provider: settings.javProvider,
    enrich: settings.javEnrich,
    titleLang: settings.javTitleLang,
    imageProxy: settings.javImageProxy
  }

  const runScrape = async () => {
    if (!javCode.trim()) {
      toast('先填番号', 'bad')
      return
    }
    setJavBusy(true)
    try {
      const res = await scrapeJav(javSettings, javCode)
      const { tags, ...patch } = javToTitlePatch(res, { titleLang: settings.javTitleLang })
      setDraft((d) => ({
        ...d,
        ...patch,
        // 已有简介就不覆盖，避免把用户自己写的冲掉
        overview: d.overview?.trim() ? d.overview : patch.overview
      }))
      if (patch.cast?.length) setCastText(patch.cast.join('、'))
      if (patch.genres?.length) setGenreText(patch.genres.join('、'))
      if (tags?.length) setTagText((prev) => (prev.trim() ? prev : tags.join('、')))

      const cover = res.cover || res.thumb
      if (cover) {
        const usable = javImageUrl(javSettings, cover)
        setRemoteUrl(usable)
        setPosterBlob(null)
        setPosterPreview((prev) => {
          if (prev) URL.revokeObjectURL(prev)
          return usable
        })
      }
      setJavResult(res)
      toast(
        res.overview ? '已填充，确认后保存' : '已填充（JavDB 没有简介，可在设置里开「补全简介」）',
        'good'
      )
    } catch (e) {
      toast(e instanceof Error ? e.message : '刮削失败', 'bad')
    } finally {
      setJavBusy(false)
    }
  }

  const save = async () => {
    const title = draft.title.trim()
    if (!title) {
      toast('请填写片名', 'bad')
      return
    }
    setSaving(true)
    try {
      let blob = posterBlob
      if (!blob && remoteUrl.trim()) {
        blob = await fetchRemoteImage(remoteUrl.trim())
        if (!blob) toast('远程封面获取失败，已忽略', 'bad')
      }
      const now = new Date().toISOString()
      const item: TitleItem = {
        ...draft,
        title,
        kind,
        cast: castText.split(/[、,，]+/).map((s) => s.trim()).filter(Boolean),
        genres: genreText.split(/[、,，]+/).map((s) => s.trim()).filter(Boolean),
        tags: tagText.split(/[、,，\s]+/).map((s) => s.replace(/^#/, '').trim()).filter(Boolean),
        posterRemote: remoteUrl.trim() || undefined,
        hasLocalPoster: Boolean(blob) || Boolean(remoteUrl.trim()) || draft.hasLocalPoster,
        progress: kind === 'tv' ? draft.progress : undefined,
        createdAt: draft.createdAt || now,
        updatedAt: now,
        id: draft.id || newId()
      }
      await store.upsert(item, blob ?? undefined)
      toast(editing ? '已保存修改' : '已添加', 'good')
      navigate(`/title/${zone}/${item.id}`, { replace: true })
    } catch (e) {
      toast(e instanceof Error ? e.message : '保存失败', 'bad')
    } finally {
      setSaving(false)
    }
  }

  if (!loaded) {
    return (
      <div className="mx-auto max-w-[560px] px-4 pt-safe">
        <div className="pt-6">
          <Skeleton className="h-9 w-40 rounded-lg" />
          <Skeleton className="mt-4 h-44 w-full rounded-2xl" />
          <Skeleton className="mt-4 h-11 w-full rounded-xl" />
        </div>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-[560px] px-4 pb-10 pt-safe">
      {/* ---------------------------------------------------------- 页头 */}
      <header className="flex items-center gap-2 pb-5 pt-3">
        <button
          onClick={() => navigate(-1)}
          className="-ml-2 inline-flex h-11 min-w-touch items-center gap-1 rounded-xl px-2 text-label font-medium text-ink-soft transition ease-standard duration-2 hover:bg-paper-sunken hover:text-ink active:scale-[0.97]"
        >
          <Icon name="chevronLeft" size={18} />
          返回
        </button>
        <h1 className="min-w-0 flex-1 truncate font-display text-page font-semibold tracking-tight text-ink">
          {editing ? '编辑影片' : '手动添加'}
        </h1>
      </header>

      {/* ------------------------------------------------------ 类型切换 */}
      <div className="mb-5">
        <Segmented
          value={kind}
          onChange={(v) => {
            setKind(v as MediaKind)
            if (v === 'tv' && !draft.progress) {
              set('progress', { season: 1, episode: 0, totalSeasons: 1, episodesInSeason: {}, watchedEpisodes: 0 })
            }
          }}
          options={[
            { value: 'movie', label: '电影' },
            { value: 'tv', label: '剧集' }
          ]}
        />
      </div>

      {/* ---------------------------------------------------- 番号刮削 */}
      {settings.javEnabled && (
        <section className="mb-5">
          <div className="overflow-hidden rounded-2xl border border-paper-line bg-paper-card shadow-e1">
            <div className="flex items-center gap-2 px-4 pb-2 pt-3.5 text-label font-semibold text-reel-dark">
              <Icon name="search" size={15} />
              按番号自动填充
            </div>

            <div className="px-4 pb-4">
              <div className="flex gap-2">
                <input
                  value={javCode}
                  onChange={(e) => setJavCode(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') void runScrape()
                  }}
                  placeholder="如 SSNI-589"
                  className={clsx(inputCls, 'text-body-sm')}
                />
                <Button className="shrink-0" disabled={javBusy} onClick={() => void runScrape()}>
                  {javBusy ? '刮削中…' : '刮削'}
                </Button>
              </div>
              <p className="mt-2 text-caption leading-relaxed text-ink-faint">
                番号会发往你在「设置 → 番号刮削」里填的服务地址，也可以直接粘贴文件名（会自动抠番号）。
                {settings.javEndpoint ? '' : '还没填地址，先去设置里配一个。'}
              </p>

              {javResult && (
                <div className="animate-slideUp mt-3 rounded-xl bg-reel-soft p-3">
                  <div className="flex gap-3">
                    {javResult.cover ? (
                      <img
                        src={javImageUrl(javSettings, javResult.cover)}
                        alt=""
                        className="h-[112px] w-[78px] shrink-0 rounded-lg bg-paper-sunken object-cover shadow-e1"
                      />
                    ) : (
                      <div className="flex h-[112px] w-[78px] shrink-0 items-center justify-center rounded-lg bg-paper-sunken text-ink-faint">
                        <Icon name="image" size={22} />
                      </div>
                    )}
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-body-sm font-semibold text-ink">
                        {javResult.title || javResult.code}
                      </div>
                      <div className="font-mono text-micro text-ink-faint">{javResult.code}</div>
                      <div className="mt-1 text-caption text-ink-soft">
                        {[
                          javResult.releaseDate,
                          javResult.runtime ? `${javResult.runtime} 分钟` : '',
                          javResult.maker,
                          javResult.score ? `评分 ${javResult.score}` : ''
                        ]
                          .filter(Boolean)
                          .join(' · ')}
                      </div>
                      {javResult.overview && (
                        <p className="mt-1 line-clamp-3 text-caption leading-relaxed text-ink-faint">
                          {javResult.overview}
                        </p>
                      )}
                    </div>
                  </div>

                  {javResult.actors.length > 0 && (
                    <div className="mt-2.5 flex flex-wrap gap-1.5">
                      {javResult.actors.map((a) => (
                        <span
                          key={a}
                          className="rounded-full bg-paper-card px-2 py-0.5 text-micro text-reel-dark shadow-e1"
                        >
                          {a}
                        </span>
                      ))}
                    </div>
                  )}

                  <div className="mt-2.5 flex flex-wrap items-center gap-1.5 text-micro">
                    {(javResult.sources ?? []).map((s) => (
                      <span
                        key={s.id}
                        title={s.note ?? ''}
                        className={clsx('font-mono', s.ok ? 'text-moss' : 'text-ink-faint')}
                      >
                        {s.id} {s.ok ? '✓' : '✕'}
                      </span>
                    ))}
                    <span className="ml-auto font-mono text-ink-faint">
                      {javResult.provider} · {javResult.elapsed ?? 0}ms
                      {javResult.cached ? ' · 缓存' : ''}
                    </span>
                  </div>
                </div>
              )}
            </div>
          </div>
        </section>
      )}

      {/* -------------------------------------------------- 核心：名称 */}
      <Section title="基本信息" className="mb-5">
        <Field label="片名">
          <input value={draft.title} onChange={(e) => set('title', e.target.value)} placeholder="必填" className={inputCls} />
        </Field>
        <Field label="原名">
          <input
            value={draft.originalTitle ?? ''}
            onChange={(e) => set('originalTitle', e.target.value)}
            placeholder="可选"
            className={inputCls}
          />
        </Field>
      </Section>

      {/* ------------------------------------------------------ 影片信息 */}
      <Section title="影片信息" className="mb-5">
        <div className="flex gap-3">
          <div className="flex-1">
            <Field label="年份">
              <input value={draft.year ?? ''} onChange={(e) => set('year', e.target.value)} inputMode="numeric" className={inputCls} />
            </Field>
          </div>
          <div className="flex-1">
            <Field label={kind === 'movie' ? '片长（分钟）' : '单集时长（分钟）'}>
              <input
                value={String(draft.runtime ?? '')}
                onChange={(e) => set('runtime', Number(e.target.value.replace(/\D/g, '')) || undefined)}
                inputMode="numeric"
                className={inputCls}
              />
            </Field>
          </div>
        </div>
        <Field label="导演 / 主创">
          <input value={draft.director ?? ''} onChange={(e) => set('director', e.target.value)} className={inputCls} />
        </Field>
        <Field label="主演（顿号分隔）">
          <input value={castText} onChange={(e) => setCastText(e.target.value)} className={inputCls} />
        </Field>
        <Field label="类型（顿号分隔）">
          <input value={genreText} onChange={(e) => setGenreText(e.target.value)} placeholder="剧情 / 悬疑" className={inputCls} />
        </Field>
      </Section>

      {/* ------------------------------------------------ 分类：状态/评分 */}
      <Section title="分类与评分" className="mb-5">
        <div className="mb-4">
          <span className="mb-1.5 block text-label font-medium text-ink-soft">观看状态</span>
          <div className="flex flex-wrap gap-2">
            {STATUS_ORDER.map((s: WatchStatus) => (
              <Chip key={s} active={draft.status === s} onClick={() => set('status', s)}>
                {STATUS_LABEL[s]}
              </Chip>
            ))}
          </div>
        </div>

        {draft.status === 'done' && (
          <Field label="观看日期">
            <input
              type="date"
              value={draft.watchedAt?.slice(0, 10) ?? ''}
              onChange={(e) => set('watchedAt', e.target.value ? `${e.target.value}T12:00:00.000Z` : undefined)}
              className={inputCls}
            />
          </Field>
        )}

        <div className="mb-4">
          <span className="mb-1.5 block text-label font-medium text-ink-soft">我的评分</span>
          <div className="flex min-h-touch items-center gap-3 rounded-xl border border-paper-line bg-paper-sunken px-3.5">
            <Stars value={draft.rating} onChange={(v) => set('rating', v || undefined)} size={24} />
            <span className="text-caption text-ink-faint">
              {draft.rating ? `${(draft.rating / 2).toFixed(1)} 星` : '未评分'}
            </span>
          </div>
        </div>

        <Field label="标签（空格或顿号分隔）">
          <input value={tagText} onChange={(e) => setTagText(e.target.value)} placeholder="二刷 治愈" className={inputCls} />
        </Field>
      </Section>

      {/* ---------------------------------------------------------- 描述 */}
      <Section title="简介" className="mb-5">
        <textarea
          value={draft.overview ?? ''}
          onChange={(e) => set('overview', e.target.value)}
          rows={5}
          placeholder="自己写一段简介"
          className={textareaCls}
        />
      </Section>

      {/* ---------------------------------------------------------- 封面 */}
      <Section title="封面" className="mb-5">
        <button
          type="button"
          onClick={() => void onPick()}
          className={clsx(
            'pressable relative block w-full overflow-hidden rounded-2xl border bg-paper-sunken',
            posterPreview ? 'border-paper-line shadow-e1' : 'border-dashed border-paper-lineStrong'
          )}
        >
          {posterPreview ? (
            <>
              <img
                src={posterPreview}
                alt=""
                className="absolute inset-0 h-full w-full scale-125 object-cover opacity-30 blur-2xl"
              />
              <img
                src={posterPreview}
                alt=""
                className="relative h-[216px] w-full object-contain px-4 py-4"
              />
              <span className="absolute bottom-3 left-1/2 flex -translate-x-1/2 items-center gap-1.5 rounded-full bg-paper-card/92 px-3 py-1.5 text-micro font-medium text-ink-soft shadow-e1 backdrop-blur-sm">
                <Icon name="upload" size={12} />
                点击更换封面
              </span>
            </>
          ) : (
            <div className="flex h-[168px] flex-col items-center justify-center gap-2 px-4">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-paper-card text-ink-faint shadow-e1">
                <Icon name="image" size={24} />
              </div>
              <span className="text-label font-medium text-ink-soft">点击上传封面</span>
            </div>
          )}
        </button>

        <div className="mt-3">
          <Button variant="outline" size="sm" className="w-full" onClick={() => void onPick()}>
            <Icon name="upload" size={15} /> {posterPreview ? '更换封面文件' : '上传封面'}
          </Button>
        </div>

        <div className="mt-3">
          <Field
            label="封面图片网址"
            hint="留空则生成文字占位封面。图片会压缩后存入本地库。"
          >
            <input
              value={remoteUrl}
              onChange={(e) => setRemoteUrl(e.target.value)}
              placeholder="或粘贴封面图片网址"
              className={inputCls}
            />
          </Field>
        </div>
      </Section>

      {/* ------------------------------------------------------ 底部操作 */}
      <div className="mt-7 flex items-center gap-3">
        <Button variant="outline" size="lg" className="px-5" onClick={() => navigate(-1)}>
          取消
        </Button>
        <Button size="lg" className="flex-1" disabled={saving} onClick={() => void save()}>
          {saving ? '保存中…' : '保存'}
        </Button>
      </div>
    </div>
  )
}
