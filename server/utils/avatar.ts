import sharp from 'sharp'

const MAX_AVATAR_SIZE = 5 * 1024 * 1024
const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const
const AVATAR_SIZE = 512
const AVATAR_QUALITY = 90

export async function processAvatar(imageBuffer: Buffer): Promise<Buffer> {
  return sharp(imageBuffer)
    .resize(AVATAR_SIZE, AVATAR_SIZE, { fit: 'cover' })
    .jpeg({ quality: AVATAR_QUALITY })
    .removeAlpha()
    .toBuffer()
}

export async function validateAndProcessAvatar(imageBuffer: Buffer, contentType: string): Promise<Buffer> {
  if (imageBuffer.length > MAX_AVATAR_SIZE) {
    throw createError({ statusCode: 400, statusMessage: 'Avatar too large (max 5MB)' })
  }

  if (!(ALLOWED_MIME_TYPES as readonly string[]).includes(contentType)) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid image type. Use JPEG, PNG, or WebP.' })
  }

  return processAvatar(imageBuffer)
}
