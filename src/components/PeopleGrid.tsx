import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import clsx from 'clsx'
import { peopleStore } from '../store/people'
import { zoneStore } from '../store/zone'
import { gapOf, useTheme } from '../store/theme'
import type { Zone } from '../lib/db'
import type { Person } from '../types'
import Avatar from './Avatar'
import Icon from './Icon'
import { Button, EmptyState, Field, IconButton, Sheet, inputCls } from './ui'
import { toast } from './Toast'

export default function PeopleGrid({ zone }: { zone: Zone }) {
  const people = peopleStore(zone)
  const items = people((s) => s.items)
  const ready = people((s) => s.ready)
  const titles = zoneStore(zone)((s) => s.items)
  const theme = useTheme()

  const [q, setQ] = useState('')
  const [addOpen, setAddOpen] = useState(false)
  const [name, setName] = useState('')
  const [note, setNote] = useState('')
  const [birthday, setBirthday] = useState('')
  const [busy, setBusy] = useState(false)

  const filtered = useMemo(() => {
    const kw = q.trim().toLowerCase()
    if (!kw) return items
    return items.filter(
      (p) =>
        p.name.toLowerCase().includes(kw) ||
        (p.note ?? '').toLowerCase().includes(kw) ||
        (p.tags ?? []).some((t) => t.toLowerCase().includes(kw))
    )
  }, [items, q])

  const doGenerate = async () => {
    setBusy(true)
    try {
      const res = await people.getState().generate(titles)
      if (res.created === 0 && res.linked === 0) {
        toast('没有发现新的演员，片库里可能还没填演员表', 'bad')
      } else {
        toast(`新增 ${res.created} 位 · 补充关联 ${res.linked} 位`, 'good')
      }
    } finally {
      setBusy(false)
    }
  }

  const doCreate = async () => {
    const trimmed = name.trim()
    if (!trimmed) {
      toast('请填写演员名字', 'bad')
      return
    }
    if (items.some((p) => p.name.trim().toLowerCase() === trimmed.toLowerCase())) {
      toast('同名演员已存在', 'bad')
      return
    }
    await people.getState().create({ name: trimmed, note, birthday })
    setName('')
    setNote('')
    setBirthday('')
    setAddOpen(false)
    toast('已添加', 'good')
  }

  return (
    <div>
      <div className="flex items-center gap-2 pb-4">
        <div className="relative flex-1">
          <Icon
            name="search"
            size={17}
            className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-faint"
          />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="搜索演员…"
            className="h-11 w-full rounded-xl border border-paper-line bg-paper-card pl-10 pr-3 text-body-sm outline-none transition ease-standard duration-2 placeholder:text-ink-faint/85 hover:border-paper-lineStrong focus:border-reel focus:ring-2 focus:ring-reel/15"
          />
        </div>
        <IconButton icon="plus" label="手动添加" size={44} onClick={() => setAddOpen(true)} />
      </div>

      <div className="mb-5 flex items-center justify-between gap-3 rounded-2xl bg-paper-sunken px-3.5 py-3">
        <p className="min-w-0 flex-1 text-caption leading-relaxed text-ink-faint">
          {zone === 'vault'
            ? '隐私区的演员与公开区完全隔离，只统计隐私片库的影片。'
            : '可以从片库影片的演员表一键生成，也可以手动添加。'}
        </p>
        <Button
          size="sm"
          variant="outline"
          className="shrink-0"
          disabled={busy || titles.length === 0}
          onClick={() => void doGenerate()}
        >
          <Icon name="refresh" size={15} /> {busy ? '生成中…' : '生成'}
        </Button>
      </div>

      {ready && filtered.length === 0 ? (
        <EmptyState
          icon="tag"
          title={items.length === 0 ? '还没有演员' : '没有匹配的演员'}
          desc={
            items.length === 0
              ? '点「生成」自动整理出已有影片的演员，或手动添加一位。'
              : '换个关键词试试。'
          }
        />
      ) : (
        <div
          className="grid"
          style={{
            gridTemplateColumns: `repeat(${Math.min(theme.columns + 1, 5)}, minmax(0, 1fr))`,
            gap: gapOf(theme.density) + 4
          }}
        >
          {filtered.map((p, idx) => (
            <Link
              key={p.id}
              to={`/person/${zone}/${p.id}`}
              className="animate-staggerIn pressable flex flex-col items-center text-center"
              style={{ animationDelay: `${Math.min(idx, 10) * 28}ms` }}
            >
              <div className="relative w-full">
                <Avatar
                  zone={zone}
                  person={p}
                  className="aspect-square w-full rounded-full bg-paper-sunken ring-1 ring-inset ring-ink/[0.07]"
                  textClass="text-body-sm"
                />
              </div>
              <div className="mt-2 w-full truncate text-label font-medium leading-snug text-ink">
                {p.name}
              </div>
              <div className="text-micro text-ink-faint">{p.titleIds.length} 部</div>
            </Link>
          ))}
        </div>
      )}

      <Sheet
        open={addOpen}
        onClose={() => setAddOpen(false)}
        title="添加演员"
        footer={
          <Button className="w-full" onClick={() => void doCreate()}>
            添加
          </Button>
        }
      >
        <Field label="姓名">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="必填"
            className={inputCls}
          />
        </Field>
        <Field label="备注">
          <input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="选填，比如喜欢的代表作"
            className={inputCls}
          />
        </Field>
        <Field label="生日">
          <input
            value={birthday}
            onChange={(e) => setBirthday(e.target.value)}
            placeholder="选填"
            className={inputCls}
          />
        </Field>
      </Sheet>
    </div>
  )
}

/** 影片详情里的演员横滑列表 */
export function CastStrip({
  zone,
  cast,
  onPick
}: {
  zone: Zone
  cast: string[]
  onPick: (name: string) => void
}) {
  const people = peopleStore(zone)((s) => s.items)
  if (!cast.length) return null

  return (
    <div className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4 pb-1">
      {cast.map((name, idx) => {
        const hit = people.find((p) => p.name.trim().toLowerCase() === name.trim().toLowerCase())
        const inner = (
          <div
            className={clsx(
              'animate-staggerIn flex w-[76px] shrink-0 flex-col items-center gap-1.5 rounded-xl p-2 transition ease-standard duration-2',
              hit
                ? 'border border-paper-line bg-paper-card'
                : 'border border-dashed border-paper-lineStrong bg-transparent'
            )}
            style={{ animationDelay: `${Math.min(idx, 10) * 26}ms` }}
          >
            {hit ? (
              <Avatar
                zone={zone}
                person={hit}
                className="h-11 w-11 rounded-full bg-paper-sunken"
                textClass="text-caption"
              />
            ) : (
              <div className="flex h-11 w-11 items-center justify-center rounded-full bg-paper-sunken text-body-sm text-ink-faint">
                <Icon name="plus" size={15} />
              </div>
            )}
            <span className="w-full truncate text-center text-caption leading-tight text-ink-soft">
              {name}
            </span>
          </div>
        )
        return (
          <button key={name} onClick={() => onPick(name)} className="pressable shrink-0">
            {inner}
          </button>
        )
      })}
    </div>
  )
}

export type { Person }
