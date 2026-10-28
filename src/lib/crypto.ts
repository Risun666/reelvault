/** PIN 校验、备份加密 —— 全部基于 WebCrypto，PIN 与密钥永不明文落盘 */

const enc = new TextEncoder()
const dec = new TextDecoder()

export function randomBytes(len: number): Uint8Array {
  const buf = new Uint8Array(len)
  crypto.getRandomValues(buf)
  return buf
}

export function toB64(bytes: Uint8Array): string {
  let s = ''
  for (let i = 0; i < bytes.length; i += 0x8000) {
    s += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  }
  return btoa(s)
}

export function fromB64(b64: string): Uint8Array {
  const raw = atob(b64)
  const out = new Uint8Array(raw.length)
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i)
  return out
}

const ITERATIONS = 200_000

export interface PinRecord {
  salt: string
  hash: string
  iterations: number
  createdAt: string
}

/** 生成 PIN 存储记录（只保存 salt + PBKDF2 摘要） */
export async function createPinRecord(pin: string): Promise<PinRecord> {
  const salt = randomBytes(16)
  const hash = await pbkdf2(pin, salt, ITERATIONS)
  return {
    salt: toB64(salt),
    hash: toB64(hash),
    iterations: ITERATIONS,
    createdAt: new Date().toISOString()
  }
}

export async function verifyPin(pin: string, record: PinRecord): Promise<boolean> {
  const hash = await pbkdf2(pin, fromB64(record.salt), record.iterations)
  const expected = fromB64(record.hash)
  if (hash.length !== expected.length) return false
  let diff = 0
  for (let i = 0; i < hash.length; i++) diff |= hash[i] ^ expected[i]
  return diff === 0
}

async function pbkdf2(pin: string, salt: Uint8Array, iterations: number): Promise<Uint8Array> {
  const baseKey = await crypto.subtle.importKey('raw', enc.encode(`reelvault:${pin}`), 'PBKDF2', false, [
    'deriveBits',
    'deriveKey'
  ])
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt: salt as BufferSource, iterations, hash: 'SHA-256' },
    baseKey,
    256
  )
  return new Uint8Array(bits)
}

/** 由 PIN 派生 AES-GCM 密钥，用于备份文件的隐私区加密 */
export async function deriveVaultKey(pin: string, saltB64: string): Promise<CryptoKey> {
  const baseKey = await crypto.subtle.importKey('raw', enc.encode(`reelvault-vault:${pin}`), 'PBKDF2', false, [
    'deriveKey'
  ])
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: fromB64(saltB64) as BufferSource, iterations: ITERATIONS, hash: 'SHA-256' },
    baseKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  )
}

export interface EncryptedBlob {
  iv: string
  cipher: string
}

export async function encryptJson(data: unknown, key: CryptoKey): Promise<EncryptedBlob> {
  const iv = randomBytes(12)
  const cipher = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: iv as BufferSource },
    key,
    enc.encode(JSON.stringify(data))
  )
  return { iv: toB64(iv), cipher: toB64(new Uint8Array(cipher)) }
}

export async function decryptJson<T>(blob: EncryptedBlob, key: CryptoKey): Promise<T> {
  const plain = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: fromB64(blob.iv) as BufferSource },
    key,
    fromB64(blob.cipher) as BufferSource
  )
  return JSON.parse(dec.decode(plain)) as T
}
