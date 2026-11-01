import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import clsx from 'clsx'
import { getCollection, putPoster, removePoster, collectionCoverKey, type Zone } from '../lib/db'
import { compressImage } from '../lib/image'
import { pickImage } from '../lib/dom'
import { useCollections } from '../store/collections'
import { useLibraryStore, useVaultStore } from '../store/zone'
import { useVaultSession } from '../store/vaultSession'
import type { Collection, TitleItem } from '../types'
import Poster from '../components/Poster'
import Icon from '../components/Icon'
import { Button, Confirm, EmptyState, Field, IconButton, Sheet, inputCls } from '../components/ui'
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
      <div className="mx-auto max-w-[560px] px-4 pt-safe">
        <EmptyState icon="list" title="片单不存在" />
      </div>
    )
  }

  if (!accessible) {
    return (
      <div className="mx-auto max-w-[560px] px-4 pt-safe">
        <EmptyState icon="lock" title="内容不可访问" />
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
      {/* 顶部工具条：返回主导航 + 编辑/删除 */}
      <div className="sticky top-0 z-30 flex items-center justify-between gap-2 bg-paper/90 px-3 py-2 pt-safe backdrop-blur">
        <Button variant="ghost" onClick={() => navigate(-1)}>
          <Icon name="chevronLeft" size={18} /> 返回
        </Button>
        <div className="flex items-center gap-2">
          <IconButton icon="edit" label="编辑" size={44} onClick={() => setEditOpen(true)} />
          <IconButton
            icon="trash"
            label="删除"
            size={44}
            onClick={() => setConfirmDelete(true)}
            className="text-danger hover:border-danger/40 hover:text-danger"
          />
        </div>
      </div>

      <div className="px-4 pb-2 pt-1">
        {/* 详情头部：与片单卡片一致的封面语言 */}
        <div className="flex gap-3.5">
          <div className="w-[104px] shrink-0 overflow-hidden rounded-xl shadow-e2">
            {members[0] ? (
              <Poster zone={zone} item={members[0]} rounded="rounded-none" className="h-full" />
            ) : (
              <div className="flex aspect-[2/3] w-full items-center justify-center bg-paper-sunken text-ink-faint">
                <Icon name="image" size={22} />
              </div>
            )}
          </div>
          <div className="min-w-0 flex-1 pt-0.5">
            <h1 className="font-display text-headline font-semibold leading-tight text-ink">
              {data.title}
            </h1>
            {data.note && (
              <p className="mt-1.5 line-clamp-3 text-body-sm leading-relaxed text-ink-soft">
                {data.note}
              </p>
            )}
            <div className="mt-2.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-caption text-ink-faint">
              <span>{members.length} 部影片</span>
              <span aria-hidden>·</span>
              <span>更新于 {data.updatedAt.slice(0, 10)}</span>
              {data.zone === 'vault' && (
                <span className="rounded-full bg-reel-soft px-1.5 py-0.5 text-micro text-reel-dark">
                  隐私
                </span>
              )}
            </div>
          </div>
        </div>

        <Button className="mt-4 w-full" onClick={() => setPickerOpen(true)}>
          <Icon name="plus" size={17} weight={2.2} /> 添加已有影片
        </Button>

        {members.length === 0 ? (
          <EmptyState icon="film" title="这个片单还是空的，把喜欢的片子加进来吧" />
        ) : (
          <div className="mt-4 space-y-2.5">
            {members.map((item, index) => (
              <div
                key={item.id}
                className="animate-staggerIn overflow-hidden rounded-2xl border border-paper-line bg-paper-card shadow-e1"
                // 交错淡入，最多错开前 10 个，避免长列表后面等待太久
                style={{ animationDelay: `${Math.min(index, 10) * 28}ms` }}
              >
                <div className="flex gap-3 p-3">
                  <div className="w-[52px] shrink-0">
                    <Poster zone={zone} item={item} rounded="rounded-lg" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-body font-medium text-ink">{item.title}</div>
                    <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-caption text-ink-faint">
                      <span>{item.year || '—'}</span>
                      {item.kind === 'tv' && <span>剧集</span>}
                      {item.rating ? (
                        <span className="flex items-center gap-0.5 font-medium text-reel-dark">
                          <Icon name="starFill" size={10} />
                          {(item.rating / 2).toFixed(1)}
                        </span>
                      ) : null}
                    </div>
                    <p className="mt-1 line-clamp-1 text-caption text-ink-faint">
                      {item.overview || '暂无简介'}
                    </p>
                  </div>
                </div>
                {/* 操作条：调序在前、危险操作在后 */}
                <div className="flex items-stretch border-t border-paper-line">
                  <button
                    onClick={() => move(index, -1)}
                    disabled={index === 0}
                    className="h-11 flex-1 text-label font-medium text-ink-soft transition ease-standard duration-2 hover:bg-paper-sunken active:bg-paper-line disabled:opacity-30"
                  >
                    ↑
                  </button>
                  <div className="w-px bg-paper-line" />
                  <button
                    onClick={() => move(index, 1)}
                    disabled={index === members.length - 1}
                    className="h-11 flex-1 text-label font-medium text-ink-soft transition ease-standard duration-2 hover:bg-paper-sunken active:bg-paper-line disabled:opacity-30"
                  >
                    ↓
                  </button>
                  <div className="w-px bg-paper-line" />
                  <button
                    onClick={() => void collections.toggleItem(data.id, item.id)}
                    className="h-11 flex-1 text-label font-medium text-danger transition ease-standard duration-2 hover:bg-danger-soft active:bg-danger-soft"
                  >
                    移出
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        <p className="mt-6 text-center text-caption text-ink-faint">
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
        <div className="mb-3 flex gap-2">
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
        <div className="relative">
          <Icon
            name="search"
            size={17}
            className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-faint"
          />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="搜索片名…"
            className={clsx(inputCls, 'pl-11')}
          />
        </div>
        <div className="mt-3 space-y-2">
          {allTitles
            .filter((t) => !query.trim() || t.title.toLowerCase().includes(query.trim().toLowerCase()))
            .map((t) => {
              const inside = data.itemIds.includes(t.id)
              return (
                <button
                  key={t.id}
                  onClick={() => void collections.toggleItem(data.id, t.id)}
                  className="pressable flex w-full items-center gap-3 rounded-xl border border-paper-line bg-paper-card p-2.5 text-left transition-colors ease-standard duration-2 hover:bg-paper-sunken active:bg-paper-sunken"
                >
                  <div className="w-[40px] shrink-0">
                    <Poster zone={zone} item={t} rounded="rounded-lg" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-body-sm font-medium text-ink">{t.title}</div>
                    <div className="mt-0.5 text-caption text-ink-faint">{t.year || '—'}</div>
                  </div>
                  <span
                    className={clsx(
                      'shrink-0 rounded-full px-2.5 py-1 text-caption font-medium',
                      inside ? 'bg-reel-soft text-reel-dark' : 'bg-paper-sunken text-ink-faint'
                    )}
                  >
                    {inside ? '已加入' : '加入'}
                  </span>
                </button>
              )
            })}
          {allTitles.length === 0 && (
            <EmptyState icon="film" title="片库还没有影片" />
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
