import antfu from '@antfu/eslint-config'

const config = antfu({
  pnpm: true,
  type: 'lib',
  typescript: true,
  rules: {
    'no-console': 'off',
    'node/prefer-global/process': 'off',
    'antfu/top-level-function': 'off',
    'regexp/no-unused-capturing-group': 'off',
  },
})

export default config
