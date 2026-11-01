import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import clsx from 'clsx'
import { type Zone } from '../lib/db'
import { compressImage } from '../lib/image'
import { pickImage } from '../lib/dom'
import { peopleStore } from '../store/people'
import { useLibraryStore, useVaultStore } from '../store/zone'
import { useVaultSession } from '../store/vaultSession'
import { gapOf, useTheme } from '../store/theme'
import type { TitleItem } from '../types'
import Avatar from '../components/Avatar'
import Poster from '../components/Poster'
import Icon from '../components/Icon'
import { Button, Confirm, Field, IconButton, Section, Sheet, inputCls } from '../components/ui'
import { toast } from '../components/Toast'

export default function ActorDetail() {
  const { zone = 'library', id = '' } = useParams<{ zone: string; id: string }>()
  const currentZone = (zone === 'vault' ? 'vault' : 'library') as Zone
  const navigate = useNavigate()

  const people = peopleStore(currentZone)
  const person = people((s) => s.items.find((p) => p.id === id))
  const library = useLibraryStore((s) => s.items)
  const vault = useVaultStore((s) => s.items)
  const vaultSession = useVaultSession()
  const theme = useTheme()

  const [editOpen, setEditOpen] = useState(false)
  const [linkOpen, setLinkOpen] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [query, setQuery] = useState('')
  const [name, setName] = useState('')
  const [note, setNote] = useState('')
  const [birthday, setBirthday] = useState('')

  useEffect(() => {
    if (!person) return
    setName(person.name)
    setNote(person.note ?? '')
    setBirthday(person.birthday ?? '')
  }, [person?.id, person?.name, person?.note, person?.birthday])

  const accessible = currentZone !== 'vault' || vaultSession.active
  const titles = currentZone === 'vault' ? vault : library

  const works = useMemo(() => {
    if (!person) return []
    return person.titleIds
      .map((tid) => titles.find((t) => t.id === tid))
      .filter((t): t is TitleItem => Boolean(t))
  }, [person, titles])

  if (!accessible || !person) {
    return (
      <div className="mx-auto max-w-[560px] px-4 pb-10 pt-safe">
        <BackBar zone={currentZone} />
        <div className="mt-14 text-center text-body-sm text-ink-faint">
          {person ? '隐私空间已上锁' : '没有找到这位演员'}
        </div>
      </div>
    )
  }

  const saveMeta = async () => {
    if (!name.trim()) {
      toast('姓名不能为空', 'bad')
      return
    }
    await people.getState().save({ ...person, name: name.trim(), note: note.trim() || undefined, birthday: birthday.trim() || undefined })
    setEditOpen(false)
    toast('已保存', 'good')
  }

  const uploadAvatar = async () => {
    const file = await pickImage()
    if (!file) return
    try {
      const blob = await compressImage(file, 480, 0.85)
      await people.getState().save({ ...person, hasLocalAvatar: true }, blob)
      toast('头像已更新', 'good')
    } catch {
      toast('图片处理失败', 'bad')
    }
  }

  const toggleTitle = async (titleId: string) => {
    const has = person.titleIds.includes(titleId)
    await people.getState().save({
      ...person,
      titleIds: has ? person.titleIds.filter((t) => t !== titleId) : [...person.titleIds, titleId]
    })
  }

  const candidates = useMemo(() => {
    const kw = query.trim().toLowerCase()
    if (!kw) return titles
    return titles.filter((t) => t.title.toLowerCase().includes(kw))
  }, [titles, query])

  return (
    <div className="mx-auto max-w-[560px] px-4 pb-10 pt-safe">
      <BackBar
        zone={currentZone}
        right={<IconButton icon="edit" label="编辑资料" size={44} onClick={() => setEditOpen(true)} />}
      />

      {/* ---------------------------------------------------------- 头像 hero */}
      <section className="animate-staggerIn mb-6 flex items-start gap-4 rounded-2xl border border-paper-line bg-paper-card p-4 shadow-e1">
        <button onClick={() => void uploadAvatar()} className="shrink-0 pressable">
          <Avatar
            zone={currentZone}
            person={person}
            className="h-24 w-24 rounded-full border border-paper-line bg-paper-sunken shadow-e2"
            textClass="font-display text-headline"
          />
        </button>
        <div className="min-w-0 flex-1 pt-0.5">
          <h1 className="font-display text-headline font-semibold leading-tight tracking-tight text-ink">
            {person.name}
          </h1>
          <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-caption text-ink-faint">
            <span>{works.length} 部作品</span>
            {person.birthday ? (
              <>
                <span aria-hidden>·</span>
                <span>{person.birthday}</span>
              </>
            ) : null}
            <span aria-hidden>·</span>
            <span>{person.source === 'manual' ? '手动添加' : '自动生成'}</span>
          </div>
          {person.note && (
            <p className="mt-2 whitespace-pre-wrap text-body-sm leading-relaxed text-ink-soft">
              {person.note}
            </p>
          )}
          <Button variant="tonal" className="mt-3" onClick={() => void uploadAvatar()}>
            <Icon name="upload" size={15} weight={2.1} />
            {person.hasLocalAvatar ? '更换头像' : '上传头像'}
          </Button>
        </div>
      </section>

      <Section
        title="出演作品"
        action={
          <Button variant="tonal" onClick={() => setLinkOpen(true)}>
            <Icon name="plus" size={15} weight={2.2} />
            关联影片
          </Button>
        }
      >
        {works.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-paper-lineStrong bg-paper-sunken px-4 py-8 text-center text-body-sm leading-relaxed text-ink-faint">
            还没有关联影片，点右上角「关联影片」添加。
          </p>
        ) : (
          <div
            className="grid"
            style={{
              gridTemplateColumns: `repeat(${theme.columns}, minmax(0, 1fr))`,
              gap: gapOf(theme.density)
            }}
          >
            {works.map((t, idx) => (
              <Link
                key={t.id}
                to={`/title/${currentZone}/${t.id}`}
                className="animate-staggerIn pressable block"
                style={{ animationDelay: `${Math.min(idx, 10) * 28}ms` }}
              >
                <div className="relative">
                  <Poster zone={currentZone} item={t} />
                  {t.rating ? (
                    <span className="pointer-events-none absolute right-1.5 top-1.5 flex items-center gap-0.5 rounded-full bg-paper-card/92 px-1.5 py-0.5 text-micro font-semibold tabular-nums text-reel-dark shadow-e1 backdrop-blur-sm">
                      <Icon name="starFill" size={9} />
                      {(t.rating / 2).toFixed(1)}
                    </span>
                  ) : null}
                </div>
                <div className="pt-2">
                  <div className="truncate text-label font-medium leading-snug text-ink">
                    {t.title}
                  </div>
                  <div className="mt-0.5 text-micro tabular-nums text-ink-faint">{t.year || '—'}</div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </Section>

      <div className="mt-2">
        <Button variant="danger" className="w-full" onClick={() => setConfirmDelete(true)}>
          <Icon name="trash" size={16} weight={2.1} />
          删除这位演员
        </Button>
      </div>

      {/* 编辑资料 */}
      <Sheet
        open={editOpen}
        onClose={() => setEditOpen(false)}
        title="编辑资料"
        footer={
          <Button className="w-full" onClick={() => void saveMeta()}>
            保存
          </Button>
        }
      >
        <Field label="姓名">
          <input value={name} onChange={(e) => setName(e.target.value)} className={inputCls} />
        </Field>
        <Field label="备注">
          <input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="选填"
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

      {/* 关联影片 */}
      <Sheet open={linkOpen} onClose={() => setLinkOpen(false)} title="关联影片">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="搜索片名…"
          className={inputCls}
        />
        <div className="mt-3 max-h-[52vh] space-y-1.5 overflow-y-auto">
          {candidates.length === 0 ? (
            <p className="py-6 text-center text-body-sm text-ink-faint">没有影片</p>
          ) : (
            candidates.map((t) => {
              const inside = person.titleIds.includes(t.id)
              return (
                <button
                  key={t.id}
                  onClick={() => void toggleTitle(t.id)}
                  className={clsx(
                    'flex w-full items-center justify-between gap-2 rounded-xl border px-3 py-2.5 text-left pressable',
                    inside
                      ? 'border-reel/35 bg-reel-soft/60'
                      : 'border-paper-line bg-paper-card hover:border-paper-lineStrong active:bg-paper-sunken'
                  )}
                >
                  <span className="min-w-0 flex-1 truncate text-body-sm text-ink">{t.title}</span>
                  <span
                    className={clsx(
                      'shrink-0 text-caption font-medium',
                      inside ? 'text-reel-dark' : 'text-ink-faint'
                    )}
                  >
                    {inside ? '已关联' : '关联'}
                  </span>
                </button>
              )
            })
          )}
        </div>
      </Sheet>

      <Confirm
        open={confirmDelete}
        title={`删除「${person.name}」？`}
        desc="只删除演员条目，不会删除任何影片。"
        danger
        confirmText="删除"
        onCancel={() => setConfirmDelete(false)}
        onConfirm={async () => {
          await people.getState().remove(person.id)
          setConfirmDelete(false)
          toast('已删除')
          navigate(currentZone === 'vault' ? '/vault' : '/')
        }}
      />
    </div>
  )
}

function BackBar({ zone, right }: { zone: Zone; right?: React.ReactNode }) {
  const navigate = useNavigate()
  return (
    <header className="flex items-center justify-between gap-2 pb-3 pt-3">
      <IconButton
        icon="chevronLeft"
        label="返回"
        size={44}
        className="-ml-1.5"
        onClick={() => navigate(zone === 'vault' ? '/vault' : '/')}
      />
      <div className="text-caption text-ink-faint">
        {zone === 'vault' ? '隐私保险箱' : '我的片库'}
      </div>
      {right ?? <span className="w-11" />}
    </header>
  )
}
