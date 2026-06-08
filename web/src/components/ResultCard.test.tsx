import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import ResultCard from './ResultCard'
import type { Station } from '../engine'

/** Stub matchMedia so prefers-reduced-motion can be forced on/off in a test. */
function stubReducedMotion(reduce: boolean): void {
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    writable: true,
    value: (query: string) => ({
      matches: reduce,
      media: query,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    }),
  })
}

const SHARE =
  'Tube Race 2026-06-06\nScore 17 (par 11)\n9/7 stops · 2/1 changes\n🟩🟩🟨🟨⬛\nStreak: 3'

function setup(props: Partial<React.ComponentProps<typeof ResultCard>> = {}) {
  const onPlayAgain = vi.fn()
  const onClose = vi.fn()
  render(
    <ResultCard
      open
      solved
      score={17}
      parScore={11}
      stops={9}
      parStops={7}
      changes={2}
      parChanges={1}
      optimal={false}
      shareText={SHARE}
      streak={3}
      onPlayAgain={onPlayAgain}
      onClose={onClose}
      {...props}
    />,
  )
  return { onPlayAgain, onClose }
}

const brixton: Station = {
  id: 'brixton',
  name: 'Brixton',
  lat: 51.4627,
  lon: -0.1145,
  lines: ['victoria'],
  zone: '2',
}
const victoria: Station = {
  id: 'victoria-stn',
  name: 'Victoria',
  lat: 51.4965,
  lon: -0.1447,
  lines: ['victoria'],
  zone: '1',
}

