import antfu from '@antfu/eslint-config'
import rules from '@trace-script/eslint-rules'
import withNuxt from './packages/chrome-extensions/.nuxt/eslint.config.mjs'

export default withNuxt(antfu({
  ignores: ['packages/eslint-rules/tests/fixtures/**'],
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
    'node/prefer-global/process': 'off',
    'antfu/top-level-function': 'off',
    'regexp/no-unused-capturing-group': 'off',
  },
}, ...rules))
