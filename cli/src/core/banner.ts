// "Lode" pre-rendered in the block font. cfonts reads its .fnt data from disk at
// runtime, which is absent from the single-file `bun build --compile` binary, so
// the art is embedded and the gradient is applied by hand (colorize).
const BANNER_ART =
  ' ██╗       ██████╗  ██████╗  ███████╗\n ██║      ██╔═══██╗ ██╔══██╗ ██╔════╝\n ██║      ██║   ██║ ██║  ██║ █████╗\n ██║      ██║   ██║ ██║  ██║ ██╔══╝\n ███████╗ ╚██████╔╝ ██████╔╝ ███████╗\n ╚══════╝  ╚═════╝  ╚═════╝  ╚══════╝'
const GRADIENT = ['#fbbf24', '#f59e0b'] as const

function colorDisabled(): boolean {
  return process.env.NO_COLOR !== undefined || process.env.TERM === 'dumb'
}

function hexToRgb(hex: string): [number, number, number] {
  const value = parseInt(hex.slice(1), 16)
  return [(value >> 16) & 0xff, (value >> 8) & 0xff, value & 0xff]
}

// Left-to-right fade across the widest line, colored per non-space glyph.
function colorize(art: string): string {
  const lines = art.split('\n')
  const width = Math.max(1, ...lines.map((line) => line.length))
  const from = hexToRgb(GRADIENT[0])
  const to = hexToRgb(GRADIENT[1])
  return (
    lines
      .map((line) =>
        Array.from(line)
          .map((ch, i) => {
            if (ch === ' ') return ch
            const t = width <= 1 ? 0 : i / (width - 1)
            const r = Math.round(from[0] + (to[0] - from[0]) * t)
            const g = Math.round(from[1] + (to[1] - from[1]) * t)
            const b = Math.round(from[2] + (to[2] - from[2]) * t)
            return `\u001b[38;2;${r};${g};${b}m${ch}`
          })
          .join('')
      )
      .join('\n') + '\u001b[0m'
  )
}

export function showTitleBanner(leadingBreak = false, trailingBreak = false): void {
  if (process.stdout.isTTY !== true) return
  const art = colorDisabled() ? BANNER_ART : colorize(BANNER_ART)
  process.stdout.write((leadingBreak ? '\n' : '') + art + '\n' + (trailingBreak ? '\n' : ''))
}
