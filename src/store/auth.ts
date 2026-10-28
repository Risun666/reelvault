import { create } from 'zustand'
import { cloud } from '../lib/cloud'

export interface CloudUser {
  id: string
  name?: string
  email?: string
  phone?: string
}

type Status = 'unknown' | 'signed-out' | 'signed-in'

interface AuthStore {
  status: Status
  user: CloudUser | null
  /** 一次性 OTP 上下文：发码与校验必须成对 */
  pending: {
    channel: 'email' | 'phone'
    target: string
    verificationId: string
    isExistingUser: boolean
  } | null
  codeSent: boolean
  busy: boolean
  error: string | null
  notice: string | null

  restore: () => Promise<void>
  sendCode: (channel: 'email' | 'phone', target: string) => Promise<boolean>
  verifyCode: (token: string) => Promise<boolean>
  signInWithWorkBuddy: () => Promise<void>
  signOut: () => Promise<void>
  clearPending: () => void
}

function normalize(value: string): string {
  return value.trim()
}

function validatePhone(value: string): boolean {
  return /^1\d{10}$/.test(value)
}

function validateEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)
}

export const useAuth = create<AuthStore>((set, get) => ({
  status: 'unknown',
  user: null,
  pending: null,
  codeSent: false,
  busy: false,
  error: null,
  notice: null,

  async restore() {
    set({ busy: true, error: null })
    try {
      // OAuth 回调优先于会话恢复，且必须在任何登录守卫之前处理
      const url = new URL(window.location.href)
      const hasCallback = url.searchParams.has('code') || url.searchParams.has('error')
      if (hasCallback) {
        const provider = url.searchParams.get('provider')
        const handler =
          provider === 'wechat'
            ? (cloud.auth as unknown as { handleWechatWebCallback?: () => Promise<{ data: unknown; error: unknown }> })
                .handleWechatWebCallback
            : provider === 'workbuddy'
              ? (cloud.auth as unknown as { handleWorkBuddyCallback?: () => Promise<{ data: unknown; error: unknown }> })
                  .handleWorkBuddyCallback
              : undefined
        if (typeof handler !== 'function') {
          set({ status: 'signed-out', error: '授权回调缺少有效的登录方式，请重新登录。', busy: false })
          return
        }
        const { data: session, error } = await handler.call(cloud.auth)
        if (error) {
          set({ status: 'signed-out', error: '授权登录失败，请重试。', busy: false })
          return
        }
        if (session) {
          for (const key of ['code', 'state', 'provider']) url.searchParams.delete(key)
          window.history.replaceState(null, '', `${url.pathname}${url.search}${url.hash}`)
        }
      }

      const { data: session } = await cloud.auth.getSession()
      if (session?.user) {
        set({
          status: 'signed-in',
          user: {
            id: session.user.id,
            name: session.user.name ?? undefined,
            email: session.user.email ?? undefined,
            phone: session.user.phone ?? undefined
          },
          busy: false,
          error: null
        })
      } else {
        set({ status: 'signed-out', user: null, busy: false })
      }
    } catch {
      set({ status: 'signed-out', user: null, busy: false })
    }
  },

  async sendCode(channel, rawTarget) {
    const target = normalize(rawTarget)
    if (channel === 'phone' && !validatePhone(target)) {
      set({ error: '请输入正确的 11 位手机号' })
      return false
    }
    if (channel === 'email' && !validateEmail(target)) {
      set({ error: '请输入正确的邮箱地址' })
      return false
    }
    set({ busy: true, error: null })
    try {
      const credentials = channel === 'phone' ? { phone: target } : { email: target }
      const { data, error } = await cloud.auth.sendOtp(credentials)
      if (error || !data) {
        set({ error: error?.message ?? '验证码发送失败，请稍后再试', busy: false })
        return false
      }
      set({
        pending: {
          channel,
          target,
          verificationId: data.verificationId,
          isExistingUser: Boolean(data.isExistingUser)
        },
        codeSent: true,
        busy: false,
        notice: channel === 'phone' ? '验证码已发送' : '验证码已发送到邮箱'
      })
      return true
    } catch (e) {
      set({ error: e instanceof Error ? e.message : '验证码发送失败', busy: false })
      return false
    }
  },

  async verifyCode(token) {
    const pending = get().pending
    if (!pending) {
      set({ error: '请先获取当前账号的验证码' })
      return false
    }
    set({ busy: true, error: null })
    try {
      const base = {
        verificationId: pending.verificationId,
        isExistingUser: pending.isExistingUser,
        token: token.trim()
      }
      const credentials =
        pending.channel === 'phone' ? { ...base, phone: pending.target } : { ...base, email: pending.target }
      const { data, error } = await cloud.auth.verifyOtp(credentials)
      if (error || !data?.user) {
        set({ error: error?.message ?? '验证码不正确', busy: false })
        return false
      }
      set({
        status: 'signed-in',
        user: {
          id: data.user.id,
          name: data.user.name ?? undefined,
          email: data.user.email ?? undefined,
          phone: data.user.phone ?? undefined
        },
        pending: null,
        codeSent: false,
        busy: false,
        error: null,
        notice: null
      })
      return true
    } catch (e) {
      set({ error: e instanceof Error ? e.message : '登录失败', busy: false })
      return false
    }
  },

  async signInWithWorkBuddy() {
    set({ busy: true, error: null })
    try {
      const back = new URL(window.location.href)
      back.pathname = '/'
      for (const key of ['code', 'state', 'provider']) back.searchParams.delete(key)
      const { data, error } = await cloud.auth.signInWithOAuth({
        provider: 'workbuddy',
        redirectTo: back.toString()
      })
      if (error || !data?.url) {
        set({ error: error?.message ?? '暂时无法使用 WorkBuddy 登录', busy: false })
        return
      }
      window.location.assign(data.url)
    } catch (e) {
      set({ error: e instanceof Error ? e.message : '登录失败', busy: false })
    }
  },

  async signOut() {
    await cloud.auth.signOut()
    set({ status: 'signed-out', user: null, pending: null, codeSent: false, notice: null })
  },

  clearPending() {
    set({ pending: null, codeSent: false, error: null, notice: null })
  }
}))

/** 供 App 启动时调用 */
export async function restoreAuthSession() {
  await useAuth.getState().restore()
}
