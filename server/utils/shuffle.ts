export function fisherYatesShuffle<T>(arr: T[]): T[] {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const buf = new Uint32Array(1)
    crypto.getRandomValues(buf)
    const rand = buf[0] ?? 0
    const j = Math.floor((rand / (0xffffffff + 1)) * (i + 1))
    const tmp: T = a[i] as T
    a[i] = a[j] as T
    a[j] = tmp
  }
  return a
}
