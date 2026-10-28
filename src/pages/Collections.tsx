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
import { Button, Confirm, EmptyState, Field, Sheet, inputCls } from '../components/ui'
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
      <header className="flex items-end justify-between pb-3 pt-2">
        <div>
          <h1 className="text-[1.5rem] font-semibold tracking-tight">片单</h1>
          <p className="mt-0.5 text-[0.75rem] text-ink-faint">
            把看过的好片串成主题清单 · 共 {visible.length} 个
          </p>
        </div>
        <Button size="sm" onClick={() => setCreateOpen(true)}>
          <Icon name="plus" size={16} /> 新建
        </Button>
      </header>

      {!collections.ready ? (
        <div className="grid grid-cols-2 gap-3">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="skeleton aspect-[4/3] rounded-2xl" />
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
        <div className="grid grid-cols-2 gap-3" style={{ gap: gapOf(theme.density) }}>
          {visible.map((c) => (
            <CollectionCard key={c.id} collection={c} titles={titles} />
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
          <label className="flex items-center gap-2 rounded-xl border border-paper-line bg-white p-3">
            <input
              type="checkbox"
              checked={toVault}
              onChange={(e) => setToVault(e.target.checked)}
              className="h-4 w-4"
              style={{ accentColor: 'rgb(var(--rv-accent))' }}
            />
            <span className="text-[0.8125rem] text-ink-soft">
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

function CollectionCard({ collection, titles }: { collection: Collection; titles: TitleItem[] }) {
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

  return (
    <Link to={`/collection/${collection.id}`} className="block">
      <div className="overflow-hidden rounded-2xl border border-paper-line bg-paper-card transition-transform active:scale-[0.985]">
        <div className="aspect-[4/3]">
          {customCover ? (
            <img src={customCover} alt="" className="h-full w-full object-cover" />
          ) : heads.length === 0 ? (
            <div className="flex h-full items-center justify-center bg-paper-line/50 text-ink-faint">
              <Icon name="image" size={22} />
            </div>
          ) : (
            <div className="flex h-full gap-0.5 bg-paper-line/50 p-0.5">
              {heads.map((t) => (
                <div key={t.id} className="min-w-0 flex-1">
                  <Poster zone={collection.zone} item={t} rounded="rounded-md" className="h-full" />
                </div>
              ))}
              {members.length > 3 && (
                <div className="flex min-w-0 flex-1 items-center justify-center rounded-md bg-paper text-[0.75rem] text-ink-faint">
                  +{members.length - 3}
                </div>
              )}
            </div>
          )}
        </div>
        <div className="p-2.5">
          <div className="truncate text-[0.8125rem] font-medium">{collection.title}</div>
          <div className="mt-0.5 flex items-center gap-1.5 text-[0.6875rem] text-ink-faint">
            <span>{members.length} 部</span>
            {collection.zone === 'vault' && (
              <span className="rounded bg-reel-soft px-1 py-0.5 text-reel-dark">隐私</span>
            )}
          </div>
        </div>
      </div>
    </Link>
  )
}
