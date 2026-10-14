import type { Rule } from './index'
import { createSimplePlugin } from 'eslint-factory'

export const noTsImportExtension: Rule = createSimplePlugin({
  name: 'no-ts-import-extension',
  include: ['*.ts', '**/*.ts'],
  exclude: ['*.config.ts', '**/*.config.ts'],
  create(context) {
    return {
      ImportDeclaration(node) {
        const source = node.source?.value
        if (typeof source !== 'string' || !source.endsWith('.ts'))
          return

        const nextPath = source.slice(0, -'.ts'.length)

        context.report({
          node: node.source,
          message: 'Do not include the .ts extension in import paths.',
          fix: fixer => fixer.replaceText(node.source, `'${nextPath}'`),
        })
      },
    }
  },
})
