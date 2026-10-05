import { describe, expect, it } from 'vitest'
import { preparePanelHtml } from '@/scripts/prepare-panel-html'

describe('preparePanelHtml', () => {
  it('extracts executable bootstrap scripts into local files in document order', () => {
    const result = preparePanelHtml('<script>window.first = 1</script><script type="module">window.second = 2</script>')

    expect(result.html).toBe('<script src="./bootstrap-0.js"></script><script type="module" src="./bootstrap-1.js"></script>')
    expect(result.scripts).toEqual([
      { filename: 'bootstrap-0.js', source: 'window.first = 1' },
      { filename: 'bootstrap-1.js', source: 'window.second = 2' },
    ])
  })

  it('preserves JSON payload scripts and already-local module resources', () => {
    const html = '<script type="application/json" id="__NUXT_DATA__">[1]</script><script type="module" src="./_nuxt/entry.js"></script>'

    expect(preparePanelHtml(html)).toEqual({ html, scripts: [] })
  })

  it('removes empty executable scripts without producing empty bootstrap files', () => {
    expect(preparePanelHtml('<p>Ready</p><script>  </script>')).toEqual({ html: '<p>Ready</p>', scripts: [] })
  })

  it('refuses import maps because Chrome cannot load an external import map', () => {
    expect(() => preparePanelHtml('<script type="importmap">{"imports":{}}</script>')).toThrow('Disable Nuxt entryImportMap')
  })

  it('leaves content without scripts unchanged', () => {
    expect(preparePanelHtml('<main>Ready</main>')).toEqual({ html: '<main>Ready</main>', scripts: [] })
  })

  it('uses separate filenames for different generated HTML pages', () => {
    const result = preparePanelHtml('<script>window.ready = true</script>', 'bootstrap-404')
    expect(result.scripts).toEqual([{ filename: 'bootstrap-404-0.js', source: 'window.ready = true' }])
    expect(result.html).toContain('src="./bootstrap-404-0.js"')
  })
})
