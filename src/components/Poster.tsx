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
  const [loaded, setLoaded] = useState(false)

  // 换片或换远程地址时重置降级状态
  useEffect(() => {
    setAlt(null)
    setDead(false)
    setLoaded(false)
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
        'relative aspect-[2/3] w-full overflow-hidden bg-paper-sunken',
        rounded,
        className
      )}
    >
      {src ? (
        <>
          {!loaded && <div className="skeleton absolute inset-0 rounded-none" />}
          <img
            src={src}
            alt={item.title}
            loading="lazy"
            decoding="async"
            onLoad={() => setLoaded(true)}
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
              setLoaded(true)
            }}
            className={clsx(
              'h-full w-full object-cover transition-opacity ease-standard duration-4',
              loaded ? 'opacity-100' : 'opacity-0'
            )}
          />
        </>
      ) : (
        <PlaceholderSeeded title={item.title} />
      )}
      {/* 内侧发丝描边，避免浅图与背景糊在一起 */}
      <div className="pointer-events-none absolute inset-0 rounded-[inherit] ring-1 ring-inset ring-ink/[0.07]" />
    </div>
  )
}

function PlaceholderSeeded({ title }: { title: string }) {
  // 低饱和的胶片灰调，不喧宾夺主
  const hue = hashString(title) % 360
  const first = title.trim().slice(0, 1).toUpperCase() || '?'
  return (
    <div
      className="flex h-full w-full flex-col items-center justify-center gap-1.5 px-2"
      style={{
        background: `linear-gradient(160deg, hsl(${hue} 18% 90%), hsl(${hue} 16% 84%))`
      }}
    >
      <span
        className="font-display text-page font-semibold leading-none"
        style={{ color: `hsl(${hue} 26% 42%)` }}
      >
        {first}
      </span>
      <span className="line-clamp-2 text-center text-caption leading-tight text-ink-faint">
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
