/**
 * 生成 Android 启动图标与闪屏（纯 Node，无第三方依赖）
 *
 * 复用 PWA 图标的「胶片盘」设计：墨黑底 + 朱红盘 + 纸质孔洞。
 * 产物直接写入 android/app/src/main/res/，供 Gradle 打包。
 */
import zlib from 'node:zlib'
import fs from 'node:fs'
import path from 'node:path'

const RES = path.resolve('android/app/src/main/res')

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
  ihdr[8] = 8
  ihdr[9] = 6
  const stride = width * 4
  const raw = Buffer.alloc((stride + 1) * height)
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride)
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0))
  ])
}

/* ---------------------------- 画布 ---------------------------- */

class Canvas {
  constructor(w, h) {
    this.w = w
    this.h = h
    this.data = Buffer.alloc(w * h * 4)
  }
  blend(x, y, [r, g, b, a]) {
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return
    // 预乘抗锯齿：用亚像素覆盖近似
    const i = (y * this.w + x) * 4
    const na = a / 255
    const ia = 1 - na
    const d = this.data
    d[i] = Math.round(r * na + d[i] * ia)
    d[i + 1] = Math.round(g * na + d[i + 1] * ia)
    d[i + 2] = Math.round(b * na + d[i + 2] * ia)
    d[i + 3] = Math.round(255 * na + d[i + 3] * ia)
  }
  /** 圆形遮罩内填充（用于 round 图标） */
  fillCircleMask(cx, cy, r, color) {
    for (let y = Math.floor(cy - r); y <= Math.ceil(cy + r); y++) {
      for (let x = Math.floor(cx - r); x <= Math.ceil(cx + r); x++) {
        if ((x - cx) ** 2 + (y - cy) ** 2 <= r * r) this.blend(x, y, color)
      }
    }
  }
  roundedRect(x0, y0, x1, y1, radius, color) {
    for (let y = Math.floor(y0); y < Math.ceil(y1); y++) {
      for (let x = Math.floor(x0); x < Math.ceil(x1); x++) {
        const cx = Math.min(Math.max(x, x0 + radius), x1 - radius)
        const cy = Math.min(Math.max(y, y0 + radius), y1 - radius)
        if ((x - cx) ** 2 + (y - cy) ** 2 <= radius * radius) this.blend(x, y, color)
      }
    }
  }
  circleRing(cx, cy, r, stroke, color) {
    const inner = r - stroke
    for (let y = Math.floor(cy - r); y <= Math.ceil(cy + r); y++) {
      for (let x = Math.floor(cx - r); x <= Math.ceil(cx + r); x++) {
        const d2 = (x - cx) ** 2 + (y - cy) ** 2
        if (d2 <= r * r && d2 >= inner * inner) this.blend(x, y, color)
      }
    }
  }
  circle(cx, cy, r, color) {
    for (let y = Math.floor(cy - r); y <= Math.ceil(cy + r); y++) {
      for (let x = Math.floor(cx - r); x <= Math.ceil(cx + r); x++) {
        if ((x - cx) ** 2 + (y - cy) ** 2 <= r * r) this.blend(x, y, color)
      }
    }
  }
  rect(x0, y0, x1, y1, color) {
    for (let y = Math.floor(y0); y < Math.ceil(y1); y++) {
      for (let x = Math.floor(x0); x < Math.ceil(x1); x++) this.blend(x, y, color)
    }
  }
}

const INK = [27, 28, 31, 255]
const REEL = [192, 69, 58, 255]
const PAPER = [247, 246, 243, 255]

