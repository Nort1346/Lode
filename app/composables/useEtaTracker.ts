import { useI18n } from 'vue-i18n'

import { formatEta, getEtaState } from './useTorrentUtils'
import type { EtaDisplay, EtaInput, EtaState } from '~/types/downloads'

// The ETA is computed server-side (shared by every user) and delivered with
// each download row. The client only formats it; it no longer samples speed
// itself, so opening the page mid-download or on a second device shows the
// already warmed-up value immediately.
type EtaRow = EtaInput & { etaState?: EtaState }

export function useEtaTracker() {
  const { t } = useI18n()

  function displayFor(dl: EtaRow): EtaDisplay {
    // Fallback for an older API response without the server-computed state.
    const state = dl.etaState ?? getEtaState(dl)
    if (state === 'ready') return { state, etaSeconds: dl.etaSeconds > 0 ? dl.etaSeconds : null }
    return { state, etaSeconds: null }
  }

  function etaState(dl: EtaRow): EtaState {
    return displayFor(dl).state
  }

  function etaLabel(dl: EtaRow): string {
    const display = displayFor(dl)
    if (display.state === 'ready') return formatEta(display.etaSeconds ?? 0)
    if (display.state === 'waiting-seeders') return t('dashboard.etaWaitingSeeders')
    return t('dashboard.etaCalculating')
  }

  return { displayFor, etaState, etaLabel }
}
