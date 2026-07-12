import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.stubGlobal(
  'createError',
  vi.fn((opts: { statusCode: number; statusMessage: string }) => {
    throw new Error(`${opts.statusCode}: ${opts.statusMessage}`)
  })
)

const mockResize = vi.fn().mockReturnThis()
const mockJpeg = vi.fn().mockReturnThis()
const mockRemoveAlpha = vi.fn().mockReturnThis()
const mockToBuffer = vi.fn().mockResolvedValue(Buffer.from('processed'))

vi.mock('sharp', () => ({
  default: vi.fn(() => ({
    resize: mockResize,
    jpeg: mockJpeg,
    removeAlpha: mockRemoveAlpha,
    toBuffer: mockToBuffer
  }))
}))

import { processAvatar, validateAndProcessAvatar } from '#server/utils/avatar'

describe('avatar utils', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockResize.mockReturnThis()
    mockJpeg.mockReturnThis()
    mockRemoveAlpha.mockReturnThis()
    mockToBuffer.mockResolvedValue(Buffer.from('processed'))
  })

  describe('processAvatar', () => {
    it('processes image buffer with sharp', async () => {
      const input = Buffer.from('image-data')
      const result = await processAvatar(input)

      expect(result).toEqual(Buffer.from('processed'))
      expect(mockResize).toHaveBeenCalledWith(512, 512, { fit: 'cover' })
      expect(mockJpeg).toHaveBeenCalledWith({ quality: 90 })
      expect(mockRemoveAlpha).toHaveBeenCalled()
    })
  })

  describe('validateAndProcessAvatar', () => {
    it('processes valid image', async () => {
      const input = Buffer.from('small-image')
      const result = await validateAndProcessAvatar(input, 'image/jpeg')
      expect(result).toEqual(Buffer.from('processed'))
    })

    it('throws when image too large', async () => {
      const largeBuffer = Buffer.alloc(6 * 1024 * 1024)
      await expect(validateAndProcessAvatar(largeBuffer, 'image/jpeg')).rejects.toThrow('400: Avatar too large')
    })

    it('throws for invalid mime type', async () => {
      const input = Buffer.from('image')
      await expect(validateAndProcessAvatar(input, 'image/gif')).rejects.toThrow('400: Invalid image type')
    })

    it('accepts png', async () => {
      const input = Buffer.from('png-image')
      const result = await validateAndProcessAvatar(input, 'image/png')
      expect(result).toEqual(Buffer.from('processed'))
    })

    it('accepts webp', async () => {
      const input = Buffer.from('webp-image')
      const result = await validateAndProcessAvatar(input, 'image/webp')
      expect(result).toEqual(Buffer.from('processed'))
    })
  })
})
