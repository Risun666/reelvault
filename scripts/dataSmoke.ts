/**
 * 数据层冒烟测试：IndexedDB 读写 → 备份导出（隐私区加密）→ 重新导入
 * 运行：node scripts/dataSmoke.mjs（由 esbuild 打包后执行）
 */
import 'fake-indexeddb/auto'
import {
  listCollections,
  listPeople,
  listTitles,
  putTitle,
  putPoster,
  putCollection,
  putPerson,
  removeCollection,
  removePerson,
  clearZone,
  getMeta,
  setMeta
} from '../src/lib/db'
import { buildBackup, importBackup } from '../src/lib/backup'
import { computeStats, watchedEpisodesOf } from '../src/lib/stats'
import { createPinRecord, verifyPin } from '../src/lib/crypto'
import type { Collection, Person, TitleItem } from '../src/types'

function makeTitle(id: string, patch: Partial<TitleItem> = {}): TitleItem {
  const now = new Date().toISOString()
  return {
    id,
    kind: 'movie',
    title: `影片 ${id}`,
    tags: ['测试'],
    status: 'done',
    runtime: 120,
    createdAt: now,
    updatedAt: now,
    source: 'manual',
    ...patch
  }
}

function assert(cond: unknown, msg: string) {
  if (!cond) throw new Error('断言失败：' + msg)
  console.log('  ✓', msg)
}

