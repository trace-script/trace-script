# `@trace-script/eslint-rules`

Repository-specific ESLint rules shared by Trace Script workspace projects.

The default export is an array of flat config items that can be passed directly
to an ESLint config factory.

```ts
import eslintRules from '@trace-script/eslint-rules'

export default createConfig(...eslintRules)
```

## Development

From the repository root:

```sh
pnpm --filter @trace-script/eslint-rules typecheck
pnpm --filter @trace-script/eslint-rules build
```
