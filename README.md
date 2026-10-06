# Trace Script

Trace Script is a Chrome DevTools extension for inspecting Agent event streams. It currently includes protocol parsing, a Trace SDK, and a foundational DevTools panel.

## Installation

Requires Node.js, pnpm `11.24.0`, and Chrome 120+.

```sh
pnpm install
```

## Common commands

| Command | Purpose |
| --- | --- |
| `pnpm dev` | Start the playground (`http://127.0.0.1:4317`) |
| `pnpm dev:panel` | Start the panel development server |
| `pnpm build` | Build all workspaces and the extension |
| `pnpm build:dev` | Build the development extension |
| `pnpm test` | Run Vitest tests |
| `pnpm typecheck` | Run TypeScript checks |
| `pnpm lint` | Run lint checks |
| `pnpm package:chrome` | Package the production extension |

## Load the extension locally

1. Run `pnpm build`.
2. Open `chrome://extensions`, enable **Developer mode**, and choose **Load unpacked**.
3. Select `packages/chrome-extensions/dist`.
4. Open the playground's DevTools and select the **Agent Trace** panel.

The development extension is generated in `packages/chrome-extensions/dist-dev`.