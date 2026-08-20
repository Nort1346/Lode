import { isIP } from 'node:net'

const BLOCKED_HOSTNAMES = new Set(['localhost', 'ip6-localhost', 'ip6-loopback', 'metadata.google.internal'])

function parseNumericLabel(label: string): number | null {
  if (label.length === 0) return null
  if (label.startsWith('0x') || label.startsWith('0X')) {
    const hex = label.slice(2)
    if (!/^[0-9a-f]+$/i.test(hex)) return null
    return parseInt(hex, 16)
  }
  // Leading zero marks an octal label (e.g. 0177.0.0.1); plain digits are decimal
  if (label.length > 1 && label.startsWith('0') && /^[0-7]+$/.test(label)) {
    return parseInt(label.slice(1), 8)
  }
  if (/^[0-9]+$/.test(label)) return Number(label)
  return null
}

function parseIpv4Octets(hostname: string): number[] | null {
  const labels = hostname.split('.')

  if (labels.length === 1) {
    const first = labels[0]
    if (first === undefined) return null
    const value = parseNumericLabel(first)
    if (value === null || value > 0xffffffff) return null
    return [(value >>> 24) & 0xff, (value >>> 16) & 0xff, (value >>> 8) & 0xff, value & 0xff]
  }

  if (labels.length !== 4) return null

  const octets: number[] = []
  for (const label of labels) {
    const octet = parseNumericLabel(label)
    if (octet === null || octet > 255) return null
    octets.push(octet)
  }
  return octets
}

function isPrivateIpv4(octets: number[]): boolean {
  const a = octets[0]
  const b = octets[1]
  if (a === undefined || b === undefined) return false
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168)
  )
}

function isPrivateIpv6(hostname: string): boolean {
  const lower = hostname.toLowerCase()
  if (lower === '::' || lower === '::1') return true
  if (lower.startsWith('fc') || lower.startsWith('fd')) return true
  if (/^fe[89ab]/.test(lower)) return true

  const mapped = lower.match(/^::ffff:(.+)$/)
  const rest = mapped?.[1]
  if (rest !== undefined) {
    if (rest.includes('.')) {
      const octets = parseIpv4Octets(rest)
      if (octets !== null && isPrivateIpv4(octets)) return true
    } else {
      const hextets = rest.split(':')
      const first = hextets[0]
      const second = hextets[1]
      if (hextets.length === 2 && first !== undefined && second !== undefined) {
        const value = ((parseInt(first, 16) << 16) | parseInt(second, 16)) >>> 0
        return isPrivateIpv4([(value >>> 24) & 0xff, (value >>> 16) & 0xff, (value >>> 8) & 0xff, value & 0xff])
      }
    }
  }

  return false
}

export function isPrivateOrReservedHost(hostname: string): boolean {
  let lower = hostname.trim().toLowerCase()
  if (lower.startsWith('[') && lower.endsWith(']')) lower = lower.slice(1, -1)
  if (BLOCKED_HOSTNAMES.has(lower)) return true

  const ipVersion = isIP(lower)
  if (ipVersion === 6) {
    return isPrivateIpv6(lower)
  }
  if (ipVersion === 4) {
    const octets = parseIpv4Octets(lower)
    return octets !== null && isPrivateIpv4(octets)
  }

  // Non-standard numeric encodings of IPv4 (decimal, octal, hex) that pass through as hostnames
  const octets = parseIpv4Octets(lower)
  return octets !== null && isPrivateIpv4(octets)
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
    throw createError({ statusCode: 400, statusMessage: 'URLs to private/internal networks are not allowed' })
  }
}
