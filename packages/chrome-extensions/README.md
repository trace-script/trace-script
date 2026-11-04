# Chrome extension

This package receives envelopes emitted by `@trace-script/sdk` and displays them in a Manifest V3 DevTools panel. The transport is deliberately small:

```text
SDK window.postMessage -> content script -> service worker -> IndexedDB -> Agent Trace panel
```

The worker validates every event with `@trace-script/core`, keeps events isolated by inspected tab, and sends an initial snapshot plus live additions to the panel. Invalid or legacy event shapes are ignored so the panel renders the SDK protocol.

Validated events are committed to the extension's IndexedDB before live delivery. Opening the panel reads the tab's stored history, including events received while DevTools was closed or before the worker restarted. Writes, snapshots, and subscriptions are processed in arrival order. Storage failures are logged by the worker and do not produce a live append for an uncommitted event; later operations can still proceed.

The event store has indexes for tab history and `traceId`. `readTraceEvents({ traceId })` retrieves one Agent session across stored history without adding a separate session identifier or changing the SDK protocol. The panel continues to display history for its inspected tab; this change does not add a historical-session picker. A browser-session identifier in `chrome.storage.session` namespaces tab IDs so a reused tab ID after browser restart cannot expose another tab's old history. IndexedDB records remain stored across browser restarts and have no application-defined expiration or capacity policy.

The standalone preview also uses this event store, under the preview page's own origin. Its initial sample is seeded once, **Add sample Trace** commits additional samples before displaying them, and reloads restore saved samples. **Clear traces** deletes preview history and keeps it empty after reload. Preview storage is separate from the extension's IndexedDB, and the preview does not subscribe to SDK events from other pages.

The panel derives calls from the raw stream: one table row per model or tool call, with TraceID, Name, Agent, Duration, Type, Status, Model, and Tokens columns. Timeline groups share model/tool tracks. Click a row's Trace ID to inspect lifecycle, timing, and aggregate usage without adding summary rows. Only errors also shows calls belonging to failed/conflicting Traces, preserving each call's actual status; errors without calls remain accessible in the table's empty state.

Run `pnpm build` from this package to generate the static Nuxt panel and assemble the production extension in `dist`. Use `pnpm dev:extension` to assemble the development extension in `dist-dev`. Load the chosen directory from Chrome's extensions page with developer mode enabled, then open a page's DevTools and select **Agent Trace**. Reload the extension after rebuilding. Use `pnpm dev` for the Nuxt-powered live panel preview.
