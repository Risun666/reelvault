import { type Zone, getPosterBlob, listCollections, listTitles, putCollection, putPoster, putTitles } from './db'
import { blobToDataUrl, dataUrlToBlob } from './image'
import { deriveVaultKey, encryptJson, decryptJson, randomBytes, toB64 } from './crypto'
import type { Collection, TitleItem } from '../types'

export const BACKUP_APP = 'reelvault'
export const BACKUP_VERSION = 2

type ExportTitle = TitleItem & { posterData?: string }

export interface BackupFile {
  app: typeof BACKUP_APP
  version: number
  exportedAt: string
  options: { posters: boolean; vault: 'none' | 'encrypted' | 'plain' }
  library: ExportTitle[]
  collections: Collection[]
  vault?: unknown
}

export interface ExportOptions {
  posters: boolean
  vaultMode: 'none' | 'encrypted' | 'plain'
  pin?: string
}

async function collect(zone: Zone, posters: boolean): Promise<ExportTitle[]> {
  const titles = await listTitles(zone)
  if (!posters) return titles
  const out: ExportTitle[] = []
  for (const t of titles) {
    const blob = await getPosterBlob(zone, t.id)
    out.push(blob ? { ...t, posterData: await blobToDataUrl(blob) } : t)
  }
  return out
}

export async function buildBackup(opts: ExportOptions): Promise<BackupFile> {
  const library = await collect('library', opts.posters)
  const allCollections = await listCollections()
  const backup: BackupFile = {
    app: BACKUP_APP,
    version: BACKUP_VERSION,
    exportedAt: new Date().toISOString(),
    options: { posters: opts.posters, vault: opts.vaultMode },
    library,
    collections: allCollections.filter((c) => c.zone !== 'vault')
  }

  if (opts.vaultMode !== 'none') {
    const vtitles = await collect('vault', opts.posters)
    const vcollections = allCollections.filter((c) => c.zone === 'vault')
    const payload = { titles: vtitles, collections: vcollections }
    if (opts.vaultMode === 'encrypted') {
      if (!opts.pin) throw new Error('缺少 PIN，无法加密隐私区')
      const salt = toB64(randomBytes(16))
      const key = await deriveVaultKey(opts.pin, salt)
      backup.vault = { encrypted: true, salt, ...(await encryptJson(payload, key)) }
    } else {
      backup.vault = { encrypted: false, ...payload }
    }
  }
  return backup
}

export function downloadJson(data: unknown, filename: string) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
  triggerDownload(blob, filename)
}

export function downloadCsv(titles: TitleItem[], filename: string) {
  const headers = ['标题', '原名', '类型', '年份', '状态', '评分', '标签', '已看至', '观看日期', '备注']
  const esc = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`
  const statusMap: Record<string, string> = { wish: '想看', watching: '在看', done: '看过', dropped: '弃坑' }
  const rows = titles.map((t) =>
    [
      t.title,
      t.originalTitle,
      t.kind === 'tv' ? '剧集' : '电影',
      t.year,
      statusMap[t.status] ?? t.status,
      t.rating ? (t.rating / 2).toFixed(1) : '',
      (t.tags ?? []).join(' / '),
      t.progress ? `S${t.progress.season}E${t.progress.episode}` : '',
      t.watchedAt?.slice(0, 10) ?? '',
      t.review
    ]
      .map(esc)
      .join(',')
  )
  const csv = '﻿' + [headers.map(esc).join(','), ...rows].join('\r\n')
  triggerDownload(new Blob([csv], { type: 'text/csv;charset=utf-8' }), filename)
}

function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 4000)
}

export interface ImportResult {
  added: number
  updated: number
  posters: number
  collections: number
  vault?: { added: number; updated: number; collections: number }
  error?: string
}

async function ingest(zone: Zone, rows: ExportTitle[]): Promise<{ added: number; updated: number; posters: number }> {
  const existing = await listTitles(zone)
  const map = new Map(existing.map((t) => [t.id, t]))
  let added = 0
  let updated = 0
  let posters = 0
  const items: TitleItem[] = []

  for (const row of rows) {
    const { posterData, ...rest } = row
    const item: TitleItem = {
      ...rest,
      tags: rest.tags ?? [],
      hasLocalPoster: Boolean(posterData) || Boolean(rest.posterRemote)
    }
    if (posterData) {
      try {
        const blob = dataUrlToBlob(posterData)
        await putPoster(zone, item.id, blob)
        posters++
      } catch {
        /* 封面损坏忽略 */
      }
    }
    items.push(item)
    if (map.has(item.id)) updated++
    else added++
  }
  await putTitles(zone, items)
  return { added, updated, posters }
}

export async function importBackup(raw: string, pinForVault?: string): Promise<ImportResult> {
  let data: BackupFile
  try {
    data = JSON.parse(raw) as BackupFile
  } catch {
    throw new Error('文件不是合法的 JSON')
  }
  if (data.app !== BACKUP_APP) throw new Error('这不是影匣的备份文件')
  if (!Array.isArray(data.library)) throw new Error('备份内容不完整')

  const lib = await ingest('library', data.library)
  const result: ImportResult = { ...lib, collections: 0 }
  const incomingCollections = Array.isArray(data.collections) ? data.collections : []
  for (const c of incomingCollections) {
    await putCollection({ ...c, zone: 'library' })
    result.collections++
  }

  const v = data.vault as
    | { encrypted: true; salt: string; iv: string; cipher: string }
    | { encrypted: false; titles?: ExportTitle[]; collections?: Collection[] }
    | undefined

  if (v) {
    let vrows: ExportTitle[] = []
    let vcols: Collection[] = []
    if (v.encrypted) {
      if (!pinForVault) throw new Error('该备份的隐私区已加密，请输入 PIN 后重试')
      const key = await deriveVaultKey(pinForVault, v.salt)
      try {
        const payload = await decryptJson<{ titles: ExportTitle[]; collections?: Collection[] }>(
          { iv: v.iv, cipher: v.cipher },
          key
        )
        // 兼容旧版备份：密文直接是数组
        vrows = Array.isArray(payload) ? (payload as unknown as ExportTitle[]) : payload.titles ?? []
        vcols = Array.isArray(payload) ? [] : payload.collections ?? []
      } catch {
        throw new Error('PIN 不正确，隐私区解密失败（公开片库已导入）')
      }
    } else {
      vrows = v.titles ?? []
      vcols = v.collections ?? []
    }
    const res = await ingest('vault', vrows)
    for (const c of vcols) await putCollection({ ...c, zone: 'vault' })
    result.vault = { added: res.added, updated: res.updated, collections: vcols.length }
  }
  return result
}
