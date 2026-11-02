import { useCallback, useEffect, useState } from 'react'
import clsx from 'clsx'
import Icon from './Icon'
import { Button } from './ui'
import { toast } from './Toast'
import { isAndroid, downloadApkAndInstall, onDownloadProgress } from '../lib/native'
import {
  APP_VERSION,
  DOWNLOAD_SOURCES,
  RELEASES_URL,
  checkUpdate,
  formatDate,
  formatSize,
  resultFromCache,
  shouldAutoCheck,
  type CheckResult,
  type DownloadSource
} from '../lib/updater'

export default function UpdatePanel() {
  const [result, setResult] = useState<CheckResult | null>(resultFromCache)
  const [checking, setChecking] = useState(false)
  const [copied, setCopied] = useState<string | null>(null)
  const [showNotes, setShowNotes] = useState(false)
  const [dl, setDl] = useState<{ state: string; progress: number; message: string } | null>(null)

  // 订阅应用内下载进度
  useEffect(() => onDownloadProgress((e) => setDl(e)), [])

  const run = useCallback(async (silent: boolean) => {
    if (checking) return
    setChecking(true)
    const res = await checkUpdate()
    setResult(res)
    setChecking(false)
    if (!silent) {
      if (res.kind === 'available') toast(`发现新版本 v${res.info.version}`, 'good')
      else if (res.kind === 'latest') toast('已经是最新版本', 'good')
      else toast(`检查失败：${res.message}`, 'bad')
    }
  }, [checking])

  // 进入设置页时静默检查一次，12 小时内不重复
  useEffect(() => {
    if (shouldAutoCheck()) void run(true)
  }, [run])

  const copy = async (text: string, id: string) => {
    const ok = await copyText(text)
    if (ok) {
      setCopied(id)
      window.setTimeout(() => setCopied(null), 1800)
      toast('已复制', 'good')
    } else {
      toast('复制失败，请长按链接手动复制', 'bad')
    }
  }

  const info = result?.kind === 'available' ? result.info : null
  const lastAt = result ? new Date(result.checkedAt) : null

  // 安卓下，GitHub 渠道改用「App 内下载并自动安装」
  const handleInAppDownload = async () => {
    if (!info?.apk) return
    try {
      await downloadApkAndInstall(info.apk.url, `影匣 v${info.version}`)
    } catch (e) {
      setDl({
        state: 'error',
        progress: 0,
        message: `启动下载失败：${e instanceof Error ? e.message : String(e)}`
      })
    }
  }

  return (
    <section
      className="animate-staggerIn mb-4 overflow-hidden rounded-2xl border border-paper-line bg-paper-card shadow-e1"
      style={{ animationDelay: '0ms' }}
    >
      <div className="flex items-center justify-between gap-3 border-b border-paper-line px-4 py-3">
        <h2 className="text-label font-semibold text-ink-faint">检查更新</h2>
        <Button variant="tonal" onClick={() => void run(false)} disabled={checking}>
          <Icon name="refresh" size={15} className={clsx(checking && 'animate-spin')} />
          {checking ? '检查中…' : '检查更新'}
        </Button>
      </div>

      <div className="px-4 py-3">
        <div className="flex items-baseline justify-between gap-2">
          <div className="text-body-sm text-ink-soft">
            当前版本 <span className="font-semibold tabular-nums text-ink">v{APP_VERSION}</span>
          </div>
          {lastAt && (
            <div className="shrink-0 text-micro text-ink-faint">
              上次检查 {formatDate(lastAt.toISOString())}
            </div>
          )}
        </div>

        {/* 有新版本 */}
        {info && (
          <div className="animate-popIn mt-3 rounded-xl border border-reel/30 bg-reel-soft p-3.5">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <span className="rounded-lg bg-reel px-2 py-0.5 text-micro font-semibold text-reel-on">
                  NEW
                </span>
                <span className="text-title font-semibold tabular-nums text-ink">
                  v{info.version}
                </span>
              </div>
              {info.publishedAt && (
                <span className="shrink-0 text-micro text-ink-faint">
                  {formatDate(info.publishedAt)}
                </span>
              )}
            </div>

            {info.name && info.name !== `v${info.version}` && (
              <div className="mt-1.5 text-body-sm font-medium text-ink">{info.name}</div>
            )}

            {info.notes && (
              <div className="mt-1">
                <button
                  onClick={() => setShowNotes((v) => !v)}
                  className="pressable flex min-h-touch items-center gap-1 text-caption font-medium text-reel-dark"
                >
                  <Icon
                    name="chevronRight"
                    size={12}
                    className={clsx(
                      'transition-transform ease-spring duration-2',
                      showNotes && 'rotate-90'
                    )}
                  />
                  {showNotes ? '收起更新说明' : '查看更新说明'}
                </button>
                {showNotes && (
                  <pre className="mt-1 max-h-56 overflow-auto whitespace-pre-wrap break-words rounded-xl bg-paper-card p-3 font-sans text-caption leading-relaxed text-ink-soft">
                    {info.notes}
                  </pre>
                )}
              </div>
            )}

            {info.apk && (
              <div className="mt-2 text-micro text-ink-faint">
                {info.apk.name} · {formatSize(info.apk.size)}
              </div>
            )}
          </div>
        )}

        {/* 状态提示 */}
        {result?.kind === 'latest' && (
          <div className="mt-3 flex items-center gap-2 rounded-xl bg-paper-sunken px-3 py-2.5 text-caption text-moss">
            <Icon name="check" size={14} />
            已是最新版本，无需更新。
          </div>
        )}
        {result?.kind === 'error' && (
          <p className="mt-3 rounded-xl bg-paper-sunken px-3 py-2.5 text-caption leading-relaxed text-ink-faint">
            检查失败（{result.message}）。GitHub 在国内可能连不上，可以直接用下面的网盘下载最新版。
          </p>
        )}

        {/* 应用内下载进度 */}
        {dl && (dl.state === 'downloading' || dl.state === 'installing') && (
          <div className="mt-3 animate-popIn rounded-xl border border-reel/30 bg-reel-soft p-3.5">
            <div className="flex items-center justify-between gap-2">
              <span className="text-body-sm font-medium text-reel-dark">{dl.message}</span>
              {dl.state === 'downloading' && (
                <span className="shrink-0 text-micro tabular-nums text-reel-dark">{dl.progress}%</span>
              )}
            </div>
            <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-reel/20">
              <div
                className="h-full rounded-full bg-reel transition-all duration-300 ease-standard"
                style={{ width: `${Math.max(4, dl.progress)}%` }}
              />
            </div>
          </div>
        )}
        {dl && dl.state === 'error' && (
          <div className="mt-3 rounded-xl bg-paper-sunken px-3 py-2.5 text-caption leading-relaxed text-danger">
            {dl.message}
          </div>
        )}

        {/* 下载渠道 */}
        <div className="mt-3 space-y-2">
          {DOWNLOAD_SOURCES.map((s) => (
            <SourceRow
              key={s.id}
              source={s}
              copied={copied}
              onCopy={(text) => void copy(text, s.id)}
              onOpen={() => window.open(s.url, '_blank', 'noopener,noreferrer')}
              primary={
                isAndroid && s.id === 'github' && info?.apk
                  ? {
                      label: 'App 内下载安装',
                      hint: '将通过系统后台下载，完成后自动弹出安装；若未自动弹出，可在通知栏点击「影匣 更新已就绪」。',
                      onClick: () => void handleInAppDownload()
                    }
                  : undefined
              }
            />
          ))}
        </div>

        <button
          onClick={() => window.open(RELEASES_URL, '_blank', 'noopener,noreferrer')}
          className="pressable mt-1 flex min-h-touch w-full items-center justify-center text-caption text-ink-faint"
        >
          查看全部历史版本
        </button>
      </div>
    </section>
  )
}

