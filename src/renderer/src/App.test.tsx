import { render } from '@testing-library/react'
import { vi } from 'vitest'
import { App } from './App'

vi.mock('./pages/PositionsListPage', () => ({
  PositionsListPage: () => <div data-testid="positions-list-page" />
}))

vi.mock('./pages/NewWheelPage', () => ({
  NewWheelPage: () => <div data-testid="new-wheel-page" />
}))

vi.mock('./pages/PositionDetailPage', () => ({
  PositionDetailPage: () => <div data-testid="position-detail-page" />
}))

describe('App — portal mount point', () => {
  it('renders a #sheet-portal div', () => {
    render(<App />)
    const portal = document.getElementById('sheet-portal')
    expect(portal).not.toBeNull()
  })

  it('#sheet-portal is a descendant of the app root, not a direct child of document.body', () => {
    render(<App />)
    const portal = document.getElementById('sheet-portal')
    expect(portal).not.toBeNull()
    expect(portal!.parentElement).not.toBe(document.body)
  })
})
