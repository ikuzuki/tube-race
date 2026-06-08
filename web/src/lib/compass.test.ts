import { describe, expect, it } from 'vitest'
import { compassWord } from './compass'

describe('compassWord', () => {
  it('maps the eight cardinal/intercardinal bearings', () => {
    expect(compassWord(0)).toBe('N')
    expect(compassWord(45)).toBe('NE')
    expect(compassWord(90)).toBe('E')
    expect(compassWord(135)).toBe('SE')
    expect(compassWord(180)).toBe('S')
    expect(compassWord(225)).toBe('SW')
    expect(compassWord(270)).toBe('W')
    expect(compassWord(315)).toBe('NW')
  })

  it('rounds to the nearest point', () => {
    expect(compassWord(20)).toBe('N')
    expect(compassWord(25)).toBe('NE')
    expect(compassWord(200)).toBe('S')
  })

  it('wraps at 360 and below 0', () => {
    expect(compassWord(360)).toBe('N')
    expect(compassWord(350)).toBe('N')
    expect(compassWord(-90)).toBe('W')
  })
})
