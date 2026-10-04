# Trace Script

Trace Script is a local Chrome DevTools panel for inspecting Agent event streams. The implementation follows the staged plans in [docs](docs/README.md); current delivery and acceptance records are in [the execution tracker](docs/08-execution-tracker.md).

Install dependencies with `pnpm install --frozen-lockfile` using the Node.js version supported by tsdown and the pnpm version declared in `package.json`.

| Command | Purpose |
| --- | --- |
| `pnpm dev` | Open the playground development server at `http://127.0.0.1:4317` |
| `pnpm dev:panel` | Preview the internal Nuxt panel |
| `pnpm build` | Build the library packages, extension, and static playground |
| `pnpm build:dev` | Assemble a separate development extension directory |
| `pnpm test` | Prepare Nuxt types and run root-level Vitest tests |
| `pnpm typecheck` | Check root tests, independent packages, and the Nuxt panel |
| `pnpm lint` | Check repository formatting and lint rules |
| `pnpm package:chrome` | Build and archive the production extension |

Every package enters packaging through tsdown. The internal Nuxt SPA uses its explicitly approved Vite pipeline. The panel belongs to `packages/chrome-extensions`; the root playground is a private development workspace and is excluded from extension packaging.

Load `packages/chrome-extensions/dist` as an unpacked extension, then open the playground's DevTools and select **Agent Trace**. The playground supplies SDK/native fixtures, lifecycle publishing, captured protocol events, aggregation and a collector handshake check. The extension currently supplies the panel shell; reception and recording follow in the ingestion stage.

See [SDK usage and native integration](packages/sdk/README.md) and [playground acceptance steps](playground/README.md).

Tests live in root `tests/<package>/` directories for `core`, `metadata`, `sdk`, `shared`, and `chrome-extensions`. They are added alongside the actual functions and schema behavior; empty entry points do not receive placeholder behavior tests. `tsconfig` supplies shared configuration and has no business unit tests.
