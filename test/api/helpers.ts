import { vi } from 'vitest'

export interface MockSession {
  user?: { id: string; username: string; role: string; [key: string]: unknown }
  sessionId?: string
}

export interface MockDbOptions {
  selectResult?: unknown
  selectAllResult?: unknown
  insertResult?: unknown
  deleteResult?: unknown
}

export function createMockDb(options: MockDbOptions = {}) {
  const runMock = vi.fn(() => ({ changes: 1 }))
  const getMock = vi.fn(() => options.selectResult)
  const allMock = vi.fn(() => options.selectAllResult ?? [])
  const setMock = vi.fn(() => ({ where: vi.fn(() => ({ run: runMock })) }))

  const mockDb = {
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          get: getMock,
          all: allMock,
          orderBy: vi.fn(() => ({
            get: getMock,
            all: allMock
          }))
        })),
        orderBy: vi.fn(() => ({
          where: vi.fn(() => ({
            get: getMock,
            all: allMock
          })),
          get: getMock,
          all: allMock
        })),
        get: getMock,
        all: allMock
      }))
    })),
    insert: vi.fn(() => ({
      values: vi.fn(() => ({ run: runMock }))
    })),
    update: vi.fn(() => ({
      set: setMock
    })),
    delete: vi.fn(() => ({
      where: vi.fn(() => ({ run: runMock }))
    })),
    _mocks: { getMock, allMock, runMock, setMock }
  }

  return mockDb
}

export function createMockEvent(
  _options: {
    session?: MockSession
    body?: Record<string, unknown>
    query?: Record<string, string | undefined>
  } = {}
) {
  return {
    __event: true
  } as unknown as Parameters<Parameters<typeof import('h3').defineEventHandler>[0]>[0]
}

export function stubAdminAuth(mockGetUserSession: ReturnType<typeof vi.fn>) {
  vi.stubGlobal('getUserSession', mockGetUserSession)
  vi.stubGlobal(
    'requireAdmin',
    vi.fn().mockImplementation(async (event: never) => {
      const session = await (mockGetUserSession as unknown as (...args: unknown[]) => Promise<MockSession>)(event)
      if (!session?.user) {
        throw new Error('401: Unauthorized')
      }
      if (session.user.role !== 'admin') {
        throw new Error('403: Forbidden')
      }
      return session.user
    })
  )
  vi.stubGlobal('logActivity', vi.fn())
}
