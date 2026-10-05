import antfu from '@antfu/eslint-config'
import { createSimplePlugin } from 'eslint-factory'

export default antfu({
  type: 'lib',
  pnpm: true,
  typescript: true,
  formatters: {
    css: 'prettier',
  },
  test: {
    overrides: {
      'test/padding-around-after-all-blocks': 'error',
      'test/padding-around-after-each-blocks': 'error',
      'test/padding-around-before-all-blocks': 'error',
      'test/padding-around-before-each-blocks': 'error',
      'test/padding-around-describe-blocks': 'error',
      'test/padding-around-test-blocks': 'error',
      'test/prefer-to-be-truthy': 'error',
      'test/prefer-to-be-falsy': 'error',
    },
  },
  rules: {
    'no-console': 'off',
    'node/prefer-global/process': 'off',
    'antfu/top-level-function': 'off',
    'regexp/no-unused-capturing-group': 'off',
  },
}, createSimplePlugin({
  name: 'no-ts-import-extension',
  include: ['*.ts', '**/*.ts'],
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
}))
