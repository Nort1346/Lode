export function parseDeviceName(ua: string | null | undefined): string {
  if (ua === null || ua === undefined || ua === '') return 'Unknown device'

  const browser = parseBrowser(ua)
  const os = parseOS(ua)

  if (browser !== null && os !== null) return `${browser} on ${os}`
  if (browser !== null) return browser
  if (os !== null) return os
  return 'Unknown device'
}

function extractVersion(ua: string, pattern: RegExp): string | null {
  const match = ua.match(pattern)
  return match?.[1]?.split('.')[0] ?? null
}

function extractVersionUnderscore(ua: string, pattern: RegExp): string | null {
  const match = ua.match(pattern)
  return match?.[1]?.replace(/_/g, '.') ?? null
}

function parseBrowser(ua: string): string | null {
  if (ua.includes('Firefox') && !ua.includes('Seamonkey')) {
    const version = extractVersion(ua, /Firefox\/([\d.]+)/)
    return version !== null ? `Firefox v${version}` : 'Firefox'
  }
  if (ua.includes('Edg/')) {
    const version = extractVersion(ua, /Edg\/([\d.]+)/)
    return version !== null ? `Edge v${version}` : 'Edge'
  }
  if (ua.includes('OPR/') || ua.includes('Opera')) {
    const version = extractVersion(ua, /(?:OPR|Opera)\/([\d.]+)/)
    return version !== null ? `Opera v${version}` : 'Opera'
  }
  if (ua.includes('Chrome') && !ua.includes('Chromium')) {
    const version = extractVersion(ua, /Chrome\/([\d.]+)/)
    return version !== null ? `Chrome v${version}` : 'Chrome'
  }
  if (ua.includes('Safari') && ua.includes('Version/')) {
    const version = extractVersion(ua, /Version\/([\d.]+)/)
    return version !== null ? `Safari v${version}` : 'Safari'
  }
  return null
}

function parseOS(ua: string): string | null {
  if (ua.includes('Windows NT 10')) return 'Windows'
  if (ua.includes('Windows NT 6.3')) return 'Windows 8.1'
  if (ua.includes('Windows NT 6.2')) return 'Windows 8'
  if (ua.includes('Windows NT 6.1')) return 'Windows 7'
  if (ua.includes('Windows')) return 'Windows'
  if (ua.includes('iPhone OS')) {
    const version = extractVersionUnderscore(ua, /iPhone OS ([\d_]+)/)
    return version !== null ? `iPhone v${version}` : 'iPhone'
  }
  if (ua.includes('iPad')) return 'iPad'
  if (ua.includes('Mac OS X')) {
    const version = extractVersionUnderscore(ua, /Mac OS X ([\d._]+)/)
    return version !== null ? `macOS v${version}` : 'macOS'
  }
  if (ua.includes('Android')) {
    const version = extractVersion(ua, /Android ([\d.]+)/)
    return version !== null ? `Android v${version}` : 'Android'
  }
  if (ua.includes('Linux')) return 'Linux'
  if (ua.includes('CrOS')) return 'ChromeOS'
  return null
}
