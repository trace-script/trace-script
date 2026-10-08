import type { JsonValue } from '@trace-script/metadata'

/** Inspect descriptors before cloning so accessors never run on accepted inputs. */
export function inspectJson(input: unknown, maxDepth = 64): JsonValue {
  const ancestors = new Set<object>()

  let nodes = 0

  function visit(value: unknown, depth: number): JsonValue {
    if (++nodes > 250_000 || depth > maxDepth)
      throw new Error('JSON exceeds the depth or node limit')

    if (value === null || typeof value === 'string' || typeof value === 'boolean')
      return value

    if (typeof value === 'number' && Number.isFinite(value))
      return value

    if (typeof value !== 'object' || value === null)
      throw new Error('Expected a JSON value')

    if (ancestors.has(value))
      throw new Error('Circular JSON is not supported')

    const array = Array.isArray(value)

    const prototype = Object.getPrototypeOf(value)

    if (!array && prototype !== Object.prototype && prototype !== null)
      throw new Error('Expected a plain object')

    ancestors.add(value)

    const descriptors = Object.getOwnPropertyDescriptors(value)

    const entries: [string, JsonValue][] = []

    for (const key of Reflect.ownKeys(descriptors)) {
      if (array && key === 'length')
        continue

      if (typeof key !== 'string')
        throw new Error('Symbol properties are not supported')

      const descriptor = descriptors[key]

      if (!descriptor || !('value' in descriptor) || !descriptor.enumerable)
        throw new Error('Only enumerable data properties are supported')

      if (array && (!/^(0|[1-9]\d*)$/.test(key) || Number(key) >= value.length))
        throw new Error('Array properties are not supported')

      entries.push([key, visit(descriptor.value, depth + 1)])
    }

    ancestors.delete(value)

    if (array) {
      if (entries.length !== value.length)
        throw new Error('Sparse arrays are not supported')

      return entries.map(([, item]) => item)
    }

    return Object.fromEntries(entries)
  }

  const result = visit(input, 0)
  // Reject proxies even when their descriptors appear JSON-compatible.

  structuredClone(input)

  return result
}
