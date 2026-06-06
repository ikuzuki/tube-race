import { describe, expect, it, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import IntroModal from './IntroModal'
import type { Station } from '../engine'
import type { StationInfo } from '../lib/stationInfo'
import infoFixture from '../lib/__fixtures__/stations-info.fixture.json'

const stations = infoFixture.stations as Record<string, StationInfo>

const brixton: Station = {
  id: 'brixton',
  name: 'Brixton',
  lat: 51.4627,
  lon: -0.1145,
  lines: ['victoria'],
  zone: '2',
}
const kingsCross: Station = {
  id: 'kings-cross',
  name: "King's Cross St. Pancras",
  lat: 51.5308,
  lon: -0.1238,
  lines: ['victoria', 'northern'],
  zone: '1',
}

function setup(props: Partial<React.ComponentProps<typeof IntroModal>> = {}) {
  const onClose = vi.fn()
  render(
    <IntroModal
      open
      onClose={onClose}
      start={{ station: brixton, info: stations.brixton }}
      destination={{ station: kingsCross, info: stations['kings-cross'] }}
      {...props}
    />,
  )
  return { onClose }
}

describe('IntroModal', () => {
  it('renders nothing when closed', () => {
    setup({ open: false })
    expect(screen.queryByText(/today's journey/i)).not.toBeInTheDocument()
  })

  it('renders the title and both station cards when open', () => {
    setup()
    expect(screen.getByRole('heading', { name: /today's journey/i })).toBeInTheDocument()
    // The Destination role tag is unique; "Start" also names the button, so just
    // assert the two station headings to confirm both cards rendered.
    expect(screen.getByText('Destination')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Brixton' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: "King's Cross St. Pancras" })).toBeInTheDocument()
    // The primary action is a button.
    expect(screen.getByRole('button', { name: /^start$/i })).toBeInTheDocument()
  })

  it('calls onClose when the Start button is clicked', () => {
    const { onClose } = setup()
    fireEvent.click(screen.getByRole('button', { name: /^start$/i }))
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('renders without info (degrades to the always-available facts)', () => {
    setup({
      start: { station: brixton },
      destination: { station: kingsCross },
    })
    expect(screen.getByRole('heading', { name: 'Brixton' })).toBeInTheDocument()
    // Lines fact is always present.
    expect(screen.getByText('1 line')).toBeInTheDocument()
    expect(screen.getByText('2 lines')).toBeInTheDocument()
  })
})
