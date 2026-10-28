import { useAuth } from '../store/auth'
import { runNow } from '../lib/autoSync'
import { lastSyncAt, resetSyncState, wipeCloud } from '../lib/sync'
import { useEffect, useState } from 'react'
import Icon from './Icon'
import { Button, Confirm } from './ui'
import { useSettings } from '../store/settings'
import { toast } from './Toast'

export default function CloudSyncPanel() {
  const auth = useAuth()
  const settings = useSettings()
  const [authOpen, setAuthOpen] = useState(false)
  const [lastAt, setLastAt] = useState('')
  const [syncing, setSyncing] = useState(false)
  const [wipeOpen, setWipeOpen] = useState(false)
  const [autoSyncEnabled, setAutoSyncEnabled] = useState(settings.autoSync !== false)

  useEffect(() => {
    void lastSyncAt().then(setLastAt)
  }, [auth.status])

  const sync = async () => {
    setSyncing(true)
    const res = await runNow()
    setSyncing(false)
    const at = await lastSyncAt()
    setLastAt(at)
    if (res.ok) toast('同步完成 · ' + res.message, 'good')
    else toast(res.message, 'bad')
  }

  useEffect(() => {
    if (auth.status === 'signed-in' && autoSyncEnabled) void sync()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [auth.status])

  const identity =
    auth.user?.phone ||
    auth.user?.email ||
    (auth.user?.name ? `${auth.user.name}` : '') ||
    (auth.user ? '已登录用户' : '')

  return (
    <section className="mt-5 rounded-2xl border border-paper-line bg-white p-4">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-[0.75rem] font-medium uppercase tracking-wide text-ink-faint">多设备云同步</h2>
        {auth.status === 'signed-in' && (
          <span className="flex items-center gap-1 text-[0.6875rem] text-moss">
            <Icon name="check" size={12} /> 已连接
          </span>
        )}
      </div>

      {auth.status !== 'signed-in' ? (
        <>
          <p className="text-[0.8125rem] leading-relaxed text-ink-soft">
            登录后可以在手机、平板、电脑之间自动同步片库和片单。数据按账号隔离，隐私保险箱不参与同步。
          </p>
          <Button className="mt-3 w-full" onClick={() => setAuthOpen(true)} disabled={auth.busy}>
            {auth.busy ? '正在连接…' : '登录 / 注册'}
          </Button>
        </>
      ) : (
        <div className="space-y-3">
          <div className="rounded-xl bg-paper p-3">
            <div className="flex items-center justify-between">
              <span className="text-[0.8125rem] text-ink-soft">{identity}</span>
              <button
                onClick={() => void auth.signOut()}
                className="text-[0.75rem] text-ink-faint underline decoration-paper-line"
              >
                退出登录
              </button>
            </div>
            <div className="mt-1 text-[0.6875rem] text-ink-faint">
              {lastAt ? `上次同步：${new Date(lastAt).toLocaleString('zh-CN')}` : '尚未同步过'}
            </div>
          </div>

          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="text-[0.875rem]">自动同步</div>
              <div className="mt-0.5 text-[0.75rem] leading-relaxed text-ink-faint">
                数据有变动时静默上传，换设备时自动拉取
              </div>
            </div>
            <button
              onClick={() => {
                const next = !autoSyncEnabled
                setAutoSyncEnabled(next)
                settings.set({ autoSync: next })
              }}
              className={
                'mt-0.5 h-6 w-11 shrink-0 rounded-full p-0.5 transition-colors ' +
                (autoSyncEnabled ? 'bg-moss' : 'bg-paper-line')
              }
            >
              <span
                className={
                  'block h-5 w-5 rounded-full bg-white shadow transition-transform ' +
                  (autoSyncEnabled && 'translate-x-5')
                }
              />
            </button>
          </div>

          <Button variant="outline" className="w-full" disabled={syncing} onClick={() => void sync()}>
            <Icon name="refresh" size={15} /> {syncing ? '同步中…' : '立即同步'}
          </Button>

          <div className="flex gap-2">
            <Button
              variant="ghost"
              size="sm"
              className="flex-1"
              onClick={async () => {
                await resetSyncState()
                setLastAt('')
                toast('已重置同步状态，下次将全量比对')
              }}
            >
              重置本地同步状态
            </Button>
            <Button variant="ghost" size="sm" className="flex-1 text-reel" onClick={() => setWipeOpen(true)}>
              清空云端数据
            </Button>
          </div>
        </div>
      )}

      <AuthSheetLazy open={authOpen} onClose={() => setAuthOpen(false)} />

      <Confirm
        open={wipeOpen}
        title="清空云端数据？"
        desc="云端保存的影片与片单会被全部删除，本机数据保留。此操作不可撤销。"
        danger
        confirmText="删除云端数据"
        onCancel={() => setWipeOpen(false)}
        onConfirm={async () => {
          setWipeOpen(false)
          try {
            const n = await wipeCloud()
            await resetSyncState()
            setLastAt('')
            toast(`已清空云端 ${n} 条记录`)
          } catch (e) {
            toast(e instanceof Error ? e.message : '清空失败', 'bad')
          }
        }}
      />
    </section>
  )
}

/** 登录抽屉按需加载，避免把 SDK 拉进主包 */
function AuthSheetLazy({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [Comp, setComp] = useState<React.ComponentType<{ open: boolean; onClose: () => void }> | null>(null)
  useEffect(() => {
    if (!open || Comp) return
    void import('./AuthSheet').then((m) => setComp(() => m.default))
  }, [open, Comp])
  if (!Comp) return null
  return <Comp open={open} onClose={onClose} />
}
