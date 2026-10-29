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
import { testJav, JAV_SOURCES } from '../lib/jav'
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

  const [javEndpointDraft, setJavEndpointDraft] = useState(settings.javEndpoint)
  const [javTokenDraft, setJavTokenDraft] = useState(settings.javToken)
  const [javProviderDraft, setJavProviderDraft] = useState(settings.javProvider)
  const [javTesting, setJavTesting] = useState(false)
  const [javTest, setJavTest] = useState<{
    ok: boolean
    ms: number
    message: string
    providers: string[]
  } | null>(null)

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

  const runJavTest = async () => {
    const endpoint = javEndpointDraft.trim()
    if (!endpoint) {
      toast('先填刮削服务地址', 'bad')
      return
    }
    setJavTesting(true)
    setJavTest(null)
    try {
      const res = await testJav({
        enabled: true,
        backend: settings.javBackend,
        endpoint,
        token: javTokenDraft,
        sources: settings.javSources,
        provider: settings.javProvider,
        enrich: settings.javEnrich,
        titleLang: settings.javTitleLang,
        imageProxy: settings.javImageProxy
      })
      setJavTest(res)
      toast(res.ok ? '刮削服务可用' : res.message, res.ok ? 'good' : 'bad')
    } finally {
      setJavTesting(false)
    }
  }

  const toggleJavSource = (id: string) => {
    const has = settings.javSources.includes(id)
    const next = has ? settings.javSources.filter((s) => s !== id) : [...settings.javSources, id]
    settings.set({ javSources: next.length ? next : [id] })
  }

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

      <UpdatePanel />

      {/* 数据来源 */}
      <Group title="数据来源">
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
          <div className="mt-2">
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
            <p className="text-[0.75rem] leading-relaxed text-ink-faint">
              到 themoviedb.org 注册后在「Settings → API」免费申请。留空则自动回退到内置 Key。
            </p>
          </div>
        )}
        {/* 接口节点测速 */}
        <div className="mb-3 rounded-xl border border-paper-line bg-paper/60 p-3">
          <div className="flex items-center justify-between gap-2">
            <div className="min-w-0">
              <div className="text-[0.8125rem] font-medium">连接诊断</div>
              <div className="mt-0.5 truncate font-mono text-[0.6875rem] text-ink-faint">
                {settings.apiBase}
              </div>
            </div>
            <Button
              variant="outline"
              className="shrink-0 px-2.5 py-1.5 text-[0.75rem]"
              onClick={() => void runProbe()}
              disabled={probing}
            >
              {probing ? '诊断中…' : '诊断并择优'}
            </Button>
          </div>

          {diag && (
            <div className="mt-2.5 space-y-1 text-[0.75rem]">
              <div className="flex items-center justify-between gap-2">
                <span className="text-ink-soft">
                  API Key（{diag.usingBuiltIn ? '内置' : '自定义'}）
                </span>
                <span className={clsx(diag.key.ok ? 'text-moss' : 'text-reel')}>
                  {diag.key.ok ? '有效' : diag.key.note}
                </span>
              </div>
              {diag.images.map((i) => (
                <div key={i.base} className="flex items-center justify-between gap-2">
                  <span className="truncate font-mono text-[0.6875rem] text-ink-faint">
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
            <div className="mt-2.5 space-y-1">
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
                      'flex w-full items-center justify-between gap-2 rounded-lg border px-2.5 py-1.5 text-left text-[0.75rem]',
                      active
                        ? 'border-reel/40 bg-reel-soft/60 text-reel-dark'
                        : 'border-paper-line bg-white',
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

          <p className="mt-2 text-[0.6875rem] leading-relaxed text-ink-faint">
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
          className="mb-2 mt-1 text-[0.75rem] text-ink-soft underline decoration-paper-line"
        >
          {advanced ? '收起高级选项' : '自建反代 / 手动指定地址'}
        </button>
        {advanced && (
          <div className="space-y-3 border-t border-paper-line pt-3">
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

      {/* 番号刮削 */}
      <Group title="番号刮削">
        <ToggleRow
          label="启用番号刮削"
          desc="在隐私空间添加影片时，输入番号自动带出标题、封面、演员、片商。"
          value={settings.javEnabled}
          onChange={(v) => settings.set({ javEnabled: v })}
        />

        {settings.javEnabled && (
          <div className="mt-3 space-y-3 border-t border-paper-line pt-3">
            <div>
              <div className="mb-1.5 text-[0.75rem] font-medium text-ink-faint">刮削后端</div>
              <Segmented
                value={settings.javBackend}
                onChange={(v) => settings.set({ javBackend: v as 'proxy' | 'metatube' })}
                options={[
                  { value: 'proxy', label: '内置代理' },
                  { value: 'metatube', label: 'MetaTube' }
                ]}
              />
              <p className="mt-1 text-[0.75rem] leading-relaxed text-ink-faint">
                {settings.javBackend === 'proxy'
                  ? '内置 javdb / jav321 / dmm / avsox / mgstage / fc2 六源，逐个尝试、互相补位。'
                  : 'MetaTube 自带 20+ 家 provider，无码和小众片商命中率更高，需要你自己跑一个服务。'}
              </p>
            </div>

            <Field label="服务地址">
              <input
                value={javEndpointDraft}
                onChange={(e) => setJavEndpointDraft(e.target.value)}
                onBlur={() => settings.set({ javEndpoint: javEndpointDraft.trim() })}
                placeholder={
                  settings.javBackend === 'proxy'
                    ? 'https://jav.yourdomain.com'
                    : 'http://127.0.0.1:8080'
                }
                className={inputCls}
              />
            </Field>

            <Field label="访问令牌（可选）">
              <input
                value={javTokenDraft}
                onChange={(e) => setJavTokenDraft(e.target.value)}
                onBlur={() => settings.set({ javToken: javTokenDraft.trim() })}
                placeholder="服务设了口令才需要填"
                className={inputCls}
              />
            </Field>

            {settings.javBackend === 'proxy' ? (
              <div>
                <div className="mb-1.5 text-[0.75rem] font-medium text-ink-faint">
                  数据源（按优先级，至少留一个）
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {JAV_SOURCES.map((s) => {
                    const on = settings.javSources.includes(s.id)
                    return (
                      <button
                        key={s.id}
                        onClick={() => toggleJavSource(s.id)}
                        title={s.note}
                        className={clsx(
                          'rounded-full border px-2.5 py-1 text-[0.75rem] transition-colors',
                          on
                            ? 'border-reel/40 bg-reel-soft/60 text-reel-dark'
                            : 'border-paper-line bg-white text-ink-faint'
                        )}
                      >
                        {s.label}
                        {!s.cn && ' · 境外'}
                      </button>
                    )
                  })}
                </div>
                <p className="mt-1 text-[0.75rem] text-ink-faint">
                  标「境外」的站需要你的服务部署在境外；境内节点建议只留 JavDB 与 Jav321。
                </p>
              </div>
            ) : (
              <Field label="指定 provider（可选）">
                <input
                  value={javProviderDraft}
                  onChange={(e) => setJavProviderDraft(e.target.value)}
                  onBlur={() => settings.set({ javProvider: javProviderDraft.trim() })}
                  placeholder="留空由 MetaTube 自选，如 javdb / dmm / fc2"
                  className={inputCls}
                />
              </Field>
            )}

            <ToggleRow
              label="补全简介"
              desc="JavDB 自身没有简介，开启后会再问 DMM 等站补齐（需要节点能出网）。"
              value={settings.javEnrich}
              onChange={(v) => settings.set({ javEnrich: v })}
            />
            <ToggleRow
              label="封面下载后存本地"
              desc="经代理下载并存入本地库，离线可看；关掉则只记住远程地址。"
              value={settings.javImageProxy}
              onChange={(v) => settings.set({ javImageProxy: v })}
            />

            <div>
              <div className="mb-1.5 text-[0.75rem] font-medium text-ink-faint">标题语言</div>
              <Segmented
                value={settings.javTitleLang}
                onChange={(v) =>
                  settings.set({ javTitleLang: v as 'translated' | 'original' })
                }
                options={[
                  { value: 'translated', label: '中文译名' },
                  { value: 'original', label: '日文原名' }
                ]}
              />
            </div>

            <Button
              variant="outline"
              className="w-full"
              disabled={javTesting}
              onClick={() => void runJavTest()}
            >
              <Icon name="refresh" size={15} /> {javTesting ? '测试中…' : '测试连接'}
            </Button>

            {javTest && (
              <div className="rounded-xl border border-paper-line bg-paper/60 p-3 text-[0.75rem]">
                <div className={clsx('font-medium', javTest.ok ? 'text-moss' : 'text-reel')}>
                  {javTest.ok ? `可用（${javTest.ms}ms）` : `不可用：${javTest.message}`}
                </div>
                {javTest.providers.length > 0 && (
                  <div className="mt-1.5 flex flex-wrap gap-1">
                    {javTest.providers.map((p) => (
                      <span
                        key={p}
                        className="rounded-md bg-white px-1.5 py-0.5 font-mono text-[0.6875rem] text-ink-soft"
                      >
                        {p}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            )}

            <div className="rounded-xl border border-reel/25 bg-reel-soft/60 p-3 text-[0.75rem] leading-relaxed text-ink-soft">
              <div className="mb-1 font-medium text-reel-dark">使用前必读</div>
              浏览器有跨域限制，抓不了这些站点，所以抓取发生在你<strong>自己部署的服务</strong>里：
              <div className="mt-1.5 font-mono text-[0.6875rem]">
                node workers/jav-proxy.mjs
                <br />
                # 或 Cloudflare Worker：cd workers && npx wrangler deploy --config
                wrangler-jav.toml
                <br />
                # 或 MetaTube：docker run -d -p 8080:8080 metatube/metatube
              </div>
              <div className="mt-1.5 text-ink-faint">
                启用后输入的番号会发往你填的地址，请只填自己的服务。刮削只取元数据，不含任何下载或播放链接。
              </div>
            </div>
          </div>
        )}
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
          影匣 ReelVault v{APP_VERSION}
        </button>

        <div className="mt-4 flex items-center justify-center gap-3">
          <button
            onClick={() => window.open(RELEASES_URL, '_blank', 'noopener,noreferrer')}
            className="flex items-center gap-1.5 rounded-full border border-paper-line bg-white px-3 py-1.5 text-[0.75rem] text-ink-soft active:bg-paper"
            title="打开 GitHub 仓库"
          >
            <Icon name="github" size={15} /> GitHub
          </button>
          <a
            href={AUTHOR_MAIL}
            className="flex items-center gap-1.5 rounded-full border border-paper-line bg-white px-3 py-1.5 text-[0.75rem] text-ink-soft active:bg-paper"
            title="给作者发邮件"
          >
            <Icon name="mail" size={15} /> by 赵大阳
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
