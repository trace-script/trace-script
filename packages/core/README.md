# Trace protocol core

`@trace-script/core` exposes browser-independent parsing, normalization and aggregation:

- `safeParseTraceEvent` / `parseTraceEvent`: validate JSON, version, event fields and UTF-8 size; normalize UTC timestamps.
- `safeParseBridgeMessage` / `parseBridgeMessage`: validate the channel envelope, event count and total size, then validate each event.
- `migrateTraceEvent`: the explicit `1.0` identity migration; unsupported versions produce a compatibility issue.
- `compareTraceEvents` / `sortTraceEvents` / `normalizeTraceEvents`: stable trace-local ordering, first-accepted deduplication, JSON-content conflicts and parent diagnostics.
- `aggregateSpans` / `aggregateMessages`: derive display data while preserving raw event references by ID.

Normalization and aggregation accept already parsed events. Parse external inputs before calling them. Completed message text, including an empty string, overrides concatenated deltas. Terminal events link to their start event through `parentId` in the same session and trace; the first terminal in normalized order determines the outcome.

The complete rules are in [the stage 2 plan](../../docs/02-trace-protocol-and-sdk.md). Root `fixtures/protocol.ts` is shared by unit tests and the playground. Tests are in `tests/core/`.
