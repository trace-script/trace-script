export type ExtensionBuildMode = 'development' | 'production'

export interface ExtensionManifest {
  manifest_version: 3
  name: string
  description: string
  version: string
  minimum_chrome_version: string
  devtools_page: string
  background: {
    service_worker: string
    type: 'module'
  }
  content_security_policy: {
    extension_pages: string
  }
}

export function createManifest(version: string, mode: ExtensionBuildMode): ExtensionManifest {
  if (!/^(?:0|[1-9]\d{0,4})(?:\.(?:0|[1-9]\d{0,4})){1,3}$/.test(version)
    || version.split('.').some(part => Number(part) > 65535)
    || version.split('.').every(part => Number(part) === 0)) {
    throw new Error('The extension version must contain 2–4 numeric parts between 0 and 65535, with at least one nonzero part.')
  }

  return {
    manifest_version: 3,
    name: mode === 'development' ? 'Trace Script (Development)' : 'Trace Script',
    description: 'Inspect Agent event streams in Chrome DevTools.',
    version,
    minimum_chrome_version: '120',
    devtools_page: 'devtools.html',
    background: {
      service_worker: 'background.js',
      type: 'module',
    },
    content_security_policy: {
      extension_pages: 'script-src \'self\'; object-src \'self\'',
    },
  }
}
