export function useDownloadOverlay() {
  const active = useState('download-overlay', () => false)
  const label = useState('download-overlay-label', () => '')

  function startDownload(downloadLabel = 'Adding torrent...') {
    active.value = true
    label.value = downloadLabel
  }

  function finishDownload() {
    active.value = false
    label.value = ''
  }

  return { active, label, startDownload, finishDownload }
}
