import { create } from 'zustand'
import { getMeta, setMeta } from '../lib/db'
import { createPinRecord, verifyPin, type PinRecord } from '../lib/crypto'

const PIN_KEY = 'vault.pin'

interface VaultSessionState {
  /** 内存中：本会话是否已解锁 */
  active: boolean
  /** 是否设置过 PIN */
  configured: boolean
  /** 解锁期间暂存的 PIN（仅内存，用于备份加密） */
  pin: string | null
  loaded: boolean
  lastTouch: number
  init: () => Promise<void>
  setup: (pin: string) => Promise<void>
  unlock: (pin: string) => Promise<boolean>
  lock: () => void
  touch: () => void
  changePin: (oldPin: string, newPin: string) => Promise<boolean>
  removePin: (pin: string) => Promise<boolean>
}

let recordCache: PinRecord | null = null

export const useVaultSession = create<VaultSessionState>((set, get) => ({
  active: false,
  configured: false,
  pin: null,
  loaded: false,
  lastTouch: 0,

  async init() {
    const rec = await getMeta<PinRecord | null>('vault', PIN_KEY, null)
    recordCache = rec
    set({ configured: Boolean(rec), loaded: true })
  },

  async setup(pin) {
    const rec = await createPinRecord(pin)
    recordCache = rec
    await setMeta('vault', PIN_KEY, rec)
    set({ configured: true, active: true, pin, lastTouch: Date.now() })
  },

  async unlock(pin) {
    const rec = recordCache ?? (await getMeta<PinRecord | null>('vault', PIN_KEY, null))
    if (!rec) return false
    const ok = await verifyPin(pin, rec)
    if (ok) {
      recordCache = rec
      set({ active: true, pin, lastTouch: Date.now(), configured: true })
    }
    return ok
  },

  lock() {
    set({ active: false, pin: null })
  },

  touch() {
    const s = get()
    // 30 秒内不重复写，避免触发无谓的重渲染
    if (!s.active || Date.now() - s.lastTouch < 30_000) return
    set({ lastTouch: Date.now() })
  },

  async changePin(oldPin, newPin) {
    const rec = recordCache ?? (await getMeta<PinRecord | null>('vault', PIN_KEY, null))
    if (!rec) return false
    if (!(await verifyPin(oldPin, rec))) return false
    const fresh = await createPinRecord(newPin)
    recordCache = fresh
    await setMeta('vault', PIN_KEY, fresh)
    set({ pin: newPin, lastTouch: Date.now() })
    return true
  },

  async removePin(pin) {
    return get().changePin(pin, pin) // 校验用；真正清除由调用方处理数据
  }
}))

/** 判断陈旧的会话是否该自动上锁 */
export function shouldAutoLock(lastTouch: number, ttlMs = 3 * 60 * 1000): boolean {
  if (!lastTouch) return false
  return Date.now() - lastTouch > ttlMs
}
