/**
 * 果冻按压 —— 全站按钮的手感层
 *
 * 为什么用事件委托而不是逐个改组件：
 * 全站有几十处裸 <button>（底部导航、设置项、详情页操作条、片单卡片…），
 * 逐个加样式既啰嗦又容易漏。这里在 window 上统一接管 pointer 事件，
 * 任何 button / a[href] / [role=button] / .pressable 都获得同一套
 * 「按下压扁 → 松手弹回」的手感，样式在 index.css 的果冻层里。
 *
 * 三条边界必须守住，否则会抢走别的交互：
 *  1. 长按超过 360ms（书架长按弹菜单）不弹回
 *  2. 位移超过 8px（列表滚动、轮播拖动）立刻撤销，不留按压残留
 *  3. data-no-jelly 子树（3D 卡牌自带 transform 姿态）完全不参与
 */

const HIT = 'jelly-hit'
const PRESS = 'is-press'
const RELEASE = 'is-release'

/** 超过这个按住时长视为长按，松手不再弹 */
const MAX_HOLD = 360
/** 位移超过这个距离视为滑动，撤销按压 */
const MOVE_CANCEL = 8
/** 回弹动画时长 + 一点余量，用于移除 class 以便下次重播 */
const RELEASE_MS = 460

const SELECTOR = 'button, a[href], [role="button"], .pressable'

function hitTarget(start: EventTarget | null): HTMLElement | null {
  if (!(start instanceof Element)) return null
  const el = start.closest<HTMLElement>(SELECTOR)
  if (!el) return null
  if (el.closest('[data-no-jelly]')) return null
  if (el.hasAttribute('disabled') || el.getAttribute('aria-disabled') === 'true') return null
  return el
}

/** 安装全局果冻按压，返回卸载函数 */
export function installJellyPress(): () => void {
  if (typeof window === 'undefined' || !('PointerEvent' in window)) return () => {}

  const root = document.documentElement
  const calm = window.matchMedia?.('(prefers-reduced-motion: reduce)')

  let target: HTMLElement | null = null
  let x0 = 0
  let y0 = 0
  let t0 = 0
  let moved = false
  let releaseTimer = 0

  const stop = (bounce: boolean) => {
    const el = target
    target = null
    if (!el) return
    el.classList.remove(PRESS)
    if (!bounce) {
      el.classList.remove(RELEASE)
      return
    }
    // 先撤再加强制回流，连点同一个按钮也能重播回弹
    el.classList.remove(RELEASE)
    void el.offsetWidth
    el.classList.add(RELEASE)
    window.clearTimeout(releaseTimer)
    releaseTimer = window.setTimeout(() => el.classList.remove(RELEASE), RELEASE_MS)
  }

  const onDown = (e: PointerEvent) => {
    if (target) stop(false)
    if (e.pointerType === 'mouse' && e.button !== 0) return
    // 果冻关掉、或系统要求减少动效时，交给 CSS 的轻量按压
    if (calm?.matches) return
    if (root.dataset.jelly === 'off' || root.dataset.motion === 'reduced') return
    const el = hitTarget(e.target)
    if (!el) return
    target = el
    x0 = e.clientX
    y0 = e.clientY
    t0 = performance.now()
    moved = false
    el.classList.add(HIT)
    el.classList.remove(RELEASE)
    el.classList.add(PRESS)
  }

  const onMove = (e: PointerEvent) => {
    if (!target || moved) return
    if (Math.hypot(e.clientX - x0, e.clientY - y0) > MOVE_CANCEL) {
      moved = true
      stop(false)
    }
  }

  const onUp = () => {
    if (!target) return
    stop(!moved && performance.now() - t0 < MAX_HOLD)
  }

  const onCancel = () => stop(false)

  window.addEventListener('pointerdown', onDown, { passive: true })
  window.addEventListener('pointermove', onMove, { passive: true })
  window.addEventListener('pointerup', onUp, { passive: true })
  window.addEventListener('pointercancel', onCancel, { passive: true })
  window.addEventListener('blur', onCancel)
  document.addEventListener('visibilitychange', onCancel)

  return () => {
    window.clearTimeout(releaseTimer)
    window.removeEventListener('pointerdown', onDown)
    window.removeEventListener('pointermove', onMove)
    window.removeEventListener('pointerup', onUp)
    window.removeEventListener('pointercancel', onCancel)
    window.removeEventListener('blur', onCancel)
    document.removeEventListener('visibilitychange', onCancel)
  }
}
