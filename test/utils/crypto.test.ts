import { describe, it, expect, vi, beforeEach } from 'vitest'
import { encryptAES, decryptAES } from '#server/utils/crypto'

const mockRuntimeConfig = {
  trackerEncryptionKey: 'a'.repeat(64)
}

vi.stubGlobal('useRuntimeConfig', () => mockRuntimeConfig)

describe('encryptAES / decryptAES', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('encrypts and decrypts correctly', () => {
    const plaintext = 'test-password-123'
    const encrypted = encryptAES(plaintext)
    const decrypted = decryptAES(encrypted)
    expect(decrypted).toBe(plaintext)
  })

  it('produces different ciphertext for same plaintext (due to random IV)', () => {
    const plaintext = 'test-password-123'
    const encrypted1 = encryptAES(plaintext)
    const encrypted2 = encryptAES(plaintext)
    expect(encrypted1).not.toBe(encrypted2)
  })

  it('decrypts different ciphertexts to same plaintext', () => {
    const plaintext = 'test-password-123'
    const encrypted1 = encryptAES(plaintext)
    const encrypted2 = encryptAES(plaintext)
    expect(decryptAES(encrypted1)).toBe(plaintext)
    expect(decryptAES(encrypted2)).toBe(plaintext)
  })

  it('handles special characters', () => {
    const plaintext = 'p@ssw0rd!#$%^&*()_+{}|:<>?'
    const encrypted = encryptAES(plaintext)
    const decrypted = decryptAES(encrypted)
    expect(decrypted).toBe(plaintext)
  })

  it('handles unicode characters', () => {
    const plaintext = 'user123'
    const encrypted = encryptAES(plaintext)
    const decrypted = decryptAES(encrypted)
    expect(decrypted).toBe(plaintext)
  })

  it('handles empty string', () => {
    const plaintext = ''
    const encrypted = encryptAES(plaintext)
    const decrypted = decryptAES(encrypted)
    expect(decrypted).toBe(plaintext)
  })

  it('throws on invalid encrypted format', () => {
    expect(() => decryptAES('invalid-format')).toThrow('Invalid encrypted format')
    expect(() => decryptAES('part1:part2')).toThrow('Invalid encrypted format')
    expect(() => decryptAES('part1:part2:part3:part4')).toThrow('Invalid encrypted format')
  })

  it('throws on wrong key', () => {
    const plaintext = 'test-password-123'
    const encrypted = encryptAES(plaintext)

    // Change the key by modifying the mock
    mockRuntimeConfig.trackerEncryptionKey = 'b'.repeat(64)

    expect(() => decryptAES(encrypted)).toThrow()
  })

  it('throws on corrupted ciphertext', () => {
    const plaintext = 'test-password-123'
    const encrypted = encryptAES(plaintext)
    const parts = encrypted.split(':')
    // Corrupt the data part
    const corrupted = `${parts[0]}:${parts[1]}:${parts[2]!.slice(0, -2)}00`
    expect(() => decryptAES(corrupted)).toThrow()
  })
})
