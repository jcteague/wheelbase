import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { vi } from 'vitest'
import { PositionDetailActions } from './PositionDetailActions'

const BASE_PROPS = {
  strategyType: 'WHEEL' as const,
  hasOpenShortCall: false,
  hasOpenLeaps: false,
  hasCostBasis: true,
  ccExpired: false,
  onOpenCc: vi.fn(),
  onRecordAssignment: vi.fn(),
  onRecordExpiration: vi.fn(),
  onCloseCcEarly: vi.fn(),
  onRecordCallAway: vi.fn(),
  onRecordCcExpiration: vi.fn(),
  onRollCsp: vi.fn(),
  onRollCc: vi.fn(),
  onRollPmccShort: vi.fn(),
  onRollPmccLeaps: vi.fn()
}

const WHEEL_TEST_IDS = [
  'record-call-away-btn',
  'roll-cc-btn',
  'close-cc-early-btn',
  'record-cc-expiration-btn',
  'open-covered-call-btn',
  'roll-csp-btn',
  'record-assignment-btn',
  'record-expiration-btn'
]

beforeEach(() => {
  BASE_PROPS.onOpenCc.mockReset()
  BASE_PROPS.onRecordAssignment.mockReset()
  BASE_PROPS.onRecordExpiration.mockReset()
  BASE_PROPS.onCloseCcEarly.mockReset()
  BASE_PROPS.onRecordCallAway.mockReset()
  BASE_PROPS.onRecordCcExpiration.mockReset()
  BASE_PROPS.onRollCsp.mockReset()
  BASE_PROPS.onRollCc.mockReset()
  BASE_PROPS.onRollPmccShort.mockReset()
  BASE_PROPS.onRollPmccLeaps.mockReset()
})

it('renders "Close CC Early →" button when phase=CC_OPEN', () => {
  render(<PositionDetailActions {...BASE_PROPS} phase="CC_OPEN" />)
  expect(screen.getByText(/Close CC Early/i)).toBeInTheDocument()
})

it('does not render "Close CC Early →" button when phase=HOLDING_SHARES', () => {
  render(<PositionDetailActions {...BASE_PROPS} phase="HOLDING_SHARES" />)
  expect(screen.queryByText(/Close CC Early/i)).not.toBeInTheDocument()
})

it('calls onCloseCcEarly when "Close CC Early →" button is clicked', async () => {
  const user = userEvent.setup()
  render(<PositionDetailActions {...BASE_PROPS} phase="CC_OPEN" />)
  await user.click(screen.getByText(/Close CC Early/i))
  expect(BASE_PROPS.onCloseCcEarly).toHaveBeenCalledOnce()
})

it('renders "Record Call-Away →" button when phase is CC_OPEN', () => {
  render(<PositionDetailActions {...BASE_PROPS} phase="CC_OPEN" />)
  expect(screen.getByTestId('record-call-away-btn')).toBeInTheDocument()
})

it('does not render "Record Call-Away →" button when phase is HOLDING_SHARES', () => {
  render(<PositionDetailActions {...BASE_PROPS} phase="HOLDING_SHARES" />)
  expect(screen.queryByTestId('record-call-away-btn')).not.toBeInTheDocument()
})

it('calls onRecordCallAway when the "Record Call-Away →" button is clicked', async () => {
  const user = userEvent.setup()
  render(<PositionDetailActions {...BASE_PROPS} phase="CC_OPEN" />)
  await user.click(screen.getByTestId('record-call-away-btn'))
  expect(BASE_PROPS.onRecordCallAway).toHaveBeenCalledOnce()
})

it('renders "Roll CSP →" button with data-testid="roll-csp-btn" when phase=CSP_OPEN', () => {
  render(<PositionDetailActions {...BASE_PROPS} phase="CSP_OPEN" />)
  const btn = screen.getByTestId('roll-csp-btn')
  expect(btn).toBeInTheDocument()
  expect(btn).toHaveTextContent('Roll CSP →')
})

it('does not render "Roll CSP →" button when phase=HOLDING_SHARES', () => {
  render(<PositionDetailActions {...BASE_PROPS} phase="HOLDING_SHARES" />)
  expect(screen.queryByTestId('roll-csp-btn')).not.toBeInTheDocument()
})

it('calls onRollCsp when "Roll CSP →" button is clicked', async () => {
  const user = userEvent.setup()
  render(<PositionDetailActions {...BASE_PROPS} phase="CSP_OPEN" />)
  await user.click(screen.getByTestId('roll-csp-btn'))
  expect(BASE_PROPS.onRollCsp).toHaveBeenCalledOnce()
})

