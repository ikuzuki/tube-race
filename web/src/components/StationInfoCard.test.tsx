import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import StationInfoCard from './StationInfoCard'
import type { Station } from '../engine'
import type { StationInfo } from '../lib/stationInfo'
import infoFixture from '../lib/__fixtures__/stations-info.fixture.json'

const stations = infoFixture.stations as Record<string, StationInfo>

// Brixton: full house — opened + rank, daily traffic + rank, zone, lines, fact, wiki.
const brixton: Station = {
  id: 'brixton',
  name: 'Brixton',
  lat: 51.4627,
  lon: -0.1145,
  lines: ['victoria'],
  zone: '2',
}

// Victoria: NO dailyTraffic in the info fixture — the traffic fact must be omitted.
const victoria: Station = {
  id: 'victoria-stn',
  name: 'Victoria',
  lat: 51.4965,
  lon: -0.1447,
  lines: ['victoria', 'district', 'circle'],
  zone: '1',
}

describe('StationInfoCard', () => {
  it('renders the role tag and station display name', () => {
    render(<StationInfoCard roleLabel="Start" station={brixton} info={stations.brixton} />)
    expect(screen.getByText('Start')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Brixton' })).toBeInTheDocument()
  })

  it('renders all available facts with their ranks for a fully-populated station', () => {
    render(<StationInfoCard roleLabel="Start" station={brixton} info={stations.brixton} />)
    expect(screen.getByText('Opened')).toBeInTheDocument()
    expect(screen.getByText('1971')).toBeInTheDocument()
    expect(screen.getByText('(#268 oldest)')).toBeInTheDocument()
    expect(screen.getByText('Daily traffic')).toBeInTheDocument()
    // 78000 formatted with a thousands separator.
    expect(screen.getByText('78,000')).toBeInTheDocument()
    expect(screen.getByText('(#18 busiest)')).toBeInTheDocument()
    expect(screen.getByText('Zone')).toBeInTheDocument()
    expect(screen.getByText('2')).toBeInTheDocument()
    expect(screen.getByText('Served by')).toBeInTheDocument()
    expect(screen.getByText('1 line')).toBeInTheDocument()
  })

  it('renders the fun fact and a Wikipedia link when present', () => {
    render(<StationInfoCard roleLabel="Start" station={brixton} info={stations.brixton} />)
    expect(screen.getByText(/southern terminus of the Victoria line/i)).toBeInTheDocument()
    const link = screen.getByRole('link', { name: /wikipedia/i })
    expect(link).toHaveAttribute('href', 'https://en.wikipedia.org/wiki/Brixton_station')
  })

  it('omits the daily-traffic fact when it is missing, falling back to zone + lines', () => {
    render(
      <StationInfoCard roleLabel="Destination" station={victoria} info={stations['victoria-stn']} />,
    )
    // No traffic stat for Victoria in the fixture.
    expect(screen.queryByText('Daily traffic')).not.toBeInTheDocument()
    // But opened, zone and lines still render.
    expect(screen.getByText('Opened')).toBeInTheDocument()
    expect(screen.getByText('1868')).toBeInTheDocument()
    expect(screen.getByText('Zone')).toBeInTheDocument()
    expect(screen.getByText('1')).toBeInTheDocument()
    expect(screen.getByText('Served by')).toBeInTheDocument()
    expect(screen.getByText('3 lines')).toBeInTheDocument()
  })

  it('shows only the always-available lines fact when no info and no zone exist', () => {
    const bare: Station = { id: 'x', name: 'Nowhere', lat: 0, lon: 0, lines: ['central'] }
    render(<StationInfoCard roleLabel="Start" station={bare} />)
    expect(screen.getByRole('heading', { name: 'Nowhere' })).toBeInTheDocument()
    expect(screen.getByText('Served by')).toBeInTheDocument()
    expect(screen.getByText('1 line')).toBeInTheDocument()
    // Nothing else: no opened, traffic, zone, fact or link.
    expect(screen.queryByText('Opened')).not.toBeInTheDocument()
    expect(screen.queryByText('Daily traffic')).not.toBeInTheDocument()
    expect(screen.queryByText('Zone')).not.toBeInTheDocument()
    expect(screen.queryByRole('link')).not.toBeInTheDocument()
  })

  it('strips the verbose TfL suffix from the station name', () => {
    const suffixed: Station = {
      id: 'oval',
      name: 'Oval Underground Station',
      lat: 0,
      lon: 0,
      lines: ['northern'],
    }
    render(<StationInfoCard roleLabel="Start" station={suffixed} />)
    expect(screen.getByRole('heading', { name: 'Oval' })).toBeInTheDocument()
  })
})
