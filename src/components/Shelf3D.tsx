import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import clsx from 'clsx'
import { zoneStore } from '../store/zone'
import type { Zone } from '../lib/db'
import type { TitleItem, WatchStatus } from '../types'
import { KIND_LABEL, STATUS_LABEL } from '../types'
import Poster from './Poster'
import Icon from './Icon'
import { Button, Chip, Sheet } from './ui'
import { toast } from './Toast'

/** 书脊按观看状态着色：全部 token 类，深浅主题与强调色跟随设置 */
const SPINE_TONE: Record<WatchStatus, string> = {
  watching: 'bg-reel text-reel-on',
  wish: 'bg-paper-sunken text-ink-soft',
  done: 'bg-moss text-moss-on',
  dropped: 'bg-paper-line text-ink-faint'
}

/** 无筛选时的智能排序：在看 C 位 → 想看 → 看过 → 弃坑沉底（弃坑再压暗） */
const SHELF_RANK: Record<WatchStatus, number> = {
  watching: 0,
  wish: 1,
  done: 2,
  dropped: 3
}

const LONG_PRESS_MS = 550
const MOVE_CANCEL_PX = 10
/** 侧卡 3D 参数 */
const SIDE_ANGLE = 36
const VISIBLE_SIDE = 3
/**
 * 真实渲染的张数半径：只给居中卡左右各 3 张挂载海报。
 * 更远的槽位留空壳占位，滚动几何不变，但 DOM/图片解码量从「整库」降到 7 张
 * —— 这是长片库滑动卡顿的主因。
 */
const RENDER_RADIUS = 3

interface Pose {
  transform: string
  /** 侧面压暗强度（用半透明遮罩代替 filter，避免 3D 层重复栅格化） */
  shade: number
  opacity: number
  zIndex: number
}

/** 按 offset（当前居中为 0，左负右正）计算立体卡姿态 */
function poseOf(o: number): Pose {
  if (o === 0) {
    return { transform: 'rotateY(0deg) translateY(-8px)', shade: 0, opacity: 1, zIndex: 20 }
  }
  const d = Math.min(Math.abs(o), VISIBLE_SIDE + 1)
  const dir = o < 0 ? 1 : -1
  const rot = SIDE_ANGLE * dir - dir * Math.max(0, d - 1) * 5
  const scale = 0.78 - Math.max(0, d - 1) * 0.08
  const z = -80 - Math.max(0, d - 1) * 50
  const y = 10 + Math.max(0, d - 1) * 5
  return {
    transform: `rotateY(${rot}deg) translateZ(${z}px) translateY(${y}px) scale(${scale})`,
    shade: 0.26 + Math.max(0, d - 1) * 0.1,
    opacity: d > VISIBLE_SIDE ? 0 : 1,
    zIndex: 10 - d
  }
}

