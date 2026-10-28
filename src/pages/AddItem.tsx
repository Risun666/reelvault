import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import clsx from 'clsx'
import { getTitle, type Zone } from '../lib/db'
import { compressImage, fetchRemoteImage } from '../lib/image'
import { pickImage } from '../lib/dom'
import { zoneStore } from '../store/zone'
import { useVaultSession } from '../store/vaultSession'
import { blankTitle } from '../lib/addTitle'
import type { MediaKind, TitleItem, WatchStatus } from '../types'
import { STATUS_LABEL, STATUS_ORDER, newId } from '../types'
import Icon from '../components/Icon'
import { Button, Chip, Field, Segmented, Stars, inputCls } from '../components/ui'
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
      if (posterPreview) URL.revokeObjectURL(posterPreview)
    }
  }, [posterPreview])

  if (zone === 'vault' && !vaultSession.active) {
    return (
      <div className="mx-auto max-w-[560px] px-4 pt-10 text-center text-[0.875rem] text-ink-faint">
        无法访问该页面
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
      <div className="mx-auto max-w-[560px] space-y-2 px-4 pt-6">
        <div className="skeleton h-8 w-32 rounded" />
        <div className="skeleton h-40 rounded-2xl" />
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-[560px] px-4 pb-10 pt-safe">
      <div className="flex items-center justify-between py-3">
        <button onClick={() => navigate(-1)} className="flex items-center gap-1 text-ink-soft">
          <Icon name="chevronLeft" size={20} /> <span className="text-[0.8125rem]">返回</span>
        </button>
        <h1 className="text-[0.9375rem] font-semibold">{editing ? '编辑影片' : '手动添加'}</h1>
        <span className="w-12" />
      </div>

      <div className="mb-4">
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

      {/* 封面 */}
      <div className="mb-5 flex gap-3">
        <div
          className={clsx(
            'flex h-[132px] w-[92px] shrink-0 items-center justify-center overflow-hidden rounded-xl bg-paper-line/70',
            !posterPreview && 'border border-dashed border-paper-line'
          )}
        >
          {posterPreview ? (
            <img src={posterPreview} alt="" className="h-full w-full object-cover" />
          ) : (
            <Icon name="image" size={26} className="text-ink-faint" />
          )}
        </div>
        <div className="flex-1 space-y-2">
          <Button variant="outline" size="sm" className="w-full" onClick={() => void onPick()}>
            <Icon name="upload" size={15} /> {posterPreview ? '更换封面文件' : '上传封面'}
          </Button>
          <input
            value={remoteUrl}
            onChange={(e) => setRemoteUrl(e.target.value)}
            placeholder="或粘贴封面图片网址"
            className={inputCls + ' text-[0.8125rem]'}
          />
          <p className="text-[0.6875rem] leading-relaxed text-ink-faint">
            留空则生成文字占位封面。图片会压缩后存入本地库。
          </p>
        </div>
      </div>

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
      <Field label="标签（空格或顿号分隔）">
        <input value={tagText} onChange={(e) => setTagText(e.target.value)} placeholder="二刷 治愈" className={inputCls} />
      </Field>
      <Field label="简介">
        <textarea
          value={draft.overview ?? ''}
          onChange={(e) => set('overview', e.target.value)}
          rows={5}
          placeholder="自己写一段简介"
          className={inputCls}
        />
      </Field>

      <div className="mb-3">
        <div className="mb-1.5 text-[0.75rem] font-medium uppercase tracking-wide text-ink-faint">观看状态</div>
        <div className="flex gap-2">
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

      <div className="mb-5">
        <div className="mb-1.5 text-[0.75rem] font-medium uppercase tracking-wide text-ink-faint">我的评分</div>
        <Stars value={draft.rating} onChange={(v) => set('rating', v || undefined)} />
      </div>

      <Button className="w-full" size="lg" disabled={saving} onClick={() => void save()}>
        {saving ? '保存中…' : '保存'}
      </Button>
    </div>
  )
}
