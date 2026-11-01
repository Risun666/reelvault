import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import clsx from 'clsx'
import { useVaultSession } from '../store/vaultSession'
import { useVaultStore } from '../store/zone'
import { vaultPeople } from '../store/people'
import { clearZone, setMeta } from '../lib/db'
import LibraryView from '../components/LibraryView'
import Icon from '../components/Icon'
import { Confirm } from '../components/ui'
import { toast } from '../components/Toast'

const MIN_LEN = 4
const MAX_LEN = 8

export default function VaultGate() {
  const session = useVaultSession()
  const vault = useVaultStore.getState()
  const navigate = useNavigate()

  const [pending, setPending] = useState('')
  const [stage, setStage] = useState<'enter' | 'confirm'>('enter')
  const [firstPin, setFirstPin] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [justCreated, setJustCreated] = useState(false)
  const [confirmWipe, setConfirmWipe] = useState(false)

  useEffect(() => {
    if (session.active) {
      void vault.refresh()
      void vaultPeople.getState().refresh()
    }
  }, [session.active])

  useEffect(() => {
    if (session.active) void session.touch()
  }, [session.active])

  const press = (d: string) => {
    setError(null)
    setPending((p) => (p.length >= MAX_LEN ? p : p + d))
  }

  const backspace = () => setPending((p) => p.slice(0, -1))

  const submit = async () => {
    if (pending.length < MIN_LEN) {
      setError(`PIN 至少 ${MIN_LEN} 位`)
      return
    }
    setBusy(true)
    try {
      if (!session.configured) {
        if (stage === 'enter') {
          setFirstPin(pending)
          setPending('')
          setStage('confirm')
          return
        }
        if (pending !== firstPin) {
          setError('两次输入不一致，请重新创建')
          setPending('')
          setFirstPin('')
          setStage('enter')
          return
        }
        await session.setup(pending)
        setPending('')
        setJustCreated(true)
        toast('隐私空间已创建', 'good')
        return
      }
      const ok = await session.unlock(pending)
      if (ok) {
        setPending('')
      } else {
        setError('PIN 不正确')
        setPending('')
      }
    } finally {
      setBusy(false)
    }
  }

  useEffect(() => {
    if (session.configured && pending.length === MAX_LEN && stage !== 'confirm') void submit()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pending])

  if (session.active) {
    return (
      <div>
        <div className="mx-auto flex max-w-[560px] items-center justify-between px-4 pt-safe">
          <span />
          <div className="flex items-center gap-1">
            <button
              onClick={() => navigate('/settings')}
              className="pressable flex min-h-touch items-center rounded-full px-3 text-label text-ink-soft hover:bg-paper-sunken"
            >
              修改 PIN
            </button>
            <button
              onClick={() => {
                session.lock()
                vault.clearMemory()
                vaultPeople.getState().clearMemory()
                toast('已上锁')
                navigate('/')
              }}
              className="pressable flex min-h-touch items-center gap-1.5 rounded-full border border-paper-line bg-paper-card px-3.5 text-label text-ink-soft"
            >
              <Icon name="lock" size={14} /> 上锁
            </button>
          </div>
        </div>
        {justCreated && (
          <div className="mx-auto mt-2 max-w-[560px] px-4">
            <div className="animate-popIn rounded-2xl border border-reel/25 bg-reel-soft p-3.5 text-caption leading-relaxed text-reel-dark">
              <div className="mb-1 flex items-center justify-between">
                <span className="text-label font-semibold">记住入口</span>
                <button
                  onClick={() => setJustCreated(false)}
                  aria-label="关闭"
                  className="pressable flex h-11 w-11 items-center justify-center rounded-xl"
                >
                  <Icon name="close" size={15} />
                </button>
              </div>
              下次进入：在「设置」页底部连续点击版本号 7 次；或直接访问本页地址（
              <span className="font-mono">#/vault</span>）。离开后 3 分钟会自动上锁，也可以点右上角手动上锁。
            </div>
          </div>
        )}
        <LibraryView zone="vault" title="隐私保险箱" accent />
      </div>
    )
  }

  const label = !session.configured
    ? stage === 'enter'
      ? '设置 4-8 位 PIN'
      : '再输入一次确认'
    : '输入 PIN'

  return (
    <div className="mx-auto flex min-h-screen max-w-[560px] flex-col items-center px-6 pb-10 pt-[14vh]">
      <div className="mb-8 flex h-28 w-28 items-center justify-center rounded-full border border-reel/20 bg-reel-soft text-reel-dark shadow-e2">
        <Icon name="lock" size={40} />
      </div>
      <h1 className="text-headline font-semibold tracking-tight text-ink">{label}</h1>
      {!session.configured && stage === 'enter' && (
        <p className="mt-3 max-w-[320px] text-center text-caption leading-relaxed text-ink-faint">
          隐私空间的数据与封面独立存储，不出现在片库、搜索、统计和常规导出中。PIN 只在本地以哈希形式保存，忘记则无法找回。
        </p>
      )}

      <div
        key={error ?? 'idle'}
        className={clsx('my-9 flex gap-2.5', error && 'animate-shake')}
      >
        {Array.from({ length: MAX_LEN }).map((_, i) => (
          <span
            key={i}
            className={clsx(
              'flex h-12 w-10 items-center justify-center rounded-xl border transition-all ease-spring duration-2',
              i < pending.length
                ? 'border-reel bg-reel-soft'
                : 'border-paper-line bg-paper-sunken'
            )}
          >
            <span
              className={clsx(
                'h-2.5 w-2.5 rounded-full transition-all ease-spring duration-2',
                i < pending.length ? 'scale-110 bg-reel' : 'bg-paper-lineStrong'
              )}
            />
          </span>
        ))}
      </div>

      <div className="mb-5 flex h-6 items-center">
        {error && <p className="animate-popIn text-caption font-medium text-danger">{error}</p>}
      </div>

      <div className="grid w-full max-w-[300px] grid-cols-3 gap-2.5">
        {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((d) => (
          <Key key={d} onClick={() => press(d)}>{d}</Key>
        ))}
        <Key onClick={() => (pending.length >= MIN_LEN ? void submit() : setError(`PIN 至少 ${MIN_LEN} 位`))}>
          {busy ? '…' : !session.configured ? '继续' : '解锁'}
        </Key>
        <Key onClick={() => press('0')}>0</Key>
        <Key onClick={backspace}>
          <Icon name="close" size={16} />
        </Key>
      </div>

      {!session.configured ? (
        <button
          onClick={() => navigate('/')}
          className="pressable mt-10 flex min-h-touch items-center text-body-sm text-ink-faint"
        >
          以后再说
        </button>
      ) : (
        <div className="mt-10 flex justify-center">
          <button
            onClick={() => setConfirmWipe(true)}
            className="pressable flex min-h-touch items-center text-caption text-ink-faint/80"
          >
            忘记 PIN
          </button>
        </div>
      )}

      <Confirm
        open={confirmWipe}
        title="重设隐私空间？"
        desc="PIN 无法找回。继续将永久删除隐私空间内的全部收藏与封面，然后可以重新创建 PIN。"
        danger
        confirmText="删除并重设"
        onCancel={() => setConfirmWipe(false)}
        onConfirm={async () => {
          await clearZone('vault')
          await setMeta('vault', 'vault.pin', null)
          setConfirmWipe(false)
          location.reload()
        }}
      />
    </div>
  )
}

function Key({ children, onClick }: { children: React.ReactNode; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="pressable flex h-14 items-center justify-center rounded-2xl border border-paper-line bg-paper-card text-title font-medium text-ink hover:border-paper-lineStrong"
    >
      {children}
    </button>
  )
}
