import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
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
  it('renders the assignment-detected banner copy with ticker, strike, type, and date', async () => {
    await renderBanner()

    expect(
      screen.getByText(
        /Assignment detected: AAPL \$180 PUT was assigned on Apr 17\. Confirm to update position\./
      )
    ).toBeInTheDocument()
  })

  it('shows Confirm and Dismiss buttons', async () => {
    await renderBanner()

    expect(screen.getByRole('button', { name: /confirm/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /dismiss/i })).toBeInTheDocument()
  })

  it('clicking Confirm calls window.api.assignments.confirm with the id and shows the success toast copy on ok:true', async () => {
    const user = userEvent.setup()
    mockConfirm.mockResolvedValue({
      ok: true,
      position: { id: 42, phase: 'HOLDING_SHARES', assignedAt: '2026-04-17T14:30:00Z' }
    })

    await renderBanner()
    await user.click(screen.getByRole('button', { name: /confirm/i }))

    await waitFor(() => {
      expect(mockConfirm).toHaveBeenCalledWith(ASSIGNMENT.id)
      expect(
        screen.getByText('AAPL assigned — now holding 100 shares at $180 strike')
      ).toBeInTheDocument()
    })
  })

  it('success toast includes "Open covered call →" link routing to the position detail page', async () => {
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

  it('surfaces an error toast and keeps the banner when confirm fails (result.ok === false)', async () => {
    const user = userEvent.setup()
    mockConfirm.mockResolvedValue({
      ok: false,
      code: 'not_pending',
      errors: [
        { field: '__root__', code: 'not_pending', message: 'Assignment is no longer pending' }
      ]
    })

    await renderBanner()
    await user.click(screen.getByRole('button', { name: /confirm/i }))

    await waitFor(() => {
      expect(screen.getByText('Assignment is no longer pending')).toBeInTheDocument()
    })
    // The warning banner must remain so the trader can retry or dismiss.
    expect(screen.getByText(/Assignment detected: AAPL/)).toBeInTheDocument()
  })

  it('auto-dismisses the success toast after the timeout elapses', async () => {
    vi.useFakeTimers()
    try {
      mockConfirm.mockResolvedValue({
        ok: true,
        position: { id: 42, phase: 'HOLDING_SHARES', assignedAt: '2026-04-17T14:30:00Z' }
      })

      await renderBanner()
      // fireEvent + act (rather than userEvent) so the async confirm handler and
      // its state update flush cleanly under fake timers.
      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: /confirm/i }))
      })

      expect(
        screen.getByText('AAPL assigned — now holding 100 shares at $180 strike')
      ).toBeInTheDocument()

      await act(async () => {
        await vi.advanceTimersByTimeAsync(10_000)
      })

      expect(
        screen.queryByText('AAPL assigned — now holding 100 shares at $180 strike')
      ).not.toBeInTheDocument()
    } finally {
      vi.useRealTimers()
    }
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
