import { useAuth } from '../store/auth'

let timer: number | undefined
let running = false
let lastRun = 0

/** 数据变更后延迟一小会儿自动同步（仅在已登录时） */
export function scheduleSync(delay = 6000) {
  window.clearTimeout(timer)
  timer = window.setTimeout(() => {
    void maybeSync()
  }, delay)
}

async function maybeSync() {
  if (running) return
  if (Date.now() - lastRun < 20000) return
  if (useAuth.getState().status !== 'signed-in') return
  await runNow()
}

export async function runNow(): Promise<{ ok: boolean; message: string; detail?: string }> {
  if (running) return { ok: false, message: '同步正在进行…' }
  running = true
  try {
    const { runSync } = await import('./sync')
    const result = await runSync()
    lastRun = Date.now()
    const parts = [
      `上传 ${result.pushed} · 下载 ${result.pulled}`,
      result.deleted ? ` · 移除 ${result.deleted}` : '',
      result.collectionsUp || result.collectionsDown
        ? ` · 片单 ${result.collectionsUp}/${result.collectionsDown}`
        : '',
      result.postersUp || result.postersDown ? ` · 封面 ↑${result.postersUp} ↓${result.postersDown}` : ''
    ]
    return { ok: true, message: parts.join('') || '已是最新' }
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : '同步失败' }
  } finally {
    running = false
  }
}

export function isSyncing() {
  return running
}
