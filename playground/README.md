# Trace Script Playground

Run `pnpm dev` from the repository root and open `http://127.0.0.1:4317`.

The playground is a private workspace used for SDK scenarios and Chrome extension acceptance. It is excluded from extension packaging. Source aliases let the Vite development server use package source directly; static packaging runs through tsdown and bundles all required browser dependencies.

Run `pnpm build` for a static playground and the production extension. Load `packages/chrome-extensions/dist` as an unpacked extension, then open this page's DevTools and select Agent Trace.

Use the fixed scenario picker to compare SDK and native `postMessage` publishing. Each fixture run gets distinct IDs; parent links, duplicate IDs within a run and original sequence order are preserved. The SDK rejects decreasing or repeated sequences, while native publishing can exercise receiver normalization with out-of-order and duplicate events.

The lifecycle button publishes a session, trace and child span with their completions. The native button also publishes invalid fields, unsupported versions and oversized payloads for boundary checks. The view shows captured raw events, deduplication, spans, messages and SDK counters, retaining at most 500 captured events in memory.

The handshake button checks the extension collector; the playground observer never answers that handshake itself. Page capture proves publication only. Confirm extension reception and storage separately in DevTools when ingestion is implemented. Clearing this view does not clear extension storage or reset SDK sequence counters.

Manual acceptance for this feature:

1. Publish conversation, streaming and tool scenarios through the SDK and inspect canonical envelopes and parent links.
2. Publish native duplicate and out-of-order fixtures and inspect stable normalized order and duplicate counts.
3. Publish native invalid, version and oversized cases and inspect validation diagnostics.
4. Publish the SDK lifecycle and inspect three completed spans with session/trace-local sequences.
5. With no collector installed, check bounded unavailable status and verify later publication still works.
6. Preview the tsdown-produced static output and confirm module/style resources load without bare package imports.

Browser, build and visual results are pending. Automatic approval review currently rejects project validation commands even after explicit user authorization.