it('PositionDetailActions: shows "Roll CC →" button when phase is CC_OPEN', () => {
  const onRollCc = vi.fn()
  render(<PositionDetailActions {...BASE_PROPS} phase="CC_OPEN" onRollCc={onRollCc} />)
  expect(screen.getByTestId('roll-cc-btn')).toBeInTheDocument()
})

it('PositionDetailActions: does not show "Roll CC →" button when phase is CSP_OPEN', () => {
  const onRollCc = vi.fn()
  render(<PositionDetailActions {...BASE_PROPS} phase="CSP_OPEN" onRollCc={onRollCc} />)
  expect(screen.queryByTestId('roll-cc-btn')).not.toBeInTheDocument()
})

describe('roll button visibility across all phases', () => {
  const ALL_PHASES = [
    'CSP_OPEN',
    'CSP_EXPIRED',
    'CSP_CLOSED_PROFIT',
    'CSP_CLOSED_LOSS',
    'HOLDING_SHARES',
    'CC_OPEN',
    'CC_EXPIRED',
    'CC_CLOSED_PROFIT',
    'CC_CLOSED_LOSS',
    'WHEEL_COMPLETE'
  ] as const

  it.each(ALL_PHASES)('phase=%s → roll-csp-btn visible only when CSP_OPEN', (phase) => {
    render(<PositionDetailActions {...BASE_PROPS} phase={phase} />)
    if (phase === 'CSP_OPEN') {
      expect(screen.getByTestId('roll-csp-btn')).toBeInTheDocument()
    } else {
      expect(screen.queryByTestId('roll-csp-btn')).not.toBeInTheDocument()
    }
  })

  it.each(ALL_PHASES)('phase=%s → roll-cc-btn visible only when CC_OPEN', (phase) => {
    render(<PositionDetailActions {...BASE_PROPS} phase={phase} />)
    if (phase === 'CC_OPEN') {
      expect(screen.getByTestId('roll-cc-btn')).toBeInTheDocument()
    } else {
      expect(screen.queryByTestId('roll-cc-btn')).not.toBeInTheDocument()
    }
  })
})

it('HOLDING_SHARES shows only phase-appropriate actions', () => {
  render(<PositionDetailActions {...BASE_PROPS} phase="HOLDING_SHARES" />)
  expect(screen.queryByTestId('roll-csp-btn')).not.toBeInTheDocument()
  expect(screen.queryByTestId('roll-cc-btn')).not.toBeInTheDocument()
  expect(screen.getByTestId('open-covered-call-btn')).toBeInTheDocument()
})

describe('terminal phases show no action buttons', () => {
  const TERMINAL_PHASES = [
    'CSP_CLOSED_PROFIT',
    'CSP_CLOSED_LOSS',
    'CC_CLOSED_PROFIT',
    'CC_CLOSED_LOSS',
    'WHEEL_COMPLETE',
    'CSP_EXPIRED',
    'CC_EXPIRED'
  ] as const

  it.each(TERMINAL_PHASES)('phase=%s → no action buttons rendered', (phase) => {
    render(<PositionDetailActions {...BASE_PROPS} phase={phase} />)
    expect(screen.queryByTestId('roll-csp-btn')).not.toBeInTheDocument()
    expect(screen.queryByTestId('roll-cc-btn')).not.toBeInTheDocument()
    expect(screen.queryByTestId('open-covered-call-btn')).not.toBeInTheDocument()
    expect(screen.queryByTestId('record-assignment-btn')).not.toBeInTheDocument()
    expect(screen.queryByTestId('record-expiration-btn')).not.toBeInTheDocument()
    expect(screen.queryByTestId('close-cc-early-btn')).not.toBeInTheDocument()
    expect(screen.queryByTestId('record-call-away-btn')).not.toBeInTheDocument()
    expect(screen.queryByTestId('record-cc-expiration-btn')).not.toBeInTheDocument()
  })
})

it('PMCC_OPEN renders only the phase badge', () => {
  render(<PositionDetailActions {...BASE_PROPS} phase="PMCC_OPEN" />)
  expect(screen.getByText('LEAPS + short call open')).toBeInTheDocument()
  expect(screen.queryAllByRole('button')).toHaveLength(0)
  ;[
    'record-call-away-btn',
    'roll-cc-btn',
    'open-covered-call-btn',
    'roll-csp-btn',
    'record-assignment-btn',
    'record-expiration-btn'
  ].forEach((testId) => expect(screen.queryByTestId(testId)).not.toBeInTheDocument())
})

