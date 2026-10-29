#!/usr/bin/env node
/**
 * 刮削内核自检（不依赖 HTTP 服务，直接打站点）
 *
 *   node scripts/jav-smoke.mjs SSNI-589
 *   node scripts/jav-smoke.mjs SSNI-589 --src=javdb,jav321
 *   node scripts/jav-smoke.mjs "[abc] SSNI-589 三上悠亜.mp4"
 */

import { scrape, normalizeCode, extractCodes, SOURCES } from '../workers/jav-scraper.mjs'

const args = process.argv.slice(2)
const srcArg = args.find((a) => a.startsWith('--src='))
const input = args.filter((a) => !a.startsWith('--'))[0] ?? 'SSNI-589'
const sources = srcArg ? srcArg.slice(6).split(',') : undefined

if (!sources) {
  console.log('可用数据源：')
  for (const s of SOURCES) console.log(`  ${s.id.padEnd(9)} ${s.label.padEnd(14)} ${s.cn ? '境内多可直连' : '需境外节点'} — ${s.note}`)
}

console.log('\n番号规范化：', normalizeCode(input))
console.log('文本提取：', extractCodes(input))

const started = Date.now()
try {
  const r = await scrape(input, sources ? { sources } : undefined)
  console.log(`\n耗时 ${Date.now() - started}ms`)
  console.log(JSON.stringify(r, null, 2))
} catch (err) {
  console.log(`\n耗时 ${Date.now() - started}ms`)
  console.error('刮削失败：', err instanceof Error ? err.message : err)
  process.exitCode = 1
}
