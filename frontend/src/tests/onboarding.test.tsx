import { describe, test, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

// Mock api module
vi.mock('../lib/api', () => ({
  default: { get: vi.fn(), post: vi.fn() },
}))

// Mock auth module — not in demo mode by default
vi.mock('../lib/auth', () => ({
  useAuth: () => ({
    user: { id: 1, email: 'test@test.com', full_name: 'Test User', role: 'mso_admin' },
    isDemo: false,
    login: vi.fn(),
    logout: vi.fn(),
    isLoading: false,
    setDemoRole: vi.fn(),
  }),
  AuthProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}))

// Mock enableDemoMode so auth.tsx import doesn't break
vi.mock('../lib/mockApi', () => ({
  enableDemoMode: vi.fn(),
}))

// ---------------------------------------------------------------------------
// OnboardingPage
// ---------------------------------------------------------------------------

describe('OnboardingPage', () => {
  let OnboardingPage: typeof import('../pages/OnboardingPage').OnboardingPage

  beforeEach(async () => {
    const mod = await import('../pages/OnboardingPage')
    OnboardingPage = mod.OnboardingPage
  })

  test('renders without crashing', () => {
    render(
      <MemoryRouter>
        <OnboardingPage />
      </MemoryRouter>
    )
    expect(screen.getByText('Setup Wizard')).toBeDefined()
  })

  test('shows all 5 step titles in the step indicator', () => {
    render(
      <MemoryRouter>
        <OnboardingPage />
      </MemoryRouter>
    )
    // Some titles appear both in the step indicator and the step header,
    // so use getAllByText and check at least one exists
    expect(screen.getAllByText('Organization').length).toBeGreaterThanOrEqual(1)
    expect(screen.getAllByText('Data Sources').length).toBeGreaterThanOrEqual(1)
    expect(screen.getAllByText('Structure').length).toBeGreaterThanOrEqual(1)
    expect(screen.getAllByText('Quality Review').length).toBeGreaterThanOrEqual(1)
    expect(screen.getAllByText('Processing').length).toBeGreaterThanOrEqual(1)
  })
})

// ---------------------------------------------------------------------------
// WizardStep5Processing — warning & error status handling
// ---------------------------------------------------------------------------

describe('WizardStep5Processing', () => {
  let WizardStep5Processing: typeof import('../components/onboarding/WizardStep5Processing').WizardStep5Processing

  beforeEach(async () => {
    const mod = await import('../components/onboarding/WizardStep5Processing')
    WizardStep5Processing = mod.WizardStep5Processing
  })

  test('renders all pipeline step labels', () => {
    render(<WizardStep5Processing demoMode={false} />)
    expect(screen.getByText('Loading data...')).toBeDefined()
    expect(screen.getByText('Running HCC analysis...')).toBeDefined()
    expect(screen.getByText('Computing provider scorecards...')).toBeDefined()
    expect(screen.getByText('Detecting care gaps...')).toBeDefined()
    expect(screen.getByText('Generating AI insights...')).toBeDefined()
  })

  test('handles warning status from stub API responses', async () => {
    // The component handles "stub" status by setting status to "warning"
    // and showing "Not yet implemented" text. We verify the component
    // renders without errors when the API returns stub responses.
    const { default: api } = await import('../lib/api')
    const mockPost = api.post as ReturnType<typeof vi.fn>
    mockPost.mockResolvedValue({ data: { status: 'stub', message: 'Not yet implemented' } })

    const mockGet = api.get as ReturnType<typeof vi.fn>
    mockGet.mockRejectedValue(new Error('not running'))

    render(<WizardStep5Processing demoMode={false} />)
    // Component should render without crashing even with stub responses
    expect(screen.getByText('Loading data...')).toBeDefined()
  })

  test('handles error status from failed API responses', async () => {
    const { default: api } = await import('../lib/api')
    const mockPost = api.post as ReturnType<typeof vi.fn>
    mockPost.mockRejectedValue(new Error('Network error'))

    const mockGet = api.get as ReturnType<typeof vi.fn>
    mockGet.mockRejectedValue(new Error('not running'))

    render(<WizardStep5Processing demoMode={false} />)
    // Component should render without crashing even with errors
    expect(screen.getByText('Loading data...')).toBeDefined()
  })
})
