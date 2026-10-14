import { existsSync } from 'node:fs'
import { dirname, extname, isAbsolute, join, relative, resolve, sep } from 'node:path'
import { createSimplePlugin } from 'eslint-factory'

const importExistsCache = new Map<string, boolean>()

function findSrcRoot(filename: string): string {
  let directory = dirname(resolve(filename))

  while (directory !== dirname(directory)) {
    const directoryName = directory.split(sep).at(-1)
    if (directoryName === 'src')
      return directory
    directory = dirname(directory)
  }

  return ''
}

/**
 * Resolve extensionless imports against supported file extensions and directory index files.
 */
function getImportCandidates(target: string): Array<string> {
  const extension = ['.ts', '.tsx', '.js', '.jsx', '.vue', '.json']
  const candidates = extname(target)
    ? [target]
    : [target, ...extension.map(extension => `${target}${extension}`), ...['index.ts', 'index.tsx', 'index.js', 'index.jsx', 'index.vue'].map(index => join(target, index))]

  return candidates
}

function importExists(target: string): boolean {
  const cached = importExistsCache.get(target)
  if (cached !== undefined)
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

const noRelativeSrcImport: ReturnType<typeof createSimplePlugin> = createSimplePlugin({
  name: 'no-relative-src-import',
  description: 'Use @/ aliases instead of relative imports within src.',
  include: ['*.ts', '**/*.ts', '*.vue', '**/*.vue'],
  create(context) {
    return {
      ImportDeclaration(node) {
        const source = node.source.value
        if (typeof source !== 'string' || !source.startsWith('../'))
          return

        const filename = context.filename
        if (typeof filename !== 'string' || filename === '')
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

export default noRelativeSrcImport
