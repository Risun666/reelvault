/**
 * 应用更新检查
 *
 * 数据源：GitHub Releases API。国内访问不畅时会在几个公开镜像之间自动降级。
 * 下载渠道固定为三个：GitHub、百度网盘、夸克网盘。
 *
 * 注意：APK 里 WebView 一样能发 fetch，所以手机端也能检查更新。
 */

/** 当前应用版本，改这里 + android/app/build.gradle 的 versionName */
export const APP_VERSION = '1.2.0'

export const REPO_OWNER = 'Risun666'
export const REPO_NAME = 'reelvault'

export const RELEASES_URL = `https://github.com/${REPO_OWNER}/${REPO_NAME}/releases`
/** 作者邮箱，设置页页脚跳转 */
export const AUTHOR_MAIL = 'mailto:3073020053@qq.com'
export const LATEST_RELEASE_URL = `https://github.com/${REPO_OWNER}/${REPO_NAME}/releases/latest`

export interface DownloadSource {
  id: string
  name: string
  desc: string
  url: string
  /** 网盘提取码 */
  code?: string
  /** 左侧圆点的颜色类名 */
  dot: string
}

export const DOWNLOAD_SOURCES: DownloadSource[] = [
  {
    id: 'github',
    name: 'GitHub Releases',
    desc: '官方仓库，每次打 tag 自动构建签名包',
    url: LATEST_RELEASE_URL,
    dot: 'bg-ink'
  },
  {
    id: 'baidu',
    name: '百度网盘',
    desc: '国内下载更快，需要提取码',
    url: 'https://pan.baidu.com/s/1JUK0rsdoY91RbHobr2JLlQ?pwd=4wjf',
    code: '4wjf',
    dot: 'bg-reel'
  },
  {
    id: 'quark',
    name: '夸克网盘',
    desc: '复制整段内容，用夸克网盘 APP 打开',
    url: 'https://pan.quark.cn/s/36d68dbdb221',
    dot: 'bg-moss'
  }
]

const API_CANDIDATES = [
  `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/releases/latest`,
  `https://gh-proxy.com/https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/releases/latest`,
  `https://ghproxy.net/https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/releases/latest`
]

export interface UpdateAsset {
  name: string
  url: string
  size?: number
}

export interface UpdateInfo {
  version: string
  /** Release 标题 */
  name: string
  notes: string
  publishedAt?: string
  htmlUrl: string
  apk?: UpdateAsset
}

export type CheckResult =
  | { kind: 'latest'; checkedAt: number }
  | { kind: 'available'; info: UpdateInfo; checkedAt: number }
  | { kind: 'error'; message: string; checkedAt: number }

const CACHE_KEY = 'rv.update.v1'
/** 自动检查的节流窗口 */
export const AUTO_CHECK_INTERVAL = 12 * 60 * 60 * 1000

interface ReleasePayload {
  tag_name?: string
  name?: string
  body?: string
  published_at?: string
  html_url?: string
  assets?: Array<{ name?: string; browser_download_url?: string; size?: number }>
}

async function fetchJson(url: string, timeoutMs: number): Promise<ReleasePayload> {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), timeoutMs)
  try {
    const res = await fetch(url, {
      signal: ctrl.signal,
      headers: { Accept: 'application/vnd.github+json' },
      cache: 'no-store'
    })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const data = (await res.json()) as ReleasePayload
    if (!data || typeof data !== 'object' || !data.tag_name) throw new Error('返回内容不是 Release 数据')
    return data
  } finally {
    clearTimeout(timer)
  }
}

/** 依次尝试各节点；前一个 3.5s 没回来就并行打下一个 */
async function fetchLatestRelease(): Promise<ReleasePayload> {
  let pending = 0
  let lastError: unknown = null
  return new Promise<ReleasePayload>((resolve, reject) => {
    let settled = false
    const done = (payload: ReleasePayload) => {
      if (settled) return
      settled = true
      resolve(payload)
    }
    const fail = (err: unknown) => {
      lastError = err
      pending -= 1
      if (pending === 0 && !settled) {
        settled = true
        reject(lastError instanceof Error ? lastError : new Error('网络不可达'))
      }
    }

    API_CANDIDATES.forEach((url, index) => {
      const start = () => {
        pending += 1
        fetchJson(url, 12_000)
          .then(done)
          .catch(fail)
      }
      if (index === 0) start()
      else setTimeout(start, 3500 * index)
    })
  })
}

