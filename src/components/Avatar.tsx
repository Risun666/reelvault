import { useEffect, useState } from 'react'
import clsx from 'clsx'
import { avatarUrl, type Zone } from '../lib/db'
import type { Person } from '../types'

/** 头像：本地上传优先 → 远程地址 → 文字首字兜底 */
export default function Avatar({
  zone,
  person,
  className,
  textClass
}: {
  zone: Zone
  person: Person
  className?: string
  textClass?: string
}) {
  const [local, setLocal] = useState<string | null>(null)
  const [remoteFailed, setRemoteFailed] = useState(false)

  useEffect(() => {
    let alive = true
    setRemoteFailed(false)
    void avatarUrl(zone, person.id).then((url) => {
      if (alive) setLocal(url)
    })
    return () => {
      alive = false
    }
  }, [zone, person.id, person.hasLocalAvatar])

  const src = local || (!remoteFailed ? person.avatarRemote : undefined)

  if (!src) {
    return (
      <div
        className={clsx(
          'flex items-center justify-center bg-paper font-medium text-ink-soft',
          className
        )}
      >
        <span className={textClass}>{initials(person.name)}</span>
      </div>
    )
  }

  return (
    <img
      src={src}
      alt={person.name}
      loading="lazy"
      onError={() => setRemoteFailed(true)}
      className={clsx('object-cover', className)}
    />
  )
}

function initials(name: string): string {
  const trimmed = name.trim()
  if (!trimmed) return '?'
  // 中文取最后两个字，英文取首字母
  if (/[\u4e00-\u9fa5]/.test(trimmed)) return trimmed.slice(-2)
  const parts = trimmed.split(/\s+/)
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}
