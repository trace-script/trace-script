import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

function createPort() {
  return {
    postMessage: vi.fn<(message: object) => void>(),
    disconnect: vi.fn(),
    onDisconnect: { addListener: vi.fn<(listener: () => void) => void>() },
  }
}

const ports: ReturnType<typeof createPort>[] = []
const envelope = { channel: 'trace-script', kind: 'trace-event', data: { type: 'trace.start' } }

function deliver(data: object, origin = window.location.origin, source: object = window): void {
  window.dispatchEvent(Object.assign(new Event('message'), { data, origin, source }))
}

beforeEach(async () => {
  vi.resetModules()
  ports.length = 0
  const page = Object.assign(new EventTarget(), { location: { origin: 'https://agent.example' } })
  vi.stubGlobal('window', page)
  vi.stubGlobal('chrome', {
    runtime: {
      connect: vi.fn(() => {
        const port = createPort()
        ports.push(port)
        return port
      }),
    },
  })
  await import('../src/entry/content')
})

afterEach(() => {
  window.dispatchEvent(new Event('pagehide'))
  vi.unstubAllGlobals()
})

describe('content script forwarding', () => {
  it('forwards only same-page bridge messages for worker validation', () => {
    deliver(envelope)
    expect(ports[0]?.postMessage.mock.calls).toEqual([[{ type: 'INGEST_EVENT', event: envelope.data }]])
  })

  it.each([
    { name: 'another origin', data: envelope, origin: 'https://other.example', source: 'page' },
    { name: 'another frame', data: envelope, origin: 'https://agent.example', source: 'frame' },
    { name: 'another channel', data: { ...envelope, channel: 'other' }, origin: 'https://agent.example', source: 'page' },
    { name: 'another bridge kind', data: { ...envelope, kind: 'trace-batch' }, origin: 'https://agent.example', source: 'page' },
    { name: 'missing event', data: { channel: 'trace-script', kind: 'trace-event' }, origin: 'https://agent.example', source: 'page' },
  ])('does not forward messages from $name', ({ data, origin, source }) => {
    deliver(data, origin, source === 'page' ? window : {})
    expect(ports[0]?.postMessage).not.toHaveBeenCalled()
  })

  it('resumes forwarding exactly once after each back/forward-cache restore', () => {
    for (let cycle = 0; cycle < 2; cycle++) {
      const active = ports[cycle]
      expect(active).toBeDefined()
      deliver(envelope)
      expect(active?.postMessage).toHaveBeenCalledOnce()
      window.dispatchEvent(new Event('pagehide'))
      expect(active?.disconnect).toHaveBeenCalledOnce()
      deliver(envelope)
      expect(active?.postMessage).toHaveBeenCalledOnce()
      window.dispatchEvent(Object.assign(new Event('pageshow'), { persisted: true }))
      expect(ports).toHaveLength(cycle + 2)
    }
    deliver(envelope)
    expect(ports[2]?.postMessage).toHaveBeenCalledOnce()
  })

  it('does not reconnect on a normal pageshow', () => {
    window.dispatchEvent(Object.assign(new Event('pageshow'), { persisted: false }))
    expect(ports).toHaveLength(1)
    deliver(envelope)
    expect(ports[0]?.postMessage).toHaveBeenCalledOnce()
  })
})
