import { createHash } from 'node:crypto'
import type { BencodeValue } from '#server/types/torrent'

class BencodeDecoder {
  private pos = 0

  constructor(private readonly data: Buffer) {}

  /**
   * Validates the whole buffer and returns the byte range [start, end) of the
   * top-level `info` dict's original encoding. Hashing those original bytes -
   * rather than re-encoding the decoded value - keeps the result correct for any
   * valid torrent, including binary strings (e.g. `pieces`) and `i…e` integers.
   */
  extractInfoDictRange(): { start: number; end: number } {
    if (this.data.length === 0 || this.data[0] !== 0x64) {
      throw new Error('Torrent file root is not a bencode dict')
    }
    this.pos = 1
    let found: { start: number; end: number } | null = null
    while (true) {
      const keyByte = this.data[this.pos]
      if (keyByte === undefined) throw new Error('Unexpected end of bencode dict')
      if (keyByte === 0x65) {
        this.pos++
        break
      }
      const key = this.decodeString().toString('utf-8')
      const valueStart = this.pos
      const value = this.decodeValue()
      const valueEnd = this.pos
      if (key === 'info' && found === null) {
        if (typeof value === 'string' || Array.isArray(value) || Buffer.isBuffer(value)) {
          throw new Error('Torrent file info entry is not a dict')
        }
        found = { start: valueStart, end: valueEnd }
      }
    }
    if (this.pos !== this.data.length) {
      throw new Error(`Trailing data after bencode value at byte ${this.pos}`)
    }
    if (found === null) throw new Error('Torrent file has no info dict')
    return found
  }

  private decodeValue(): BencodeValue {
    const byte = this.data[this.pos]
    if (byte === undefined) throw new Error('Unexpected end of bencode data')
    if (byte === 0x64) {
      this.pos++
      return this.decodeDict()
    }
    if (byte === 0x6c) {
      this.pos++
      return this.decodeList()
    }
    if (byte === 0x69) {
      this.pos++
      return this.decodeInteger()
    }
    if (byte >= 0x30 && byte <= 0x39) {
      return this.decodeString()
    }
    throw new Error(`Unexpected bencode byte 0x${byte.toString(16)} at position ${this.pos}`)
  }

  private decodeDict(): { [key: string]: BencodeValue } {
    const dict: { [key: string]: BencodeValue } = {}
    while (true) {
      const keyByte = this.data[this.pos]
      if (keyByte === undefined) throw new Error('Unexpected end of bencode dict')
      if (keyByte === 0x65) {
        this.pos++
        return dict
      }
      const key = this.decodeString().toString('utf-8')
      dict[key] = this.decodeValue()
    }
  }

  private decodeList(): BencodeValue[] {
    const list: BencodeValue[] = []
    while (true) {
      const byte = this.data[this.pos]
      if (byte === undefined) throw new Error('Unexpected end of bencode list')
      if (byte === 0x65) {
        this.pos++
        return list
      }
      list.push(this.decodeValue())
    }
  }

  private decodeInteger(): string {
    const start = this.pos
    while (this.pos < this.data.length && this.data[this.pos] !== 0x65) {
      this.pos++
    }
    if (this.pos >= this.data.length) throw new Error('Unterminated bencode integer')
    const raw = this.data.subarray(start, this.pos).toString('utf-8')
    if (!/^[+-]?\d+$/.test(raw)) throw new Error(`Invalid bencode integer: ${raw}`)
    this.pos++
    return raw
  }

  // Byte strings (and dict keys) are returned as Buffers so binary data stays intact
  private decodeString(): Buffer {
    const length = this.decodeLength()
    if (this.data[this.pos] !== 0x3a) throw new Error(`Expected ':' at position ${this.pos}`)
    this.pos++
    if (this.pos + length > this.data.length) throw new Error('Bencode string extends past end of data')
    const value = Buffer.from(this.data.subarray(this.pos, this.pos + length))
    this.pos += length
    return value
  }

  private decodeLength(): number {
    let end = this.pos
    while (end < this.data.length) {
      const byte = this.data[end]
      if (byte === undefined || byte < 0x30 || byte > 0x39) break
      end++
    }
    if (end === this.pos) throw new Error(`Expected digit at position ${this.pos}`)
    const length = Number.parseInt(this.data.subarray(this.pos, end).toString('utf-8'), 10)
    if (!Number.isSafeInteger(length) || length < 0) throw new Error(`Invalid bencode length: ${length}`)
    this.pos = end
    return length
  }
}

/**
 * Computes the info hash of a .torrent file: SHA-1 of the bencoded `info` dictionary.
 * The original `info` bytes are hashed directly, so the result is independent of
 * integer formatting and binary content. Throws if the buffer is not a valid torrent.
 */
export function computeTorrentInfoHash(fileBuffer: Buffer): string {
  const range = new BencodeDecoder(fileBuffer).extractInfoDictRange()
  return createHash('sha1').update(fileBuffer.subarray(range.start, range.end)).digest('hex')
}
