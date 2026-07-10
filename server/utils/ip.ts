import { getHeader } from 'h3'
import type { H3Event } from 'h3'

export function resolveIp(event: H3Event): string | null {
  const cf = getHeader(event, 'cf-connecting-ip')
  if (cf !== undefined && cf !== null && cf !== '') return cf

  const forwarded = getHeader(event, 'x-forwarded-for')
  if (forwarded !== undefined && forwarded !== null && forwarded !== '') {
    const first = forwarded.split(',')[0]
    if (first !== undefined) return first.trim()
  }

  const realIp = getHeader(event, 'x-real-ip')
  if (realIp !== undefined && realIp !== null && realIp !== '') return realIp

  return null
}
