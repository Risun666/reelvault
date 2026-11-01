import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useCollections } from '../store/collections'
import { useLibraryStore, useVaultStore } from '../store/zone'
import { useVaultSession } from '../store/vaultSession'
import { collectionCoverKey, posterUrl } from '../lib/db'
import { gapOf, useTheme } from '../store/theme'
import type { Collection, TitleItem } from '../types'
import Poster from '../components/Poster'
import Icon from '../components/Icon'
import { Button, Confirm, EmptyState, Field, Sheet, Skeleton, inputCls } from '../components/ui'
import { toast } from '../components/Toast'

export default function Collections() {
  const collections = useCollections()
  const library = useLibraryStore((s) => s.items)
  const vault = useVaultStore((s) => s.items)
  const vaultSession = useVaultSession()
  const theme = useTheme()
  const navigate = useNavigate()

  const [createOpen, setCreateOpen] = useState(false)
  const [titleDraft, setTitleDraft] = useState('')
  const [noteDraft, setNoteDraft] = useState('')
  const [toVault, setToVault] = useState(false)
  const [pendingDelete, setPendingDelete] = useState<Collection | null>(null)

  useEffect(() => {
    if (vaultSession.active) void collections.refresh()
    else void collections.refreshPublic()
  }, [vaultSession.active])

  const titles = useMemo(
    () => [...library, ...(vaultSession.active ? vault : [])],
    [library, vault, vaultSession.active]
  )

  const visible = useMemo(
    () => collections.items.filter((c) => c.zone !== 'vault' || vaultSession.active),
    [collections.items, vaultSession.active]
  )

  async function create() {
    const title = titleDraft.trim()
    if (!title) {
      toast('给片单起个名字', 'bad')
      return
    }
    const item = await collections.create(
      title,
      toVault && vaultSession.active ? 'vault' : 'library',
      noteDraft.trim()
    )
    setCreateOpen(false)
    setTitleDraft('')
    setNoteDraft('')
    setToVault(false)
    toast('片单已创建', 'good')
    navigate(`/collection/${item.id}`)
  }

  return (
    <div className="mx-auto max-w-[560px] px-4 pb-10 pt-safe">
      <header className="flex items-end justify-between gap-3 pb-5 pt-3">
        <div className="min-w-0">
          <h1 className="font-display text-page font-semibold leading-tight tracking-tight text-ink">
            片单
          </h1>
          <p className="mt-1 text-caption text-ink-faint">
            把看过的好片串成主题清单 · 共 {visible.length} 个
          </p>
        </div>
        <Button onClick={() => setCreateOpen(true)}>
          <Icon name="plus" size={17} weight={2.2} /> 新建
        </Button>
      </header>

      {!collections.ready ? (
        <div className="grid grid-cols-2" style={{ gap: gapOf(theme.density) }}>
          {[0, 1, 2, 3].map((i) => (
            <div key={i}>
              <Skeleton className="aspect-[4/3] w-full rounded-2xl" />
              <Skeleton className="mt-2.5 h-3.5 w-3/4" />
              <Skeleton className="mt-1.5 h-3 w-1/3" />
            </div>
          ))}
        </div>
      ) : visible.length === 0 ? (
        <EmptyState
          icon="list"
          title="还没有片单"
          desc="比如「夏日补完计划」「一个人的深夜电影」「年度十选」，把收藏按心情归拢起来。"
          action={<Button onClick={() => setCreateOpen(true)}>创建第一个片单</Button>}
        />
      ) : (
        <div className="grid grid-cols-2" style={{ gap: gapOf(theme.density) }}>
          {visible.map((c, i) => (
            <CollectionCard key={c.id} collection={c} titles={titles} index={i} />
          ))}
        </div>
      )}

      <Sheet
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        title="新建片单"
        footer={
          <Button className="w-full" onClick={() => void create()}>
            创建
          </Button>
        }
      >
        <Field label="片单名称">
          <input
            value={titleDraft}
            onChange={(e) => setTitleDraft(e.target.value)}
            placeholder="例如：今年最爱的十部电影"
            className={inputCls}
          />
        </Field>
        <Field label="一句话介绍（选填）">
          <textarea
            value={noteDraft}
            onChange={(e) => setNoteDraft(e.target.value)}
            rows={3}
            placeholder="为什么把它们放在一起"
            className={inputCls}
          />
        </Field>
        {vaultSession.active && (
          <label className="pressable flex min-h-touch items-center gap-3 rounded-xl border border-paper-line bg-paper-sunken p-3">
            <input
              type="checkbox"
              checked={toVault}
              onChange={(e) => setToVault(e.target.checked)}
              className="h-4 w-4"
              style={{ accentColor: 'rgb(var(--rv-accent))' }}
            />
            <span className="text-label text-ink-soft">
              存进隐私保险箱（不参与云同步）
            </span>
          </label>
        )}
      </Sheet>

      <Confirm
        open={Boolean(pendingDelete)}
        title={`删除片单「${pendingDelete?.title ?? ''}」？`}
        desc="只是删掉这个清单，里面的影片仍然留在片库里。"
        danger
        onCancel={() => setPendingDelete(null)}
        onConfirm={() => {
          if (pendingDelete) void collections.remove(pendingDelete.id)
          setPendingDelete(null)
          toast('片单已删除')
        }}
      />
    </div>
  )
}