/** 比较语义化版本：a > b 返回正数 */
export function compareVersion(a: string, b: string): number {
  const pa = normalize(a)
  const pb = normalize(b)
  const len = Math.max(pa.length, pb.length)
  for (let i = 0; i < len; i += 1) {
    const x = pa[i] ?? 0
    const y = pb[i] ?? 0
    if (x !== y) return x - y
  }
  return 0
}

function normalize(v: string): number[] {
  return v
    .trim()
    .replace(/^v/i, '')
    .split(/[.\-+]/)
    .map((part) => {
      const n = Number.parseInt(part, 10)
      return Number.isFinite(n) ? n : 0
    })
}

function pickApk(assets: ReleasePayload['assets']): UpdateAsset | undefined {
  if (!assets?.length) return undefined
  const apks = assets.filter((a) => a.name?.toLowerCase().endsWith('.apk'))
  if (!apks.length) return undefined
  const preferred = apks.find((a) => a.name?.includes('release')) ?? apks[0]
  if (!preferred?.browser_download_url) return undefined
  return {
    name: preferred.name ?? 'app-release.apk',
    url: preferred.browser_download_url,
    size: preferred.size
  }
}

function toInfo(data: ReleasePayload): UpdateInfo {
  return {
    version: (data.tag_name ?? '').replace(/^v/i, ''),
    name: (data.name ?? data.tag_name ?? '').trim(),
    notes: (data.body ?? '').trim(),
    publishedAt: data.published_at,
    htmlUrl: data.html_url ?? LATEST_RELEASE_URL,
    apk: pickApk(data.assets)
  }
}

export async function checkUpdate(): Promise<CheckResult> {
  const checkedAt = Date.now()
  try {
    const data = await fetchLatestRelease()
    const info = toInfo(data)
    if (!info.version || compareVersion(info.version, APP_VERSION) <= 0) {
      const result: CheckResult = { kind: 'latest', checkedAt }
      saveCache({ kind: 'latest', checkedAt })
      return result
    }
    const result: CheckResult = { kind: 'available', info, checkedAt }
    saveCache({ kind: 'available', info, checkedAt })
    return result
  } catch (e) {
    const message = e instanceof Error ? e.message : '未知错误'
    const result: CheckResult = { kind: 'error', message, checkedAt }
    saveCache({ kind: 'error', message, checkedAt })
    return result
  }
}

export interface UpdateCache {
  at: number
  kind: 'latest' | 'available' | 'error'
  message?: string
  info?: UpdateInfo
}

function saveCache(result: CheckResult) {
  try {
    const cache: UpdateCache = {
      at: result.checkedAt,
      kind: result.kind,
      message: result.kind === 'error' ? result.message : undefined,
      info: result.kind === 'available' ? result.info : undefined
    }
    localStorage.setItem(CACHE_KEY, JSON.stringify(cache))
  } catch {
    /* 隐私模式下忽略 */
  }
}

export function readCache(): UpdateCache | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as UpdateCache
    if (typeof parsed?.at !== 'number' || !parsed.kind) return null
    return parsed
  } catch {
    return null
  }
}

/** 把缓存还原成检查结果，供界面首屏直接显示 */
export function resultFromCache(): CheckResult | null {
  const cache = readCache()
  if (!cache) return null
  if (cache.kind === 'latest') return { kind: 'latest', checkedAt: cache.at }
  if (cache.kind === 'error')
    return { kind: 'error', message: cache.message ?? '未知错误', checkedAt: cache.at }
  if (cache.kind === 'available' && cache.info)
    return { kind: 'available', info: cache.info, checkedAt: cache.at }
  return null
}

/** 距上次检查是否已超过节流窗口 */
export function shouldAutoCheck(): boolean {
  const cache = readCache()
  if (!cache) return true
  return Date.now() - cache.at > AUTO_CHECK_INTERVAL
}

export function formatSize(bytes?: number): string {
  if (!bytes) return ''
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`
}

export function formatDate(iso?: string): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
