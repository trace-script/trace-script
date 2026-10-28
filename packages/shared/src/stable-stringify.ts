import { isArray, isObject } from './type-guards'

/** Serialize JSON objects independently of object key insertion order. */
export function stableStringify(input: object): string {
  return JSON.stringify(input, (_, value) => {
    if (isObject(value) && !isArray(value))
      return Object.fromEntries(Object.entries(value).sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0))
    return value
  })
}
