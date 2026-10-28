import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { getCollection, putPoster, removePoster, collectionCoverKey, type Zone } from '../lib/db'
import { compressImage } from '../lib/image'
import { pickImage } from '../lib/dom'
import { useCollections } from '../store/collections'
import { useLibraryStore, useVaultStore } from '../store/zone'
import { useVaultSession } from '../store/vaultSession'
import type { Collection, TitleItem } from '../types'
import Poster from '../components/Poster'
import Icon from '../components/Icon'
import { Button, Confirm, Field, Sheet, inputCls } from '../components/ui'
import { toast } from '../components/Toast'

export default function CollectionDetail() {
  const { id = '' } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const collections = useCollections()
  const library = useLibraryStore((s) => s.items)
  const vault = useVaultStore((s) => s.items)
  const vaultSession = useVaultSession()

  const [data, setData] = useState<Collection | null>(null)
  const [notFound, setNotFound] = useState(false)
  const [editOpen, setEditOpen] = useState(false)
  const [pickerOpen, setPickerOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [titleDraft, setTitleDraft] = useState('')
  const [noteDraft, setNoteDraft] = useState('')
  const [confirmDelete, setConfirmDelete] = useState(false)

  // 详情直达或隐私区切换时补数据
  useEffect(() => {
    let alive = true
    void getCollection(id).then((c) => {
      if (!alive) return
      setData(c ?? null)
      setNotFound(!c)
      if (c) {
        setTitleDraft(c.title)
        setNoteDraft(c.note ?? '')
      }
    })
    return () => {
      alive = false
    }
  }, [id])

  useEffect(() => {
    const fromStore = collections.items.find((c) => c.id === id)
    if (fromStore) {
      setData(fromStore)
      setNotFound(false)
    }
  }, [collections.items, id])

  const zone: Zone = data?.zone ?? 'library'
  const accessible = zone !== 'vault' || vaultSession.active

  useEffect(() => {
    if (data?.zone === 'vault' && vaultSession.active) void useVaultStore.getState().refresh()
  }, [data?.zone, vaultSession.active])

  const allTitles = useMemo(
    () => (zone === 'vault' ? vault : library),
    [zone, library, vault]
  )
  const members = useMemo(
    () =>
      (data?.itemIds ?? [])
        .map((t) => allTitles.find((i) => i.id === t))
        .filter(Boolean) as TitleItem[],
    [data?.itemIds, allTitles]
  )

  if (notFound || !data) {
    return (
      <div className="mx-auto max-w-[560px] px-4 py-16 text-center text-[0.875rem] text-ink-faint">
        片单不存在
      </div>
    )
  }

  if (!accessible) {
    return (
      <div className="mx-auto max-w-[560px] px-4 py-16 text-center text-[0.875rem] text-ink-faint">
        内容不可访问
      </div>
    )
  }

  const move = (index: number, delta: number) => {
    const ids = [...data.itemIds]
    const target = index + delta
    if (target < 0 || target >= ids.length) return
    ;[ids[index], ids[target]] = [ids[target], ids[index]]
    void collections.setOrder(data.id, ids)
  }

  async function saveMeta() {
    const title = titleDraft.trim()
    if (!title) {
      toast('标题不能为空', 'bad')
      return
    }
    await collections.save({ ...data!, title, note: noteDraft.trim() || undefined })
    setEditOpen(false)
    toast('已保存', 'good')
  }

  async function uploadCover() {
    const file = await pickImage()
    if (!file) return
    const blob = await compressImage(file, 900)
    await putPoster(zone, collectionCoverKey(data!.id), blob)
    await collections.save({ ...data!, hasLocalCover: true })
    toast('封面已更新', 'good')
  }

  return (
    <div className="mx-auto max-w-[560px] pb-10">
      <div className="sticky top-0 z-30 flex items-center justify-between bg-paper/95 px-2 py-2 pt-safe backdrop-blur">
        <button onClick={() => navigate(-1)} className="flex items-center gap-1 text-ink-soft">
          <Icon name="chevronLeft" size={20} /> <span className="text-[0.8125rem]">返回</span>
        </button>
        <div className="flex items-center gap-1">
          <button onClick={() => setEditOpen(true)} className="rounded-full p-2 text-ink-soft active:bg-paper-line">
            <Icon name="edit" size={19} />
          </button>
          <button
            onClick={() => setConfirmDelete(true)}
            className="rounded-full p-2 text-ink-soft active:bg-paper-line"
          >
            <Icon name="trash" size={19} />
          </button>
        </div>
      </div>

      <div className="px-4">
        <div className="flex gap-3">
          <div className="h-[128px] w-[92px] shrink-0 overflow-hidden rounded-xl bg-paper-line/60">
            {members[0] ? (
              <Poster zone={zone} item={members[0]} rounded="rounded-none" className="h-full" />
            ) : (
              <div className="flex h-full items-center justify-center text-ink-faint">
                <Icon name="image" size={20} />
              </div>
            )}
          </div>
          <div className="min-w-0 flex-1">
            <h1 className="text-[1.125rem] font-semibold leading-tight">{data.title}</h1>
            {data.note && (
              <p className="mt-1 text-[0.8125rem] leading-relaxed text-ink-soft">{data.note}</p>
            )}
            <div className="mt-2 flex flex-wrap gap-1.5 text-[0.6875rem] text-ink-faint">
              <span>{members.length} 部影片</span>
              <span>·</span>
              <span>更新于 {data.updatedAt.slice(0, 10)}</span>
              {data.zone === 'vault' && (
                <span className="rounded bg-reel-soft px-1.5 py-0.5 text-reel-dark">隐私</span>
              )}
            </div>
          </div>
        </div>

        <Button variant="outline" className="mt-4 w-full" onClick={() => setPickerOpen(true)}>
          <Icon name="plus" size={16} /> 添加已有影片
        </Button>

        {members.length === 0 ? (
          <p className="py-10 text-center text-[0.8125rem] text-ink-faint">
            这个片单还是空的，把喜欢的片子加进来吧
          </p>
        ) : (
          <div className="mt-4 space-y-2">
            {members.map((item, index) => (
              <div
                key={item.id}
                className="flex gap-3 rounded-2xl border border-paper-line bg-white p-2.5"
              >
                <div className="w-[54px] shrink-0">
                  <Poster zone={zone} item={item} rounded="rounded-lg" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[0.875rem] font-medium">{item.title}</div>
                  <div className="mt-0.5 text-[0.75rem] text-ink-faint">
                    {item.year || '—'}
                    {item.kind === 'tv' ? ' · 剧集' : ''}
                    {item.rating ? ` · ${(item.rating / 2).toFixed(1)}★` : ''}
                  </div>
                  <p className="mt-1 line-clamp-1 text-[0.75rem] text-ink-faint">
                    {item.overview || '暂无简介'}
                  </p>
                </div>
                <div className="flex shrink-0 flex-col items-center justify-center gap-1">
                  <button
                    onClick={() => move(index, -1)}
                    disabled={index === 0}
                    className="rounded-md bg-paper px-1.5 py-0.5 text-[0.6875rem] text-ink-soft disabled:opacity-30"
                  >
                    ↑
                  </button>
                  <button
                    onClick={() => move(index, 1)}
                    disabled={index === members.length - 1}
                    className="rounded-md bg-paper px-1.5 py-0.5 text-[0.6875rem] text-ink-soft disabled:opacity-30"
                  >
                    ↓
                  </button>
                  <button
                    onClick={() => void collections.toggleItem(data.id, item.id)}
                    className="rounded-md bg-paper px-1.5 py-0.5 text-[0.6875rem] text-reel"
                  >
                    移出
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        <p className="mt-5 text-center text-[0.6875rem] text-ink-faint">
          {data.zone === 'vault'
            ? '隐私区的片单不会上传到云端'
            : '片单与公开片库一起参与云同步'}
        </p>
      </div>

      <Sheet
        open={editOpen}
        onClose={() => setEditOpen(false)}
        title="编辑片单"
        footer={
          <Button className="w-full" onClick={() => void saveMeta()}>
            保存
          </Button>
        }
      >
        <Field label="片单名称">
          <input
            value={titleDraft}
            onChange={(e) => setTitleDraft(e.target.value)}
            className={inputCls}
            placeholder="必填"
          />
        </Field>
        <Field label="一句话介绍">
          <textarea
            value={noteDraft}
            onChange={(e) => setNoteDraft(e.target.value)}
            rows={3}
            className={inputCls}
          />
        </Field>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" className="flex-1" onClick={() => void uploadCover()}>
            <Icon name="upload" size={15} /> 上传封面
          </Button>
          {data.hasLocalCover && (
            <Button
              variant="ghost"
              size="sm"
              className="flex-1"
              onClick={async () => {
                await removePoster(zone, collectionCoverKey(data.id))
                await collections.save({ ...data, hasLocalCover: false })
                toast('已改用影片封面')
              }}
            >
              用影片封面
            </Button>
          )}
        </div>
      </Sheet>

      <Sheet open={pickerOpen} onClose={() => setPickerOpen(false)} title="添加影片到片单">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="搜索片名…"
          className={inputCls}
        />
        <div className="mt-3 space-y-2">
          {allTitles
            .filter((t) => !query.trim() || t.title.toLowerCase().includes(query.trim().toLowerCase()))
            .map((t) => {
              const inside = data.itemIds.includes(t.id)
              return (
                <button
                  key={t.id}
                  onClick={() => void collections.toggleItem(data.id, t.id)}
                  className="flex w-full items-center gap-3 rounded-xl border border-paper-line bg-white p-2 text-left active:bg-paper"
                >
                  <div className="w-[38px] shrink-0">
                    <Poster zone={zone} item={t} rounded="rounded-md" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[0.8125rem]">{t.title}</div>
                    <div className="text-[0.6875rem] text-ink-faint">{t.year || '—'}</div>
                  </div>
                  <span
                    className={
                      'shrink-0 rounded-full px-2 py-1 text-[0.6875rem] ' +
                      (inside ? 'bg-reel-soft text-reel-dark' : 'bg-paper text-ink-faint')
                    }
                  >
                    {inside ? '已加入' : '加入'}
                  </span>
                </button>
              )
            })}
          {allTitles.length === 0 && (
            <p className="py-6 text-center text-[0.8125rem] text-ink-faint">片库还没有影片</p>
          )}
        </div>
      </Sheet>

      <Confirm
        open={confirmDelete}
        title={`删除片单「${data.title}」？`}
        desc="里面的影片不会被删除。"
        danger
        onCancel={() => setConfirmDelete(false)}
        onConfirm={() => {
          void collections.remove(data.id)
          setConfirmDelete(false)
          toast('片单已删除')
          navigate('/collections')
        }}
      />
    </div>
  )
}