/** 胶片盘图形：环 + 四孔 + 轴心 + 底部齿孔条，尺寸全部以半径 r 为单位 */
function glyph(c, cx, cy, r) {
  c.circleRing(cx, cy, r, Math.max(1, r * 0.205), REEL)
  const hole = r * 0.185
  const off = r * 0.534
  for (const [ox, oy] of [
    [0, -off],
    [off, 0],
    [0, off],
    [-off, 0]
  ]) {
    c.circle(cx + ox, cy + oy, hole, PAPER)
  }
  c.circle(cx, cy, r * 0.164, PAPER)

  // 齿孔条
  const barTop = cy + r * 1.096
  const barH = r * 0.233
  const holeW = r * 0.205
  const pitch = r * 0.384
  const spanHalf = r * 1.062
  for (let i = 0; i < 6; i++) {
    const x0 = cx - spanHalf + i * pitch
    c.rect(x0, barTop, x0 + holeW, barTop + barH, PAPER)
  }
}

/** 图形整体（含齿孔条）的垂直范围：上边 cy-r，下边 cy+1.445r */
function centeredCy(size, r) {
  const top = (size - 2.445 * r) / 2
  return top + r
}

/* ---------------------------- 图标生成 ---------------------------- */

const DENSITY = [
  ['mdpi', 1],
  ['hdpi', 1.5],
  ['xhdpi', 2],
  ['xxhdpi', 3],
  ['xxxhdpi', 4]
]

/** 自适应图标前景：透明底，只画图形，位于 108dp 画布的安全区中央 */
function foreground(size) {
  const c = new Canvas(size, size)
  const r = size * 0.3
  glyph(c, size / 2, centeredCy(size, r), r)
  return c
}

/** 方形图标（API < 26 回退）：墨底 + 圆角 */
function square(size) {
  const c = new Canvas(size, size)
  c.roundedRect(0, 0, size, size, size * 0.21875, INK)
  const r = size * 0.285
  glyph(c, size / 2, size * 0.453, r)
  return c
}

/** 圆形图标（API < 26 回退） */
function round(size) {
  const c = new Canvas(size, size)
  c.fillCircleMask(size / 2, size / 2, size / 2, INK)
  const r = size * 0.285
  glyph(c, size / 2, size * 0.453, r)
  return c
}

function write(file, canvas) {
  const png = encodePng(canvas.w, canvas.h, canvas.data)
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(file, png)
  return png.length
}

let total = 0
for (const [name, scale] of DENSITY) {
  const fg = Math.round(108 * scale)
  const sq = Math.round(48 * scale)
  total += write(path.join(RES, `mipmap-${name}/ic_launcher_foreground.png`), foreground(fg))
  total += write(path.join(RES, `mipmap-${name}/ic_launcher.png`), square(sq))
  total += write(path.join(RES, `mipmap-${name}/ic_launcher_round.png`), round(sq))
}

/* ---------------------------- 闪屏 ---------------------------- */

const SPLASH = [
  ['drawable-port-mdpi', 320, 480],
  ['drawable-port-hdpi', 480, 800],
  ['drawable-port-xhdpi', 720, 1280],
  ['drawable-port-xxhdpi', 960, 1600],
  ['drawable-port-xxxhdpi', 1280, 1920]
]

function splash(w, h) {
  const c = new Canvas(w, h)
  c.rect(0, 0, w, h, PAPER)
  // 纸质底上放一块墨黑的圆角方块，避免孔洞与背景同色而"消失"
  const s = Math.min(w, h) * 0.3
  const x0 = (w - s) / 2
  const y0 = (h - s) / 2
  c.roundedRect(x0, y0, x0 + s, y0 + s, s * 0.21875, INK)
  glyph(c, w / 2, y0 + s * 0.453, s * 0.285)
  return c
}

for (const [dir, w, h] of SPLASH) {
  total += write(path.join(RES, `${dir}/splash.png`), splash(w, h))
  total += write(path.join(RES, `${dir.replace('port', 'land')}/splash.png`), splash(h, w))
}
total += write(path.join(RES, 'drawable/splash.png'), splash(480, 800))

console.log(`Android 图标与闪屏已生成，共 ${(total / 1024).toFixed(0)}KB`)
