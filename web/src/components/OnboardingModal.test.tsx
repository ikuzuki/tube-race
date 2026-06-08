import { describe, expect, it, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import OnboardingModal from './OnboardingModal'

describe('OnboardingModal', () => {
  it('renders nothing when closed', () => {
    render(<OnboardingModal open={false} onClose={vi.fn()} />)
    expect(screen.queryByText(/how to play/i)).not.toBeInTheDocument()
  })

  it('renders the title and keeps the one explicit compass rule', () => {
    render(<OnboardingModal open onClose={vi.fn()} />)
    expect(screen.getByRole('heading', { name: /how to play/i })).toBeInTheDocument()
    expect(screen.getByText(/never/i)).toBeInTheDocument()
    expect(screen.getByText(/which line/i)).toBeInTheDocument()
  })

  it('is trimmed: no rule list, no "stays on your map" promise', () => {
    render(<OnboardingModal open onClose={vi.fn()} />)
    expect(screen.queryAllByRole('listitem')).toHaveLength(0)
    expect(screen.queryByText(/stays on your map/i)).not.toBeInTheDocument()
  })

  it('shows the animated gameplay demo', () => {
    render(<OnboardingModal open onClose={vi.fn()} />)
    expect(screen.getByRole('img', { name: /demo of a run/i })).toBeInTheDocument()
  })

  it('states the goal of getting from start to destination', () => {
    render(<OnboardingModal open onClose={vi.fn()} />)
    expect(screen.getByText(/find your way from your start to the destination/i)).toBeInTheDocument()
  })

  it('explains the scoring system as stop = 1, change = 4', () => {
    render(<OnboardingModal open onClose={vi.fn()} />)
    expect(screen.getByText('each stop')).toBeInTheDocument()
    expect(screen.getByText('each change')).toBeInTheDocument()
    // +1 appears on each stop pill and in the demo popups; +4 on the change.
    expect(screen.getAllByText('+1').length).toBeGreaterThanOrEqual(1)
    expect(screen.getAllByText('+4').length).toBeGreaterThanOrEqual(1)
    expect(screen.getByText(/lower is better/i)).toBeInTheDocument()
    expect(screen.getByText(/racing the best possible route/i)).toBeInTheDocument()
  })

  it('calls onClose when "Got it" is clicked', () => {
    const onClose = vi.fn()
    render(<OnboardingModal open onClose={onClose} />)
    fireEvent.click(screen.getByRole('button', { name: /got it/i }))
    expect(onClose).toHaveBeenCalledTimes(1)
  })
})
