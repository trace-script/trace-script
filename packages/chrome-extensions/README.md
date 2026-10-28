# Chrome extension

This package receives envelopes emitted by `@trace-script/sdk` and displays them in a Manifest V3 DevTools panel. The transport is deliberately small:

```text
SDK window.postMessage -> content script -> service worker -> Agent Trace panel
```

The worker validates every event with `@trace-script/core`, keeps events isolated by inspected tab, and sends an initial snapshot plus live additions to the panel. Invalid or legacy event shapes are ignored so the panel renders the SDK protocol.

The panel derives calls from the raw stream: one table row per model or tool call, with TraceID, Name, Agent, Duration, Type, Status, Model, and Tokens columns. Timeline groups share model/tool tracks. Click a row's Trace ID to inspect lifecycle, timing, and aggregate usage without adding summary rows. Only errors also shows calls belonging to failed/conflicting Traces, preserving each call's actual status; errors without calls remain accessible in the table's empty state.

Run `pnpm build` from this package to generate the static Nuxt panel and assemble the production extension in `dist`. Use `pnpm dev:extension` to assemble the development extension in `dist-dev`. Load the chosen directory from Chrome's extensions page with developer mode enabled, then open a page's DevTools and select **Agent Trace**. Reload the extension after rebuilding. Use `pnpm dev` for the Nuxt-powered live panel preview.
