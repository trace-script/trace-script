import { describe, expect, it } from 'vitest'
import { externalizeNuxtPage, resolveEntryAlias } from '../scripts/extension-page'

describe('extension panel page', () => {
  it('externalizes executable Nuxt scripts for the extension CSP', () => {
    const source = [
      '<script type="importmap">{"imports":{"#entry":"/_nuxt/entry.js"}}</script>',
      '<script type="module" src="/_nuxt/entry.js"></script>',
      '<script>window.__NUXT__={};window.__NUXT__.config={}</script>',
      '<script type="application/json">[]</script>',
    ].join('')

    expect(externalizeNuxtPage(source)).toEqual({
      html: [
        '<script type="module" src="/_nuxt/entry.js"></script>',
        '<script src="/_nuxt/nuxt-config.js"></script>',
        '<script type="application/json">[]</script>',
      ].join(''),
      entryFile: 'entry.js',
      runtimeConfig: 'window.__NUXT__={};window.__NUXT__.config={}\n',
    })
  })

  it('resolves the Nuxt entry alias inside generated chunks', () => {
    expect(resolveEntryAlias('import{x}from"#entry"', 'entry.js')).toBe('import{x}from"./entry.js"')
  })
})
