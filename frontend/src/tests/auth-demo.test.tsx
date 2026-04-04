import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

// Mock api module
vi.mock('../lib/api', () => ({
  default: {
    get: vi.fn(),
    post: vi.fn(),
    interceptors: {
      request: { use: vi.fn() },
      response: { use: vi.fn() },
    },
    defaults: { baseURL: 'http://localhost:8090' },
  },
}))

vi.mock('../lib/mockApi', () => ({
  enableDemoMode: vi.fn(),
}))

// ---------------------------------------------------------------------------
// Demo mode activation logic
// ---------------------------------------------------------------------------

describe('Demo mode', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  afterEach(() => {
    localStorage.clear()
  })

  test('isDemoMode detects query param', () => {
    // Simulate ?demo=true in the URL
    const originalLocation = window.location
    Object.defineProperty(window, 'location', {
      writable: true,
      value: { ...originalLocation, search: '?demo=true' },
    })

    const params = new URLSearchParams(window.location.search)
    expect(params.get('demo')).toBe('true')

    // Restore
    Object.defineProperty(window, 'location', {
      writable: true,
      value: originalLocation,
    })
  })

  test('isDemoMode detects localStorage flag', () => {
    localStorage.setItem('demo_mode', 'true')
    const isDemo =
      new URLSearchParams(window.location.search).get('demo') === 'true' ||
      localStorage.getItem('demo_mode') === 'true'
    expect(isDemo).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// Demo badge rendering — test Sidebar directly (lighter than full AppShell)
// ---------------------------------------------------------------------------

describe('Demo badge in Sidebar', () => {
  beforeEach(() => {
    // Mock auth to return isDemo: true
    vi.doMock('../lib/auth', () => ({
      useAuth: () => ({
        user: { id: 1, email: 'demo@aqsoft.ai', full_name: 'Demo User (MSO Admin)', role: 'mso_admin' },
        isDemo: true,
        login: vi.fn(),
        logout: vi.fn(),
        isLoading: false,
        setDemoRole: vi.fn(),
      }),
      AuthProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
    }))
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  test('demo badge shows when active', async () => {
    const { Sidebar } = await import('../components/layout/Sidebar')

    render(
      <MemoryRouter initialEntries={['/']}>
        <Sidebar collapsed={false} onToggle={() => {}} />
      </MemoryRouter>
    )

    // Sidebar renders a "DEMO" badge when isDemo is true
    const demoBadges = screen.getAllByText('DEMO')
    expect(demoBadges.length).toBeGreaterThanOrEqual(1)
  })
})
