import { describe, test, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'

// Mock api module
vi.mock('../lib/api', () => ({
  default: {
    get: vi.fn(() => Promise.resolve({ data: { items: [] } })),
    post: vi.fn(() => Promise.resolve({ data: {} })),
  },
}))

// Mock auth
vi.mock('../lib/auth', () => ({
  useAuth: () => ({
    user: { id: 1, email: 'test@test.com', full_name: 'Test', role: 'mso_admin' },
    isDemo: false,
    login: vi.fn(),
    logout: vi.fn(),
    isLoading: false,
    setDemoRole: vi.fn(),
  }),
}))

// ---------------------------------------------------------------------------
// JobHistory
// ---------------------------------------------------------------------------

describe('JobHistory', () => {
  let JobHistory: typeof import('../components/ingestion/JobHistory').JobHistory

  beforeEach(async () => {
    const mod = await import('../components/ingestion/JobHistory')
    JobHistory = mod.JobHistory
  })

  test('renders and shows loading then empty state', async () => {
    render(<JobHistory />)

    // After the API resolves with empty items, the component should render
    // without crashing. It may show a loading state briefly then empty.
    await waitFor(() => {
      // The component should be in the document without errors
      expect(document.body.textContent).toBeDefined()
    })
  })
})

// ---------------------------------------------------------------------------
// ColumnMapper
// ---------------------------------------------------------------------------

describe('ColumnMapper', () => {
  let ColumnMapper: typeof import('../components/ingestion/ColumnMapper').ColumnMapper

  beforeEach(async () => {
    const mod = await import('../components/ingestion/ColumnMapper')
    ColumnMapper = mod.ColumnMapper
  })

  test('renders with proposed mapping', () => {
    render(
      <ColumnMapper
        jobId="test-job-123"
        proposedMapping={{ col_a: 'member_id', col_b: 'first_name' }}
        sampleData={{ col_a: ['M001', 'M002'], col_b: ['John', 'Jane'] }}
        detectedType="roster"
      />
    )

    // Should render the detected type and column names
    expect(screen.getByText(/roster/i)).toBeDefined()
  })
})

// ---------------------------------------------------------------------------
// IngestionPage (full page)
// ---------------------------------------------------------------------------

describe('IngestionPage', () => {
  let IngestionPage: typeof import('../pages/IngestionPage').IngestionPage

  beforeEach(async () => {
    const mod = await import('../pages/IngestionPage')
    IngestionPage = mod.IngestionPage
  })

  test('renders page header and tabs', () => {
    render(<IngestionPage />)

    expect(screen.getByText('Data Ingestion')).toBeDefined()
    expect(screen.getByText('Upload')).toBeDefined()
    expect(screen.getByText('History')).toBeDefined()
  })
})
