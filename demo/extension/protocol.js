// Shared by the content script, service worker and panel; no bundling needed.
globalThis.AgentTraceProtocol = Object.freeze({
  channel: 'agent-trace',
  version: '1.0',
  maxRecords: 100,
  isEvent(event) {
    if (!event || typeof event !== 'object' || Array.isArray(event))
      return false

    const stringFields = ['eventId', 'sessionId', 'traceId', 'type', 'name']
    if (!stringFields.every(field => typeof event[field] === 'string' && event[field].length > 0 && event[field].length <= 200))
      return false

    if (!Number.isSafeInteger(event.sequence) || event.sequence < 1 || !Number.isFinite(event.timestamp))
      return false

    return ['pending', 'running', 'success', 'error'].includes(event.status)
  },
  isSession(session) {
    if (!session || typeof session !== 'object' || Array.isArray(session))
      return false

    if (!['sessionId', 'traceId', 'name'].every(field => typeof session[field] === 'string' && session[field].length > 0 && session[field].length <= 200))
      return false

    if (!['pending', 'running', 'success', 'error'].includes(session.status))
      return false

    if (!Number.isFinite(session.startedAt) || !Number.isFinite(session.endedAt) || session.endedAt < session.startedAt)
      return false

    const events = session.events
    if (!Array.isArray(events) || events.length === 0 || events.length > 100)
      return false

    return events.every((event, index) => this.isEvent(event)
      && event.sessionId === session.sessionId
      && event.traceId === session.traceId
      && (index === 0 || event.sequence > events[index - 1].sequence))
    && new Set(events.map(event => event.eventId)).size === events.length
  },
  getKind(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value))
      return null
    const hasEvent = Object.hasOwn(value, 'event')
    const hasSession = Object.hasOwn(value, 'session')
    if (hasEvent === hasSession)
      return null
    return hasEvent ? 'event' : 'session'
  },
  isEnvelope(value) {
    const kind = this.getKind(value)
    if (!kind || value.channel !== this.channel || value.version !== this.version)
      return false

    // Existing { channel, version, event } messages remain supported.
    if (value.kind !== undefined && value.kind !== kind)
      return false

    if (kind === 'event' ? !this.isEvent(value.event) : !this.isSession(value.session))
      return false

    try {
      return new TextEncoder().encode(JSON.stringify(value)).byteLength <= 8192
    }
    catch {
      return false
    }
  },
})
