// [US-110] Screening-criteria sheet on the PMCC lens — the six PMCC groups, pre-fill,
// the overlapping-window and IV-band rules gating "Save & re-screen", the two IV-rank
// toggles, "Reset to defaults", and the save round trip through `window.api`.

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { PmccScreeningCriteria } from '../api/pmcc-screening-criteria'
import { PmccScreeningCriteriaForm } from './PmccScreeningCriteriaForm'

const mockSavePmccCriteria = vi.fn<Window['api']['screener']['savePmccCriteria']>()
const onClose = vi.fn()
const onSaved = vi.fn()

const OVERLAP = 'LEAPS minimum DTE must exceed short-call maximum DTE'
const IV_INVERTED = 'IV-rank floor must be less than IV-rank ceiling'
const DELTA_INVERTED = 'Minimum delta must be less than maximum delta'
const DTE_INVERTED = 'Minimum DTE must be less than maximum DTE'

// A saved document away from every default, so pre-fill and "Reset to defaults"
// are each distinguishable from the other.
const PERSISTED: PmccScreeningCriteria = {
  longDeltaMin: '0.75',
  longDeltaMax: '0.90',
  longDteMin: 200,
  longDteMax: 600,
  shortDeltaMin: '0.20',
  shortDeltaMax: '0.30',
  shortDteMin: 25,
  shortDteMax: 50,
  maxDebitToWidthPercent: '80',
  minOpenInterest: 300,
  maxSpreadPercent: '12',
  maxSpreadAbsolute: '0.10',
  minIvRank: '30',
  maxIvRank: '55',
  earningsHandling: 'flag'
}

// The shipped defaults: both IV-rank toggles off, earnings Exclude.
const DEFAULTS: PmccScreeningCriteria = {
  longDeltaMin: '0.70',
  longDeltaMax: '0.85',
  longDteMin: 180,
  longDteMax: 540,
  shortDeltaMin: '0.25',
  shortDeltaMax: '0.35',
  shortDteMin: 20,
  shortDteMax: 45,
  maxDebitToWidthPercent: '90',
  minOpenInterest: 200,
  maxSpreadPercent: '10',
  maxSpreadAbsolute: '0.10',
  minIvRank: null,
  maxIvRank: null,
  earningsHandling: 'exclude'
}

function renderForm(criteria: PmccScreeningCriteria = DEFAULTS, watchlistCount?: number): void {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } }
  })
  render(
    <QueryClientProvider client={queryClient}>
      <PmccScreeningCriteriaForm
        criteria={criteria}
        watchlistCount={watchlistCount}
        onClose={onClose}
        onSaved={onSaved}
      />
    </QueryClientProvider>
  )
}

const saveButton = (): HTMLElement => screen.getByRole('button', { name: 'Save & re-screen' })

async function retype(label: string, value: string): Promise<void> {
  const user = userEvent.setup()
  const input = screen.getByLabelText(label)
  await user.clear(input)
  await user.type(input, value)
}

beforeEach(() => {
  mockSavePmccCriteria.mockReset()
  onClose.mockReset()
  onSaved.mockReset()
  Object.assign(window, {
    api: {
      ...(window.api ?? {}),
      screener: { ...(window.api?.screener ?? {}), savePmccCriteria: mockSavePmccCriteria }
    }
  })
})

