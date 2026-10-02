import { describe, it, expect } from 'vitest'
import {
  computeTorrentInfoHash,
  computeTorrentInfoHashes,
  computeTorrentTotalSize
} from '#server/utils/torrents/info-hash'

// Hand-built bencoded torrent (see docs: info hash = SHA-1 of the bencoded `info` dict).
// Outer dict: created by + creation date (i…e integer) + info dict containing a length
// (i…e integer), a name, a piece length, 40 bytes of 0xAB binary `pieces`, and private.
// Ground truth SHA-1 was computed independently with node:crypto over the exact
// `info` dict bytes (8a7fc9bddd5c69639bf0a652a6b88ede5e3e3111), so any decoding or
// re-encoding corruption (integer formatting, binary bytes) changes the result.
const FIXTURE_HEX =
  '6431303a6372656174656420627931343a73747265616d6875622d7465737431333a6372656174696f6e2064617465693137353030303030303065343a696e666f64363a6c656e677468693130303030303065343a6e616d6533303a54657374204d6f766965203230323620313038307020574542207832363431323a7069656365206c656e6774686932363231343465363a70696563657334303aabababababababababababababababababababababababababababababababababababababababab373a707269766174656931656565'
const EXPECTED_HASH = '8a7fc9bddd5c69639bf0a652a6b88ede5e3e3111'

describe('computeTorrentInfoHash', () => {
  it('computes the SHA-1 of the info dict (integers + binary pieces)', () => {
    expect(computeTorrentInfoHash(Buffer.from(FIXTURE_HEX, 'hex'))).toBe(EXPECTED_HASH)
  })

  it('throws when the root is not a dict', () => {
    expect(() => computeTorrentInfoHash(Buffer.from('4:spam', 'utf-8'))).toThrow('root is not a bencode dict')
  })

  it('throws when the info dict is missing', () => {
    expect(() => computeTorrentInfoHash(Buffer.from('d3:foo3:bare', 'utf-8'))).toThrow('has no info dict')
  })

  it('throws when the info entry is not a dict', () => {
    expect(() => computeTorrentInfoHash(Buffer.from('d4:info3:bare', 'utf-8'))).toThrow('info entry is not a dict')
  })

  it('throws on truncated data', () => {
    expect(() => computeTorrentInfoHash(Buffer.from('d4:info', 'utf-8'))).toThrow('Unexpected end of bencode data')
  })

  it('throws on an unterminated integer', () => {
    expect(() => computeTorrentInfoHash(Buffer.from('d1:ai1', 'utf-8'))).toThrow('Unterminated bencode integer')
  })

  it('throws on trailing data after the root dict', () => {
    const buffer = Buffer.concat([Buffer.from(FIXTURE_HEX, 'hex'), Buffer.from('x', 'utf-8')])
    expect(() => computeTorrentInfoHash(buffer)).toThrow('Trailing data')
  })

  it('throws on empty input', () => {
    expect(() => computeTorrentInfoHash(Buffer.alloc(0))).toThrow('root is not a bencode dict')
  })
})

// v2 (BEP 52) fixture: info dict with `meta version` 2. The `info` dict bytes are
// `d12:meta versioni2e6:lengthi1000e4:name5:Test2e`; ground-truth SHA-1/SHA-256 were
// computed independently with node:crypto over those exact bytes.
const V2_FIXTURE = Buffer.from('d4:infod12:meta versioni2e6:lengthi1000e4:name5:Test2ee', 'utf-8')

describe('computeTorrentInfoHashes', () => {
  it('returns only the v1 hash for a v1 torrent', () => {
    expect(computeTorrentInfoHashes(Buffer.from(FIXTURE_HEX, 'hex'))).toEqual({
      v1: EXPECTED_HASH,
      v2: null
    })
  })

  it('returns the SHA-1 and SHA-256 of the info dict for a v2 torrent', () => {
    expect(computeTorrentInfoHashes(V2_FIXTURE)).toEqual({
      v1: '2de3cea7eb2ed24feaaf267459f0327ebd8a6205',
      v2: 'b9a5700f039b0a325ab9464874c8f7a341271e722aab28e26ecb33b90d39e8f8'
    })
  })

  it('detects v2 via the v2 key', () => {
    const hybrid = Buffer.from('d4:infod2:v2d5:layeri0e6:lengthi1e6:piecesi0ee4:name5:Test2ee', 'utf-8')
    const result = computeTorrentInfoHashes(hybrid)

    expect(result.v2).toMatch(/^[a-f0-9]{64}$/)
  })
})

describe('computeTorrentTotalSize', () => {
  it('returns the single-file length', () => {
    expect(computeTorrentTotalSize(Buffer.from(FIXTURE_HEX, 'hex'))).toBe(1_000_000)
  })

  it('sums multi-file lengths', () => {
    const multiFile = Buffer.from('d4:infod5:filesld6:lengthi123eed6:lengthi567eee4:name5:test1ee', 'utf-8')

    expect(computeTorrentTotalSize(multiFile)).toBe(690)
  })

  it('ignores malformed file entries while summing the valid entries', () => {
    const mixed = Buffer.from('d4:infod5:filesl4:spami123ee6:lengthi567eee4:name5:test1ee', 'utf-8')

    expect(computeTorrentTotalSize(mixed)).toBe(567)
  })

  it('returns null for an empty buffer', () => {
    expect(computeTorrentTotalSize(Buffer.alloc(0))).toBeNull()
  })

  it('returns null when the info dict is missing', () => {
    expect(computeTorrentTotalSize(Buffer.from('d3:foo3:bare', 'utf-8'))).toBeNull()
  })

  it('returns null when the info dict has no size metadata', () => {
    expect(computeTorrentTotalSize(Buffer.from('d4:info4:name5:test1ee', 'utf-8'))).toBeNull()
  })

  it('returns null when the size is not a safe integer', () => {
    const oversized = Buffer.from('d4:infod6:lengthi9007199254740993e4:name5:test1ee', 'utf-8')

    expect(computeTorrentTotalSize(oversized)).toBeNull()
  })
})
