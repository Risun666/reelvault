/** 生成 PWA 图标 PNG（纯 Node，无第三方依赖） */
import zlib from 'node:zlib'
import fs from 'node:fs'
import path from 'node:path'

const OUT = path.resolve('public/icons')
fs.mkdirSync(OUT, { recursive: true })

/* ---------------------------- PNG 编码 ---------------------------- */

const CRC_TABLE = (() => {
  const t = new Int32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    t[n] = c
  }
  return t
})()

function crc32(buf) {
  let c = 0xffffffff
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

function chunk(type, data) {
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length)
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(body))
  return Buffer.concat([len, body, crc])
}

function encodePng(width, height, rgba) {
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(width, 0)
  ihdr.writeUInt32BE(height, 4)
  ihdr[8] = 8 // bit depth
  ihdr[9] = 6 // color type RGBA
  const raw = Buffer.alloc((width * 4 + 1) * height)
  for (let y = 0; y < height; y++) {
    raw[y * (width * 4 + 1)] = 0
    rgba.copy(raw, y * (width * 4 + 1) + 1, y * width * 4, (y + 1) * width * 4)
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0))
  ])
}

/* ---------------------------- 绘制工具 ---------------------------- */

class Canvas {
  constructor(size) {
    this.size = size
    this.data = Buffer.alloc(size * size * 4)
  }
  blend(x, y, [r, g, b, a]) {
    if (x < 0 || y < 0 || x >= this.size || y >= this.size) return
    const i = (y * this.size + x) * 4
    const na = a / 255
    const ia = 1 - na
    const d = this.data
    d[i] = Math.round(r * na + d[i] * ia)
    d[i + 1] = Math.round(g * na + d[i + 1] * ia)
    d[i + 2] = Math.round(b * na + d[i + 2] * ia)
    d[i + 3] = Math.round(255 * na + d[i + 3] * ia)
  }
  roundedRect(x0, y0, x1, y1, radius, color) {
    for (let y = Math.floor(y0); y < Math.ceil(y1); y++) {
      for (let x = Math.floor(x0); x < Math.ceil(x1); x++) {
        const cx = Math.min(Math.max(x, x0 + radius), x1 - radius)
        const cy = Math.min(Math.max(y, y0 + radius), y1 - radius)
        const dx = x - cx
        const dy = y - cy
        if (dx * dx + dy * dy <= radius * radius) this.blend(x, y, color)
      }
    }
  }
  circle(cx, cy, r, color, { stroke } = {}) {
    const inner = stroke ? r - stroke : 0
    const rr = Math.ceil(r)
    for (let y = Math.floor(cy - rr); y <= Math.ceil(cy + rr); y++) {
      for (let x = Math.floor(cx - rr); x <= Math.ceil(cx + rr); x++) {
        const d2 = (x - cx) ** 2 + (y - cy) ** 2
        if (d2 <= r * r && (!stroke || d2 >= inner * inner)) this.blend(x, y, color)
      }
    }
  }
}

const INK = [27, 28, 31, 255]
const REEL = [192, 69, 58, 255]
const PAPER = [247, 246, 243, 255]

/** 抽象胶片盘：墨底 + 朱红圆盘 + 四孔 + 齿孔条 */
function draw(scale = 1, fullBleed = false) {
  const S = 512
  const c = new Canvas(S)
  const k = (v) => v * scale
  const m = (v) => 256 + (v - 256) * scale

  if (fullBleed) c.roundedRect(0, 0, S, S, 0, INK)
  const radius = fullBleed ? 0 : 112
  if (!fullBleed) c.roundedRect(0, 0, S, S, radius, INK)

  // 主体胶片盘
  const cx = m(256)
  const cy = m(232)
  c.circle(cx, cy, k(146), REEL, { stroke: k(30) })
  // 盘上的四个孔
  const offsets = [
    [0, -78],
    [78, 0],
    [0, 78],
    [-78, 0]
  ]
  for (const [ox, oy] of offsets) {
    c.circle(m(256 + ox), m(232 + oy), k(27), PAPER)
  }
  c.circle(cx, cy, k(24), PAPER)
  // 底部齿孔条
  const barTop = m(392)
  const barH = k(34)
  for (let i = 0; i < 6; i++) {
    const x0 = m(96 + i * 56)
    const w = k(30)
    for (let y = Math.floor(barTop); y < Math.ceil(barTop + barH); y++) {
      for (let x = Math.floor(x0); x < Math.ceil(x0 + w); x++) c.blend(x, y, PAPER)
    }
  }
  return c
}

function write(name, canvas) {
  const png = encodePng(canvas.size, canvas.size, canvas.data)
  fs.writeFileSync(path.join(OUT, name), png)
  console.log(name, (png.length / 1024).toFixed(1) + 'KB')
}

function downscale(src, size) {
  const out = new Canvas(size)
  const factor = src.size / size
  const r = Math.max(1, factor / 2)
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let rs = 0, gs = 0, bs = 0, as = 0, n = 0
      const steps = 3
      for (let sy = 0; sy < steps; sy++) {
        for (let sx = 0; sx < steps; sx++) {
          const px = Math.min(src.size - 1, Math.floor(x * factor + (sx + 0.5) * (factor / steps)))
          const py = Math.min(src.size - 1, Math.floor(y * factor + (sy + 0.5) * (factor / steps)))
          const i = (py * src.size + px) * 4
          rs += src.data[i]
          gs += src.data[i + 1]
          bs += src.data[i + 2]
          as += src.data[i + 3]
          n++
        }
      }
      const i = (y * size + x) * 4
      out.data[i] = Math.round(rs / n)
      out.data[i + 1] = Math.round(gs / n)
      out.data[i + 2] = Math.round(bs / n)
      out.data[i + 3] = Math.round(as / n)
    }
  }
  void r
  return out
}

const base = draw(1, false)
write('icon-512.png', base)
write('icon-192.png', downscale(base, 192))
write('maskable-512.png', draw(0.66, true))

/* SVG 版（favicon / 兜底） */
const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <rect width="512" height="512" rx="112" fill="#1b1c1f"/>
  <circle cx="256" cy="232" r="146" fill="none" stroke="#c0453a" stroke-width="30"/>
  <circle cx="256" cy="154" r="27" fill="#f7f6f3"/>
  <circle cx="334" cy="232" r="27" fill="#f7f6f3"/>
  <circle cx="256" cy="310" r="27" fill="#f7f6f3"/>
  <circle cx="178" cy="232" r="27" fill="#f7f6f3"/>
  <circle cx="256" cy="232" r="24" fill="#f7f6f3"/>
  <g fill="#f7f6f3">
    <rect x="96" y="392" width="30" height="34" rx="6"/>
    <rect x="152" y="392" width="30" height="34" rx="6"/>
    <rect x="208" y="392" width="30" height="34" rx="6"/>
    <rect x="264" y="392" width="30" height="34" rx="6"/>
    <rect x="320" y="392" width="30" height="34" rx="6"/>
    <rect x="376" y="392" width="30" height="34" rx="6"/>
  </g>
</svg>
`
fs.writeFileSync(path.join(OUT, 'icon.svg'), svg)
console.log('icon.svg ok')