describe('PmccScreeningCriteriaForm — layout', () => {
  it('renders the Screener eyebrow and Screening Criteria title', () => {
    renderForm()
    expect(screen.getByText('Screener')).toBeInTheDocument()
    expect(screen.getByText('Screening Criteria')).toBeInTheDocument()
  })

  it('names the PMCC lens and the watchlist size in the subtitle', () => {
    renderForm(DEFAULTS, 9)
    expect(screen.getByTestId('sheet-subtitle')).toHaveTextContent(
      /^Applies to all 9 watchlist tickers · PMCC · LEAPS \+ short call$/
    )
  })

  it('names only the PMCC lens in the subtitle when the watchlist size is unknown', () => {
    renderForm()
    expect(screen.getByTestId('sheet-subtitle')).toHaveTextContent(/^PMCC · LEAPS \+ short call$/)
  })

  it('renders the six PMCC groups in order', () => {
    renderForm()
    const groups = screen.getAllByText(
      /^(LEAPS \(long call\)|Short call|Spread efficiency \(pair\)|Liquidity \(per leg\)|IV environment \(optional\)|Policy)$/
    )
    expect(groups.map((group) => group.textContent)).toEqual([
      'LEAPS (long call)',
      'Short call',
      'Spread efficiency (pair)',
      'Liquidity (per leg)',
      'IV environment (optional)',
      'Policy'
    ])
  })

  it('pre-fills every input from the persisted criteria', () => {
    renderForm(PERSISTED)

    expect(screen.getByLabelText('LEAPS minimum delta')).toHaveValue('0.75')
    expect(screen.getByLabelText('LEAPS maximum delta')).toHaveValue('0.90')
    expect(screen.getByLabelText('LEAPS minimum DTE')).toHaveValue('200')
    expect(screen.getByLabelText('LEAPS maximum DTE')).toHaveValue('600')
    expect(screen.getByLabelText('Short-call minimum delta')).toHaveValue('0.20')
    expect(screen.getByLabelText('Short-call maximum delta')).toHaveValue('0.30')
    expect(screen.getByLabelText('Short-call minimum DTE')).toHaveValue('25')
    expect(screen.getByLabelText('Short-call maximum DTE')).toHaveValue('50')
    expect(screen.getByLabelText('Max debit / width')).toHaveValue('80')
    expect(screen.getByLabelText('Minimum open interest')).toHaveValue('300')
    expect(screen.getByLabelText('Max bid-ask spread')).toHaveValue('12')
    expect(screen.getByTestId('iv-rank-floor-on')).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByLabelText('IV-rank floor')).toHaveValue('30')
    expect(screen.getByTestId('iv-rank-ceiling-on')).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByLabelText('IV-rank ceiling')).toHaveValue('55')
    expect(screen.getByTestId('earnings-flag')).toHaveAttribute('aria-pressed', 'true')
  })
})

