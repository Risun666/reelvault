/** 封面处理：本地压缩、远程抓取 */

const MAX_EDGE = 720
const QUALITY = 0.82

/** 把任意图片压成体积可控的 JPEG Blob */
export async function compressImage(input: Blob, maxEdge = MAX_EDGE, quality = QUALITY): Promise<Blob> {
  if (input.type === 'image/gif') return input
  const bitmap = await loadBitmap(input)
  const { width, height } = bitmap
  const scale = Math.min(1, maxEdge / Math.max(width, height))
  const w = Math.max(1, Math.round(width * scale))
  const h = Math.max(1, Math.round(height * scale))

  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')
  if (!ctx) return input
  ctx.drawImage(bitmap, 0, 0, w, h)
  if ('close' in bitmap) (bitmap as ImageBitmap).close()

  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, 'image/jpeg', quality)
  )
  return blob ?? input
}

async function loadBitmap(input: Blob): Promise<ImageBitmap | HTMLImageElement> {
  if (typeof createImageBitmap === 'function') {
    try {
      return await createImageBitmap(input)
    } catch {
      /* fallback below */
    }
  }
  const url = URL.createObjectURL(input)
  try {
    return await new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image()
      img.onload = () => resolve(img)
      img.onerror = () => reject(new Error('image decode failed'))
      img.src = url
    })
  } finally {
    setTimeout(() => URL.revokeObjectURL(url), 0)
  }
}

/** 抓取远程海报，失败返回 null（离线或被 CORS 拦截时静默降级） */
export async function fetchRemoteImage(url: string | undefined): Promise<Blob | null> {
  if (!url) return null
  try {
    const res = await fetch(url, { mode: 'cors' })
    if (!res.ok) return null
    const raw = await res.blob()
    return await compressImage(raw)
  } catch {
    return null
  }
}

export function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(new Error('read failed'))
    reader.readAsDataURL(blob)
  })
}

export function dataUrlToBlob(dataUrl: string): Blob {
  const [head, body] = dataUrl.split(',')
  const mime = /data:(.*?);base64/.exec(head)?.[1] ?? 'image/jpeg'
  const bytes = atob(body)
  const out = new Uint8Array(bytes.length)
  for (let i = 0; i < bytes.length; i++) out[i] = bytes.charCodeAt(i)
  return new Blob([out], { type: mime })
}