async function run() {
  // 清场，保证可重复运行
  for (const c of await listCollections()) await removeCollection(c.id)
  for (const z of ['library', 'vault'] as const) {
    for (const p of await listPeople(z)) await removePerson(z, p.id)
  }
  await clearZone('library')
  await clearZone('vault')

  console.log('1) 主库写入 / 读取')
  await putTitle('library', makeTitle('a1'))
  await putTitle('library', makeTitle('a2', { kind: 'tv', status: 'watching' }))
  await putTitle('library', makeTitle('a3', {
    kind: 'tv',
    status: 'watching',
    episodeRuntime: 45,
    progress: { season: 2, episode: 3, episodesInSeason: { 1: 10, 2: 12 } }
  }))
  const lib = await listTitles('library')
  assert(lib.length === 3, `主库 3 条（实际 ${lib.length}）`)
  assert(watchedEpisodesOf(lib.find((i) => i.id === 'a3')!.progress) === 13, '剧集累计集数推算 = 13')

  console.log('2) 封面 Blob 存取')
  await putPoster('library', 'a1', new Blob([new Uint8Array([1, 2, 3])], { type: 'image/jpeg' }))
  const { getPosterBlob } = await import('../src/lib/db')
  const blob = await getPosterBlob('library', 'a1')
  assert(blob && blob.size === 3, '封面 Blob 写入并可读回')

  console.log('3) 隐私区独立存储')
  await putTitle('vault', makeTitle('v1', { title: '隐私条目' }))
  const vault = await listTitles('vault')
  assert(vault.length === 1 && vault[0].title === '隐私条目', '隐私区独立可写')
  assert((await listTitles('library')).every((i) => i.title !== '隐私条目'), '隐私条目不出现在主库')

  console.log('3.5) 片单合集')
  await putCollection({
    id: 'col-1',
    title: '夏日补完计划',
    note: '把没看完的补齐',
    zone: 'library',
    itemIds: ['a1', 'a3'],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  })
  await putCollection({
    id: 'col-2',
    title: '隐私清单',
    zone: 'vault',
    itemIds: ['v1'],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  })
  const cols = await listCollections()
  assert(cols.length === 2, '片单写入 2 个')
  assert(cols.find((c) => c.id === 'col-1')!.itemIds.length === 2, '片单成员顺序写入')

  console.log('4) PIN 哈希校验')
  const rec = await createPinRecord('2468')
  await setMeta('vault', 'vault.pin', rec)
  assert(await verifyPin('2468', rec), '正确 PIN 通过')
  assert(!(await verifyPin('1357', rec)), '错误 PIN 拒绝')
  assert(!JSON.stringify(rec).includes('2468'), 'PIN 明文未落盘')

  console.log('5) 导出备份（含加密隐私区）')
  const backup = await buildBackup({ posters: false, vaultMode: 'encrypted', pin: '2468' })
  assert(backup.library.length === 3, '备份包含 3 条公开记录')
  assert(backup.collections.length === 1, '备份只含公开片单（1 个）')
  assert(
    !JSON.stringify(backup.collections).includes('隐私清单'),
    '备份的公开片单里不含隐私片单标题'
  )
  const vaultPart = backup.vault as { encrypted: boolean; cipher: string }
  assert(vaultPart.encrypted === true, '隐私区已加密')
  assert(!JSON.stringify(vaultPart).includes('隐私条目'), '密文不含明文标题')

  console.log('6) 清库后重新导入')
  await clearZone('library')
  await clearZone('vault')
  for (const c of await listCollections()) await removeCollection(c.id)
  const res = await importBackup(JSON.stringify(backup), '2468')
  assert(res.added === 3, `公开片库恢复 3 条（实际 ${res.added}）`)
  assert(res.vault?.added === 1, '隐私区恢复 1 条')
  assert(res.collections === 1, '公开片单恢复 1 个')
  assert(res.vault?.collections === 1, '隐私片单恢复 1 个')
  const restored = await listCollections()
  assert(restored.some((c) => c.zone === 'vault' && c.title === '隐私清单'), '隐私片单归属正确')
  assert((await listTitles('vault'))[0]?.title === '隐私条目', '隐私内容解密正确')

  console.log('7) 错误 PIN 解密应失败')
  await clearZone('vault')
  let failed = false
  try {
    await importBackup(JSON.stringify(backup), '0000')
  } catch (e) {
    failed = String(e).includes('PIN')
  }
  assert(failed, '错误 PIN 拒绝解密')

  console.log('8) 统计')
  const stats = computeStats(await listTitles('library'))
  assert(stats.total === 3 && stats.movies === 1 && stats.tvs === 2, '统计数量正确')
  assert(stats.minutes > 0, `累计时长 > 0（${stats.minutes} 分钟）`)
  assert(stats.byStatus.done === 1, '状态分布正确')

  console.log('9) 演员：两区隔离')
  const now = new Date().toISOString()
  const mk = (id: string, name: string, titleIds: string[]): Person => ({
    id,
    name,
    titleIds,
    source: 'manual',
    createdAt: now,
    updatedAt: now
  })
  await putPerson('library', mk('p-lib', '公开区演员', ['a1']))
  await putPerson('vault', mk('p-vault', '隐私区演员', ['v1']))

  const libPeople = await listPeople('library')
  const vaultPeopleAfter = await listPeople('vault')
  assert(libPeople.some((p) => p.name === '公开区演员'), '公开区演员写入成功')
  assert(vaultPeopleAfter.some((p) => p.name === '隐私区演员'), '隐私区演员写入成功')
  assert(
    !libPeople.some((p) => p.name === '隐私区演员'),
    '公开区演员表里不含隐私区演员'
  )
  assert(
    !vaultPeopleAfter.some((p) => p.name === '公开区演员'),
    '隐私区演员表里不含公开区演员'
  )

  console.log('10) 演员：清空片库不影响隐私区')
  await clearZone('library')
  assert((await listPeople('library')).length === 0, '公开区演员随片库清空')
  assert(
    (await listPeople('vault')).some((p) => p.name === '隐私区演员'),
    '清空公开片库后隐私区演员仍在'
  )

  console.log('11) 元数据键值')
  const pin = await getMeta<{ hash?: string } | null>('vault', 'vault.pin', null)
  assert(Boolean(pin?.hash), 'PIN 记录持久化')

  console.log('\n全部通过 ✅')
}

run().catch((e) => {
  console.error('\n❌ 冒烟测试失败：', e)
  process.exit(1)
})