function SourceRow({
  source,
  copied,
  onCopy,
  onOpen,
  primary
}: {
  source: DownloadSource
  copied: string | null
  onCopy: (text: string) => void
  onOpen: () => void
  /** 安卓下覆盖「打开下载」按钮的更优动作（如 App 内下载安装） */
  primary?: { label: string; hint?: string; onClick: () => void }
}) {
  return (
    <div className="rounded-xl border border-paper-line bg-paper-sunken p-3">
      <div className="flex min-h-touch items-center gap-2.5">
        <span className={clsx('h-2.5 w-2.5 shrink-0 rounded-full', source.dot)} />
        <span className="min-w-0 flex-1">
          <span className="block text-body-sm font-medium text-ink">{source.name}</span>
          <span className="mt-0.5 block text-caption text-ink-faint">{source.desc}</span>
        </span>
      </div>

      <div className="mt-2.5 flex gap-2">
        <div className="flex-1">
          {primary ? (
            <Button className="w-full" onClick={primary.onClick}>
              <Icon name="download" size={15} /> {primary.label}
            </Button>
          ) : (
            <Button className="w-full" onClick={onOpen}>
              <Icon name="download" size={15} /> 打开下载
            </Button>
          )}
        </div>
        <Button
          variant="outline"
          onClick={() => onCopy(source.code ? `${source.url} 提取码: ${source.code}` : source.url)}
        >
          <Icon name={copied === source.id ? 'check' : 'share'} size={15} />
          {copied === source.id ? '已复制' : '复制链接'}
        </Button>
      </div>

      {primary?.hint && (
        <p className="mt-2 text-micro leading-relaxed text-ink-faint">{primary.hint}</p>
      )}

      {source.code && (
        <div className="mt-2 flex min-h-touch items-center justify-between gap-2 rounded-xl bg-paper-card px-3">
          <span className="text-caption text-ink-soft">
            提取码 <span className="font-mono font-semibold tracking-wider text-ink">{source.code}</span>
          </span>
          <button
            onClick={() => onCopy(source.code!)}
            className="pressable flex min-h-touch items-center text-caption font-medium text-reel-dark"
          >
            复制
          </button>
        </div>
      )}
    </div>
  )
}

async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text)
      return true
    }
  } catch {
    /* 继续走兜底 */
  }
  try {
    const ta = document.createElement('textarea')
    ta.value = text
    ta.setAttribute('readonly', '')
    ta.style.position = 'fixed'
    ta.style.opacity = '0'
    document.body.appendChild(ta)
    ta.select()
    const ok = document.execCommand('copy')
    document.body.removeChild(ta)
    return ok
  } catch {
    return false
  }
}