describe('ResultCard', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('renders nothing when closed', () => {
    setup({ open: false })
    expect(screen.queryByText(/stops/i)).not.toBeInTheDocument()
  })

  it('leads with the weighted score against par', () => {
    setup()
    // Hero score block: value 17, par 11.
    expect(screen.getByLabelText('Score 17, best possible 11')).toBeInTheDocument()
    expect(screen.getByText('17')).toBeInTheDocument()
    expect(screen.getByText('/ 11 best')).toBeInTheDocument()
  })

  it('shows the stops and changes against par as supporting mini-stats', () => {
    setup()
    expect(screen.getByText('stops')).toBeInTheDocument()
    expect(screen.getByText('changes')).toBeInTheDocument()
    // value 9, par 7 for stops; value 2, par 1 for changes.
    expect(screen.getByText('9')).toBeInTheDocument()
    expect(screen.getByText('/ 7')).toBeInTheDocument()
    expect(screen.getByText('2')).toBeInTheDocument()
    expect(screen.getByText('/ 1')).toBeInTheDocument()
  })

  it('shows the current streak', () => {
    setup({ streak: 5 })
    expect(screen.getByText('5 day streak')).toBeInTheDocument()
  })

  it('never shows the raw % optimal text (stars carry the rating)', () => {
    setup()
    expect(screen.queryByText(/% optimal/)).not.toBeInTheDocument()
  })

  it('shows three stars as the headline for an optimal run', () => {
    setup({ optimal: true, score: 11 })
    expect(screen.getByLabelText('3 of 3 stars')).toBeInTheDocument()
  })

  it('shows fewer stars for a weak run', () => {
    // 30 vs 11 -> 37% -> 1 star (below the 60% second-star threshold).
    setup({ optimal: false, score: 30, parScore: 11 })
    expect(screen.getByLabelText('1 of 3 stars')).toBeInTheDocument()
  })

  it('shows zero stars for an unsolved run', () => {
    setup({ solved: false })
    expect(screen.getByLabelText('0 of 3 stars')).toBeInTheDocument()
  })

  it('renders the gave-up numbers in red, even at zero', () => {
    // Gave up having made no moves: score/stops/changes all 0 but still red.
    const { container } = render(
      <ResultCard
        open
        solved={false}
        score={0}
        parScore={11}
        stops={0}
        parStops={7}
        changes={0}
        parChanges={1}
        optimal={false}
        shareText="x"
        streak={0}
        onClose={vi.fn()}
      />,
    )
    const score = screen.getByText('0', { selector: 'span.text-6xl' })
    expect(score).toHaveClass('text-danger')
    expect(score).not.toHaveClass('text-progress')
    // Both mini-stat values (stops, changes) are red too, not green.
    const reds = container.querySelectorAll('span.text-danger')
    expect(reds.length).toBeGreaterThanOrEqual(3)
    expect(container.querySelector('span.text-progress')).toBeNull()
  })

  it('shows a next-puzzle countdown', () => {
    setup()
    expect(screen.getByText(/next puzzle in/i)).toBeInTheDocument()
    expect(screen.getByText(/^\d{2}:\d{2}:\d{2}$/)).toBeInTheDocument()
  })

  it('uses the native share sheet when available', async () => {
    const share = vi.fn().mockResolvedValue(undefined)
    Object.assign(navigator, { share })
    setup({ shareText: SHARE })
    fireEvent.click(screen.getByRole('button', { name: /share/i }))
    await waitFor(() => expect(share).toHaveBeenCalledWith({ text: SHARE }))
    // Clean up so the clipboard-fallback test below sees no native share.
    delete (navigator as { share?: unknown }).share
  })

  it('copies the share text and shows feedback when Share is clicked', async () => {
    delete (navigator as { share?: unknown }).share
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.assign(navigator, { clipboard: { writeText } })

    setup({ shareText: SHARE })

    fireEvent.click(screen.getByRole('button', { name: /share/i }))

    await waitFor(() => expect(writeText).toHaveBeenCalledWith(SHARE))
    expect(await screen.findByText(/copied/i)).toBeInTheDocument()
  })

  it('does not crash or claim a copy when the clipboard rejects', async () => {
    delete (navigator as { share?: unknown }).share
    const writeText = vi.fn().mockRejectedValue(new Error('denied'))
    Object.assign(navigator, { clipboard: { writeText } })

    setup()
    fireEvent.click(screen.getByRole('button', { name: /share/i }))

    await waitFor(() => expect(writeText).toHaveBeenCalled())
    expect(screen.queryByText(/copied/i)).not.toBeInTheDocument()
  })

  it('calls onPlayAgain when Play again is clicked', () => {
    const { onPlayAgain } = setup()
    fireEvent.click(screen.getByRole('button', { name: /play again/i }))
    expect(onPlayAgain).toHaveBeenCalledTimes(1)
  })

  it('omits Play again when onPlayAgain is absent (the daily is one attempt)', () => {
    setup({ onPlayAgain: undefined })
    expect(screen.queryByRole('button', { name: /play again/i })).not.toBeInTheDocument()
  })

  it('renders a "no streak yet" hint when the streak is zero', () => {
    setup({ streak: 0 })
    expect(screen.getByText(/no streak yet/i)).toBeInTheDocument()
  })

  it('shows the "Show best route" button only when onShowOptimal is provided', () => {
    const onShowOptimal = vi.fn()
    setup({ onShowOptimal })
    const btn = screen.getByRole('button', { name: /show best route/i })
    fireEvent.click(btn)
    expect(onShowOptimal).toHaveBeenCalledTimes(1)
  })

  it('omits the "Show best route" button when onShowOptimal is absent', () => {
    setup()
    expect(screen.queryByRole('button', { name: /show best route/i })).not.toBeInTheDocument()
  })

  it('renders start and destination station cards when provided', () => {
    setup({
      start: { station: brixton },
      destination: { station: victoria },
    })
    expect(screen.getByText('Start')).toBeInTheDocument()
    expect(screen.getByText('Destination')).toBeInTheDocument()
    expect(screen.getByText('Brixton')).toBeInTheDocument()
    expect(screen.getByText('Victoria')).toBeInTheDocument()
  })

  describe('count-up + celebration', () => {
    afterEach(() => {
      // Drop the matchMedia stub so the default (reduced) env returns.
      delete (window as { matchMedia?: unknown }).matchMedia
    })

    it('shows the final score immediately and no confetti under reduced motion', () => {
      stubReducedMotion(true)
      const { container } = render(
        <ResultCard
          open
          solved
          score={17}
          parScore={11}
          stops={9}
          parStops={7}
          changes={2}
          parChanges={1}
          optimal={false}
          shareText="x"
          streak={1}
          onClose={vi.fn()}
        />,
      )
      // No count-up: the hero shows 17 right away, never 0.
      expect(screen.getByText('17')).toBeInTheDocument()
      expect(screen.queryByText('0')).not.toBeInTheDocument()
      // No celebration canvas.
      expect(container.querySelector('canvas')).toBeNull()
    })

    it('mounts a celebration canvas on a solved run when motion is allowed', () => {
      stubReducedMotion(false)
      const { container } = render(
        <ResultCard
          open
          solved
          score={11}
          parScore={11}
          stops={7}
          parStops={7}
          changes={1}
          parChanges={1}
          optimal
          shareText="x"
          streak={1}
          onClose={vi.fn()}
        />,
      )
      expect(container.querySelector('canvas')).not.toBeNull()
    })

    it('never celebrates an unsolved run, even when motion is allowed', () => {
      stubReducedMotion(false)
      const { container } = render(
        <ResultCard
          open
          solved={false}
          score={17}
          parScore={11}
          stops={9}
          parStops={7}
          changes={2}
          parChanges={1}
          optimal={false}
          shareText="x"
          streak={0}
          onClose={vi.fn()}
        />,
      )
      expect(container.querySelector('canvas')).toBeNull()
    })
  })
})
