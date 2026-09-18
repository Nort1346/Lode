import { copyToClipboardOsc52 } from '../core/clipboard'
import { dcCmdPrefix } from '../core/docker'
import { hyperlink } from '../core/hyperlink'
import { log, note } from '../core/prompt'
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
  if (selection.flaresolverr)
    rows.push({ label: 'FlareSolverr', value: 'http://localhost:8191', url: 'http://localhost:8191' })
  rows.push({ label: 'Database', value: selection.dbDriver })
  if (selection.dbDriver === 'postgres') rows.push({ label: 'PostgreSQL', value: 'localhost:5432 / lode' })
  if (selection.dozzle) rows.push({ label: 'Dozzle', value: 'http://localhost:8082', url: 'http://localhost:8082' })
  return rows
}

export function showSummary(ctx: StepContext): void {
  log.success('Lode is ready!')
  const rows = buildRows(ctx).map((row) => `  ${row.label.padEnd(18)} ${row.url ? hyperlink(row.value) : row.value}`)
  note(rows.join('\n'), 'Services')

  log.message('Username: admin')
  if (ctx.adminPass) {
    copyToClipboardOsc52(ctx.adminPass)
    log.message(`Password: ${ctx.adminPass}`)
    log.message('Copied to clipboard (this replaces your previous clipboard contents)')
  } else {
    log.message(`Password: check '${dcCmdPrefix(ctx.composeFiles)} logs lode'`)
  }
  log.message('Change this password after first login.')

  const { selection } = ctx
  const required =
    selection.prowlarr === 'local'
      ? [
          'Prowlarr has no indexers yet - Lode cannot find torrents until you add them.',
          `Open ${hyperlink('http://localhost:9900')} and add at least one indexer (e.g. YTS).`,
          ...(selection.flaresolverr
            ? ['For private trackers: Settings > Indexers > Add > FlareSolverr, URL: http://flaresolverr:8191']
            : [])
        ]
      : ['Your external Prowlarr needs at least one indexer before Lode can find torrents.']
  note(required.map((line) => `  ${line}`).join('\n'), 'Required before first use')
}
