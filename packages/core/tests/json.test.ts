import { describe, expect, it } from 'vitest'
import { inspectJson, redactJson, safeParseTraceEvent } from '../src/index'
import { baseEvent } from './fixtures/protocol'

describe('untrusted JSON boundary', () => {
  it('rejects circular, sparse, accessor, proxy and hidden data without throwing from safe parsing', () => {
    const cycle: { child?: object } = {}

    cycle.child = cycle

    const accessor = Object.defineProperty({}, 'token', { enumerable: true, get() {
      throw new Error('must not execute')
    } })

    const hidden = Object.defineProperty({}, 'hidden', { value: 1 })

    for (const payload of [cycle, accessor, hidden, new Proxy({}, {}), Array.from({ length: 2 }), { [Symbol('secret')]: 1 }]) {
      expect(safeParseTraceEvent({ ...baseEvent, payload }).success).toBeFalsy()
    }
  })

  it('accepts shared references and rejects excessive nesting', () => {
    const shared = { x: 1 }

    expect(inspectJson({ a: shared, b: shared })).toEqual({ a: shared, b: shared })

    let nested: object = {}

    for (let i = 0; i < 70; i++) nested = { nested }

    expect(() => inspectJson(nested)).toThrow('depth')
  })

  it('redacts case-insensitive nested fields without changing the input', () => {
    const original = { Cookie: 'private', data: [{ api_key: 'secret', public: 'safe' }] }

    expect(redactJson(original)).toEqual({ Cookie: '[REDACTED]', data: [{ api_key: '[REDACTED]', public: 'safe' }] })

    expect(original.Cookie).toBe('private')
  })
})
