import { copyToClipboardOsc52 } from '../core/clipboard'
import { showTitleBanner } from '../core/banner'
import { dcCmdPrefix } from '../core/docker'
import { hyperlink } from '../core/hyperlink'
import { note, warningBox } from '../core/prompt'
import type { StepContext, SummaryRow } from '../types'

function buildRows(ctx: StepContext): SummaryRow[] {
  const { selection, urls } = ctx
  const rows: SummaryRow[] = [{ label: 'Lode', value: 'http://localhost:5757', url: 'http://localhost:5757' }]
  const qbit = selection.qbittorrent === 'local' ? 'http://localhost:8080' : urls.qbittorrent
  rows.push({ label: 'qBittorrent', value: qbit, url: /^https?:\/\//.test(qbit) ? qbit : undefined })
  const prowlarr = selection.prowlarr === 'local' ? 'http://localhost:9900' : urls.prowlarr
  rows.push({ label: 'Prowlarr', value: prowlarr, url: /^https?:\/\//.test(prowlarr) ? prowlarr : undefined })
  if (selection.mediaMode === 'local') {
    rows.push({ label: 'Jellyfin', value: 'http://localhost:8096', url: 'http://localhost:8096' })
  } else if (selection.mediaMode === 'external') {
    rows.push({
      label: 'Jellyfin',
      value: urls.jellyfin,
      url: /^https?:\/\//.test(urls.jellyfin) ? urls.jellyfin : undefined
    })
  } else {
    rows.push({ label: 'Jellyfin', value: '(disabled)' })
  }
  if (selection.flaresolverr) rows.push({ label: 'FlareSolverr', value: 'http://localhost:8191', url: 'http://localhost:8191' })
  rows.push({ label: 'Database', value: selection.dbDriver })
  if (selection.dbDriver === 'postgres') rows.push({ label: 'PostgreSQL', value: 'localhost:5432 / lode' })
  if (selection.dozzle) rows.push({ label: 'Dozzle', value: 'http://localhost:8082', url: 'http://localhost:8082' })
  return rows
}

export async function showSummary(ctx: StepContext): Promise<void> {
  await showTitleBanner(true)

  // BEL-terminated hyperlinks measure at their visible width, so the note border stays aligned.
  const rows = buildRows(ctx).map((row) => `  ${row.label.padEnd(18)} ${row.url ? hyperlink(row.value) : row.value}`)
  note(rows.join('\n'), 'Services')

  const cred: string[] = ['  Username:  admin']
  if (ctx.adminPass) {
    copyToClipboardOsc52(ctx.adminPass)
    cred.push(`  Password:  ${ctx.adminPass}`)
    cred.push('  (copied to clipboard - this replaces your previous contents)')
  } else {
    cred.push(`  Password:  check '${dcCmdPrefix(ctx.composeFiles)} logs lode'`)
  }
  note(cred.join('\n'), 'Login')
  warningBox('Change this password after your first login.', 'Password')

  const { selection } = ctx
  const required =
    selection.prowlarr === 'local'
      ? [
          'Prowlarr has no indexers yet - Lode cannot find torrents until you add them.',
          'Open http://localhost:9900 and add at least one indexer (e.g. YTS).',
          ...(selection.flaresolverr
            ? ['For private trackers: Settings > Indexers > Add > FlareSolverr, URL: http://flaresolverr:8191']
            : [])
        ]
      : ['Your external Prowlarr needs at least one indexer before Lode can find torrents.']
  warningBox(required.join('\n'), 'Required before first use')
}
