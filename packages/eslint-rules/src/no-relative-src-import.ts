import type { Rule } from './index'
import { existsSync } from 'node:fs'
import { dirname, extname, isAbsolute, join, relative, resolve, sep } from 'node:path'
import { isString, isUndefined } from '@trace-script/shared'
import { createSimplePlugin } from 'eslint-factory'

const importExistsCache = new Map<string, boolean>()

function findSrcRoot(filename: string): string {
  let directory = dirname(resolve(filename))

  while (directory !== dirname(directory)) {
    const directoryName = directory.split(sep).at(-1)
    if (directoryName === 'src')
      return directory
    if (directoryName === 'tests' && existsSync(join(dirname(directory), 'src')))
      return join(dirname(directory), 'src')
    directory = dirname(directory)
  }

  return ''
}

/**
 * Resolve extensionless imports against supported file extensions and directory index files.
 */
function getImportCandidates(target: string): Array<string> {
  const extension = ['.ts', '.tsx', '.js', '.jsx', '.vue', '.json']
  if (extname(target))
    return [target]

  const fileCandidates = extension.map(extension => `${target}${extension}`)
  const indexFiles = ['index.ts', 'index.tsx', 'index.js', 'index.jsx', 'index.vue']
  const directoryCandidates = indexFiles.map(index => join(target, index))
  return [target, ...fileCandidates, ...directoryCandidates]
}

function importExists(target: string): boolean {
  const cached = importExistsCache.get(target)
  if (!isUndefined(cached))
    return cached

  const exists = getImportCandidates(target).some(candidate => existsSync(candidate))
  importExistsCache.set(target, exists)

  return exists
}

function resolveSrcImport(source: string, filename: string, srcRoot: string): string {
  const target = resolve(dirname(resolve(filename)), source)
  const relativeTarget = relative(srcRoot, target)
  const targetSegments = relativeTarget.split(sep)

  if (isAbsolute(relativeTarget) || targetSegments[0] === '..' || relativeTarget === '' || !importExists(target))
    return ''

  return relativeTarget.split(sep).join('/')
}

function resolveAlias(source: string, filename: string): string {
  const srcRoot = findSrcRoot(filename)

  if (srcRoot === '')
    return ''

  const srcImport = resolveSrcImport(source, filename, srcRoot)
  if (srcImport === '')
    return ''

  return `@/${srcImport}`
}

export const noRelativeSrcImport: Rule = createSimplePlugin({
  name: 'no-relative-src-import',
  description: 'Use @/ aliases for imports from src in source and test files.',
  include: ['*.ts', '**/*.ts', '*.vue', '**/*.vue'],
  create(context) {
    return {
      ImportDeclaration(node) {
        const source = node.source.value
        if (!isString(source) || !source.startsWith('../'))
          return

        const filename = context.filename
        if (!isString(filename) || filename === '')
          return

        const alias = resolveAlias(source, filename)
        if (alias === '')
          return

        context.report({
          node: node.source,
          message: 'Use an @/ alias instead of a relative src import.',
          fix: fixer => fixer.replaceText(node.source, `'${alias}'`),
        })
      },
    }
  },
})
