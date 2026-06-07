import { describe, expect, it, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { buildAdjacency } from '../engine'
import type { TubeGraph } from '../engine'
import { archiveDates } from '../lib/archive'
import fixture from '../engine/__fixtures__/graph.fixture.json'
import ArchiveModal from './ArchiveModal'

const graph = fixture as TubeGraph
const adj = buildAdjacency(graph)
// A near-launch reference date keeps the derived list tiny (3 puzzles), so the
// fixture's full-attempt-budget derivation stays fast under parallel suite load.
const REF_TODAY = '2026-05-11'
const DATES = archiveDates(REF_TODAY)

function setup(props: Partial<React.ComponentProps<typeof ArchiveModal>> = {}) {
  const onSelect = vi.fn()
  const onClose = vi.fn()
  render(
    <ArchiveModal
      open
      onClose={onClose}
      graph={graph}
      adj={adj}
      completions={{}}
      activeDate={REF_TODAY}
      todayISO={REF_TODAY}
      onSelect={onSelect}
      {...props}
    />,
  )
  return { onSelect, onClose }
}

describe('ArchiveModal', () => {
  it('lists every curated puzzle once derived', async () => {
    setup()
    // Deriving the archive's puzzles is compute-heavy (fixture days that miss
    // their tier run the full attempt budget), so allow well beyond the
    // default 1s before calling it a failure under parallel suite load.
    await waitFor(
      () => {
        expect(screen.getAllByRole('listitem')).toHaveLength(DATES.length)
      },
      { timeout: 10_000 },
    )
    // Every row reads "X to Y" and shows an unplayed state by default.
    expect(screen.getAllByRole('button', { name: / to / })).toHaveLength(DATES.length)
    expect(screen.getAllByText('Not played')).toHaveLength(DATES.length)
  })

  it('selects a puzzle date and closes', async () => {
    const { onSelect, onClose } = setup()
    const rows = await screen.findAllByRole('button', { name: / to / })
    fireEvent.click(rows[0])
    expect(onSelect).toHaveBeenCalledWith(DATES[0])
    expect(onClose).toHaveBeenCalled()
  })

  it('shows the best result and a solved tick', async () => {
    setup({
      completions: { [DATES[0]]: { solved: true, score: 11, parScore: 10 } },
    })
    await screen.findByText('Solved: 11 (best 10)')
    expect(screen.getByLabelText('Solved')).toBeInTheDocument()
  })

  it('offers a way back to today only while replaying the past', async () => {
    setup({ activeDate: DATES[0] })
    const back = await screen.findByRole('button', { name: /back to today/i })
    fireEvent.click(back)
  })

  it('hides the back-to-today action on the daily', async () => {
    setup()
    await screen.findAllByRole('listitem')
    expect(screen.queryByRole('button', { name: /back to today/i })).not.toBeInTheDocument()
  })

  it('returns to the daily via onSelect(null)', async () => {
    const { onSelect } = setup({ activeDate: DATES[0] })
    fireEvent.click(await screen.findByRole('button', { name: /back to today/i }))
    expect(onSelect).toHaveBeenCalledWith(null)
  })
})
