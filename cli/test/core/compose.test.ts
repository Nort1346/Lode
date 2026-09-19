import { describe, expect, it } from 'vitest'
import { maskLodeImageTag, setLodeImageTag } from '../../src/core/compose'

const CONTENT = `services:
  lode:
    image: ghcr.io/nort1346/lode:latest
  redis:
    image: redis:7
`

describe('maskLodeImageTag', () => {
  it('masks the lode image tag only', () => {
    const masked = maskLodeImageTag(CONTENT)
    expect(masked).toContain('image: ghcr.io/nort1346/lode:<version>')
    expect(masked).toContain('image: redis:7')
  })

  it('masks commented-out image lines too', () => {
    const masked = maskLodeImageTag('  # image: ghcr.io/nort1346/lode:nightly\n')
    expect(masked).toBe('  # image: ghcr.io/nort1346/lode:<version>\n')
  })

  it('makes tag-only differences compare equal', () => {
    const a = maskLodeImageTag(CONTENT)
    const b = maskLodeImageTag(CONTENT.replace('lode:latest', 'lode:nightly'))
    expect(a).toBe(b)
  })
})

describe('setLodeImageTag', () => {
  it('replaces the tag and reports a change', () => {
    const { content, changed } = setLodeImageTag(CONTENT, 'nightly')
    expect(changed).toBe(true)
    expect(content).toContain('image: ghcr.io/nort1346/lode:nightly')
    expect(content).toContain('image: redis:7')
  })

  it('reports no change when there is no lode image line', () => {
    const { content, changed } = setLodeImageTag('services:\n  redis:\n    image: redis:7\n', 'nightly')
    expect(changed).toBe(false)
    expect(content).toBe('services:\n  redis:\n    image: redis:7\n')
  })
})
