import { describe, it, expect } from 'vitest'
import { computeTorrentInfoHash } from '#server/utils/torrents/info-hash'

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
