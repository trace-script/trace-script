# @trace-script/sdk

Publish Trace Script protocol events from a web page. The SDK uses `window.postMessage` with the page's exact origin and does not use Chrome APIs or require an extension ID.

Create the SDK in the browser where the Agent runs. Calls made without a browser return an error result; an instance created during server rendering does not attach itself later during hydration. The initial collector supports the top-level page.

## Session, trace and span example

```ts
import { createTraceSdk } from '@trace-script/sdk'

const sdk = createTraceSdk({
  batchSize: 20,
  flushIntervalMs: 50,
  onError(issue) {
    console.warn('Trace publishing issue:', issue.code)
  },
})

const session = sdk.startSession('Conversation')
if (session.ok) {
  const trace = sdk.startTrace('Turn')
  if (trace.ok) {
    const model = sdk.startSpan('Model request', {
      model: { name: 'example-model', provider: 'example-provider' },
      payload: { prompt: 'Hello' },
    })
    if (model.ok) {
      model.value.end({
        payload: { response: 'Hello back' },
        metrics: { inputTokens: 1, outputTokens: 2 },
      })
    }
    sdk.endTrace()
  }
  sdk.endSession()
}

sdk.flush()
sdk.dispose()
```

Results discriminate on `ok`. Successful calls that produce a value expose it in `value`; failures expose a stable `issue.code` and readable `issue.message`. Diagnostic callbacks cannot throw through the SDK into the host application.

`startSession` creates a session and a dedicated trace for its lifecycle events. Each `startTrace` creates another trace within that session, represented by a root `span.start`. Span completions reference their start event through `parentId`. Child spans capture their original session and trace, so ending a child after another trace starts preserves its original context. Ending a session first closes its active root trace; unfinished child spans remain available for later completion.

## Publish complete events

```ts
import type { TraceEventEnvelope } from '@trace-script/metadata'
import { PROTOCOL_VERSION } from '@trace-script/metadata'
import { createTraceSdk } from '@trace-script/sdk'

const sdk = createTraceSdk()
const event: TraceEventEnvelope = {
  version: PROTOCOL_VERSION,
  eventId: crypto.randomUUID(),
  sessionId: 'external-session',
  traceId: 'external-trace',
  sequence: 1,
  timestamp: new Date().toISOString(),
  type: 'log',
  name: 'External application log',
  payload: { message: 'Ready' },
}

const result = sdk.emit(event)
if (!result.ok)
  console.warn(result.issue.code)

sdk.flush()
sdk.dispose()
```

Complete events and SDK lifecycle events share sequence accounting. Sequences must increase within each trace, and rejected events cannot be used to move the counter backwards. Use distinct IDs for each event, session and trace. The receiver still performs event deduplication for native publishers and repeated input.

Payloads must contain JSON data: finite numbers, strings, booleans, `null`, arrays and plain objects. Functions, DOM nodes, accessors, class instances, sparse arrays and cyclic references are rejected. Event JSON depth is limited to 64 by default; the bridge wrapper does not consume this event allowance.

## Configure batching and redaction

```ts
import { createTraceSdk } from '@trace-script/sdk'

const sdk = createTraceSdk({
  redact: event => ({ ...event, payload: '[redacted]' }),
  onError: issue => console.warn(issue.code),
})

sdk.configure({ batchSize: 10, flushIntervalMs: 25 })
```

The channel is fixed by the public protocol as `trace-script`. Configuration supports:

| Option | Default | Supported range or behavior |
| --- | --- | --- |
| `enabled` | `true` | Disabling drops pending events and resolves pending handshakes with `false` |
| `batchSize` | `20` | Integer from 1 to 100 |
| `flushIntervalMs` | `50` | Integer from 1 to 60,000 milliseconds |
| `maxEventBytes` | `1,048,576` | Positive integer up to the default protocol event limit |
| `maxBatchBytes` | `2,097,152` | Positive integer up to the default protocol batch limit; includes the bridge envelope |
| `handshakeTimeoutMs` | `200` | Integer from 1 to 60,000 milliseconds |
| `redact` | No hook | Returns a valid event while preserving `eventId`, `sessionId`, `traceId`, `parentId`, `sequence` and `type` |
| `onError` | No callback | Receives validation, configuration and publication issues |
| `debug` | `false` | Also writes issues to the browser console |

Enabled configuration changes flush the pending queue using its previous settings before applying the new configuration. Invalid options preserve the existing configuration. Redaction runs after initial event validation and before queueing. The configured event byte limit therefore applies both before and after redaction; the hook cannot rescue an already oversized input.

Queued events are isolated from both the caller's input and the event returned by `emit`. Batch limits apply to serialized UTF-8 bytes, including the channel envelope. A count threshold or a timer from the first queued event triggers publication; later events do not extend that timer.

## Collector availability and delivery

```ts
import { createTraceSdk } from '@trace-script/sdk'

const sdk = createTraceSdk()
const available = await sdk.isCollectorAvailable()
console.log('Collector available:', available)
sdk.dispose()
```

Availability checks are optional. A check sends a handshake request and waits for a matching same-window, same-origin response. Absence of a collector returns `false` within the configured timeout. Publishing does not require a successful handshake.

Delivery is best effort. `flush()` publishes pending events as a `trace-batch`; it does not send a protocol `flush` request or wait for an acknowledgement. Successful `postMessage` means that the browser accepted publication, not that the collector persisted the batch. Browser publication errors clear that batch, record dropped events and return an error. There are no automatic retries. Sequences for events already queued remain consumed after a failed send. When sending the preceding batch fails during a capacity split, the incoming event is also rejected and counted as dropped, but its sequence has not been consumed.

The SDK flushes on `pagehide`, `beforeunload` and disposal. These hooks cannot guarantee delivery during page termination. `dispose()` removes listeners and timers and rejects later publishing calls. Repeated span completion and disposal are safe to call.

`getStats()` returns a copy of counters plus the current queue length. `sent` counts events accepted by `postMessage`. `dropped` records rejected data and buffered events discarded by disable, copy failure or send failure. `onError` also reports asynchronous timer send failures.

## Native integration without the SDK

The same protocol can be published directly from the top-level web page:

```ts
if (window === window.top) {
  window.postMessage({
    channel: 'trace-script',
    version: '1.0',
    kind: 'trace-event',
    data: {
      version: '1.0',
      eventId: crypto.randomUUID(),
      sessionId: crypto.randomUUID(),
      traceId: crypto.randomUUID(),
      sequence: 1,
      timestamp: new Date().toISOString(),
      type: 'log',
      name: 'Native publisher',
      payload: { message: 'Hello from the page' },
    },
  }, window.location.origin)
}
```

Use `kind: 'trace-batch'` with an event array in `data` to publish a batch. Keep IDs and increasing sequences consistent across later events in the same session and trace. Native publishers must enforce their own JSON, size, batching and redaction rules. The protocol and event types are described in [the development plan](../../docs/02-trace-protocol-and-sdk.md).

## Pending validation and ablation

Unit tests live in the repository root at `tests/sdk/browser-sdk.test.ts`. Added regressions cover capacity split failures, queue copy failures, parent relationship redaction and the event depth boundary. Their execution, type checking, package builds and playground acceptance are pending; project validation was rejected by automatic approval review.

The serialization snapshot in `emit` remains an ablation candidate. Before removing it, compare the same input and returned-event mutation, redaction, depth and send-failure tests with and without that round trip. Queue/return isolation, validation outcomes, counters and publication contents must remain equivalent. No ablation result is claimed until these checks run.
