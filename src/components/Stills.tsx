import { useEffect, useState } from 'react'
import { fallbackImageUrl, MAX_STILLS } from '../lib/tmdb'
import Icon from './Icon'
import { Button, IconButton, Sheet, textareaCls } from './ui'
import { toast } from './Toast'

/**
 * 单张剧照：优先直连，失败后换另一组 TMDB 官方图片域名重试一次，
 * 仍失败则退回占位（手动填写的非 TMDB 网址加载不出来也不会破版）。
 */
export function StillImage({ src, alt, className }: { src: string; alt?: string; className?: string }) {
  const [url, setUrl] = useState(src)
  const [dead, setDead] = useState(false)

  useEffect(() => {
    setUrl(src)
    setDead(false)
  }, [src])

  if (dead) {
    return (
      <div className={`flex items-center justify-center bg-paper-sunken text-ink-faint ${className ?? ''}`}>
        <Icon name="image" size={22} />
      </div>
    )
  }

  return (
    <img
      src={url}
      alt={alt ?? ''}
      loading="lazy"
      decoding="async"
      className={className}
      onError={() => {
        const next = fallbackImageUrl(src)
        if (next && next !== url) setUrl(next)
        else setDead(true)
      }}
    />
  )
}

/** 详情页用的横向剧照长廊 */
export function StillsStrip({ urls, onOpen }: { urls: string[]; onOpen: (index: number) => void }) {
  return (
    <div className="-mx-4 flex snap-x gap-2.5 overflow-x-auto px-4 pb-1">
      {urls.map((u, i) => (
        <button
          key={`${u}-${i}`}
          type="button"
          onClick={() => onOpen(i)}
          aria-label={`查看剧照 ${i + 1}`}
          className="pressable animate-staggerIn w-[220px] shrink-0 snap-start overflow-hidden rounded-xl border border-paper-line bg-paper-sunken shadow-e1"
          style={{ animationDelay: `${Math.min(i, 10) * 28}ms` }}
        >
          <StillImage src={u} alt={`剧照 ${i + 1}`} className="aspect-video w-full object-cover" />
        </button>
      ))}
    </div>
  )
}

/** 点开缩略图后的大图查看器（底部抽屉 + 前后翻页） */
export function StillsViewer({
  urls,
  index,
  onClose
}: {
  urls: string[]
  index: number | null
  onClose: () => void
}) {
  const [current, setCurrent] = useState(0)

  useEffect(() => {
    if (index != null) setCurrent(index)
  }, [index])

  const total = urls.length
  const open = index != null && total > 0
  const safeCurrent = total > 0 ? Math.min(Math.max(current, 0), total - 1) : 0
  const go = (delta: number) => setCurrent((c) => (c + delta + total) % total)

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={open ? `剧照 ${safeCurrent + 1} / ${total}` : '剧照'}
      footer={
        total > 1 ? (
          <div className="flex items-center justify-center gap-3">
            <Button variant="outline" onClick={() => go(-1)}>
              <Icon name="chevronLeft" size={16} /> 上一张
            </Button>
            <Button variant="outline" onClick={() => go(1)}>
              下一张 <Icon name="chevronRight" size={16} />
            </Button>
          </div>
        ) : undefined
      }
    >
      {open && (
        <StillImage
          key={urls[safeCurrent]}
          src={urls[safeCurrent]}
          alt={`剧照 ${safeCurrent + 1}`}
          className="max-h-[68vh] w-full rounded-xl border border-paper-line bg-paper-sunken object-contain"
        />
      )}
    </Sheet>
  )
}

/** 手动添加 / 编辑页用的剧照编辑器：网址录入 + TMDB 补充 + 缩略图管理 */
export function StillsEditor({
  stills,
  onChange,
  onFetchFromTmdb,
  fetching
}: {
  stills: string[]
  onChange: (next: string[]) => void
  onFetchFromTmdb?: () => void | Promise<void>
  fetching?: boolean
}) {
  const [draft, setDraft] = useState('')

  const addUrls = () => {
    const urls = draft
      .split(/[\s,，、]+/)
      .map((s) => s.trim())
      .filter((s) => /^https?:\/\//i.test(s))
    if (!urls.length) {
      toast('请粘贴以 http 开头的图片网址', 'bad')
      return
    }
    onChange(Array.from(new Set([...stills, ...urls])).slice(0, MAX_STILLS))
    setDraft('')
  }

  return (
    <>
      <textarea
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        rows={2}
        placeholder="粘贴剧照图片网址，多个用换行或逗号分隔"
        className={textareaCls}
      />
      <div className="mt-2 flex gap-2">
        <Button variant="outline" className="flex-1" disabled={!draft.trim()} onClick={addUrls}>
          添加网址
        </Button>
        {onFetchFromTmdb && (
          <Button variant="tonal" className="flex-1" loading={fetching} onClick={() => void onFetchFromTmdb()}>
            <Icon name="image" size={15} /> 从 TMDB 获取
          </Button>
        )}
      </div>

      {stills.length > 0 ? (
        <div className="mt-3 grid grid-cols-3 gap-2">
          {stills.map((u, i) => (
            <div
              key={`${u}-${i}`}
              className="animate-staggerIn relative overflow-hidden rounded-lg border border-paper-line bg-paper-sunken"
              style={{ animationDelay: `${Math.min(i, 10) * 28}ms` }}
            >
              <StillImage src={u} alt={`剧照 ${i + 1}`} className="aspect-video w-full object-cover" />
              <IconButton
                icon="close"
                label={`移除剧照 ${i + 1}`}
                size={44}
                className="absolute right-0.5 top-0.5 rounded-full border-paper-line bg-paper-card/90 text-danger shadow-e1"
                onClick={() => onChange(stills.filter((_, j) => j !== i))}
              />
            </div>
          ))}
        </div>
      ) : (
        <p className="mt-2.5 text-caption leading-relaxed text-ink-faint">
          暂无剧照。可以粘贴图片网址，或按片名从 TMDB 自动补充（最多 {MAX_STILLS} 张）。剧照为远程图片，需联网加载。
        </p>
      )}
    </>
  )
}
