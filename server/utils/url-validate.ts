const PRIVATE_IP_PATTERNS = [
  /^127\./,
  /^10\./,
  /^192\.168\./,
  /^172\.(1[6-9]|2\d|3[01])\./,
  /^0\.0\.0\.0$/,
  /^169\.254\./,
  /^::1$/,
  /^::ffff:127\./,
  /^::ffff:10\./,
  /^::ffff:192\.168\./,
  /^::ffff:172\.(1[6-9]|2\d|3[01])\./,
  /^::ffff:0\.0\.0\.0$/,
  /^::ffff:169\.254\./
]

export function isPrivateOrReservedHost(hostname: string): boolean {
  const lower = hostname.toLowerCase()
  if (lower === 'localhost') return true
  return PRIVATE_IP_PATTERNS.some((p) => p.test(lower))
}

export function assertExternalUrl(urlString: string): void {
  let parsed: URL
  try {
    parsed = new URL(urlString)
  } catch {
    throw createError({ statusCode: 400, statusMessage: 'Invalid URL format' })
  }

  const protocol = parsed.protocol
  if (protocol !== 'http:' && protocol !== 'https:') {
    throw createError({ statusCode: 400, statusMessage: 'Only HTTP/HTTPS URLs are allowed' })
  }

  if (isPrivateOrReservedHost(parsed.hostname)) {
    throw createError({ statusCode: 400, statusMessage: ' URLs to private/internal networks are not allowed' })
  }
}
