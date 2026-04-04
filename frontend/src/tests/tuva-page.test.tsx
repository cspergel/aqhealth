import { describe, test, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'

// Mock api module
vi.mock('../lib/api', () => ({
  default: { get: vi.fn(), post: vi.fn() },
}))

// Mock fetch globally — simulate backend unavailable so component falls back to demo data
const originalFetch = globalThis.fetch
beforeEach(() => {
  globalThis.fetch = vi.fn().mockRejectedValue(new Error('Backend unavailable'))
})

// ---------------------------------------------------------------------------
// TuvaPage
// ---------------------------------------------------------------------------

describe('TuvaPage', () => {
  let TuvaPage: typeof import('../pages/TuvaPage').TuvaPage

  beforeEach(async () => {
    const mod = await import('../pages/TuvaPage')
    TuvaPage = mod.TuvaPage
  })

  test('renders with demo data when API unavailable', async () => {
    render(<TuvaPage />)
    await waitFor(() => {
      expect(screen.getByText('Tuva Health Integration')).toBeDefined()
    })
  })

  test('shows all tabs', async () => {
    render(<TuvaPage />)
    await waitFor(() => {
      expect(screen.getByText('Overview')).toBeDefined()
      expect(screen.getByText('3-Tier Comparison')).toBeDefined()
      expect(screen.getByText('1,000 Patient Demo')).toBeDefined()
      expect(screen.getByText('RAF Baselines')).toBeDefined()
      expect(screen.getByText('PMPM Baselines')).toBeDefined()
      expect(screen.getByText('Pipeline')).toBeDefined()
    })
  })

  test('comparison tab renders member list after fallback to demo', async () => {
    render(<TuvaPage />)

    // Wait for demo data to load (fetch fails, fallback kicks in)
    await waitFor(() => {
      expect(screen.getByText('Tuva Health Integration')).toBeDefined()
    })

    // Click the comparison tab
    const compTab = screen.getByText('3-Tier Comparison')
    compTab.click()

    await waitFor(() => {
      // Demo comparisons include "John Smith"
      expect(screen.getByText('John Smith')).toBeDefined()
    })
  })

  test('falls back to demo data gracefully', async () => {
    // fetch is already mocked to reject
    render(<TuvaPage />)

    await waitFor(() => {
      expect(screen.getByText('Tuva Health Integration')).toBeDefined()
    })

    // Should show DEMO DATA badge when using fallback data
    expect(screen.getByText('DEMO DATA')).toBeDefined()
  })
})
