import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

// ─── Hoisted mocks ────────────────────────────────────────────────────────────

const { mockUsePendingAssignments, mockUseQuery, mockInvalidateQueries } = vi.hoisted(() => ({
  mockUsePendingAssignments: vi.fn(),
  mockUseQuery: vi.fn(),
  mockInvalidateQueries: vi.fn()
}))

// Mock the assignments API module so component tests don't trigger real IPC
vi.mock('../api/assignments', () => ({
  usePendingAssignments: mockUsePendingAssignments
}))

// Mock @tanstack/react-query: preserve all real exports, override only useQuery
// and useQueryClient so the component's cache-invalidation calls are captured.
vi.mock('@tanstack/react-query', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@tanstack/react-query')>()
  return {
    ...actual,
    useQuery: mockUseQuery,
    useQueryClient: () => ({ invalidateQueries: mockInvalidateQueries })
  }
})

// Mock wouter: provide a minimal Link that renders a plain <a> so we can
// assert href values without a full router context.
vi.mock('wouter', () => ({
  useLocation: () => ['/', vi.fn()],
  Link: ({ children, href }: { children: React.ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  )
}))

// ─── Fixtures ─────────────────────────────────────────────────────────────────

type PendingAssignment = {
  id: number
  ticker: string
  strike: string
  expiration: string
  contractType: 'put' | 'call'
  qty: number
  transactionTime: string
  positionId: number
}

const ASSIGNMENT: PendingAssignment = {
  id: 1,
  ticker: 'AAPL',
  strike: '180.00',
  expiration: '2026-04-17',
  contractType: 'put',
  qty: 1,
  transactionTime: '2026-04-17T14:30:00Z',
  positionId: 42
}

// ─── window.api mocks ─────────────────────────────────────────────────────────

const mockConfirm = vi.fn()
const mockDismiss = vi.fn()
const mockListPending = vi.fn()

beforeEach(() => {
  mockUsePendingAssignments.mockReset()
  mockConfirm.mockReset()
  mockDismiss.mockReset()
  mockListPending.mockReset()
  mockInvalidateQueries.mockReset()
  mockUseQuery.mockReset()

  // Default: one pending assignment
  mockUsePendingAssignments.mockReturnValue({
    data: [ASSIGNMENT],
    isLoading: false,
    isError: false
  })

  Object.assign(window, {
    api: {
      ...(window.api ?? {}),
      assignments: {
        confirm: mockConfirm,
        dismiss: mockDismiss,
        listPending: mockListPending
      }
    }
  })
})

// Dynamic import so the module-level vi.mock is in place before the component
// module is evaluated (mirrors the pattern used in AssignmentSheet.test.tsx).
async function renderBanner(): Promise<import('@testing-library/react').RenderResult> {
  const mod = await import('./AssignmentNotificationBanner')
  return render(<mod.AssignmentNotificationBanner />)
}

// ─── Component tests ──────────────────────────────────────────────────────────

describe('AssignmentNotificationBanner', () => {
  it('renders ticker, strike, contract type, and transaction date', async () => {
    await renderBanner()

    expect(screen.getByText('AAPL')).toBeInTheDocument()
    // Strike is displayed (e.g. "$180.00" or "180")
    expect(screen.getByText(/180/)).toBeInTheDocument()
    // Contract type label
    expect(screen.getByText(/put/i)).toBeInTheDocument()
    // Transaction date (ISO date portion must appear somewhere)
    expect(screen.getByText(/2026-04-17/)).toBeInTheDocument()
  })

  it('shows Confirm and Dismiss buttons', async () => {
    await renderBanner()

    expect(screen.getByRole('button', { name: /confirm/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /dismiss/i })).toBeInTheDocument()
  })

  it('clicking Confirm calls window.api.assignments.confirm with the id and shows a success message on ok:true', async () => {
    const user = userEvent.setup()
    mockConfirm.mockResolvedValue({
      ok: true,
      position: { id: 42, phase: 'HOLDING_SHARES', assignedAt: '2026-04-17T14:30:00Z' }
    })

    await renderBanner()
    await user.click(screen.getByRole('button', { name: /confirm/i }))

    await waitFor(() => {
      expect(mockConfirm).toHaveBeenCalledWith(ASSIGNMENT.id)
      expect(screen.getByText(/assignment confirmed/i)).toBeInTheDocument()
    })
  })

  it('success state includes "Open covered call →" link routing to the position detail page', async () => {
    const user = userEvent.setup()
    mockConfirm.mockResolvedValue({
      ok: true,
      position: { id: 42, phase: 'HOLDING_SHARES', assignedAt: '2026-04-17T14:30:00Z' }
    })

    await renderBanner()
    await user.click(screen.getByRole('button', { name: /confirm/i }))

    await waitFor(() => {
      const link = screen.getByRole('link', { name: /open covered call →/i })
      expect(link).toBeInTheDocument()
      // Hash routing: wouter Link receives "/positions/{id}"; the mock <a> exposes
      // whatever href the component passes, so we assert on the path segment.
      expect(link).toHaveAttribute('href', `/positions/${ASSIGNMENT.positionId}`)
    })
  })

  it('clicking Dismiss calls window.api.assignments.dismiss with the id and the banner unmounts on ok:true', async () => {
    const user = userEvent.setup()
    mockDismiss.mockResolvedValue({ ok: true, dismissedAt: '2026-04-17T14:30:00Z' })

    await renderBanner()
    await user.click(screen.getByRole('button', { name: /dismiss/i }))

    // The component must locally remove the dismissed banner so the ticker
    // disappears without waiting for a query refetch.
    await waitFor(() => {
      expect(mockDismiss).toHaveBeenCalledWith(ASSIGNMENT.id)
      expect(screen.queryByText('AAPL')).not.toBeInTheDocument()
    })
  })
})

// ─── Hook configuration test ──────────────────────────────────────────────────

describe('usePendingAssignments', () => {
  it('calls useQuery with refetchInterval: 30_000', async () => {
    mockUseQuery.mockReturnValue({ data: [], isLoading: false, isError: false })

    // vi.importActual bypasses the vi.mock('../api/assignments') stub so the
    // real hook implementation is loaded. @tanstack/react-query is still mocked,
    // so we can inspect what options the hook passes to useQuery.
    // In the red phase this throws module-not-found — the correct failing reason.
    const mod = await vi.importActual<{ usePendingAssignments: () => unknown }>(
      '../api/assignments'
    )
    mod.usePendingAssignments()

    expect(mockUseQuery).toHaveBeenCalledWith(expect.objectContaining({ refetchInterval: 30_000 }))
  })
})