// [US-104] Roll Short Call header action
describe('PMCC roll short call action', () => {
  it('PMCC with an open short call shows "Roll Short Call →" and no wheel buttons', () => {
    render(
      <PositionDetailActions
        {...BASE_PROPS}
        strategyType="PMCC"
        phase="PMCC_OPEN"
        hasOpenShortCall
      />
    )
    expect(screen.getByTestId('roll-pmcc-short-btn')).toHaveTextContent('Roll Short Call →')
    expect(screen.getAllByRole('button')).toHaveLength(1)
    WHEEL_TEST_IDS.forEach((testId) => expect(screen.queryByTestId(testId)).not.toBeInTheDocument())
  })

  it('calls onRollPmccShort when "Roll Short Call →" is clicked', async () => {
    const user = userEvent.setup()
    render(
      <PositionDetailActions
        {...BASE_PROPS}
        strategyType="PMCC"
        phase="PMCC_OPEN"
        hasOpenShortCall
      />
    )
    await user.click(screen.getByTestId('roll-pmcc-short-btn'))
    expect(BASE_PROPS.onRollPmccShort).toHaveBeenCalledOnce()
  })

  it('PMCC without an open short call shows no roll button', () => {
    render(
      <PositionDetailActions
        {...BASE_PROPS}
        strategyType="PMCC"
        phase="PMCC_OPEN"
        hasOpenShortCall={false}
      />
    )
    expect(screen.queryByTestId('roll-pmcc-short-btn')).not.toBeInTheDocument()
    expect(screen.queryAllByRole('button')).toHaveLength(0)
  })

  it('WHEEL in CC_OPEN still shows roll-cc-btn and never roll-pmcc-short-btn', () => {
    render(
      <PositionDetailActions
        {...BASE_PROPS}
        strategyType="WHEEL"
        phase="CC_OPEN"
        hasOpenShortCall
      />
    )
    expect(screen.getByTestId('roll-cc-btn')).toBeInTheDocument()
    expect(screen.queryByTestId('roll-pmcc-short-btn')).not.toBeInTheDocument()
  })
})

// [US-105] Roll LEAPS header action
describe('PMCC roll LEAPS action', () => {
  it('PMCC with open LEAPS and short call shows both roll buttons, short first, and no wheel buttons', () => {
    render(
      <PositionDetailActions
        {...BASE_PROPS}
        strategyType="PMCC"
        phase="PMCC_OPEN"
        hasOpenShortCall
        hasOpenLeaps
      />
    )
    expect(screen.getAllByRole('button').map((b) => b.dataset.testid)).toEqual([
      'roll-pmcc-short-btn',
      'roll-pmcc-leaps-btn'
    ])
    expect(screen.getByTestId('roll-pmcc-leaps-btn')).toHaveTextContent('Roll LEAPS →')
    WHEEL_TEST_IDS.forEach((testId) => expect(screen.queryByTestId(testId)).not.toBeInTheDocument())
  })

  it('PMCC with open LEAPS and no short call shows only "Roll LEAPS →"', () => {
    render(
      <PositionDetailActions
        {...BASE_PROPS}
        strategyType="PMCC"
        phase="PMCC_OPEN"
        hasOpenShortCall={false}
        hasOpenLeaps
      />
    )
    expect(screen.getAllByRole('button').map((b) => b.dataset.testid)).toEqual([
      'roll-pmcc-leaps-btn'
    ])
  })

  it('calls onRollPmccLeaps when "Roll LEAPS →" is clicked', async () => {
    const user = userEvent.setup()
    render(
      <PositionDetailActions {...BASE_PROPS} strategyType="PMCC" phase="PMCC_OPEN" hasOpenLeaps />
    )
    await user.click(screen.getByTestId('roll-pmcc-leaps-btn'))
    expect(BASE_PROPS.onRollPmccLeaps).toHaveBeenCalledOnce()
  })

  it('PMCC without open LEAPS shows no roll buttons', () => {
    render(
      <PositionDetailActions
        {...BASE_PROPS}
        strategyType="PMCC"
        phase="PMCC_OPEN"
        hasOpenShortCall={false}
        hasOpenLeaps={false}
      />
    )
    expect(screen.queryByTestId('roll-pmcc-leaps-btn')).not.toBeInTheDocument()
    expect(screen.queryByTestId('roll-pmcc-short-btn')).not.toBeInTheDocument()
    expect(screen.queryAllByRole('button')).toHaveLength(0)
  })

  it('WHEEL in CC_OPEN shows roll-cc-btn and neither PMCC roll button', () => {
    render(
      <PositionDetailActions
        {...BASE_PROPS}
        strategyType="WHEEL"
        phase="CC_OPEN"
        hasOpenShortCall
        hasOpenLeaps
      />
    )
    expect(screen.getByTestId('roll-cc-btn')).toBeInTheDocument()
    expect(screen.queryByTestId('roll-pmcc-short-btn')).not.toBeInTheDocument()
    expect(screen.queryByTestId('roll-pmcc-leaps-btn')).not.toBeInTheDocument()
  })
})
