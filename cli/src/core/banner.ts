const GRADIENT = ['#fbbf24', '#f59e0b'] as const

function colorDisabled(): boolean {
  return process.env.NO_COLOR !== undefined || process.env.TERM === 'dumb'
}

export async function showTitleBanner(leadingBreak = false, trailingBreak = false): Promise<void> {
  if (process.stdout.isTTY !== true) return
  // cfonts bundles every font it ships; defer the cost until it is actually needed.
  const { render } = await import('cfonts')
  const width = process.stdout.columns ?? 80
  // transitionGradient blends the two stops directly - without it cfonts invents a
  // full hue-wheel "impressive" gradient, which reads as a rainbow.
  const settings: object = colorDisabled()
    ? { font: 'block', align: 'left', spaceless: true }
    : { font: 'block', gradient: [...GRADIENT], transitionGradient: true, align: 'left', spaceless: true }
  const out = render('Lode', settings, false, 0, { width, height: 30 })
  if (out) process.stdout.write((leadingBreak ? '\n' : '') + out.string + '\n' + (trailingBreak ? '\n' : ''))
}
