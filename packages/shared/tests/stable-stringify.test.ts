import { expect, it } from 'vitest'
import { stableStringify } from '@/stable-stringify'

it('normalizes nested object keys while preserving array order and values', () => {
  expect(stableStringify({ b: [{ z: 1, a: 2 }], a: false })).toBe(stableStringify({ a: false, b: [{ a: 2, z: 1 }] }))
  expect(stableStringify([1, 2])).not.toBe(stableStringify([2, 1]))
  expect(stableStringify({ a: 0 })).not.toBe(stableStringify({ a: false }))
})
