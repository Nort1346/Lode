import { styleText } from 'node:util'
import {
  CANCEL_SYMBOL,
  box,
  cancel,
  confirm,
  isCancel,
  log,
  multiselect,
  note,
  password,
  S_WARN,
  select,
  text
} from '@clack/prompts'
import { TOTAL_STEPS } from '../constants'
import type { PromptOption } from '../types'
import { clipboardAvailable, readClipboard } from './clipboard'

export { cancel, intro, isCancel, log, note, outro, spinner } from '@clack/prompts'

export function stepHeader(step: number, title: string): void {
  log.step(`[${step}/${TOTAL_STEPS}] ${title}`)
}

export function instructions(title: string, lines: readonly string[]): void {
  note(lines.join('\n'), title)
}

// Bordered warning block: yellow border + warning icon. note() has no warning
// variant, and box() wraps long lines so the border stays aligned.
export function warningBox(message: string, title: string): void {
  const yellow = (s: string) => styleText('yellow', s)
  box(message, yellow(`${S_WARN} ${title}`), { width: 'auto', formatBorder: yellow })
}

// Esc at any prompt aborts the whole setup (parity with the old scripts: print and exit 0).
function guard<T>(value: T | typeof CANCEL_SYMBOL): T {
  if (isCancel(value)) {
    cancel('Aborted.')
    process.exit(0)
  }
  return value
}

export async function askConfirm(message: string, initialValue = false): Promise<boolean> {
  return guard(await confirm({ message, initialValue }))
}

export async function askSelect<T extends string>(
  message: string,
  options: readonly PromptOption<T>[],
  initialValue?: T
): Promise<T> {
  // clack's Option<T> is a deferred conditional type, so the generic call site
  // cannot be checked; the result is always one of the provided values.
  const result = await select<string>({
    message,
    options: options.map((option) => ({ value: option.value, label: option.label, hint: option.hint })),
    initialValue
  })
  return guard(result as T | typeof CANCEL_SYMBOL)
}

export async function askMultiSelect(
  message: string,
  options: readonly PromptOption[],
  initialValues: readonly string[] = []
): Promise<string[]> {
  const result = await multiselect<string>({
    message,
    options: options.map((option) => ({ value: option.value, label: option.label, hint: option.hint })),
    initialValues: [...initialValues]
  })
  return guard(result)
}

export async function askText(message: string, initialValue = ''): Promise<string> {
  return guard(await text({ message, initialValue }))
}

export async function askPassword(message: string): Promise<string> {
  return guard(await password({ message }))
}

// Primary secret entry: copy the value in the browser, pick "Read from
// clipboard" here; manual paste stays available for headless servers.
export async function askSecret(name: string): Promise<string> {
  if (!(await clipboardAvailable())) {
    log.message('No clipboard tool available - paste manually (right-click or Ctrl+Shift+V, not Ctrl+C).')
    return askPassword(`Paste your ${name} (Enter to skip)`)
  }
  for (;;) {
    const mode = await askSelect<'clipboard' | 'manual'>(`Copy your ${name} to your clipboard, then choose:`, [
      { value: 'clipboard', label: 'Read from clipboard' },
      { value: 'manual', label: 'Paste manually' }
    ])
    if (mode === 'manual') return askPassword(`Paste your ${name} (Enter to skip)`)
    const value = await readClipboard()
    if (value) {
      log.success(`Received from clipboard (${value.length} characters)`)
      return value
    }
    log.warn('Clipboard is empty - paste manually instead.')
    log.message('Paste with right-click or Ctrl+Shift+V (not Ctrl+C).')
    return askPassword(`Paste your ${name} (Enter to skip)`)
  }
}
