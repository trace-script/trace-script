import { describe, expect, it } from 'vitest'
import { formatMilliseconds } from '../src/format-milliseconds'

describe('formatMilliseconds', () => {
  it('formats millisecond and second durations', () => {
    expect(formatMilliseconds(420)).toBe('420 ms')
    expect(formatMilliseconds(1250)).toBe('1.3 s')
  })
})
