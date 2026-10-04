import { describe, expect, it } from 'vitest'
import { createManifest } from '../../packages/chrome-extensions/extension/manifest/create-manifest'

describe('createManifest', () => {
  it('creates a local Manifest V3 extension without site permissions', () => {
    const manifest = createManifest('0.1.0', 'production')

    expect(manifest.manifest_version).toBe(3)
    expect(manifest.devtools_page).toBe('devtools.html')
    expect(manifest.background).toEqual({ service_worker: 'background.js', type: 'module' })
    expect(manifest.content_security_policy.extension_pages).toBe('script-src \'self\'; object-src \'self\'')
    expect(manifest).not.toHaveProperty('permissions')
    expect(manifest).not.toHaveProperty('host_permissions')
    expect(manifest).not.toHaveProperty('content_scripts')
  })

  it('labels development builds without weakening the production CSP', () => {
    const development = createManifest('1.2.3', 'development')
    const production = createManifest('1.2.3', 'production')

    expect(development.name).toBe('Trace Script (Development)')
    expect(production.name).toBe('Trace Script')
    expect(development.content_security_policy).toEqual(production.content_security_policy)
  })

  it.each(['1.0', '0.0.1', '1.2.3.65535'])('accepts valid Chrome version %s', (version) => {
    expect(createManifest(version, 'production').version).toBe(version)
  })

  it.each(['', '0.0.0', '1', '01.2', '1.2.3.4.5', '1.2.65536', '1.2.3-beta', '-1.2'])('rejects invalid Chrome version %s', (version) => {
    expect(() => createManifest(version, 'production')).toThrow('extension version')
  })
})
