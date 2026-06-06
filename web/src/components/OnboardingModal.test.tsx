import { describe, expect, it, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import OnboardingModal from './OnboardingModal'

describe('OnboardingModal', () => {
  it('renders nothing when closed', () => {
    render(<OnboardingModal open={false} onClose={vi.fn()} />)
    expect(screen.queryByText(/how to play/i)).not.toBeInTheDocument()
  })

  it('renders the title and a set of rules when open', () => {
    render(<OnboardingModal open onClose={vi.fn()} />)
    expect(screen.getByRole('heading', { name: /how to play/i })).toBeInTheDocument()
    // Four rules, rendered as list items.
    expect(screen.getAllByRole('listitem')).toHaveLength(4)
    // Touches the core mechanics in the copy.
    expect(screen.getByText(/fog/i)).toBeInTheDocument()
    expect(screen.getByText(/compass/i)).toBeInTheDocument()
    expect(screen.getByText(/tap a lit station/i)).toBeInTheDocument()
    expect(screen.getByText(/streak/i)).toBeInTheDocument()
  })

  it('calls onClose when "Got it" is clicked', () => {
    const onClose = vi.fn()
    render(<OnboardingModal open onClose={onClose} />)
    fireEvent.click(screen.getByRole('button', { name: /got it/i }))
    expect(onClose).toHaveBeenCalledTimes(1)
  })
})