export default function Shelf3D({
  zone,
  items,
  grouped
}: {
  zone: Zone
  items: TitleItem[]
  /** 未按状态/关键词/类型/标签筛选时为 true：智能排序（在看 C 位，弃坑沉底） */
  grouped: boolean
}) {
  const navigate = useNavigate()
  const trackRef = useRef<HTMLDivElement>(null)
  const rafRef = useRef(0)
  const [active, setActive] = useState(0)
  const [actionItem, setActionItem] = useState<TitleItem | null>(null)

  // 智能排序：无筛选时把「在看」顶到 C 位，弃坑沉底；组内保持外部排序（sort 是 stable 的）
  const deck = useMemo(() => {
    if (!grouped) return items
    return [...items].sort((a, b) => SHELF_RANK[a.status] - SHELF_RANK[b.status])
  }, [items, grouped])

  // 列表变化后修正越界索引
  useEffect(() => {
    if (active > deck.length - 1) setActive(Math.max(0, deck.length - 1))
  }, [deck.length, active])

  const current = deck[Math.min(active, deck.length - 1)] ?? null

  /* ---------------------------------------------------------------- 槽位宽
     每次滚动都去量 DOM 会触发布局抖动，这里量一次缓存起来，
     只有容器尺寸变化（旋转屏幕 / 字号变化）才重新量。 */
  const slotWRef = useRef(0)
  const measureSlot = useCallback(() => {
    const el = trackRef.current
    if (!el) return
    const slot = el.firstElementChild as HTMLElement | null
    slotWRef.current = slot ? slot.getBoundingClientRect().width : el.clientWidth
  }, [])

  useEffect(() => {
    measureSlot()
    const el = trackRef.current
    if (!el || typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(measureSlot)
    ro.observe(el)
    return () => ro.disconnect()
  }, [measureSlot])

  const dictRef = useRef({ total: deck.length })
  dictRef.current.total = deck.length

  const onScroll = useCallback(() => {
    // 同一个 rAF 内只算一次，滚动事件的密度远高于屏幕刷新
    if (rafRef.current) return
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = 0
      const el = trackRef.current
      const w = slotWRef.current
      if (!el || !w) return
      const i = Math.round(el.scrollLeft / w)
      if (i >= 0 && i < dictRef.current.total) setActive((prev) => (prev === i ? prev : i))
    })
  }, [])

  useEffect(
    () => () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
    },
    []
  )

  const scrollToCard = useCallback((index: number) => {
    const el = trackRef.current
    const w = slotWRef.current
    if (!el || !w) return
    el.scrollTo({ left: index * w, behavior: 'smooth' })
  }, [])

  /* 回调必须稳定：否则每次 active 变化都会让 memo 过的卡片全部重渲 */
  const activeRef = useRef(0)
  activeRef.current = active

  const onCardOpen = useCallback(
    (item: TitleItem, index: number) => {
      if (index === activeRef.current) navigate(`/title/${zone}/${item.id}`)
      else scrollToCard(index)
    },
    [navigate, scrollToCard, zone]
  )

  const markStatus = useCallback(
    async (item: TitleItem, status: WatchStatus) => {
      try {
        await zoneStore(zone).getState().patch(item.id, { status })
        toast(`已标记为「${STATUS_LABEL[status]}」`, 'good')
      } catch (e) {
        toast(e instanceof Error ? e.message : '操作失败', 'bad')
      }
    },
    [zone]
  )

  if (!current) return null

  return (
    <div className="deck-root -mx-4">
      {/* ------------------------------------------------ 3D 全息轮播舞台 */}
      <div className="deck-stage">
        <div ref={trackRef} onScroll={onScroll} className="deck-track no-scrollbar">
          {deck.map((item, idx) => {
            const near = Math.abs(idx - active) <= RENDER_RADIUS
            const o = Math.max(-VISIBLE_SIDE - 1, Math.min(VISIBLE_SIDE + 1, idx - active))
            return (
              // 槽位一直在（保证滚动总宽与吸附点不变），只有邻近几张才挂真卡
              <div className="deck-slot" key={item.id}>
                {near && (
                  <DeckCard
                    zone={zone}
                    item={item}
                    index={idx}
                    offset={o}
                    isActive={o === 0}
                    onOpen={onCardOpen}
                    onLongPress={setActionItem}
                  />
                )}
              </div>
            )
          })}
        </div>
      </div>

      {/* ------------------------------------------------ 页码指示 */}
      <div className="flex items-center justify-center gap-2.5 pt-1 text-caption text-ink-faint">
        {deck.length <= 8 ? (
          deck.map((it, i) => (
            <button
              key={it.id}
              type="button"
              aria-label={`第 ${i + 1} 张`}
              onClick={() => scrollToCard(i)}
              className={clsx(
                'h-1.5 rounded-full transition-all ease-spring duration-3',
                i === active ? 'w-5 bg-reel' : 'w-1.5 bg-paper-lineStrong active:opacity-60'
              )}
            />
          ))
        ) : (
          <span className="flex items-baseline gap-1.5 font-display tabular-nums">
            <span key={active} className="jelly-in text-title font-semibold text-ink">
              {String(active + 1).padStart(2, '0')}
            </span>
            <span>/ {deck.length}</span>
          </span>
        )}
      </div>

      {/* ------------------------------------------------ 底部：当前选中详情 */}
      <div className="deck-info px-5 pb-1 pt-3 text-center">
        <div key={current.id} className="jelly-in">
          <h2 className="font-display text-headline font-semibold leading-tight tracking-tight text-ink">
            {current.title}
          </h2>
          {current.originalTitle && current.originalTitle !== current.title && (
            <p className="mt-0.5 truncate text-caption text-ink-faint">{current.originalTitle}</p>
          )}
          <div className="mt-2 flex flex-wrap items-center justify-center gap-x-2 gap-y-1 text-body-sm text-ink-soft">
            <span>{current.year || '—'}</span>
            <span aria-hidden>·</span>
            <span>{KIND_LABEL[current.kind]}</span>
            <span aria-hidden>·</span>
            <span
              className={clsx(
                'font-medium',
                current.status === 'watching' && 'text-reel-dark',
                current.status === 'dropped' && 'text-ink-faint'
              )}
            >
              {STATUS_LABEL[current.status]}
            </span>
            {current.kind === 'tv' && current.progress && current.progress.episode > 0 && (
              <>
                <span aria-hidden>·</span>
                <span className="tabular-nums">
                  S{current.progress.season}E{current.progress.episode}
                </span>
              </>
            )}
            {current.rating ? (
              <span className="flex items-center gap-0.5 font-medium text-reel-dark">
                <Icon name="starFill" size={11} />
                {(current.rating / 2).toFixed(1)}
              </span>
            ) : null}
          </div>

          <div className="mt-3 flex items-center justify-center gap-2">
            <button
              type="button"
              onClick={() => navigate(`/title/${zone}/${current.id}`)}
              className="pressable flex h-11 items-center gap-1.5 rounded-xl bg-reel px-4 text-body-sm font-semibold text-reel-on shadow-e1 hover:shadow-lift"
            >
              <Icon name="chevronRight" size={16} />
              详情
            </button>
            {(['watching', 'wish', 'done'] as const).map((s) => (
              <button
                key={s}
                type="button"
                aria-label={`标记为${STATUS_LABEL[s]}`}
                onClick={() => void markStatus(current, s)}
                className={clsx(
                  'pressable flex h-11 min-w-[44px] items-center justify-center rounded-xl border px-3 text-caption font-medium',
                  current.status === s
                    ? 'border-reel bg-reel/12 text-reel-dark'
                    : 'border-paper-line bg-paper-card text-ink-soft hover:border-paper-lineStrong hover:text-ink'
                )}
              >
                {STATUS_LABEL[s]}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ------------------------------------------------ 长按：快捷操作 */}
      <Sheet
        open={Boolean(actionItem)}
        onClose={() => setActionItem(null)}
        title={actionItem?.title ?? ''}
      >
        {actionItem && (
          <>
            <div className="mb-2 text-label font-medium text-ink-faint">标记状态</div>
            <div className="mb-6 flex flex-wrap gap-2">
              {(['wish', 'watching', 'done', 'dropped'] as const).map((s) => (
                <Chip
                  key={s}
                  active={actionItem.status === s}
                  onClick={() => {
                    void markStatus(actionItem, s)
                    setActionItem(null)
                  }}
                >
                  {STATUS_LABEL[s]}
                </Chip>
              ))}
            </div>
            <div className="flex gap-2.5">
              <Button
                variant="outline"
                className="flex-1"
                onClick={() => {
                  navigate(`/edit/${zone}/${actionItem.id}`)
                  setActionItem(null)
                }}
              >
                <Icon name="edit" size={16} /> 编辑
              </Button>
              <Button
                className="flex-1"
                onClick={() => {
                  navigate(`/title/${zone}/${actionItem.id}`)
                  setActionItem(null)
                }}
              >
                打开详情
              </Button>
            </div>
          </>
        )}
      </Sheet>
    </div>
  )
}

/* ==========================================================================
   单张全息卡：正面大海报 + 左侧书脊（状态色）+ 右侧背面 + 顶部书页
   offset = 距居中位置的张数；memo 后只在姿态真正变化时才重渲
   ========================================================================== */

const DeckCard = memo(function DeckCard({
  zone,
  item,
  index,
  offset,
  isActive,
  onOpen,
  onLongPress
}: {
  zone: Zone
  item: TitleItem
  index: number
  offset: number
  isActive: boolean
  onOpen: (item: TitleItem, index: number) => void
  onLongPress: (item: TitleItem) => void
}) {
  const press = useRef<{
    timer: number
    x: number
    y: number
    fired: boolean
    moved: boolean
  } | null>(null)

  const cancelPressTimer = () => {
    if (press.current) window.clearTimeout(press.current.timer)
  }

  const pose = poseOf(offset)

  return (
    <button
      type="button"
      // 卡牌自身有 3D 姿态（transform 由 pose 计算），不参与全局果冻按压，
      // 否则按下时会被压扁成平面
      data-no-jelly
      aria-label={`${item.title}，${STATUS_LABEL[item.status]}`}
      className={clsx('deck-card', isActive && 'is-active', item.status === 'dropped' && 'is-muted')}
      style={{ zIndex: pose.zIndex }}
      onPointerDown={(e) => {
        press.current = {
          x: e.clientX,
          y: e.clientY,
          fired: false,
          moved: false,
          timer: window.setTimeout(() => {
            if (press.current) press.current.fired = true
            onLongPress(item)
          }, LONG_PRESS_MS)
        }
      }}
      onPointerMove={(e) => {
        if (!press.current) return
        const dx = e.clientX - press.current.x
        const dy = e.clientY - press.current.y
        if (Math.hypot(dx, dy) > MOVE_CANCEL_PX) {
          press.current.moved = true
          cancelPressTimer()
        }
      }}
      onPointerUp={cancelPressTimer}
      onPointerCancel={cancelPressTimer}
      onPointerLeave={cancelPressTimer}
      onClick={() => {
        // 长按已触发操作面板 / 拖动滚动后残留的 click 一并吞掉
        if (press.current?.fired || press.current?.moved) {
          press.current = null
          return
        }
        onOpen(item, index)
      }}
    >
      <div className="deck-cube" style={{ transform: pose.transform, opacity: pose.opacity }}>
        {/* 果冻内胆：落位时整体软弹一下，不干扰外层的 3D 姿态 */}
        <div className={clsx('deck-jelly', isActive && 'is-jelly')}>
          {/* 顶部书页：层叠纸纹 */}
          <div className="deck-face deck-top" aria-hidden />
          {/* 右侧背面：左卡朝右倾时兜住边缘 */}
          <div className="deck-face deck-back" aria-hidden />
          {/* 左侧书脊：状态色 + 竖排片名 */}
          <div className={clsx('deck-face deck-spine', SPINE_TONE[item.status])} aria-hidden>
            <span className="deck-spine-text">{item.title}</span>
          </div>
          {/* 正面：大海报 + 压暗遮罩 + 全息光泽 */}
          <div className="deck-face deck-front">
            <Poster zone={zone} item={item} rounded="rounded-2xl" />
            <div className="deck-shade" style={{ opacity: pose.shade }} aria-hidden />
            <div className="deck-holo" aria-hidden />
            {isActive && (
              <>
                {item.rating ? (
                  <span className="deck-chip left-2.5 top-2.5">
                    <Icon name="starFill" size={10} />
                    {(item.rating / 2).toFixed(1)}
                  </span>
                ) : null}
                <span
                  className={clsx(
                    'deck-chip right-2.5 top-2.5',
                    item.status === 'watching' && 'deck-chip-reel'
                  )}
                >
                  {STATUS_LABEL[item.status]}
                </span>
                {item.kind === 'tv' && item.progress && item.progress.episode > 0 && (
                  <span className="deck-chip deck-chip-progress">
                    S{item.progress.season}E{item.progress.episode}
                  </span>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </button>
  )
})
