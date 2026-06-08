import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { track } from './analytics'

describe('track', () => {
  beforeEach(() => {
    sessionStorage.clear()
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(new Response(null, { status: 204 }))))
  })
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  function lastUrl(): string {
    const mock = fetch as unknown as ReturnType<typeof vi.fn>
    return String(mock.mock.calls[mock.mock.calls.length - 1][0])
  }

  it('beacons to /e with ev, sid and props', () => {
    track('start', { mode: 'daily' })
    expect(fetch).toHaveBeenCalledTimes(1)
    const url = lastUrl()
    expect(url.startsWith('/e?')).toBe(true)
    const params = new URLSearchParams(url.slice(url.indexOf('?') + 1))
    expect(params.get('ev')).toBe('start')
    expect(params.get('mode')).toBe('daily')
    expect(params.get('sid')).toBeTruthy()
  })

  it('uses no-cors and keepalive (a fire-and-forget beacon)', () => {
    track('complete', { stars: 3 })
    const mock = fetch as unknown as ReturnType<typeof vi.fn>
    const opts = mock.mock.calls[0][1] as RequestInit
    expect(opts.mode).toBe('no-cors')
    expect(opts.keepalive).toBe(true)
  })

  it('reuses one session id across events', () => {
    track('start', { mode: 'daily' })
    track('give_up', { mode: 'daily' })
    const sids = (fetch as unknown as ReturnType<typeof vi.fn>).mock.calls.map((c) => {
      const u = String(c[0])
      return new URLSearchParams(u.slice(u.indexOf('?') + 1)).get('sid')
    })
    expect(sids[0]).toBe(sids[1])
    expect(sids[0]).toBeTruthy()
  })

  it('honours Do Not Track', () => {
    const original = Object.getOwnPropertyDescriptor(Navigator.prototype, 'doNotTrack')
    Object.defineProperty(navigator, 'doNotTrack', { value: '1', configurable: true })
    track('start', { mode: 'daily' })
    expect(fetch).not.toHaveBeenCalled()
    if (original) Object.defineProperty(Navigator.prototype, 'doNotTrack', original)
    else Object.defineProperty(navigator, 'doNotTrack', { value: null, configurable: true })
  })

  it('never throws even if fetch fails', () => {
    vi.stubGlobal('fetch', vi.fn(() => {
      throw new Error('network down')
    }))
    expect(() => track('share', { ok: true })).not.toThrow()
  })
})
