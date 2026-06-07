import { describe, expect, it, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import OnboardingModal from './OnboardingModal'

describe('OnboardingModal', () => {
  it('renders nothing when closed', () => {
    render(<OnboardingModal open={false} onClose={vi.fn()} />)
    expect(screen.queryByText(/mind the gap/i)).not.toBeInTheDocument()
  })

  it('renders the title and a set of rules when open', () => {
    render(<OnboardingModal open onClose={vi.fn()} />)
    expect(screen.getByRole('heading', { name: /mind the gap/i })).toBeInTheDocument()
    // Three rules, rendered as list items.
    expect(screen.getAllByRole('listitem')).toHaveLength(3)
    // Touches the core mechanics in the copy.
    expect(screen.getByText(/fog/i)).toBeInTheDocument()
    expect(screen.getByText(/compass/i)).toBeInTheDocument()
    expect(screen.getByText(/tap a lit station/i)).toBeInTheDocument()
    expect(screen.getByText(/streak/i)).toBeInTheDocument()
  })

  it('shows the animated gameplay demo', () => {
    render(<OnboardingModal open onClose={vi.fn()} />)
    expect(screen.getByRole('img', { name: /demo of a run/i })).toBeInTheDocument()
  })

  it('states the goal of getting from start to destination', () => {
    render(<OnboardingModal open onClose={vi.fn()} />)
    expect(screen.getByText(/given a start and a destination/i)).toBeInTheDocument()
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
