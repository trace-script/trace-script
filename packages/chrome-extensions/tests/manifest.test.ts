import { describe, expect, it } from 'vitest'
import { createManifest } from '../scripts/create-manifest'

describe('extension manifest', () => {
  it('describes the production extension entry points', () => {
    expect(createManifest('production')).toMatchObject({
      manifest_version: 3,
      name: 'Trace Script',
      version: '0.1.0',
      devtools_page: 'devtools.html',
      permissions: ['storage'],
      background: {
        service_worker: 'background.js',
        type: 'module',
      },
      content_scripts: [{
        matches: ['<all_urls>'],
        js: ['content.js'],
        run_at: 'document_start',
        all_frames: true,
      }],
    })
  })

  it('labels development builds without changing their wiring', () => {
    const manifest = createManifest('development')

    expect(manifest.name).toBe('Trace Script (Development)')
    expect(manifest.devtools_page).toBe('devtools.html')
    expect(manifest.background.service_worker).toBe('background.js')
  })
})
