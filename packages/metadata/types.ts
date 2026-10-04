import type { JsonValue } from './protocol'

/** Legacy payload shape retained with the same JSON boundary as the event protocol. */
export interface AgentPayload {
  type: string
  data: JsonValue
}
