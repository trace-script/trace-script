# Protocol metadata

`@trace-script/metadata` owns protocol version `1.0`, JSON-based schemas and inferred public types. It has no browser, Chrome, storage or UI dependency.

Use `@trace-script/core` parsing functions at external boundaries. The schemas alone do not inspect descriptors, reject cycles before recursive parsing, or apply UTF-8 byte limits.

`AgentPayload` retains its legacy `{ type, data }` shape, with `data` constrained to `JsonValue`.

Protocol behavior and fixtures are documented in [the stage 2 plan](../../docs/02-trace-protocol-and-sdk.md). Unit tests are centralized in `tests/metadata/`.
