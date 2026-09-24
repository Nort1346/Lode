import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { effectScope, type EffectScope } from 'vue'

class MockEventSource {
  static instances: MockEventSource[] = []
  readonly url: string
  onmessage: ((e: { data: string }) => void) | null = null
  onerror: (() => void) | null = null
  onopen: (() => void) | null = null
  closed = false

  constructor(url: string) {
    this.url = url
    MockEventSource.instances.push(this)
  }

  close() {
    this.closed = true
  }

  emit(data: unknown) {
    this.onmessage?.({ data: JSON.stringify(data) })
  }

  fireError() {
    this.onerror?.()
  }
}

vi.stubGlobal('EventSource', MockEventSource)

import { useTorrentSearch } from '../../../app/composables/useTorrentSearch'

type Search = ReturnType<typeof useTorrentSearch<{ torrents: Array<{ title: string }> }>>

let scope: EffectScope

function use(): Search {
  return scope.run(() => useTorrentSearch<{ torrents: Array<{ title: string }> }>())!
}

describe('useTorrentSearch', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    MockEventSource.instances = []
    scope = effectScope()
  })

  afterEach(() => {
    scope.stop()
    vi.useRealTimers()
  })

  it('walks the phase machine through a full event stream', () => {
    const s = use()
    s.start('/api/stream')
    const es = MockEventSource.instances[0]!
    expect(es.url).toBe('/api/stream')
    expect(s.phase.value).toBe('connecting')

    es.emit({ type: 'start', queries: 2 })
    expect(s.phase.value).toBe('searching')
    expect(s.queriesTotal.value).toBe(2)

    es.emit({ type: 'query', state: 'start', index: 1, total: 2, text: 'Show S01 2020' })
    expect(s.currentQuery.value).toBe('Show S01 2020')

    es.emit({ type: 'query', state: 'done', index: 1, total: 2, text: 'Show S01 2020', results: 12 })
    expect(s.queriesCompleted.value).toBe(1)
    expect(s.foundSoFar.value).toBe(12)
    expect(s.currentQuery.value).toBeNull()
    expect(s.phase.value).toBe('searching')

    es.emit({ type: 'imdb', results: 8 })
    expect(s.foundSoFar.value).toBe(20)

    es.emit({ type: 'query', state: 'done', index: 2, total: 2, text: 'Show', results: 1 })
    expect(s.phase.value).toBe('finishing')

    es.emit({ type: 'done', found: 20, data: { torrents: [{ title: 'a' }] } })
    expect(s.phase.value).toBe('done')
    expect(s.payload.value).toEqual({ torrents: [{ title: 'a' }] })
  })

  it('handles a fast early stop: done without any query events', () => {
    const s = use()
    s.start('/api/stream')
    const es = MockEventSource.instances[0]!

    es.emit({ type: 'start', queries: 4 })
    es.emit({ type: 'done', found: 0, data: { torrents: [] } })

    expect(s.phase.value).toBe('done')
    expect(s.payload.value).toEqual({ torrents: [] })
  })

  it('resets the ladder counters on a second start event (TV original-name retry)', () => {
    const s = use()
    s.start('/api/stream')
    const es = MockEventSource.instances[0]!

    es.emit({ type: 'start', queries: 2 })
    es.emit({ type: 'query', state: 'done', index: 1, total: 2, text: 'A', results: 5 })
    es.emit({ type: 'start', queries: 2 })

    expect(s.queriesCompleted.value).toBe(0)
    expect(s.foundSoFar.value).toBe(0)
    expect(s.phase.value).toBe('searching')
  })

  it('surfaces a limit error as the limitInfo state', () => {
    const s = use()
    s.start('/api/stream')
    const es = MockEventSource.instances[0]!

    es.emit({ type: 'error', code: 'limit', status: 429, data: { activeCount: 3, todayCount: 9, limit: 10 } })

    expect(s.phase.value).toBe('error')
    expect(s.limitInfo.value).toEqual({ activeCount: 3, todayCount: 9, limit: 10 })
  })

  it('does not reconnect after a terminal event', () => {
    const s = use()
    s.start('/api/stream')
    const es = MockEventSource.instances[0]!

    es.emit({ type: 'done', found: 1, data: { torrents: [{ title: 'a' }] } })
    es.fireError() // the server closed the stream after done

    vi.advanceTimersByTime(120_000)
    expect(MockEventSource.instances).toHaveLength(1)
  })

  it('reconnects with exponential backoff after a mid-search drop', () => {
    const s = use()
    s.start('/api/stream')
    const es1 = MockEventSource.instances[0]!
    es1.emit({ type: 'start', queries: 2 })
    es1.fireError()

    expect(MockEventSource.instances).toHaveLength(1)
    vi.advanceTimersByTime(1999)
    expect(MockEventSource.instances).toHaveLength(1)
    vi.advanceTimersByTime(1)
    expect(MockEventSource.instances).toHaveLength(2)
    expect(MockEventSource.instances[1]!.url).toBe('/api/stream')
    expect(s.phase.value).toBe('connecting')

    // second drop doubles the delay to 4s
    MockEventSource.instances[1]!.fireError()
    vi.advanceTimersByTime(3999)
    expect(MockEventSource.instances).toHaveLength(2)
    vi.advanceTimersByTime(1)
    expect(MockEventSource.instances).toHaveLength(3)
  })

  it('fails the search if the stream goes silent (stale watchdog)', () => {
    const s = use()
    s.start('/api/stream')
    expect(s.phase.value).toBe('connecting')

    vi.advanceTimersByTime(60_000)

    expect(s.phase.value).toBe('error')
  })

  it('restarts cleanly when start is called again (language or media change)', () => {
    const s = use()
    s.start('/api/stream')
    s.start('/api/stream?locale=pl')

    expect(MockEventSource.instances).toHaveLength(2)
    expect(MockEventSource.instances[0]!.closed).toBe(true)
    expect(MockEventSource.instances[1]!.url).toBe('/api/stream?locale=pl')
    expect(s.payload.value).toBeNull()
  })

  it('stops the stream when the scope is disposed', () => {
    const s = use()
    s.start('/api/stream')
    const es = MockEventSource.instances[0]!

    scope.stop()

    expect(es.closed).toBe(true)
    expect(s.phase.value).toBe('idle')
  })
})
