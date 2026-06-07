import { describe, expect, it, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { buildAdjacency } from '../engine'
import type { TubeGraph } from '../engine'
import { ARCHIVE_DATES } from '../lib/archive'
import fixture from '../engine/__fixtures__/graph.fixture.json'
import ArchiveModal from './ArchiveModal'

const graph = fixture as TubeGraph
const adj = buildAdjacency(graph)

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
      activeDate="2026-06-07"
      todayISO="2026-06-07"
      onSelect={onSelect}
      {...props}
    />,
  )
  return { onSelect, onClose }
}

describe('ArchiveModal', () => {
  it('lists every curated puzzle once derived', async () => {
    setup()
    await waitFor(() => {
      expect(screen.getAllByRole('listitem')).toHaveLength(ARCHIVE_DATES.length)
    })
    // Every row reads "X to Y" and shows an unplayed state by default.
    expect(screen.getAllByRole('button', { name: / to / })).toHaveLength(ARCHIVE_DATES.length)
    expect(screen.getAllByText('Not played')).toHaveLength(ARCHIVE_DATES.length)
  })

  it('selects a puzzle date and closes', async () => {
    const { onSelect, onClose } = setup()
    const rows = await screen.findAllByRole('button', { name: / to / })
    fireEvent.click(rows[0])
    expect(onSelect).toHaveBeenCalledWith(ARCHIVE_DATES[0])
    expect(onClose).toHaveBeenCalled()
  })

  it('shows the best result and a solved tick', async () => {
    setup({
      completions: { [ARCHIVE_DATES[0]]: { solved: true, score: 11, parScore: 10 } },
    })
    await screen.findByText('Solved: 11 (best 10)')
    expect(screen.getByLabelText('Solved')).toBeInTheDocument()
  })

  it('offers a way back to today only while replaying the past', async () => {
    setup({ activeDate: ARCHIVE_DATES[0] })
    const back = await screen.findByRole('button', { name: /back to today/i })
    fireEvent.click(back)
  })

  it('hides the back-to-today action on the daily', async () => {
    setup()
    await screen.findAllByRole('listitem')
    expect(screen.queryByRole('button', { name: /back to today/i })).not.toBeInTheDocument()
  })

  it('returns to the daily via onSelect(null)', async () => {
    const { onSelect } = setup({ activeDate: ARCHIVE_DATES[0] })
    fireEvent.click(await screen.findByRole('button', { name: /back to today/i }))
    expect(onSelect).toHaveBeenCalledWith(null)
  })
})
