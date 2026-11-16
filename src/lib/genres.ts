import type { TitleItem } from '../types'

/* ==========================================================================
   题材分类（Genre）
   --------------------------------------------------------------------------
   TMDB 的中文类型名不稳定：电影侧是「动作」「科幻」，剧集侧会给「动作冒险」
   「科幻奇幻」，手动录入还可能写「动漫」「恐怖片」。所以这里做一层归一化：
   一张表把各种写法收敛到同一个 key，筛选只认 key。

   顺序即面板里的展示顺序（常用题材在前），实际渲染时再按片库数量重排。
   ========================================================================== */

export interface GenreDef {
  key: string
  label: string
  /** 命中任一别名即归入该题材（子串匹配，兼容「动作冒险」这种组合名） */
  match: string[]
}

export const GENRE_DEFS: GenreDef[] = [
  { key: 'action', label: '动作', match: ['动作'] },
  { key: 'animation', label: '动画', match: ['动画', '动漫'] },
  { key: 'comedy', label: '喜剧', match: ['喜剧'] },
  { key: 'crime', label: '犯罪', match: ['犯罪'] },
  { key: 'documentary', label: '纪录片', match: ['纪录'] },
  { key: 'horror', label: '恐怖', match: ['恐怖', '惊悚片'] },
  { key: 'scifi', label: '科幻', match: ['科幻'] },
  { key: 'mystery', label: '悬疑', match: ['悬疑', '推理'] },
  { key: 'thriller', label: '惊悚', match: ['惊悚'] },
  { key: 'romance', label: '爱情', match: ['爱情', '恋爱', '言情'] },
  { key: 'drama', label: '剧情', match: ['剧情'] },
  { key: 'adventure', label: '冒险', match: ['冒险'] },
  { key: 'fantasy', label: '奇幻', match: ['奇幻', '魔幻'] },
  { key: 'family', label: '家庭', match: ['家庭'] },
  { key: 'war', label: '战争', match: ['战争'] },
  { key: 'history', label: '历史', match: ['历史', '传记'] },
  { key: 'music', label: '音乐', match: ['音乐', '歌舞'] },
  { key: 'western', label: '西部', match: ['西部'] },
  { key: 'kids', label: '儿童', match: ['儿童', '少儿'] },
  { key: 'variety', label: '综艺', match: ['综艺', '真人秀', '脱口秀'] }
]

const BY_KEY = new Map(GENRE_DEFS.map((d) => [d.key, d]))

export function genreLabel(key: string): string {
  return BY_KEY.get(key)?.label ?? key
}

/**
 * 把一部影片的原始类型名归一化成题材 key 列表。
 * 只做包含匹配，且要求原文至少 2 个字，避免「动」这种单字误伤。
 */
export function genreKeysOf(genres: string[] | undefined): string[] {
  if (!genres?.length) return []
  const keys = new Set<string>()
  for (const raw of genres) {
    const name = String(raw).trim()
    if (name.length < 2) continue
    for (const def of GENRE_DEFS) {
      if (def.match.some((m) => name.includes(m) || (name.length >= 2 && m.includes(name)))) {
        keys.add(def.key)
      }
    }
  }
  return [...keys]
}

/** 片库中各题材的影片数量 */
export function genreCountsOf(items: TitleItem[]): Map<string, number> {
  const counts = new Map<string, number>()
  for (const item of items) {
    for (const key of genreKeysOf(item.genres)) {
      counts.set(key, (counts.get(key) ?? 0) + 1)
    }
  }
  return counts
}

/** 面板里要展示的题材：只保留片库里真实存在的，按数量从多到少 */
export function genreFacets(items: TitleItem[]): Array<{ key: string; label: string; count: number }> {
  const counts = genreCountsOf(items)
  const order = new Map(GENRE_DEFS.map((d, i) => [d.key, i]))
  return [...counts.entries()]
    .map(([key, count]) => ({ key, label: genreLabel(key), count }))
    .sort((a, b) => b.count - a.count || (order.get(a.key) ?? 99) - (order.get(b.key) ?? 99))
}
