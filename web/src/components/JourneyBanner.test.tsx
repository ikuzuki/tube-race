import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import type { Station } from '../engine'
import JourneyBanner from './JourneyBanner'

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

function setup(props: Partial<React.ComponentProps<typeof JourneyBanner>> = {}) {
  render(
    <JourneyBanner
      startName="Brixton"
      targetName="Bank"
      legs={[]}
      lineNames={lineNames}
      stationsById={stationsById}
      solved={false}
      {...props}
    />,
  )
}

describe('JourneyBanner', () => {
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
    expect(screen.getByTitle('Victoria: 6 stops to Oxford Circus')).toBeInTheDocument()
  })

  it('marks the player position while live and drops it when solved', () => {
    setup({ legs: [{ lineId: 'victoria', fromId: 'a', toId: 'b', stops: 6 }] })
    expect(screen.getByTitle('You are here')).toBeInTheDocument()
  })

  it('shows no live marker once solved', () => {
    setup({
      legs: [{ lineId: 'victoria', fromId: 'a', toId: 'b', stops: 6 }],
      solved: true,
    })
    expect(screen.queryByTitle('You are here')).not.toBeInTheDocument()
  })
})
