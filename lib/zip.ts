import zlib from 'node:zlib'

/**
 * A minimal ZIP writer (PKWARE APPNOTE 6.3) for the content export (H16) —
 * no dependency: entries are deflated with node:zlib (stored when that does
 * not make them smaller), names are UTF-8 (general-purpose flag bit 11), and
 * the archive is built in memory. No ZIP64: the export is a few megabytes of
 * text, far below the 4 GiB / 65,535-entry limits, which build() enforces.
 * Server-only.
 */

export type ZipEntry = { name: string; data: Buffer | string; mtime?: Date }

const CRC_TABLE = (() => {
  const table = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    table[n] = c >>> 0
  }
  return table
})()

/** CRC-32 (IEEE 802.3) of a buffer. */
export function crc32(buf: Uint8Array): number {
  let c = 0xffffffff
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

/** MS-DOS date and time of `d` (local fields, 2-second resolution, 1980–2107). */
export function dosDateTime(d: Date): { date: number; time: number } {
  const year = Math.min(Math.max(d.getFullYear(), 1980), 2107)
  return {
    date: ((year - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate(),
    time: (d.getHours() << 11) | (d.getMinutes() << 5) | Math.floor(d.getSeconds() / 2),
  }
}

const MAX_32 = 0xffffffff

/** A safe archive path: relative, forward slashes, no "..", no empty segments. */
export function isSafeZipName(name: string): boolean {
  if (!name || name.length > 512 || name.startsWith('/') || name.includes('\\') || name.includes('\0')) return false
  return name.split('/').every((seg) => seg !== '' && seg !== '.' && seg !== '..')
}

/** The archive bytes of `entries` (in order). Throws on an unsafe or duplicate name. */
export function buildZip(entries: readonly ZipEntry[]): Buffer {
  if (entries.length > 0xffff) throw new Error('too many zip entries')
  const locals: Buffer[] = []
  const centrals: Buffer[] = []
  const names = new Set<string>()
  let offset = 0
  for (const entry of entries) {
    if (!isSafeZipName(entry.name)) throw new Error(`unsafe zip entry name: ${entry.name}`)
    if (names.has(entry.name)) throw new Error(`duplicate zip entry: ${entry.name}`)
    names.add(entry.name)
    const raw = typeof entry.data === 'string' ? Buffer.from(entry.data, 'utf8') : entry.data
    const deflated = zlib.deflateRawSync(raw, { level: 9 })
    const stored = deflated.length >= raw.length
    const body = stored ? raw : deflated
    const method = stored ? 0 : 8
    const crc = crc32(raw)
    const name = Buffer.from(entry.name, 'utf8')
    const { date, time } = dosDateTime(entry.mtime ?? new Date())
    if (raw.length > MAX_32 || body.length > MAX_32 || offset > MAX_32) throw new Error('zip entry too large')

    const local = Buffer.alloc(30)
    local.writeUInt32LE(0x04034b50, 0)
    local.writeUInt16LE(20, 4) // version needed: 2.0 (deflate)
    local.writeUInt16LE(0x0800, 6) // UTF-8 names
    local.writeUInt16LE(method, 8)
    local.writeUInt16LE(time, 10)
    local.writeUInt16LE(date, 12)
    local.writeUInt32LE(crc, 14)
    local.writeUInt32LE(body.length, 18)
    local.writeUInt32LE(raw.length, 22)
    local.writeUInt16LE(name.length, 26)
    local.writeUInt16LE(0, 28)
    locals.push(local, name, body)

    const central = Buffer.alloc(46)
    central.writeUInt32LE(0x02014b50, 0)
    central.writeUInt16LE(0x0314, 4) // made by: UNIX, spec 2.0
    central.writeUInt16LE(20, 6)
    central.writeUInt16LE(0x0800, 8)
    central.writeUInt16LE(method, 10)
    central.writeUInt16LE(time, 12)
    central.writeUInt16LE(date, 14)
    central.writeUInt32LE(crc, 16)
    central.writeUInt32LE(body.length, 20)
    central.writeUInt32LE(raw.length, 24)
    central.writeUInt16LE(name.length, 28)
    central.writeUInt16LE(0, 30) // extra
    central.writeUInt16LE(0, 32) // comment
    central.writeUInt16LE(0, 34) // disk
    central.writeUInt16LE(0, 36) // internal attributes
    central.writeUInt32LE((0o100644 << 16) >>> 0, 38) // external: a regular file, rw-r--r--
    central.writeUInt32LE(offset, 42)
    centrals.push(central, name)

    offset += local.length + name.length + body.length
  }
  const centralDir = Buffer.concat(centrals)
  if (offset > MAX_32 || centralDir.length > MAX_32) throw new Error('zip archive too large')
  const end = Buffer.alloc(22)
  end.writeUInt32LE(0x06054b50, 0)
  end.writeUInt16LE(0, 4)
  end.writeUInt16LE(0, 6)
  end.writeUInt16LE(entries.length, 8)
  end.writeUInt16LE(entries.length, 10)
  end.writeUInt32LE(centralDir.length, 12)
  end.writeUInt32LE(offset, 16)
  end.writeUInt16LE(0, 20)
  return Buffer.concat([...locals, centralDir, end])
}
