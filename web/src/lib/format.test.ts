import { describe, expect, it } from 'vitest'
import { displayName } from './format'

describe('displayName', () => {
  it('strips the Underground Station suffix', () => {
    expect(displayName('Victoria Underground Station')).toBe('Victoria')
  })

  it('strips Rail and DLR mode suffixes', () => {
    expect(displayName('Acton Central Rail Station')).toBe('Acton Central')
    expect(displayName('Custom House DLR Station')).toBe('Custom House')
    expect(displayName('Custom House DLR')).toBe('Custom House')
  })

  it('strips the internal ELL marker', () => {
    expect(displayName('New Cross ELL Rail Station')).toBe('New Cross')
  })

  it('removes parenthetical disambiguators', () => {
    expect(displayName('Paddington (H&C Line) Underground Station')).toBe('Paddington')
  })

  it('preserves an internal Station that is not a mode suffix', () => {
    expect(displayName('Battersea Power Station Underground Station')).toBe(
      'Battersea Power Station',
    )
  })

  it('leaves an already-clean name untouched', () => {
    expect(displayName('Oval')).toBe('Oval')
  })

  it('keeps a disambiguating qualifier for genuinely colliding stations', () => {
    // Two real, non-interchanging Edgware Road stations; two Bethnal Greens.
    expect(displayName('Edgware Road (Bakerloo) Underground Station')).toBe('Edgware Road (Bakerloo)')
    expect(displayName('Edgware Road (Circle Line) Underground Station')).toBe('Edgware Road (Circle)')
    expect(displayName('Bethnal Green Rail Station')).toBe('Bethnal Green (Overground)')
    // The Central-line Bethnal Green stays plain (it is the one without a peer suffix).
    expect(displayName('Bethnal Green Underground Station')).toBe('Bethnal Green')
  })
})
