import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import type { Station } from '../engine'
import { points } from '../lib/score'
import StatusBar from './StatusBar'

const stationsById = new Map<string, Station>(
  [
    { id: 'a', name: 'Brixton Underground Station', lat: 0, lon: 0, lines: ['victoria'] },
    { id: 'b', name: 'Oxford Circus Underground Station', lat: 0, lon: 0, lines: ['victoria'] },
    { id: 'c', name: 'Bank Underground Station', lat: 0, lon: 0, lines: ['central'] },
  ].map((s) => [s.id, s as Station]),
)

const lineNames = new Map([
  ['victoria', 'Victoria'],
  ['central', 'Central'],
])

function setup(props: Partial<React.ComponentProps<typeof StatusBar>> = {}) {
  render(
    <StatusBar
      startName="Brixton"
      targetName="Bank"
      legs={[]}
      lineNames={lineNames}
      stationsById={stationsById}
      solved={false}
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

describe('StatusBar score', () => {
  it('shows the weighted score against par as the hero number', () => {
    // hops 5, changes 1 -> 5 + 4 = 9; par 4 + 4 = 8.
    setup({ hops: 5, parHops: 4, changes: 1, parChanges: 1 })
    expect(points(5, 1)).toBe(9)
    expect(screen.getByLabelText('Score 9, best possible 8')).toBeInTheDocument()
    expect(screen.getByText('9')).toBeInTheDocument()
    expect(screen.getByText('/ 8 best')).toBeInTheDocument()
  })

  it('shows stops and changes as plain counts (no denominator)', () => {
    setup({ hops: 5, parHops: 4, changes: 2, parChanges: 1 })
    expect(screen.getByText('Stops')).toBeInTheDocument()
    expect(screen.getByText('Changes')).toBeInTheDocument()
    expect(screen.queryByText('/ 4')).not.toBeInTheDocument()
  })

  it('renders the current line badge', () => {
    setup()
    expect(screen.getByText('Victoria')).toBeInTheDocument()
  })

  it('shows a boarding placeholder before the first move', () => {
    setup({ currentLineId: null, currentLineName: null })
    expect(screen.getByText(/boarding/i)).toBeInTheDocument()
  })
})

describe('StatusBar journey', () => {
  it('always shows start and destination', () => {
    setup()
    expect(screen.getByText('Start')).toBeInTheDocument()
    expect(screen.getByText('Brixton')).toBeInTheDocument()
    expect(screen.getByText('Destination')).toBeInTheDocument()
    expect(screen.getByText('Bank')).toBeInTheDocument()
  })

  it('describes an empty journey before the first move', () => {
    setup()
    expect(screen.getByLabelText('Journey so far: No moves yet')).toBeInTheDocument()
  })

  const compactLine = (_: string, el: Element | null): boolean =>
    el?.tagName === 'P' && el.textContent === 'Brixton to Bank'

  it('offers a compact one-line start-to-destination before the first move', () => {
    // The mobile-only collapsed form (CSS hides it from sm up).
    setup()
    expect(screen.getByText(compactLine)).toBeInTheDocument()
  })

  it('drops the compact line once the ride ribbon has content', () => {
    setup({ legs: [{ lineId: 'victoria', fromId: 'a', toId: 'b', stops: 2 }] })
    expect(screen.queryByText(compactLine)).not.toBeInTheDocument()
  })

  it('narrates the legs ridden, including changes', () => {
    setup({
      legs: [
        { lineId: 'victoria', fromId: 'a', toId: 'b', stops: 6 },
        { lineId: 'central', fromId: 'b', toId: 'c', stops: 2 },
      ],
    })
    expect(
      screen.getByLabelText(
        'Journey so far: 6 stops on Victoria, change at Oxford Circus, 2 stops on Central',
      ),
    ).toBeInTheDocument()
    expect(screen.getByTitle('Change at Oxford Circus')).toBeInTheDocument()
  })

  it('marks the player position while the run is live', () => {
    setup({ legs: [{ lineId: 'victoria', fromId: 'a', toId: 'b', stops: 6 }] })
    expect(screen.getByTitle('You are here')).toBeInTheDocument()
  })

  it('drops the live marker once solved', () => {
    setup({ legs: [{ lineId: 'victoria', fromId: 'a', toId: 'b', stops: 6 }], solved: true })
    expect(screen.queryByTitle('You are here')).not.toBeInTheDocument()
  })

  it('exposes the compass bearing and distance', () => {
    setup({ km: 2.3 })
    expect(screen.getByLabelText(/Destination is 2\.3 km away/)).toBeInTheDocument()
  })
})
