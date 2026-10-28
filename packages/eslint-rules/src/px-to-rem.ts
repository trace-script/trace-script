import type { Rule } from './index'
import { createSimplePlugin } from 'eslint-factory'

const dimensionPattern = /[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?px(?![-\w])/iy
const identifierCharacterPattern = /[\p{L}\p{N}_.-]/u
const urlPattern = /url\(/iy
const IgnoreSize = 10

function skipString(text: string, start: number): number {
  const quote = text[start]
  let index = start + 1

  while (index < text.length) {
    if (text[index] === '\\') {
      index += 2
      continue
    }
    if (text[index] === quote)
      return index + 1
    index += 1
  }
  return index
}

function skipUrl(text: string, start: number): number {
  let depth = 1
  let index = start + 4

  while (index < text.length && depth > 0) {
    if (text[index] === '"' || text[index] === '\'') {
      index = skipString(text, index)
      continue
    }
    if (text[index] === '\\') {
      index += 2
      continue
    }
    if (text[index] === '(')
      depth += 1
    else if (text[index] === ')')
      depth -= 1

    index += 1
  }

  return index
}

function findPxDimensions(text: string): Array<{ start: number, end: number, replacement: string }> {
  const dimensions = []
  let index = 0

  while (index < text.length) {
    if (text[index] === '/' && text[index + 1] === '*') {
      const commentEnd = text.indexOf('*/', index + 2)
      index = commentEnd < 0 ? text.length : commentEnd + 2
      continue
    }

    if (text[index] === '"' || text[index] === '\'') {
      index = skipString(text, index)
      continue
    }

    if (text[index] === '\\') {
      index += 2
      continue
    }

    if (index === 0 || !identifierCharacterPattern.test(text.charAt(index - 1))) {
      urlPattern.lastIndex = index
      if (urlPattern.test(text)) {
        index = skipUrl(text, index)
        continue
      }

      dimensionPattern.lastIndex = index
      const match = dimensionPattern.exec(text)

      if (match) {
        const pixelValue = Number.parseFloat(match[0].slice(0, -2))
        const value = pixelValue / 16
        if (Number.isFinite(value) && Math.abs(pixelValue) >= IgnoreSize) {
          dimensions.push({
            start: index,
            end: index + match[0].length,
            replacement: `${value}rem`,
          })
        }
        index += match[0].length
        continue
      }
    }

    index += 1
  }

  return dimensions
}

export const pxToRem: Rule = createSimplePlugin({
  name: 'px-to-rem',
  description: 'Convert CSS px dimensions to rem using a 16px base.',
  include: ['**/*.css', '**/*.scss', '**/*.vue'],
  create(context) {
    return {
      Program() {
        for (const { start, end, replacement } of findPxDimensions(context.text))
          context.replaceTextRange(start, end, replacement)
      },
    }
  },
})