describe('PmccScreeningCriteriaForm — validation', () => {
  // Validity resolves after the first render, so the reset link is awaited.
  it('offers Reset to defaults while every field is valid', async () => {
    renderForm()
    expect(await screen.findByRole('button', { name: 'Reset to defaults' })).toBeInTheDocument()
    expect(saveButton()).toBeEnabled()
  })

  it('shows the overlap message inline, disables Save and asks to fix the fields for a LEAPS minimum DTE of 40', async () => {
    renderForm()

    await retype('LEAPS minimum DTE', '40')

    expect(await screen.findByText(OVERLAP)).toBeInTheDocument()
    await waitFor(() => expect(saveButton()).toBeDisabled())
    expect(screen.getByText('Fix the highlighted fields.')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Reset to defaults' })).not.toBeInTheDocument()
  })

  it('shows the IV-band message when the floor is set above the ceiling', async () => {
    const user = userEvent.setup()
    renderForm()

    await user.click(screen.getByTestId('iv-rank-floor-on'))
    await user.click(screen.getByTestId('iv-rank-ceiling-on'))
    await retype('IV-rank floor', '60')
    await retype('IV-rank ceiling', '40')

    expect(await screen.findByText(IV_INVERTED)).toBeInTheDocument()
    await waitFor(() => expect(saveButton()).toBeDisabled())
  })

  // A cross-field rule is bound to one field but read from two: editing the other end must
  // re-check the bound field, or its message is missing (or stale) while Save is disabled.
  describe('editing the end a cross-field rule is not bound to', () => {
    it('shows the overlap message when Short-call maximum DTE reaches the LEAPS minimum', async () => {
      renderForm()

      await retype('Short-call maximum DTE', '200')

      expect(await screen.findByText(OVERLAP)).toBeInTheDocument()
    })

    it('clears the overlap message and re-enables Save when Short-call maximum DTE is lowered below it', async () => {
      renderForm()
      await retype('LEAPS minimum DTE', '40')
      expect(await screen.findByText(OVERLAP)).toBeInTheDocument()

      await retype('Short-call maximum DTE', '30')

      await waitFor(() => expect(screen.queryByText(OVERLAP)).not.toBeInTheDocument())
      expect(saveButton()).toBeEnabled()
    })

    it('shows the inverted-delta message when a minimum delta is raised above its maximum', async () => {
      renderForm()

      await retype('Short-call minimum delta', '0.40')

      expect(await screen.findByText(DELTA_INVERTED)).toBeInTheDocument()
    })

    it('shows the inverted-DTE message when a minimum DTE is raised above its maximum', async () => {
      renderForm()

      await retype('Short-call minimum DTE', '50')

      expect(await screen.findByText(DTE_INVERTED)).toBeInTheDocument()
    })

    it('shows the IV-band message when the floor is typed above an existing ceiling', async () => {
      const user = userEvent.setup()
      renderForm()
      await user.click(screen.getByTestId('iv-rank-floor-on'))
      await user.click(screen.getByTestId('iv-rank-ceiling-on'))
      await retype('IV-rank ceiling', '40')

      await retype('IV-rank floor', '60')

      expect(await screen.findByText(IV_INVERTED)).toBeInTheDocument()
    })

    it('clears the IV-band message when the ceiling is switched Off', async () => {
      const user = userEvent.setup()
      renderForm()
      await user.click(screen.getByTestId('iv-rank-floor-on'))
      await user.click(screen.getByTestId('iv-rank-ceiling-on'))
      await retype('IV-rank floor', '60')
      await retype('IV-rank ceiling', '40')
      expect(await screen.findByText(IV_INVERTED)).toBeInTheDocument()

      await user.click(screen.getByTestId('iv-rank-ceiling-off'))

      await waitFor(() => expect(screen.queryByText(IV_INVERTED)).not.toBeInTheDocument())
      expect(saveButton()).toBeEnabled()
    })
  })

  it('disables the IV-rank ceiling input while its toggle is Off and enables it when switched On', async () => {
    const user = userEvent.setup()
    renderForm()

    expect(screen.getByLabelText('IV-rank ceiling')).toBeDisabled()
    await user.click(screen.getByTestId('iv-rank-ceiling-on'))

    await waitFor(() => expect(screen.getByLabelText('IV-rank ceiling')).toBeEnabled())
  })

  it('disables the IV-rank floor input while its toggle is Off and enables it when switched On', async () => {
    const user = userEvent.setup()
    renderForm()

    expect(screen.getByLabelText('IV-rank floor')).toBeDisabled()
    await user.click(screen.getByTestId('iv-rank-floor-on'))

    await waitFor(() => expect(screen.getByLabelText('IV-rank floor')).toBeEnabled())
  })
})

describe('PmccScreeningCriteriaForm — footer', () => {
  it('restores every field to the shipped PMCC default when Reset to defaults is clicked', async () => {
    const user = userEvent.setup()
    renderForm(PERSISTED)

    await user.click(await screen.findByRole('button', { name: 'Reset to defaults' }))

    await waitFor(() => expect(screen.getByLabelText('LEAPS minimum delta')).toHaveValue('0.70'))
    expect(screen.getByLabelText('LEAPS maximum delta')).toHaveValue('0.85')
    expect(screen.getByLabelText('LEAPS minimum DTE')).toHaveValue('180')
    expect(screen.getByLabelText('LEAPS maximum DTE')).toHaveValue('540')
    expect(screen.getByLabelText('Short-call minimum delta')).toHaveValue('0.25')
    expect(screen.getByLabelText('Short-call maximum delta')).toHaveValue('0.35')
    expect(screen.getByLabelText('Short-call minimum DTE')).toHaveValue('20')
    expect(screen.getByLabelText('Short-call maximum DTE')).toHaveValue('45')
    expect(screen.getByLabelText('Max debit / width')).toHaveValue('90')
    expect(screen.getByLabelText('Minimum open interest')).toHaveValue('200')
    expect(screen.getByLabelText('Max bid-ask spread')).toHaveValue('10')
    expect(screen.getByTestId('iv-rank-floor-off')).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByTestId('iv-rank-ceiling-off')).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByTestId('earnings-exclude')).toHaveAttribute('aria-pressed', 'true')
    expect(mockSavePmccCriteria).not.toHaveBeenCalled()
  })

  it('closes without saving when Cancel is clicked', async () => {
    const user = userEvent.setup()
    renderForm()

    await user.click(screen.getByRole('button', { name: 'Cancel' }))

    expect(onClose).toHaveBeenCalledTimes(1)
    expect(mockSavePmccCriteria).not.toHaveBeenCalled()
  })
})

