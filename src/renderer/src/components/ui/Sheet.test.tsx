import { render, screen, fireEvent } from '@testing-library/react'
import {
  SheetOverlay,
  SheetPanel,
  SheetHeader,
  SheetBody,
  SheetFooter,
  SheetCloseButton
} from './Sheet'

describe('SheetOverlay', () => {
  it('renders children', () => {
    const onClose = vi.fn()
    render(
      <SheetOverlay onClose={onClose}>
        <div>Panel content</div>
      </SheetOverlay>
    )
    expect(screen.getByText('Panel content')).toBeInTheDocument()
  })

  it('calls onClose when scrim is clicked', () => {
    const onClose = vi.fn()
    const { container } = render(
      <SheetOverlay onClose={onClose}>
        <div>Panel content</div>
      </SheetOverlay>
    )
    // Scrim is the first child of the overlay (the backdrop div)
    const overlay = container.firstElementChild as HTMLElement
    const scrim = overlay.firstElementChild as HTMLElement
    fireEvent.click(scrim)
    expect(onClose).toHaveBeenCalledTimes(1)
  })
})

describe('SheetPanel', () => {
  it('renders children', () => {
    render(
      <SheetPanel>
        <div>Body content</div>
      </SheetPanel>
    )
    expect(screen.getByText('Body content')).toBeInTheDocument()
  })

  it('applies default width of 400px', () => {
    const { container } = render(
      <SheetPanel>
        <div>Body content</div>
      </SheetPanel>
    )
    const panel = container.firstElementChild as HTMLElement
    const style = panel.getAttribute('style') ?? ''
    expect(style).toContain('width: 400px')
  })

  it('accepts custom width via inline style', () => {
    const { container } = render(
      <SheetPanel width={420}>
        <div>Wide content</div>
      </SheetPanel>
    )
    const panel = container.firstElementChild as HTMLElement
    const style = panel.getAttribute('style') ?? ''
    expect(style).toContain('width: 420px')
  })
})

describe('SheetHeader', () => {
  it('renders eyebrow, title, and close button', () => {
    render(<SheetHeader eyebrow="CSP Expiration" title="AAPL $150" onClose={vi.fn()} />)
    expect(screen.getByText('CSP Expiration')).toBeInTheDocument()
    expect(screen.getByText('AAPL $150')).toBeInTheDocument()
    expect(screen.getByLabelText('Close sheet')).toBeInTheDocument()
  })

  it('renders subtitle when provided', () => {
    render(
      <SheetHeader
        eyebrow="Close CC"
        title="AAPL $150"
        subtitle="Exp 2026-04-18"
        onClose={vi.fn()}
      />
    )
    expect(screen.getByText('Exp 2026-04-18')).toBeInTheDocument()
  })

  it('omits subtitle when not provided', () => {
    const { container } = render(
      <SheetHeader eyebrow="Close CC" title="AAPL $150" onClose={vi.fn()} />
    )
    // Should have eyebrow + title but no subtitle element
    expect(screen.getByText('Close CC')).toBeInTheDocument()
    expect(screen.getByText('AAPL $150')).toBeInTheDocument()
    // Query for a subtitle — should not exist
    expect(screen.queryByText('Exp 2026-04-18')).not.toBeInTheDocument()
    // The header should not contain a subtitle div (data-testid approach)
    const subtitleEl = container.querySelector('[data-testid="sheet-subtitle"]')
    expect(subtitleEl).toBeNull()
  })

  it('applies custom eyebrowColor and borderBottomColor via inline styles', () => {
    const { container } = render(
      <SheetHeader
        eyebrow="Expired Worthless"
        title="AAPL $150"
        onClose={vi.fn()}
        eyebrowColor="var(--wb-green)"
        borderBottomColor="rgba(63,185,80,0.2)"
      />
    )
    const header = container.firstElementChild as HTMLElement
    const headerStyle = header.getAttribute('style') ?? ''
    expect(headerStyle).toContain('rgba(63, 185, 80, 0.2)')
    // Eyebrow element should have the custom color
    const eyebrow = screen.getByText('Expired Worthless')
    const eyebrowStyle = eyebrow.getAttribute('style') ?? ''
    expect(eyebrowStyle).toContain('var(--wb-green)')
  })

  it('close button calls onClose', () => {
    const onClose = vi.fn()
    render(<SheetHeader eyebrow="Test" title="Title" onClose={onClose} />)
    fireEvent.click(screen.getByLabelText('Close sheet'))
    expect(onClose).toHaveBeenCalledTimes(1)
  })
})

describe('SheetBody', () => {
  it('renders children', () => {
    render(
      <SheetBody>
        <p>Form field 1</p>
        <p>Form field 2</p>
      </SheetBody>
    )
    expect(screen.getByText('Form field 1')).toBeInTheDocument()
    expect(screen.getByText('Form field 2')).toBeInTheDocument()
  })
})

describe('SheetFooter', () => {
  it('renders children', () => {
    render(
      <SheetFooter>
        <button>Cancel</button>
        <button>Submit</button>
      </SheetFooter>
    )
    expect(screen.getByText('Cancel')).toBeInTheDocument()
    expect(screen.getByText('Submit')).toBeInTheDocument()
  })
})

describe('SheetCloseButton', () => {
  it('renders × button with aria-label', () => {
    render(<SheetCloseButton onClick={vi.fn()} />)
    const button = screen.getByLabelText('Close sheet')
    expect(button).toBeInTheDocument()
    expect(button.textContent).toBe('×')
  })

  it('calls onClick when clicked', () => {
    const onClick = vi.fn()
    render(<SheetCloseButton onClick={onClick} />)
    fireEvent.click(screen.getByLabelText('Close sheet'))
    expect(onClick).toHaveBeenCalledTimes(1)
  })
})
