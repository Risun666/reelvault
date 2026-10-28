import { useEffect, useState } from 'react'
import clsx from 'clsx'
import { posterUrl, type Zone } from '../lib/db'
import { fallbackImageUrl } from '../lib/tmdb'
import type { TitleItem } from '../types'

interface Props {
  zone: Zone
  item: Pick<TitleItem, 'id' | 'title' | 'posterRemote' | 'hasLocalPoster' | 'year'>
  className?: string
  rounded?: string
}

/** 海报：本地缓存优先 -> TMDB 远程兜底 -> 文字占位 */
export default function Poster({ zone, item, className, rounded = 'rounded-xl' }: Props) {
  const [local, setLocal] = useState<string | null | undefined>(undefined)
  const [alt, setAlt] = useState<string | null>(null)
  const [dead, setDead] = useState(false)

  // 换片或换远程地址时重置降级状态
  useEffect(() => {
    setAlt(null)
    setDead(false)
  }, [item.posterRemote])

  useEffect(() => {
    let alive = true
    if (!item.hasLocalPoster) {
      setLocal(null)
      return
    }
    posterUrl(zone, item.id)
      .then((u) => alive && setLocal(u))
      .catch(() => alive && setLocal(null))
    return () => {
      alive = false
    }
  }, [zone, item.id, item.hasLocalPoster])

  const src = local || (dead ? undefined : (alt ?? item.posterRemote) || undefined)

  return (
    <div
      className={clsx(
        'relative aspect-[2/3] w-full overflow-hidden bg-paper-line/70',
        rounded,
        className
      )}
    >
      {src ? (
        <img
          src={src}
          alt={item.title}
          loading="lazy"
          onError={() => {
            // 先换一组官方图片域名再试一次，仍失败才退回文字占位
            if (!alt) {
              const next = fallbackImageUrl(item.posterRemote)
              if (next) {
                setAlt(next)
                return
              }
            }
            setDead(true)
          }}
          className="h-full w-full object-cover"
        />
      ) : (
        <PlaceholderSeeded title={item.title} />
      )}
      <div className="pointer-events-none absolute inset-0 rounded-[inherit] ring-1 ring-inset ring-ink/[0.06]" />
    </div>
  )
}

function PlaceholderSeeded({ title }: { title: string }) {
  const hue = hashString(title) % 360
  const first = title.trim().slice(0, 1).toUpperCase() || '?'
  return (
    <div
      className="flex h-full w-full flex-col items-center justify-center gap-1"
      style={{ background: `hsl(${hue} 22% 92%)` }}
    >
      <span className="text-[1.625rem] font-semibold" style={{ color: `hsl(${hue} 30% 45%)` }}>
        {first}
      </span>
      <span className="px-2 text-center text-[0.625rem] leading-tight text-ink-faint line-clamp-2">
        {title}
      </span>
    </div>
  )
}

function hashString(s: string): number {
  let h = 0
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0
  return h
}
