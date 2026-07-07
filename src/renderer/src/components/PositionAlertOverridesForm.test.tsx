import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, vi } from 'vitest'
import { useAlertDefaults } from '../hooks/useSettings'
import { useSaveAlertOverrides } from '../hooks/useSaveAlertOverrides'
import { PositionAlertOverridesForm } from './PositionAlertOverridesForm'

vi.mock('../hooks/useSettings')
vi.mock('../hooks/useSaveAlertOverrides')

const mockUseAlertDefaults = vi.mocked(useAlertDefaults)
const mockUseSaveAlertOverrides = vi.mocked(useSaveAlertOverrides)
const mockMutate = vi.fn()

beforeEach(() => {
  mockMutate.mockReset()
  mockUseAlertDefaults.mockReturnValue({
    data: { profitTargetPercent: 50, managementWindowDte: 21 },
    isLoading: false,
    isError: false,
    error: null
  } as unknown as ReturnType<typeof useAlertDefaults>)
  mockUseSaveAlertOverrides.mockReturnValue({
    mutate: mockMutate,
    isPending: false,
    isSuccess: false,
    isError: false,
    data: undefined,
    error: null
  } as unknown as ReturnType<typeof useSaveAlertOverrides>)
})

it('renders the inherit state using resolved global defaults when no override is set', () => {
  render(
    <PositionAlertOverridesForm
      positionId="pos-123"
      profitTargetPercent={null}
      managementWindowDteOverride={null}
    />
  )

  expect(screen.getByText('Using global defaults')).toBeInTheDocument()
  expect(screen.getByLabelText('Profit Target Override')).toHaveValue(50)
  expect(screen.getByLabelText('Management Window Override')).toHaveValue(21)
})

it('renders the override state with the position’s stored override values', () => {
  render(
    <PositionAlertOverridesForm
      positionId="pos-123"
      profitTargetPercent={25}
      managementWindowDteOverride={14}
    />
  )

  expect(screen.getByText('Custom alert thresholds active')).toBeInTheDocument()
  expect(screen.getByLabelText('Profit Target Override')).toHaveValue(25)
  expect(screen.getByLabelText('Management Window Override')).toHaveValue(14)
})

it('re-syncs the displayed defaults once the async global-defaults query resolves after mount', () => {
  // First render: the defaults query is still in flight (data undefined).
  mockUseAlertDefaults.mockReturnValue({
    data: undefined,
    isLoading: true,
    isError: false,
    error: null
  } as unknown as ReturnType<typeof useAlertDefaults>)

  const { rerender } = render(
    <PositionAlertOverridesForm
      positionId="pos-123"
      profitTargetPercent={null}
      managementWindowDteOverride={null}
    />
  )

  // The query resolves to non-fallback defaults; the disabled fields must update.
  mockUseAlertDefaults.mockReturnValue({
    data: { profitTargetPercent: 70, managementWindowDte: 14 },
    isLoading: false,
    isError: false,
    error: null
  } as unknown as ReturnType<typeof useAlertDefaults>)

  rerender(
    <PositionAlertOverridesForm
      positionId="pos-123"
      profitTargetPercent={null}
      managementWindowDteOverride={null}
    />
  )

  expect(screen.getByLabelText('Profit Target Override')).toHaveValue(70)
  expect(screen.getByLabelText('Management Window Override')).toHaveValue(14)
})

it('persists the cleared override (null) when the Custom alerts checkbox is unchecked', async () => {
  const user = userEvent.setup()
  render(
    <PositionAlertOverridesForm
      positionId="pos-123"
      profitTargetPercent={25}
      managementWindowDteOverride={14}
    />
  )

  // Starts checked because an override exists; unchecking must revert to defaults
  // in the DB, not merely flip the banner.
  await user.click(screen.getByRole('checkbox', { name: /custom alerts/i }))

  expect(mockMutate).toHaveBeenCalledWith(
    { positionId: 'pos-123', profitTargetPercent: null, managementWindowDte: null },
    expect.anything()
  )
})

it('enables editing, saves custom overrides, and calls the mutation with the typed values', async () => {
  const user = userEvent.setup()
  render(
    <PositionAlertOverridesForm
      positionId="pos-123"
      profitTargetPercent={null}
      managementWindowDteOverride={null}
    />
  )

  await user.click(screen.getByRole('checkbox', { name: /custom alerts/i }))

  const profitInput = screen.getByLabelText('Profit Target Override')
  const dteInput = screen.getByLabelText('Management Window Override')
  await user.clear(profitInput)
  await user.type(profitInput, '25')
  await user.clear(dteInput)
  await user.type(dteInput, '14')

  await user.click(screen.getByRole('button', { name: /save overrides/i }))

  expect(mockMutate).toHaveBeenCalledWith(
    { positionId: 'pos-123', profitTargetPercent: 25, managementWindowDte: 14 },
    expect.anything()
  )
})

it('clears overrides and calls the mutation with null values when "Use global defaults" is clicked', async () => {
  const user = userEvent.setup()
  render(
    <PositionAlertOverridesForm
      positionId="pos-123"
      profitTargetPercent={25}
      managementWindowDteOverride={14}
    />
  )

  await user.click(screen.getByRole('button', { name: /use global defaults/i }))

  expect(mockMutate).toHaveBeenCalledWith(
    { positionId: 'pos-123', profitTargetPercent: null, managementWindowDte: null },
    expect.anything()
  )
})

it('shows inline validation errors and disables Save overrides for out-of-range values', async () => {
  const user = userEvent.setup()
  render(
    <PositionAlertOverridesForm
      positionId="pos-123"
      profitTargetPercent={null}
      managementWindowDteOverride={null}
    />
  )

  await user.click(screen.getByRole('checkbox', { name: /custom alerts/i }))

  const profitInput = screen.getByLabelText('Profit Target Override')
  const dteInput = screen.getByLabelText('Management Window Override')
  await user.clear(profitInput)
  await user.type(profitInput, '100')
  await user.clear(dteInput)
  await user.type(dteInput, '60')

  expect(await screen.findByText('Profit target must be between 1 and 99')).toBeInTheDocument()
  expect(screen.getByText('Management window must be between 6 and 45 DTE')).toBeInTheDocument()
  expect(screen.getByRole('button', { name: /save overrides/i })).toBeDisabled()
})
