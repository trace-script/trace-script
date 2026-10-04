// @vitest-environment happy-dom
import { mount } from '@vue/test-utils'
import { expect, it } from 'vitest'
import PanelShell from '../../packages/chrome-extensions/panel/app/components/foundation/PanelShell.vue'

it('renders the panel identity, build version, and collection availability honestly', () => {
  const wrapper = mount(PanelShell)

  expect(wrapper.get('h1').text()).toBe('Agent Trace')
  expect(wrapper.text()).toContain('v0.1.0')
  expect(wrapper.get('[aria-labelledby="empty-title"]').text()).toContain('Trace collection will be available')
})
