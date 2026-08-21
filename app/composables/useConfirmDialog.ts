import { useOverlay } from '@nuxt/ui/composables'
import ConfirmDialog from '~/components/ConfirmDialog.vue'
import type { ConfirmDialogOptions } from '~/types/confirm'

// Wraps Nuxt UI's useOverlay in the confirm-dialog pattern from the official docs:
// a single awaitable confirm() instead of create/open boilerplate at every call site.
// The SFC import lives here so the OpenedOverlay conditional types (which ESLint's
// tsserver cannot evaluate for SFCs, though vue-tsc verifies them) are contained
// in one place instead of every page.
export function useConfirmDialog() {
  const overlay = useOverlay()

  function confirm(options: ConfirmDialogOptions): Promise<boolean> {
    const modal = overlay.create(ConfirmDialog, {
      destroyOnClose: true,
      props: options
    })
    return modal.open()
  }

  return { confirm }
}
