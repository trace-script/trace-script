import { describe, expect, it } from 'vitest'
import { utf8ByteLength } from '@/index'

describe('utf8ByteLength', () => {
  it.each([
    { text: '', bytes: 0 },
    { text: 'trace', bytes: 5 },
    { text: '你好', bytes: 6 },
    { text: '🙂', bytes: 4 },
    { text: 'a\u0301', bytes: 3 },
    { text: '\uD800', bytes: 3 },
  ])('measures $text as $bytes UTF-8 bytes', ({ text, bytes }) => {
    expect(utf8ByteLength(text)).toBe(bytes)
  })
})
