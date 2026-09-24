import { computed, onScopeDispose, ref } from 'vue'
import type { TorrentSearchLimitInfo, TorrentStreamEvent } from '#server/types/torrent-search'
import {
  TORRENT_STREAM_RECONNECT_BASE_MS,
  TORRENT_STREAM_RECONNECT_MAX_MS,
  TORRENT_STREAM_STALE_MS
} from '#server/types/torrent-search'

export type TorrentSearchPhase = 'connecting' | 'searching' | 'finishing' | 'done' | 'error' | 'idle'

// Subscribes to a torrent search SSE stream (see
// /api/browse/movie/:id/torrents-stream and
// /api/browse/tv/:id/season/:season/torrents-stream) and exposes the progress
// as plain refs. The search runs server-side inside the SSE request, so the
// client is always subscribed before any event is emitted; a mid-search drop
// is recovered with a bounded backoff, and the finished queries of the
// re-run arrive instantly from the server-side Prowlarr cache.
export function useTorrentSearch<T>() {
  // 'connecting' is also the SSR state: the progress card renders on the
  // server and the real stream starts on hydration
  const phase = ref<TorrentSearchPhase>('connecting')
  const queriesTotal = ref(0)
  const queriesCompleted = ref(0)
  const foundSoFar = ref(0)
  const payload = ref<T | null>(null)
  const limitInfo = ref<TorrentSearchLimitInfo | null>(null)

  // Tier queries currently in flight; the first is the one the UI names
  const activeQueries = ref<string[]>([])
  const currentQuery = computed(() => activeQueries.value[0] ?? null)

  let eventSource: EventSource | null = null
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null
  let staleTimer: ReturnType<typeof setTimeout> | null = null
  let reconnectDelay = TORRENT_STREAM_RECONNECT_BASE_MS
  let terminal = false
  let activeUrl = ''

  function resetProgress() {
    queriesTotal.value = 0
    queriesCompleted.value = 0
    foundSoFar.value = 0
    activeQueries.value = []
  }

  function clearStaleTimer() {
    if (staleTimer !== null) {
      clearTimeout(staleTimer)
      staleTimer = null
    }
  }

  function armStaleWatchdog() {
    clearStaleTimer()
    // The server goes silent if Prowlarr hangs or the connection drops without
    // an error event: never leave the indicator stuck, surface an error state
    // so the page falls back to its empty/error presentation
    staleTimer = setTimeout(() => {
      terminal = true
      closeSource()
      phase.value = 'error'
    }, TORRENT_STREAM_STALE_MS)
  }

  function closeSource() {
    if (reconnectTimer !== null) {
      clearTimeout(reconnectTimer)
      reconnectTimer = null
    }
    clearStaleTimer()
    if (eventSource !== null) {
      eventSource.close()
      eventSource = null
    }
  }

  function applyEvent(e: TorrentStreamEvent) {
    switch (e.type) {
      case 'start':
        // A second `start` (TV original-name retry) resets the ladder counters
        phase.value = 'searching'
        resetProgress()
        queriesTotal.value = e.queries
        break
      case 'query':
        phase.value = 'searching'
        if (e.state === 'start') {
          activeQueries.value.push(e.text)
        } else {
          const at = activeQueries.value.indexOf(e.text)
          if (at !== -1) activeQueries.value.splice(at, 1)
          if (e.state === 'done') foundSoFar.value += e.results
          queriesCompleted.value += 1
          if (queriesTotal.value > 0 && queriesCompleted.value >= queriesTotal.value) {
            phase.value = 'finishing'
          }
        }
        break
      case 'imdb':
        foundSoFar.value += e.results
        break
      case 'done':
        // Terminal: valid from any state, including a fast early-stop where it
        // arrives without any query events in between
        terminal = true
        payload.value = e.data as T
        phase.value = 'done'
        break
      case 'error':
        terminal = true
        if (e.code === 'limit') limitInfo.value = e.data
        phase.value = 'error'
        break
    }
  }

  function connect(url: string) {
    if (import.meta.server) return
    activeUrl = url
    terminal = false
    phase.value = 'connecting'
    armStaleWatchdog()

    eventSource = new EventSource(url)

    eventSource.onopen = () => {
      reconnectDelay = TORRENT_STREAM_RECONNECT_BASE_MS
    }

    eventSource.onmessage = (msg) => {
      if (terminal) return
      let data: TorrentStreamEvent
      try {
        data = JSON.parse(msg.data) as TorrentStreamEvent
      } catch {
        return
      }
      armStaleWatchdog()
      applyEvent(data)
      if (terminal) {
        // The server closes after a terminal event; EventSource would treat
        // that as a connection error and auto-reconnect - stop it
        closeSource()
      }
    }

    eventSource.onerror = () => {
      if (terminal) {
        closeSource()
        return
      }
      // Connection dropped mid-search: reconnect with exponential backoff
      closeSource()
      reconnectTimer = setTimeout(() => {
        reconnectTimer = null
        if (!terminal) connect(activeUrl)
      }, reconnectDelay)
      reconnectDelay = Math.min(reconnectDelay * 2, TORRENT_STREAM_RECONNECT_MAX_MS)
    }
  }

  function start(url: string) {
    if (import.meta.server) return
    closeSource()
    terminal = false
    reconnectDelay = TORRENT_STREAM_RECONNECT_BASE_MS
    payload.value = null
    limitInfo.value = null
    resetProgress()
    connect(url)
  }

  function stop() {
    terminal = true
    closeSource()
    phase.value = 'idle'
  }

  onScopeDispose(stop)

  return {
    phase,
    queriesTotal,
    queriesCompleted,
    foundSoFar,
    currentQuery,
    payload,
    limitInfo,
    start,
    stop
  }
}
