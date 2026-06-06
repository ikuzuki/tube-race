import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import Hud from './Hud'
import { points } from '../lib/score'

function setup(props: Partial<React.ComponentProps<typeof Hud>> = {}) {
  render(
    <Hud
      targetName="King's Cross St. Pancras"
      currentLineId="victoria"
      currentLineName="Victoria"
      hops={5}
      parHops={4}
      changes={1}
      parChanges={1}
      bearingDeg={45}
      km={2.3}
      {...props}
    />,
  )
}

describe('Hud', () => {
  it('shows the weighted score against par as the hero number', () => {
    // hops 5, changes 1 -> score 5 + 4 = 9; par 4 + 4 = 8.
    setup({ hops: 5, parHops: 4, changes: 1, parChanges: 1 })
    expect(points(5, 1)).toBe(9)
    expect(points(4, 1)).toBe(8)
    expect(screen.getByLabelText('Score 9, best possible 8')).toBeInTheDocument()
    expect(screen.getByText('9')).toBeInTheDocument()
    expect(screen.getByText('/ 8 best')).toBeInTheDocument()
  })

  it('shows stops and changes as plain breakdown counts (no denominator)', () => {
    setup({ hops: 5, parHops: 4, changes: 2, parChanges: 1 })
    expect(screen.getByText('Stops')).toBeInTheDocument()
    expect(screen.getByText('Changes')).toBeInTheDocument()
    // Stops value 5, shown as a plain count (no "/ par" denominator any more).
    expect(screen.getByText('5')).toBeInTheDocument()
    expect(screen.queryByText('/ 4')).not.toBeInTheDocument()
  })

  it('renders the destination name and the current line badge', () => {
    setup()
    expect(screen.getByText("King's Cross St. Pancras")).toBeInTheDocument()
    expect(screen.getByText('Victoria')).toBeInTheDocument()
  })

  it('shows a boarding placeholder before the first move', () => {
    setup({ currentLineId: null, currentLineName: null })
    expect(screen.getByText(/boarding/i)).toBeInTheDocument()
  })
})
