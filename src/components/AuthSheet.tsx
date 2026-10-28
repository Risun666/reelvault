import { useEffect, useRef, useState } from 'react'
import clsx from 'clsx'
import { useAuth } from '../store/auth'
import { Button, inputCls } from './ui'

export default function AuthSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const auth = useAuth()
  const [channel, setChannel] = useState<'phone' | 'email'>('phone')
  const [target, setTarget] = useState('')
  const [token, setToken] = useState('')
  const [countdown, setCountdown] = useState(0)
  const timer = useRef<number | undefined>(undefined)

  useEffect(() => {
    if (countdown <= 0) return
    timer.current = window.setInterval(() => setCountdown((c) => (c <= 1 ? 0 : c - 1)), 1000)
    return () => window.clearInterval(timer.current)
  }, [countdown])

  useEffect(() => {
    if (!open) {
      setTarget('')
      setToken('')
      auth.clearPending()
    }
  }, [open])

  const send = async () => {
    const ok = await auth.sendCode(channel, target)
    if (ok) setCountdown(60)
  }

  const submit = async () => {
    const ok = await auth.verifyCode(token)
    if (ok) {
      setToken('')
      onClose()
    }
  }

  return (
    <div
      className={clsx(
        'fixed inset-0 z-[75] flex items-end justify-center',
        !open && 'pointer-events-none'
      )}
    >
      <div
        className={clsx('fade-in absolute inset-0 bg-ink/30 transition-opacity', open ? 'opacity-100' : 'opacity-0')}
        onClick={onClose}
      />
      <div
        className={clsx(
          'slide-up relative w-full max-w-[560px] rounded-t-[22px] bg-paper-card px-4 pb-6 pt-4 shadow-lift transition-transform',
          open ? 'translate-y-0' : 'translate-y-full'
        )}
      >
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-[1rem] font-semibold">登录以开启多设备同步</h3>
          <button onClick={onClose} className="rounded-full p-1.5 text-ink-faint">
            ✕
          </button>
        </div>

        <div className="mb-3 flex rounded-xl bg-paper p-1">
          {(['phone', 'email'] as const).map((c) => (
            <button
              key={c}
              onClick={() => {
                setChannel(c)
                auth.clearPending()
                setToken('')
              }}
              className={clsx(
                'flex-1 rounded-lg py-1.5 text-[0.8125rem] font-medium transition-colors',
                channel === c ? 'bg-white text-ink shadow-sm' : 'text-ink-faint'
              )}
            >
              {c === 'phone' ? '手机号验证码' : '邮箱验证码'}
            </button>
          ))}
        </div>

        <div className="space-y-2">
          <input
            value={target}
            onChange={(e) => {
              setTarget(e.target.value)
              auth.clearPending()
            }}
            placeholder={channel === 'phone' ? '11 位手机号' : 'you@example.com'}
            inputMode={channel === 'phone' ? 'numeric' : 'email'}
            className={inputCls}
          />
          <div className="flex gap-2">
            <input
              value={token}
              onChange={(e) => setToken(e.target.value)}
              placeholder="验证码"
              inputMode="numeric"
              className={inputCls}
            />
            <Button
              variant="outline"
              className="w-[120px] shrink-0"
              disabled={auth.busy || countdown > 0}
              onClick={() => void send()}
            >
              {countdown > 0 ? `${countdown}s` : auth.codeSent ? '重新获取' : '获取验证码'}
            </Button>
          </div>
          <Button className="w-full" disabled={auth.busy} onClick={() => void submit()}>
            {auth.busy ? '处理中…' : '登录 / 注册'}
          </Button>
        </div>

        <div className="my-3 flex items-center gap-2 text-[0.6875rem] text-ink-faint">
          <span className="h-px flex-1 bg-paper-line" />
          或
          <span className="h-px flex-1 bg-paper-line" />
        </div>

        <Button variant="soft" className="w-full" disabled={auth.busy} onClick={() => void auth.signInWithWorkBuddy()}>
          使用 WorkBuddy 登录
        </Button>

        {auth.error && <p className="mt-3 text-[0.8125rem] text-reel">{auth.error}</p>}
        {auth.notice && !auth.error && (
          <p className="mt-3 text-[0.8125rem] text-moss">{auth.notice}</p>
        )}

        <p className="mt-3 text-[0.6875rem] leading-relaxed text-ink-faint">
          登录只用于把公开片库和片单同步到你的多台设备；<b className="text-ink-soft">隐私保险箱的内容永远不会上传</b>。
        </p>
      </div>
    </div>
  )
}
