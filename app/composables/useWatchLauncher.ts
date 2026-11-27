import type { WatchPlatform, WatchTarget } from '#shared/watch'
import { rankWatchTargets, resolveWatchUrl } from '#shared/watch'

const NATIVE_OPEN_TIMEOUT_MS = 1200

export function useWatchLauncher() {
  function openInBrowser(url: string): void {
    const opened = window.open(url, '_blank', 'noopener,noreferrer')
    if (!opened) {
      window.location.assign(url)
    }
  }

  function requestNative(url: string): Promise<boolean> {
    return new Promise((resolve) => {
      let settled = false
      const iframe = document.createElement('iframe')
      iframe.hidden = true
      iframe.src = url

      const cleanup = (): void => {
        document.removeEventListener('visibilitychange', onVisibilityChange)
        window.removeEventListener('blur', onAppOpened)
        window.clearTimeout(timer)
        iframe.remove()
      }
      const finish = (opened: boolean): void => {
        if (settled) return
        settled = true
        cleanup()
        resolve(opened)
      }
      function onVisibilityChange(): void {
        if (document.visibilityState === 'hidden') finish(true)
      }
      function onAppOpened(): void {
        finish(true)
      }

      const timer = window.setTimeout(() => finish(false), NATIVE_OPEN_TIMEOUT_MS)
      document.addEventListener('visibilitychange', onVisibilityChange)
      window.addEventListener('blur', onAppOpened)
      document.body.appendChild(iframe)
    })
  }

  async function launchNativeThenWeb(
    nativeTargets: WatchTarget[],
    webTarget: WatchTarget | undefined,
    platform: WatchPlatform
  ): Promise<boolean> {
    for (const target of nativeTargets) {
      const url = resolveWatchUrl(target, platform)
      if (url !== null && (await requestNative(url))) {
        return true
      }
    }

    const webUrl = webTarget ? resolveWatchUrl(webTarget, platform) : null
    if (webUrl !== null) {
      openInBrowser(webUrl)
    }
    return false
  }

  async function launch(targets: WatchTarget[], platform: WatchPlatform, preferred?: WatchTarget): Promise<boolean> {
    const ranked = rankWatchTargets(targets, platform)
    const webTarget = ranked.find((target) => target.kind === 'web')

    if (preferred) {
      if (preferred.kind === 'web') {
        const url = resolveWatchUrl(preferred, platform)
        if (url !== null) openInBrowser(url)
        return false
      }
      return launchNativeThenWeb([preferred], webTarget, platform)
    }

    return launchNativeThenWeb(
      ranked.filter((target) => target.kind === 'native'),
      webTarget,
      platform
    )
  }

  return { launch }
}