describe('PmccScreeningCriteriaForm — save', () => {
  it('saves the edited criteria as the PMCC payload', async () => {
    mockSavePmccCriteria.mockResolvedValue({ ok: true, criteria: DEFAULTS })
    const user = userEvent.setup()
    renderForm()

    await retype('Max debit / width', '85')
    await user.click(saveButton())

    await waitFor(() => expect(mockSavePmccCriteria).toHaveBeenCalledTimes(1))
    expect(mockSavePmccCriteria.mock.calls[0][0]).toEqual({
      longDeltaMin: '0.70',
      longDeltaMax: '0.85',
      longDteMin: 180,
      longDteMax: 540,
      shortDeltaMin: '0.25',
      shortDeltaMax: '0.35',
      shortDteMin: 20,
      shortDteMax: 45,
      maxDebitToWidthPercent: '85',
      minOpenInterest: 200,
      maxSpreadPercent: '10',
      minIvRank: null,
      maxIvRank: null,
      earningsHandling: 'exclude'
    })
  })

  it('calls onSaved and then onClose once the save succeeds', async () => {
    const order: string[] = []
    onSaved.mockImplementation(() => order.push('onSaved'))
    onClose.mockImplementation(() => order.push('onClose'))
    mockSavePmccCriteria.mockResolvedValue({ ok: true, criteria: DEFAULTS })
    const user = userEvent.setup()
    renderForm()

    await user.click(saveButton())

    await waitFor(() => expect(order).toEqual(['onSaved', 'onClose']))
  })

  it('binds a field error returned by the save to that field and keeps the sheet open', async () => {
    mockSavePmccCriteria.mockResolvedValue({
      ok: false,
      errors: [{ field: 'longDteMin', code: 'overlapping_windows', message: OVERLAP }]
    })
    const user = userEvent.setup()
    renderForm()

    expect(screen.queryByText(OVERLAP)).not.toBeInTheDocument()
    await user.click(saveButton())

    expect(await screen.findByText(OVERLAP)).toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(onClose).not.toHaveBeenCalled()
  })

  it('surfaces a form-level alert for an error naming a field the sheet has no input for', async () => {
    mockSavePmccCriteria.mockResolvedValue({
      ok: false,
      errors: [
        {
          field: 'earningsHandling',
          code: 'invalid_enum',
          message: 'Earnings handling must be Exclude or Flag only.'
        }
      ]
    })
    const user = userEvent.setup()
    renderForm()

    await user.click(saveButton())

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Earnings handling must be Exclude or Flag only.'
    )
    expect(onClose).not.toHaveBeenCalled()
  })

  it('surfaces the generic save failure when the save rejects without field detail', async () => {
    mockSavePmccCriteria.mockRejectedValue(new Error('ipc channel closed'))
    const user = userEvent.setup()
    renderForm()

    await user.click(saveButton())

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Could not save the screening criteria — please try again.'
    )
    expect(onClose).not.toHaveBeenCalled()
  })
})
