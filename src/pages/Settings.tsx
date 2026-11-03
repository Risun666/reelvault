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
import {
  DEFAULT_API_BASE,
  clearResultCache,
  diagnose,
  pickImageBase,
  type Diagnosis,
  type ProbeResult
} from '../lib/tmdb'
import AppearancePanel from '../components/AppearancePanel'
import UpdatePanel from '../components/UpdatePanel'
import { APP_VERSION, RELEASES_URL, AUTHOR_MAIL } from '../lib/updater'

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
  const [probes, setProbes] = useState<ProbeResult[] | null>(null)
  const [probing, setProbing] = useState(false)
  const [diag, setDiag] = useState<Diagnosis | null>(null)

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

  const runProbe = async () => {
    setProbing(true)
    try {
      const result = await diagnose(settings)
      setDiag(result)
      setProbes(result.api)

      const best = result.api.find((r) => r.ok && !r.note)
      const img = pickImageBase(result.images)
      if (best || img) {
        const patch: Partial<Record<'apiBase' | 'imageBase', string>> = {}
        if (best && best.base !== settings.apiBase) patch.apiBase = best.base
        if (img && img !== settings.imageBase) patch.imageBase = img
        if (Object.keys(patch).length) settings.set(patch)
      }

      if (!result.key.ok) {
        toast(result.key.note, 'bad')
        return
      }
      if (!best) {
        toast('Key 正常，但接口节点都连不上：需要自建反代或走代理', 'bad')
        return
      }
      toast(`服务正常（接口 ${best.ms}ms，Key ${result.usingBuiltIn ? '内置' : '自定义'}）`, 'good')
    } catch (e) {
      toast(e instanceof Error ? e.message : '诊断失败', 'bad')
    } finally {
      setProbing(false)
    }
  }

  const doExport = async () => {
    setExporting(true)
    try {
      const backup = await buildBackup({
        posters: exportPosters,
        vaultMode,
        pin: vaultMode === 'encrypted' ? exportPin : undefined
      })
      // 只保留数字后取前 12 位 = YYYYMMDDHHmm（避免出现中括号字符类被误当成 Tailwind 候选）
      const stamp = new Date().toISOString().replace(/\D/g, '').slice(0, 12)
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
      <header className="pb-5 pt-3">
        <h1 className="font-display text-page font-semibold tracking-tight text-ink">设置</h1>
        <p className="mt-1 text-caption text-ink-faint">数据全部保存在本机，随时可导出带走</p>
      </header>

      <UpdatePanel />

      {/* 数据来源 */}
      <Group title="数据来源" index={1}>
        <ToggleRow
          label="使用内置 API Key"
          desc="已内置一个能直接用的 Key，不用自己去申请。它是共享的，额度被打满时会限流，换成自己的更稳。"
          value={settings.useBuiltInKey}
          onChange={(v) => {
            settings.set({ useBuiltInKey: v })
            clearResultCache()
          }}
        />
        {!settings.useBuiltInKey && (
          <div className="pt-2">
            <Field label="自定义 TMDB API Key">
              <input
                value={keyDraft}
                onChange={(e) => setKeyDraft(e.target.value)}
                onBlur={() => {
                  settings.set({ apiKey: keyDraft.trim() })
                  clearResultCache()
                }}
                placeholder="粘贴你的 TMDB API Key"
                className={inputCls}
              />
            </Field>
            <p className="text-caption leading-relaxed text-ink-faint">
              到 themoviedb.org 注册后在「Settings → API」免费申请。留空则自动回退到内置 Key。
            </p>
          </div>
        )}
      </Group>

      {/* TMDB 接口 */}
      <Group title="TMDB" index={2}>
        {/* 接口节点测速 */}
        <div className="mb-2 mt-2 rounded-xl border border-paper-line bg-paper-sunken p-3">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="text-body-sm font-medium text-ink">连接诊断</div>
              <div className="mt-0.5 truncate font-mono text-micro text-ink-faint">
                {settings.apiBase}
              </div>
            </div>
            <Button variant="tonal" className="shrink-0" onClick={() => void runProbe()} disabled={probing}>
              {probing ? '诊断中…' : '诊断并择优'}
            </Button>
          </div>

          {diag && (
            <div className="mt-2.5 space-y-1.5 rounded-xl bg-paper-card px-3 py-2.5 text-caption">
              <div className="flex items-center justify-between gap-2">
                <span className="min-w-0 text-ink-soft">
                  API Key（{diag.usingBuiltIn ? '内置' : '自定义'}）
                </span>
                <span className={clsx('shrink-0', diag.key.ok ? 'text-moss' : 'text-danger')}>
                  {diag.key.ok ? '有效' : diag.key.note}
                </span>
              </div>
              {diag.images.map((i) => (
                <div key={i.base} className="flex items-center justify-between gap-2">
                  <span className="truncate font-mono text-micro text-ink-faint">
                    {i.base.replace('https://', '')}
                  </span>
                  <span className={clsx('shrink-0', i.ok ? 'text-moss' : 'text-ink-faint')}>
                    {i.ok ? `图片 ${i.ms}ms` : '图片不可达'}
                  </span>
                </div>
              ))}
            </div>
          )}

          {probes && (
            <div className="mt-2.5 space-y-1.5">
              {probes.map((p) => {
                const active = p.base === settings.apiBase
                return (
                  <button
                    key={p.base}
                    onClick={() => {
                      if (!p.ok) return
                      settings.set({
                        apiBase: p.base,
                        imageBase: p.base.includes('themoviedb.org')
                          ? 'https://image.themoviedb.org/t/p'
                          : 'https://image.tmdb.org/t/p'
                      })
                    }}
                    className={clsx(
                      'pressable flex min-h-touch w-full items-center justify-between gap-2 rounded-xl border px-3 text-left text-caption',
                      active
                        ? 'border-reel/40 bg-reel-soft text-reel-dark'
                        : 'border-paper-line bg-paper-card text-ink',
                      !p.ok && 'opacity-60'
                    )}
                  >
                    <span className="min-w-0 flex-1 truncate">
                      {p.label}
                      {p.note && <span className="ml-1 text-ink-faint">· {p.note}</span>}
                    </span>
                    <span className={clsx('shrink-0 tabular-nums', p.ok ? 'text-moss' : 'text-ink-faint')}>
                      {p.ok ? `${p.ms}ms` : '不可达'}
                    </span>
                  </button>
                )
              })}
            </div>
          )}

          <p className="mt-2.5 text-micro leading-relaxed text-ink-faint">
            大陆网络常屏蔽 themoviedb.org，默认已改用官方短域名。仍不通就点「测速并择优」；
            若全部不可达，可在下方填自建反代地址（仓库 <span className="font-mono">workers/</span> 里有现成脚本）。
          </p>
        </div>

        <ToggleRow
          label="自动在官方节点间降级"
          desc="一个节点超时就自动换下一个，不用手动改地址。关掉后只使用当前填写的地址。"
          value={settings.autoEndpoint}
          onChange={(v) => settings.set({ autoEndpoint: v })}
        />

        <button
          onClick={() => setAdvanced((v) => !v)}
          className="pressable flex min-h-touch w-full items-center gap-1.5 border-b border-paper-line text-caption text-ink-soft"
        >
          <Icon
            name="chevronRight"
            size={13}
            className={clsx('transition-transform ease-spring duration-2', advanced && 'rotate-90')}
          />
          {advanced ? '收起高级选项' : '自建反代 / 手动指定地址'}
        </button>
        {advanced && (
          <div className="space-y-3 border-b border-paper-line py-3">
            <Field label="API 地址">
              <input value={apiBaseDraft} onChange={(e) => setApiBaseDraft(e.target.value)} onBlur={() => settings.set({ apiBase: apiBaseDraft.trim() })} className={inputCls} />
            </Field>
            <Field label="图片地址">
              <input value={imageBaseDraft} onChange={(e) => setImageBaseDraft(e.target.value)} onBlur={() => settings.set({ imageBase: imageBaseDraft.trim() })} className={inputCls} />
            </Field>
            <Button
              variant="outline"
              className="w-full"
              onClick={() => {
                setApiBaseDraft(DEFAULT_API_BASE)
                setImageBaseDraft('https://image.tmdb.org/t/p')
                settings.set({ apiBase: DEFAULT_API_BASE, imageBase: 'https://image.tmdb.org/t/p' })
                toast('已恢复官方默认地址')
              }}
            >
              恢复官方默认地址
            </Button>
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
      <Group title="备份与导出" index={5}>
        <div className="space-y-2.5 py-2">
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
        <p className="pb-2 pt-1 text-caption leading-relaxed text-ink-faint">
          备份是单个 JSON 文件，封面可内嵌；隐私区可选「不导出」或「AES 加密后导出」。
        </p>
      </Group>

      {/* 隐私保险箱 */}
      {!vaultSession.configured && (
        <Group title="隐私" index={6}>
          <div className="my-2 rounded-xl bg-paper-sunken p-3.5">
            <div className="flex items-start gap-2.5">
              <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-paper-card text-reel-dark shadow-e1">
                <Icon name="lock" size={16} />
              </span>
              <p className="text-caption leading-relaxed text-ink-soft">
                创建一个带 PIN 码的隐私空间，用于存放不想出现在主片库的收藏。它的内容是独立存储的，不会出现
                在片库、搜索结果、统计数据或常规导出中。
              </p>
            </div>
            <Button className="mt-3 w-full" onClick={() => navigate('/vault')}>
              创建隐私空间
            </Button>
          </div>
        </Group>
      )}

      {vaultSession.active && (
        <Group title="隐私空间" index={7}>
          <div className="space-y-2.5 py-2">
            <Button variant="outline" className="w-full" onClick={() => navigate('/vault')}>
              <Icon name="lock" size={16} /> 打开隐私保险箱
            </Button>
            <Button
              variant="ghost"
              className="w-full text-danger"
              onClick={() => setConfirmClearVault(true)}
            >
              清空隐私空间全部数据
            </Button>
          </div>
        </Group>
      )}

      {/* 危险操作 */}
      <Group title="数据维护" index={8} tone="danger">
        <div className="py-2">
          <Button variant="danger" className="w-full" onClick={() => setConfirmClearLib(true)}>
            <Icon name="trash" size={16} /> 清空公开片库（{library.length} 条）
          </Button>
        </div>
      </Group>

      <div className="mt-8">
        <div className="h-px w-full bg-paper-line" />
        <p className="mx-auto mt-6 max-w-[320px] text-center text-micro leading-relaxed text-ink-faint">
          装到手机：iPhone 用 Safari 打开后点「分享 → 添加到主屏幕」，Android 用 Chrome 菜单里的「安装应用」。
        </p>
        <div className="mt-4 flex justify-center">
          <button
            onClick={onVersionTap}
            className="pressable min-h-touch rounded-xl px-4 text-caption text-ink-faint/80"
          >
            影匣 ReelVault v{APP_VERSION}
          </button>
        </div>

        <div className="mt-2 flex items-center justify-center gap-2">
          <button
            onClick={() => window.open(RELEASES_URL, '_blank', 'noopener,noreferrer')}
            className="pressable flex min-h-touch items-center gap-2 rounded-full border border-paper-line bg-paper-card px-4 text-label text-ink-soft hover:border-paper-lineStrong hover:text-ink"
            title="打开 GitHub 仓库"
          >
            <Icon name="github" size={16} /> GitHub
          </button>
          <a
            href={AUTHOR_MAIL}
            className="pressable flex min-h-touch items-center gap-2 rounded-full border border-paper-line bg-paper-card px-4 text-label text-ink-soft hover:border-paper-lineStrong hover:text-ink"
            title="给作者发邮件"
          >
            <Icon name="mail" size={16} /> by 赵大阳
          </a>
        </div>
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
          <div className="mb-2 text-label font-semibold text-ink-faint">隐私区如何处理</div>
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
              <p className="text-caption leading-relaxed text-ink-faint">恢复时需要输入同一个 PIN 才能解开隐私区。</p>
            </div>
          )}
          {vaultMode === 'plain' && (
            <p className="mt-2 text-caption leading-relaxed text-danger">
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
        <p className="text-caption leading-relaxed text-ink-faint">公开片库已经导入成功，这里只用于解开隐私区。</p>
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

function Group({
  title,
  children,
  index = 0,
  tone
}: {
  title: string
  children: React.ReactNode
  index?: number
  tone?: 'danger'
}) {
  return (
    <section
      className={clsx(
        'animate-staggerIn mb-4 overflow-hidden rounded-2xl border bg-paper-card shadow-e1',
        tone === 'danger' ? 'border-danger/30' : 'border-paper-line'
      )}
      style={{ animationDelay: `${Math.min(index, 10) * 28}ms` }}
    >
      <div className="border-b border-paper-line px-4 py-3">
        <h2
          className={clsx(
            'text-label font-semibold',
            tone === 'danger' ? 'text-danger' : 'text-ink-faint'
          )}
        >
          {title}
        </h2>
      </div>
      <div className="px-4 py-2">{children}</div>
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
    <button
      type="button"
      onClick={() => onChange(!value)}
      aria-pressed={value}
      className="pressable flex min-h-touch w-full items-center justify-between gap-4 border-b border-paper-line py-3 text-left last:border-b-0"
    >
      <span className="min-w-0 flex-1">
        <span className="block text-body-sm font-medium text-ink">{label}</span>
        {desc && (
          <span className="mt-0.5 block text-caption leading-relaxed text-ink-faint">{desc}</span>
        )}
      </span>
      <span
        aria-hidden
        className={clsx(
          'flex h-7 w-12 shrink-0 items-center rounded-full border transition-colors ease-spring duration-2',
          value ? 'border-reel bg-reel' : 'border-paper-lineStrong bg-paper-sunken'
        )}
      >
        <span
          className={clsx(
            'ml-0.5 block h-5 w-5 rounded-full bg-paper-card shadow-e1 ring-1 ring-ink/10',
            'transition-transform ease-spring duration-2',
            value && 'translate-x-5'
          )}
        />
      </span>
    </button>
  )
}
