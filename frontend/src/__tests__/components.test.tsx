import { describe, test, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { Tag } from '../components/ui/Tag'
import { MetricCard } from '../components/ui/MetricCard'
import { DataTierBadge } from '../components/ui/DataTierBadge'
import { DRG_LOOKUP, isDrgCode, extractDrgCode, extractDrgCodes } from '../components/ui/DrgTooltip'

// Mock the api module so InsightCard doesn't make real HTTP calls
vi.mock('../lib/api', () => ({
  default: {
    post: vi.fn(() => Promise.resolve({ data: {} })),
    get: vi.fn(() => Promise.resolve({ data: {} })),
  },
}))

// ---------------------------------------------------------------------------
// Tag
// ---------------------------------------------------------------------------

describe('Tag', () => {
  test('renders children text', () => {
    render(<Tag>Test Label</Tag>)
    expect(screen.getByText('Test Label')).toBeDefined()
  })

  test('renders with green variant', () => {
    render(<Tag variant="green">Active</Tag>)
    const el = screen.getByText('Active')
    expect(el).toBeDefined()
  })

  test('renders with amber variant', () => {
    render(<Tag variant="amber">Warning</Tag>)
    expect(screen.getByText('Warning')).toBeDefined()
  })

  test('renders with red variant', () => {
    render(<Tag variant="red">Critical</Tag>)
    expect(screen.getByText('Critical')).toBeDefined()
  })

  test('renders with blue variant', () => {
    render(<Tag variant="blue">Info</Tag>)
    expect(screen.getByText('Info')).toBeDefined()
  })

  test('defaults to default variant', () => {
    render(<Tag>Default</Tag>)
    const el = screen.getByText('Default')
    expect(el).toBeDefined()
    // Should have inline styles from the default variant
    expect(el.style.background).toBeTruthy()
  })
})

// ---------------------------------------------------------------------------
// MetricCard
// ---------------------------------------------------------------------------

describe('MetricCard', () => {
  test('renders label and value', () => {
    render(<MetricCard label="Total Lives" value="4,832" />)
    expect(screen.getByText('Total Lives')).toBeDefined()
    expect(screen.getByText('4,832')).toBeDefined()
  })

  test('renders trend when provided', () => {
    render(<MetricCard label="RAF" value="1.247" trend="+2.3%" trendDirection="up" />)
    expect(screen.getByText('+2.3%')).toBeDefined()
  })

  test('does not render trend when not provided', () => {
    const { container } = render(<MetricCard label="Count" value="100" />)
    // Should only have label and value, no trend element
    const divs = container.querySelectorAll('div')
    // Outer card + label + value = 3 divs, no trend div
    expect(divs.length).toBe(3)
  })

  test('renders down trend with correct styling', () => {
    render(<MetricCard label="Cost" value="$500" trend="-1.5%" trendDirection="down" />)
    expect(screen.getByText('-1.5%')).toBeDefined()
  })

  test('renders flat trend', () => {
    render(<MetricCard label="MLR" value="85%" trend="0.0%" trendDirection="flat" />)
    expect(screen.getByText('0.0%')).toBeDefined()
  })
})

// ---------------------------------------------------------------------------
// DataTierBadge
// ---------------------------------------------------------------------------

describe('DataTierBadge', () => {
  test('renders "Est." label in default mode', () => {
    render(<DataTierBadge />)
    expect(screen.getByText('Est.')).toBeDefined()
  })

  test('renders compact mode as small dot', () => {
    const { container } = render(<DataTierBadge compact />)
    // In compact mode, no "Est." text should appear
    expect(screen.queryByText('Est.')).toBeNull()
    // Should have a small dot span
    const dots = container.querySelectorAll('span.inline-block')
    expect(dots.length).toBe(1)
  })

  test('shows tooltip on hover in default mode', () => {
    render(<DataTierBadge />)
    const trigger = screen.getByText('Est.')
    fireEvent.mouseEnter(trigger.parentElement!)
    expect(screen.getByText(/estimated from ADT data/i)).toBeDefined()
  })

  test('hides tooltip on mouse leave', () => {
    render(<DataTierBadge />)
    const trigger = screen.getByText('Est.')
    fireEvent.mouseEnter(trigger.parentElement!)
    expect(screen.getByText(/estimated from ADT data/i)).toBeDefined()
    fireEvent.mouseLeave(trigger.parentElement!)
    expect(screen.queryByText(/estimated from ADT data/i)).toBeNull()
  })

  test('renders custom tooltip text', () => {
    render(<DataTierBadge tooltip="Custom tooltip" />)
    fireEvent.mouseEnter(screen.getByText('Est.').parentElement!)
    expect(screen.getByText('Custom tooltip')).toBeDefined()
  })
})

// ---------------------------------------------------------------------------
// DrgTooltip helpers (pure functions, no rendering needed)
// ---------------------------------------------------------------------------

describe('DRG_LOOKUP', () => {
  test('contains known DRG codes', () => {
    expect(DRG_LOOKUP['291']).toBeDefined()
    expect(DRG_LOOKUP['291'].description).toBe('Heart Failure & Shock w/ MCC')
    expect(DRG_LOOKUP['470']).toBeDefined()
    expect(DRG_LOOKUP['470'].description).toBe('Major Hip/Knee Joint Replacement')
  })

  test('returns undefined for unknown DRG', () => {
    expect(DRG_LOOKUP['999']).toBeUndefined()
  })
})

describe('isDrgCode', () => {
  test('returns true for valid DRG codes', () => {
    expect(isDrgCode('291')).toBe(true)
    expect(isDrgCode('470')).toBe(true)
    expect(isDrgCode('DRG 291')).toBe(true)
  })

  test('returns false for invalid codes', () => {
    expect(isDrgCode('999')).toBe(false)
    expect(isDrgCode('abc')).toBe(false)
    expect(isDrgCode('')).toBe(false)
  })
})

describe('extractDrgCode', () => {
  test('extracts valid DRG code from string', () => {
    expect(extractDrgCode('291')).toBe('291')
    expect(extractDrgCode('DRG 470')).toBe('470')
  })

  test('returns null for invalid input', () => {
    expect(extractDrgCode('999')).toBeNull()
    expect(extractDrgCode('hello')).toBeNull()
  })
})

describe('extractDrgCodes', () => {
  test('extracts multiple DRG codes', () => {
    const codes = extractDrgCodes('DRG 291, 470, 392')
    expect(codes).toContain('291')
    expect(codes).toContain('470')
    expect(codes).toContain('392')
  })

  test('returns empty for no matches', () => {
    expect(extractDrgCodes('no codes here')).toEqual([])
  })
})

// ---------------------------------------------------------------------------
// InsightCard
// ---------------------------------------------------------------------------

describe('InsightCard', () => {
  // Dynamic import to avoid issues with api mock timing
  let InsightCard: typeof import('../components/ui/InsightCard').InsightCard

  beforeEach(async () => {
    const mod = await import('../components/ui/InsightCard')
    InsightCard = mod.InsightCard
  })

  test('renders title and description', () => {
    render(
      <InsightCard
        title="Revenue Opportunity"
        description="50 members have unrecaptured HCCs"
        category="revenue"
      />
    )
    expect(screen.getByText('Revenue Opportunity')).toBeDefined()
    expect(screen.getByText('50 members have unrecaptured HCCs')).toBeDefined()
  })

  test('renders impact when provided', () => {
    render(
      <InsightCard
        title="Test"
        description="Desc"
        impact="$125,000 annual value"
        category="cost"
      />
    )
    expect(screen.getByText('$125,000 annual value')).toBeDefined()
  })

  test('renders dismiss button when callback provided', () => {
    const onDismiss = vi.fn()
    render(
      <InsightCard
        title="Test"
        description="Desc"
        category="quality"
        onDismiss={onDismiss}
      />
    )
    const btn = screen.getByText('Dismiss')
    expect(btn).toBeDefined()
    fireEvent.click(btn)
    expect(onDismiss).toHaveBeenCalledTimes(1)
  })

  test('renders bookmark button when callback provided', () => {
    const onBookmark = vi.fn()
    render(
      <InsightCard
        title="Test"
        description="Desc"
        category="provider"
        onBookmark={onBookmark}
      />
    )
    const btn = screen.getByText('Bookmark')
    expect(btn).toBeDefined()
    fireEvent.click(btn)
    expect(onBookmark).toHaveBeenCalledTimes(1)
  })

  test('renders with each category variant', () => {
    const categories = ['revenue', 'cost', 'quality', 'provider', 'trend', 'cross_module'] as const
    for (const cat of categories) {
      const { unmount } = render(
        <InsightCard title={`Cat ${cat}`} description="d" category={cat} />
      )
      expect(screen.getByText(`Cat ${cat}`)).toBeDefined()
      unmount()
    }
  })
})
