export function useCopyToClipboard() {
  const toast = useToast()
  const { t } = useI18n()

  async function copyToClipboard(text: string): Promise<void> {
    try {
      await navigator.clipboard.writeText(text)
      toast.add({ title: t('browse.copied'), color: 'success' })
    } catch {
      toast.add({ title: t('browse.copyFailed'), color: 'error' })
    }
  }

  return { copyToClipboard }
}