function CollectionCard({
  collection,
  titles,
  index
}: {
  collection: Collection
  titles: TitleItem[]
  index: number
}) {
  const members = collection.itemIds
    .map((id) => titles.find((t) => t.id === id))
    .filter(Boolean) as TitleItem[]
  const [customCover, setCustomCover] = useState<string | null>(null)

  useEffect(() => {
    let alive = true
    if (!collection.hasLocalCover) {
      setCustomCover(null)
      return
    }
    posterUrl(collection.zone, collectionCoverKey(collection.id))
      .then((u) => alive && setCustomCover(u))
      .catch(() => undefined)
    return () => {
      alive = false
    }
  }, [collection.zone, collection.id, collection.hasLocalCover])

  const heads = members.slice(0, 3)
  const extra = members.length - heads.length

  return (
    <Link
      to={`/collection/${collection.id}`}
      className="animate-staggerIn pressable block"
      // 交错淡入，最多错开前 10 个，避免长列表后面等待太久
      style={{ animationDelay: `${Math.min(index, 10) * 28}ms` }}
    >
      <div className="overflow-hidden rounded-2xl border border-paper-line bg-paper-card shadow-e1 transition-shadow ease-standard duration-3">
        {/* 封面：优先自定义图，否则用前 3 部影片的海报拼贴 */}
        <div className="relative aspect-[4/3] overflow-hidden bg-paper-sunken">
          {customCover ? (
            <img src={customCover} alt="" className="h-full w-full object-cover" />
          ) : heads.length === 0 ? (
            <div className="flex h-full items-center justify-center text-ink-faint">
              <Icon name="image" size={24} />
            </div>
          ) : heads.length === 1 ? (
            <div className="h-full overflow-hidden">
              <Poster zone={collection.zone} item={heads[0]} rounded="rounded-none" className="h-full" />
            </div>
          ) : heads.length === 2 ? (
            <div className="flex h-full gap-0.5">
              {heads.map((t) => (
                <div key={t.id} className="min-w-0 flex-1 overflow-hidden">
                  <Poster zone={collection.zone} item={t} rounded="rounded-none" className="h-full" />
                </div>
              ))}
            </div>
          ) : (
            <div className="grid h-full grid-cols-2 grid-rows-2 gap-0.5">
              <div className="row-span-2 overflow-hidden">
                <Poster zone={collection.zone} item={heads[0]} rounded="rounded-none" className="h-full" />
              </div>
              <div className="overflow-hidden">
                <Poster zone={collection.zone} item={heads[1]} rounded="rounded-none" className="h-full" />
              </div>
              <div className="overflow-hidden">
                <Poster zone={collection.zone} item={heads[2]} rounded="rounded-none" className="h-full" />
              </div>
            </div>
          )}

          {extra > 0 && (
            <span className="pointer-events-none absolute bottom-2 right-2 rounded-full bg-paper-card/92 px-1.5 py-0.5 text-micro font-semibold text-ink shadow-e1 backdrop-blur-sm">
              +{extra}
            </span>
          )}
          {collection.zone === 'vault' && (
            <span className="pointer-events-none absolute left-2 top-2 flex items-center gap-1 rounded-full bg-paper-card/92 px-1.5 py-0.5 text-micro text-reel-dark shadow-e1 backdrop-blur-sm">
              <Icon name="lock" size={10} />
              隐私
            </span>
          )}
        </div>
        <div className="px-3 py-2.5">
          <div className="truncate text-body font-medium text-ink">{collection.title}</div>
          <div className="mt-0.5 flex items-center gap-1.5 text-caption text-ink-faint">
            <Icon name="film" size={11} />
            <span>{members.length} 部</span>
          </div>
        </div>
      </div>
    </Link>
  )
}
