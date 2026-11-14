/* 把 Vite 生产构建产物同步进鸿蒙 rawfile 目录
 * 用法：npm run harmony:sync（内部会先执行 npm run build）
 */
import { cpSync, rmSync, mkdirSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { execSync } from 'node:child_process'

const root = new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')
const dist = `${root}/dist`
const rawfile = `${root}/harmony/entry/src/main/resources/rawfile`

if (!existsSync(dist) || !existsSync(`${dist}/index.html`)) {
  console.error('未找到 dist/index.html，请先执行 npm run build')
  process.exit(1)
}

rmSync(rawfile, { recursive: true, force: true })
mkdirSync(rawfile, { recursive: true })
cpSync(dist, rawfile, { recursive: true })

// rawfile 里的资源通过 $rawfile('assets/xx') 相对 index.html 引用，
// vite base 为 './'，产物内已经是相对路径，直接可用。
console.log('已同步 dist ->', rawfile)

// 列出同步产物数量
const count = execSync(`ls -1 "${rawfile}" | wc -l`).toString().trim()
console.log(`rawfile 顶层条目：${count}`)
