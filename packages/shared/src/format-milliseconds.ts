/** Format a millisecond duration as milliseconds or fractional seconds. */
export function formatMilliseconds(value: number): string {
  if (value < 1000)
    return `${Math.round(value)} ms`
  return `${(value / 1000).toFixed(1)} s`
}
