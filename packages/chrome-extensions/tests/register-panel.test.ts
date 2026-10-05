import { expect, it, vi } from 'vitest'
import { registerPanel } from '@/extension/devtools/register-panel'

it('registers the local Agent Trace panel once for the supplied DevTools instance', () => {
  const create = vi.fn()
  registerPanel({ create })

  expect(create).toHaveBeenCalledExactlyOnceWith('Agent Trace', '', 'panel/index.html', expect.any(Function))
})
