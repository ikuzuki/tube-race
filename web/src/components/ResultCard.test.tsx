import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import ResultCard from './ResultCard'
import type { Station } from '../engine'

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
    expect(screen.getByLabelText('Score 17, par 11')).toBeInTheDocument()
    expect(screen.getByText('17')).toBeInTheDocument()
    expect(screen.getByText('/ 11 par')).toBeInTheDocument()
  })

  it('shows the stops and changes against par as the breakdown', () => {
    setup()
    expect(screen.getByText('Stops')).toBeInTheDocument()
    expect(screen.getByText('Changes')).toBeInTheDocument()
    // value 9, par 7 for stops.
    expect(screen.getByText('9')).toBeInTheDocument()
    expect(screen.getByText('/ 7 par')).toBeInTheDocument()
    expect(screen.getByText('2')).toBeInTheDocument()
    expect(screen.getByText('/ 1 par')).toBeInTheDocument()
  })

  it('shows the current streak', () => {
    setup({ streak: 5 })
    expect(screen.getByText('5 day streak')).toBeInTheDocument()
  })

  it('shows the Optimal badge only when optimal', () => {
    setup({ optimal: true, score: 11 })
    expect(screen.getByText(/optimal route/i)).toBeInTheDocument()
  })

  it('hides the Optimal badge when not optimal', () => {
    setup({ optimal: false })
    expect(screen.queryByText(/optimal route/i)).not.toBeInTheDocument()
  })

  it('copies the share text and shows feedback when Share is clicked', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.assign(navigator, { clipboard: { writeText } })

    setup({ shareText: SHARE })

    fireEvent.click(screen.getByRole('button', { name: /share/i }))

    await waitFor(() => expect(writeText).toHaveBeenCalledWith(SHARE))
    expect(await screen.findByText(/copied/i)).toBeInTheDocument()
  })

  it('does not crash or claim a copy when the clipboard rejects', async () => {
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
})
