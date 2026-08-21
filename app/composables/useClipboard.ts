export function useCopyToClipboard() {
  const toast = useToast()
  const { t } = useI18n()

  async function copyToClipboard(text: string): Promise<void> {
    try {
      // navigator.clipboard is unavailable in non-secure (plain HTTP) contexts, which is a
      // common deployment mode for a self-hosted instance - fall back to legacy copy
      if (navigator.clipboard !== undefined && window.isSecureContext) {
        await navigator.clipboard.writeText(text)
      } else {
        const textarea = document.createElement('textarea')
        textarea.value = text
        textarea.style.position = 'fixed'
        textarea.style.opacity = '0'
        document.body.appendChild(textarea)
        textarea.select()
        const ok = document.execCommand('copy')
        document.body.removeChild(textarea)
        if (!ok) throw new Error('copy failed')
      }
      toast.add({ title: t('browse.copied'), color: 'success' })
    } catch {
      toast.add({ title: t('browse.copyFailed'), color: 'error' })
    }
  }

  return { copyToClipboard }
}
