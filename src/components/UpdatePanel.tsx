import { useCallback, useEffect, useState } from 'react'
import clsx from 'clsx'
import Icon from './Icon'
import { toast } from './Toast'
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

  return (
    <section className="mt-5 rounded-2xl border border-paper-line bg-white p-4">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="text-[0.75rem] font-medium uppercase tracking-wide text-ink-faint">检查更新</h2>
        <button
          onClick={() => void run(false)}
          disabled={checking}
          className="flex shrink-0 items-center gap-1 rounded-full border border-paper-line px-2.5 py-1 text-[0.75rem] text-ink-soft active:bg-paper disabled:opacity-50"
        >
          <Icon name="refresh" size={13} className={clsx(checking && 'animate-spin')} />
          {checking ? '检查中…' : '检查更新'}
        </button>
      </div>

      <div className="flex items-baseline justify-between gap-2">
        <div className="text-[0.875rem]">
          当前版本 <span className="font-semibold tabular-nums">v{APP_VERSION}</span>
        </div>
        {lastAt && (
          <div className="text-[0.6875rem] text-ink-faint">
            上次检查 {formatDate(lastAt.toISOString())}
          </div>
        )}
      </div>

      {/* 有新版本 */}
      {info && (
        <div className="mt-3 rounded-xl border border-reel/30 bg-reel-soft p-3">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-1.5">
              <span className="rounded-md bg-reel px-1.5 py-0.5 text-[0.6875rem] font-semibold text-white">
                NEW
              </span>
              <span className="text-[0.9375rem] font-semibold tabular-nums">v{info.version}</span>
            </div>
            {info.publishedAt && (
              <span className="text-[0.6875rem] text-ink-faint">{formatDate(info.publishedAt)}</span>
            )}
          </div>

          {info.name && info.name !== `v${info.version}` && (
            <div className="mt-1 text-[0.8125rem] font-medium">{info.name}</div>
          )}

          {info.notes && (
            <div className="mt-2">
              <button
                onClick={() => setShowNotes((v) => !v)}
                className="text-[0.75rem] text-reel-dark underline decoration-reel/30"
              >
                {showNotes ? '收起更新说明' : '查看更新说明'}
              </button>
              {showNotes && (
                <pre className="mt-1.5 max-h-56 overflow-auto whitespace-pre-wrap break-words font-sans text-[0.75rem] leading-relaxed text-ink-soft">
                  {info.notes}
                </pre>
              )}
            </div>
          )}

          {info.apk && (
            <div className="mt-2 text-[0.6875rem] text-ink-faint">
              {info.apk.name} · {formatSize(info.apk.size)}
            </div>
          )}
        </div>
      )}

      {/* 状态提示 */}
      {result?.kind === 'latest' && (
        <p className="mt-2.5 text-[0.75rem] text-moss">已是最新版本，无需更新。</p>
      )}
      {result?.kind === 'error' && (
        <p className="mt-2.5 text-[0.75rem] leading-relaxed text-ink-faint">
          检查失败（{result.message}）。GitHub 在国内可能连不上，可以直接用下面的网盘下载最新版。
        </p>
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
          />
        ))}
      </div>

      <button
        onClick={() => window.open(RELEASES_URL, '_blank', 'noopener,noreferrer')}
        className="mt-2 text-[0.6875rem] text-ink-faint underline decoration-paper-line"
      >
        查看全部历史版本
      </button>
    </section>
  )
}

function SourceRow({
  source,
  copied,
  onCopy,
  onOpen
}: {
  source: DownloadSource
  copied: string | null
  onCopy: (text: string) => void
  onOpen: () => void
}) {
  return (
    <div className="rounded-xl border border-paper-line bg-paper/60 p-2.5">
      <div className="flex items-center gap-2">
        <span className={clsx('h-2 w-2 shrink-0 rounded-full', source.dot)} />
        <span className="min-w-0 flex-1">
          <span className="text-[0.8125rem] font-medium">{source.name}</span>
          <span className="ml-1.5 text-[0.6875rem] text-ink-faint">{source.desc}</span>
        </span>
      </div>

      <div className="mt-2 flex gap-1.5">
        <button
          onClick={onOpen}
          className="flex flex-1 items-center justify-center gap-1 rounded-lg bg-ink px-2.5 py-1.5 text-[0.75rem] font-medium text-white active:opacity-90"
        >
          <Icon name="download" size={13} /> 打开下载
        </button>
        <button
          onClick={() => onCopy(source.code ? `${source.url} 提取码: ${source.code}` : source.url)}
          className="flex items-center justify-center gap-1 rounded-lg border border-paper-line bg-white px-2.5 py-1.5 text-[0.75rem] active:bg-paper"
        >
          <Icon name={copied === source.id ? 'check' : 'share'} size={13} />
          {copied === source.id ? '已复制' : '复制链接'}
        </button>
      </div>

      {source.code && (
        <div className="mt-1.5 flex items-center justify-between gap-2 rounded-lg bg-white px-2 py-1.5">
          <span className="text-[0.75rem] text-ink-soft">
            提取码 <span className="font-mono font-semibold tracking-wider">{source.code}</span>
          </span>
          <button onClick={() => onCopy(source.code!)} className="text-[0.6875rem] text-reel">
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
