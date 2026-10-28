import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import clsx from 'clsx'
import { useSettings } from '../store/settings'
import { useLibraryStore, useVaultStore } from '../store/zone'
import { useVaultSession } from '../store/vaultSession'
import { useCollections } from '../store/collections'
import { clearZone } from '../lib/db'
import { pickJson } from '../lib/dom'
import { buildBackup, downloadCsv, downloadJson, importBackup } from '../lib/backup'
import Icon from '../components/Icon'
import { Button, Confirm, Field, Segmented, Sheet, inputCls } from '../components/ui'
import { toast } from '../components/Toast'
import CloudSyncPanel from '../components/CloudSyncPanel'
import AppearancePanel from '../components/AppearancePanel'

type VaultMode = 'none' | 'encrypted' | 'plain'

export default function Settings() {
  const settings = useSettings()
  const navigate = useNavigate()
  const library = useLibraryStore((s) => s.items)
  const vaultSession = useVaultSession()

  const [keyDraft, setKeyDraft] = useState(settings.apiKey)
  const [apiBaseDraft, setApiBaseDraft] = useState(settings.apiBase)
  const [imageBaseDraft, setImageBaseDraft] = useState(settings.imageBase)
  const [advanced, setAdvanced] = useState(false)

  const [exportSheet, setExportSheet] = useState(false)
  const [exportPosters, setExportPosters] = useState(true)
  const [vaultMode, setVaultMode] = useState<VaultMode>('none')
  const [exportPin, setExportPin] = useState('')
  const [exporting, setExporting] = useState(false)

  const [importPin, setImportPin] = useState('')
  const [pendingBackup, setPendingBackup] = useState<string | null>(null)
  const [importing, setImporting] = useState(false)

  const [confirmClearLib, setConfirmClearLib] = useState(false)
  const [confirmClearVault, setConfirmClearVault] = useState(false)

  const [taps, setTaps] = useState(0)
  const tapTimer = useRef<number | undefined>(undefined)

  useEffect(() => {
    void useVaultSession.getState().touch()
  }, [])

  const doExport = async () => {
    setExporting(true)
    try {
      const backup = await buildBackup({
        posters: exportPosters,
        vaultMode,
        pin: vaultMode === 'encrypted' ? exportPin : undefined
      })
      const stamp = new Date().toISOString().slice(0, 16).replace(/[-:T]/g, '')
      downloadJson(backup, `reelvault-backup-${stamp}.json`)
      setExportSheet(false)
      setExportPin('')
      toast('备份已导出', 'good')
    } catch (e) {
      toast(e instanceof Error ? e.message : '导出失败', 'bad')
    } finally {
      setExporting(false)
    }
  }

  const doImport = async (file: File, pin?: string) => {
    setImporting(true)
    try {
      const text = await file.text()
      const res = await importBackup(text, pin)
      await useLibraryStore.getState().refresh()
      await useVaultStore.getState().refresh()
      await useCollections.getState().refreshPublic()
      setPendingBackup(null)
      setImportPin('')
      toast(
        `导入完成：新增 ${res.added} · 更新 ${res.updated} · 片单 ${res.collections}${
          res.vault ? ` · 隐私区 +${res.vault.added}` : ''
        }`,
        'good'
      )
    } catch (e) {
      const msg = e instanceof Error ? e.message : '导入失败'
      if (msg.includes('PIN') || msg.includes('解密')) {
        setPendingBackup(await file.text())
        toast('请输入备份的隐私区 PIN', 'bad')
      } else {
        toast(msg, 'bad')
      }
    } finally {
      setImporting(false)
    }
  }

  const [pendingImportName, setPendingImportName] = useState('')

  const onVersionTap = () => {
    if (!vaultSession.configured) return
    const next = taps + 1
    setTaps(next)
    window.clearTimeout(tapTimer.current)
    tapTimer.current = window.setTimeout(() => setTaps(0), 2200)
    if (next >= 7) {
      setTaps(0)
      navigate('/vault')
    }
  }

  return (
    <div className="mx-auto max-w-[560px] px-4 pb-10 pt-safe">
      <header className="pb-3 pt-2">
        <h1 className="text-[1.5rem] font-semibold tracking-tight">设置</h1>
        <p className="mt-0.5 text-[0.75rem] text-ink-faint">数据全部保存在本机，随时可导出带走</p>
      </header>

      <CloudSyncPanel />

      {/* 数据来源 */}
      <Group title="数据来源">
        <Field label="TMDB API Key">
          <input
            value={keyDraft}
            onChange={(e) => setKeyDraft(e.target.value)}
            onBlur={() => settings.set({ apiKey: keyDraft.trim() })}
            placeholder="粘贴你的 TMDB API Key"
            className={inputCls}
          />
        </Field>
        <p className="mb-3 text-[0.75rem] leading-relaxed text-ink-faint">
          到 themoviedb.org 注册后在「Settings → API」免费申请。填一次即可自动拉取封面、简介、演员。
        </p>
        <button
          onClick={() => setAdvanced((v) => !v)}
          className="mb-2 text-[0.75rem] text-ink-soft underline decoration-paper-line"
        >
          {advanced ? '收起高级选项' : '网络访问不畅？展开代理设置'}
        </button>
        {advanced && (
          <div className="space-y-3 border-t border-paper-line pt-3">
            <Field label="API 地址">
              <input value={apiBaseDraft} onChange={(e) => setApiBaseDraft(e.target.value)} onBlur={() => settings.set({ apiBase: apiBaseDraft.trim() })} className={inputCls} />
            </Field>
            <Field label="图片地址">
              <input value={imageBaseDraft} onChange={(e) => setImageBaseDraft(e.target.value)} onBlur={() => settings.set({ imageBase: imageBaseDraft.trim() })} className={inputCls} />
            </Field>
          </div>
        )}
        <ToggleRow
          label="入库时缓存远程封面"
          desc="把 TMDB 海报存到本地，之后离线也能显示。"
          value={settings.cacheRemotePoster}
          onChange={(v) => settings.set({ cacheRemotePoster: v })}
        />
        <ToggleRow
          label="搜索结果包含成人分级"
          desc="关闭后只返回常规影视条目，需要时可在手动录入里自行添加。"
          value={settings.includeAdult}
          onChange={(v) => settings.set({ includeAdult: v })}
        />
      </Group>

      <AppearancePanel />

      {/* 备份 */}
      <Group title="备份与导出">
        <div className="space-y-2">
          <Button variant="outline" className="w-full" onClick={() => setExportSheet(true)}>
            <Icon name="download" size={16} /> 导出 JSON 备份
          </Button>
          <Button
            variant="outline"
            className="w-full"
            onClick={() => downloadCsv(library, `reelvault-${Date.now()}.csv`)}
          >
            <Icon name="list" size={16} /> 导出片单 CSV（{library.length} 条）
          </Button>
          <Button
            variant="outline"
            className="w-full"
            disabled={importing}
            onClick={async () => {
              const file = await pickJson()
              if (!file) return
              setPendingImportName(file.name)
              void doImport(file)
            }}
          >
            <Icon name="upload" size={16} /> 导入备份文件
          </Button>
        </div>
        <p className="mt-2 text-[0.75rem] leading-relaxed text-ink-faint">
          备份是单个 JSON 文件，封面可内嵌；隐私区可选「不导出」或「AES 加密后导出」。
        </p>
      </Group>

      {/* 隐私保险箱 */}
      {!vaultSession.configured && (
        <Group title="隐私">
          <div className="rounded-xl border border-paper-line bg-paper p-3">
            <div className="flex items-start gap-2">
              <Icon name="lock" size={16} className="mt-0.5 text-ink-soft" />
              <div className="text-[0.8125rem] leading-relaxed text-ink-soft">
                创建一个带 PIN 码的隐私空间，用于存放不想出现在主片库的收藏。它的内容是独立存储的，不会出现
                在片库、搜索结果、统计数据或常规导出中。
              </div>
            </div>
            <Button className="mt-3 w-full" onClick={() => navigate('/vault')}>
              创建隐私空间
            </Button>
          </div>
        </Group>
      )}

      {vaultSession.active && (
        <Group title="隐私空间">
          <div className="space-y-2">
            <Button variant="outline" className="w-full" onClick={() => navigate('/vault')}>
              <Icon name="lock" size={16} /> 打开隐私保险箱
            </Button>
            <Button variant="ghost" className="w-full" onClick={() => setConfirmClearVault(true)}>
              清空隐私空间全部数据
            </Button>
          </div>
        </Group>
      )}

      {/* 危险操作 */}
      <Group title="数据维护">
        <Button variant="ghost" className="w-full text-reel" onClick={() => setConfirmClearLib(true)}>
          清空公开片库（{library.length} 条）
        </Button>
      </Group>

      <div className="mt-6 text-center">
        <p className="mx-auto max-w-[320px] text-[0.7188rem] leading-relaxed text-ink-faint">
          装到手机：iPhone 用 Safari 打开后点「分享 → 添加到主屏幕」，Android 用 Chrome 菜单里的「安装应用」。
        </p>
        <button onClick={onVersionTap} className="mt-3 text-[0.6875rem] text-ink-faint/70">
          影匣 ReelVault v1.0.0
        </button>
      </div>

      {/* 导出抽屉 */}
      <Sheet
        open={exportSheet}
        onClose={() => setExportSheet(false)}
        title="导出备份"
        footer={
          <Button className="w-full" disabled={exporting} onClick={() => void doExport()}>
            {exporting ? '正在生成…' : '生成备份文件'}
          </Button>
        }
      >
        <ToggleRow
          label="内嵌封面图片"
          desc="体积会变大，但换设备恢复时封面不丢。"
          value={exportPosters}
          onChange={setExportPosters}
        />
        <div className="mt-4">
          <div className="mb-1.5 text-[0.75rem] font-medium text-ink-faint">隐私区如何处理</div>
          <Segmented
            value={vaultMode}
            onChange={(v) => setVaultMode(v as VaultMode)}
            options={[
              { value: 'none', label: '不导出' },
              { value: 'encrypted', label: '加密导出' },
              { value: 'plain', label: '明文导出' }
            ]}
          />
          {vaultMode === 'encrypted' && (
            <div className="mt-3">
              <Field label="输入 PIN（用于加密）">
                <input
                  value={exportPin}
                  onChange={(e) => setExportPin(e.target.value)}
                  type="password"
                  inputMode="numeric"
                  placeholder="隐私空间 PIN"
                  className={inputCls}
                />
              </Field>
              <p className="text-[0.75rem] text-ink-faint">恢复时需要输入同一个 PIN 才能解开隐私区。</p>
            </div>
          )}
          {vaultMode === 'plain' && (
            <p className="mt-2 text-[0.75rem] text-reel-dark">
              明文导出后任何拿到文件的人都能看到隐私区内容，请谨慎保存。
            </p>
          )}
        </div>
      </Sheet>

      {/* 导入 PIN */}
      <Sheet
        open={Boolean(pendingBackup)}
        onClose={() => setPendingBackup(null)}
        title="解锁备份中的隐私区"
        footer={
          <Button
            className="w-full"
            disabled={importing}
            onClick={() => {
              const raw = pendingBackup
              if (!raw) return
              void doImport(new File([raw], pendingImportName || 'backup.json', { type: 'application/json' }), importPin)
            }}
          >
            解密并导入
          </Button>
        }
      >
        <Field label="输入该备份的 PIN">
          <input
            value={importPin}
            onChange={(e) => setImportPin(e.target.value)}
            type="password"
            inputMode="numeric"
            className={inputCls}
          />
        </Field>
        <p className="text-[0.75rem] text-ink-faint">公开片库已经导入成功，这里只用于解开隐私区。</p>
      </Sheet>

      <Confirm
        open={confirmClearLib}
        title="清空公开片库？"
        desc={`将删除 ${library.length} 条记录和它们的封面，不可撤销。建议先导出备份。`}
        danger
        confirmText="清空"
        onCancel={() => setConfirmClearLib(false)}
        onConfirm={async () => {
          await clearZone('library')
          await useLibraryStore.getState().refresh()
          setConfirmClearLib(false)
          toast('已清空片库')
        }}
      />

      <Confirm
        open={confirmClearVault}
        title="清空隐私空间？"
        desc="所有隐私收藏与本地封面会被彻底删除，PIN 保留。"
        danger
        confirmText="清空"
        onCancel={() => setConfirmClearVault(false)}
        onConfirm={async () => {
          await clearZone('vault')
          await useVaultStore.getState().refresh()
          setConfirmClearVault(false)
          toast('已清空隐私空间')
        }}
      />
    </div>
  )
}

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-5 rounded-2xl border border-paper-line bg-white p-4">
      <h2 className="mb-3 text-[0.75rem] font-medium uppercase tracking-wide text-ink-faint">{title}</h2>
      {children}
    </section>
  )
}

function ToggleRow({
  label,
  desc,
  value,
  onChange
}: {
  label: string
  desc?: string
  value: boolean
  onChange: (v: boolean) => void
}) {
  return (
    <div className="flex items-start justify-between gap-3 py-1.5">
      <div className="min-w-0">
        <div className="text-[0.875rem]">{label}</div>
        {desc && <div className="mt-0.5 text-[0.75rem] leading-relaxed text-ink-faint">{desc}</div>}
      </div>
      <button
        onClick={() => onChange(!value)}
        className={clsx(
          'mt-0.5 h-6 w-11 shrink-0 rounded-full p-0.5 transition-colors',
          value ? 'bg-moss' : 'bg-paper-line'
        )}
      >
        <span
          className={clsx(
            'block h-5 w-5 rounded-full bg-white shadow transition-transform',
            value && 'translate-x-5'
          )}
        />
      </button>
    </div>
  )
}
