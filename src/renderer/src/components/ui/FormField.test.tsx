import { render, screen } from '@testing-library/react'
import { Field, FieldLabel } from './FormField'

// ---------------------------------------------------------------------------
// FieldLabel
// ---------------------------------------------------------------------------

it('renders label text', () => {
  render(<FieldLabel htmlFor="test">My Label</FieldLabel>)
  expect(screen.getByText('My Label')).toBeInTheDocument()
})

// ---------------------------------------------------------------------------
// Field
// ---------------------------------------------------------------------------

it('renders field with label and children', () => {
  render(
    <Field label="Strike" htmlFor="strike">
      <input id="strike" />
    </Field>
  )
  expect(screen.getByText('Strike')).toBeInTheDocument()
  expect(screen.getByRole('textbox')).toBeInTheDocument()
})

it('renders hint text when provided', () => {
  render(
    <Field label="Ticker" hint="e.g. TSLA">
      <input />
    </Field>
  )
  expect(screen.getByText('e.g. TSLA')).toBeInTheDocument()
})

it('renders error text when provided and hides hint', () => {
  render(
    <Field label="Ticker" hint="e.g. TSLA" error="Required">
      <input />
    </Field>
  )
  expect(screen.getByRole('alert')).toHaveTextContent('Required')
  expect(screen.queryByText('e.g. TSLA')).not.toBeInTheDocument()
})
