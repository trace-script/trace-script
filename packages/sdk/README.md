# Trace Script page SDK

`@trace-script/sdk` records the minimal Trace event stream through `window.postMessage`. It does not call the model or execute tools.
Its build includes the protocol parser and schema, so installed applications do not need the private workspace packages.

```js
import { createTraceSdk } from '@trace-script/sdk'

const sdk = createTraceSdk()
const trace = sdk.startTrace()

try {
  const request = { model: 'gpt-4.1', input: [{ role: 'user', content: 'Hello' }] }
  trace.recordRequest(request)
  const response = await openai.responses.create(request)
  trace.recordResponse(response)
  trace.end()
}
catch (error) {
  trace.fail(error)
  throw error
}
```

Each record method returns `{ success: true }` or `{ success: false, reason }`. Recording failures do not throw into application control flow. The request and response must be JSON objects; the SDK copies them when recording and keeps their original field names. The page bridge uses single events. Delivery is best effort.

See [the protocol and lifecycle design](../../docs/02-trace-protocol-and-sdk.md) for the tool-call example.
