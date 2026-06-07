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
})
