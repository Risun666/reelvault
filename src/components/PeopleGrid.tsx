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
import { Button, EmptyState, Field, Sheet, inputCls } from './ui'
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
      <div className="flex items-center gap-2 pb-3">
        <div className="relative flex-1">
          <Icon
            name="search"
            size={16}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-faint"
          />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="搜索演员…"
            className="w-full rounded-xl border border-paper-line bg-white py-2.5 pl-9 pr-3 text-[0.875rem] outline-none placeholder:text-ink-faint/80 focus:border-ink/25"
          />
        </div>
        <button
          onClick={() => setAddOpen(true)}
          className="rounded-xl border border-paper-line bg-white p-2.5 text-ink-soft"
          title="手动添加"
        >
          <Icon name="plus" size={17} />
        </button>
      </div>

      <div className="mb-3 flex items-center justify-between gap-2 rounded-xl border border-paper-line bg-paper/60 px-3 py-2">
        <p className="min-w-0 flex-1 text-[0.6875rem] leading-relaxed text-ink-faint">
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
          <Icon name="refresh" size={14} /> {busy ? '生成中…' : '从片库生成'}
        </Button>
      </div>

      {ready && filtered.length === 0 ? (
        <EmptyState
          icon="tag"
          title={items.length === 0 ? '还没有演员' : '没有匹配的演员'}
          desc={
            items.length === 0
              ? '点「从片库生成」自动整理出已有影片的演员，或手动添加一位。'
              : '换个关键词试试。'
          }
        />
      ) : (
        <div
          className="grid"
          style={{
            gridTemplateColumns: `repeat(${Math.min(theme.columns + 1, 5)}, minmax(0, 1fr))`,
            gap: gapOf(theme.density)
          }}
        >
          {filtered.map((p) => (
            <Link
              key={p.id}
              to={`/person/${zone}/${p.id}`}
              className="flex flex-col items-center text-center"
            >
              <Avatar
                zone={zone}
                person={p}
                className="aspect-square w-full rounded-full border border-paper-line bg-paper"
                textClass="text-[0.875rem]"
              />
              <div className="mt-1.5 w-full truncate text-[0.8125rem] font-medium leading-tight">
                {p.name}
              </div>
              <div className="text-[0.6875rem] text-ink-faint">{p.titleIds.length} 部</div>
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
      {cast.map((name) => {
        const hit = people.find((p) => p.name.trim().toLowerCase() === name.trim().toLowerCase())
        const inner = (
          <div
            className={clsx(
              'flex w-[72px] shrink-0 flex-col items-center gap-1 rounded-xl border p-2',
              hit ? 'border-paper-line bg-white' : 'border-dashed border-paper-line bg-paper/50'
            )}
          >
            {hit ? (
              <Avatar
                zone={zone}
                person={hit}
                className="h-10 w-10 rounded-full"
                textClass="text-[0.6875rem]"
              />
            ) : (
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-paper-line/60 text-[0.6875rem] text-ink-faint">
                +
              </div>
            )}
            <span className="w-full truncate text-center text-[0.6875rem] leading-tight">
              {name}
            </span>
          </div>
        )
        return (
          <button key={name} onClick={() => onPick(name)} className="shrink-0">
            {inner}
          </button>
        )
      })}
    </div>
  )
}

export type { Person }
