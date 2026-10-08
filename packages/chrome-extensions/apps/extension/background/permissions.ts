export function sitePattern(url: string): string {
  const parsed = new URL(url)

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:')
    throw new Error('Only HTTP and HTTPS pages can be recorded')

  return `${parsed.protocol}//${parsed.hostname}/*`
}
let syncing: Promise<string[]> = Promise.resolve([])
export function syncPermissions(): Promise<string[]> {
  syncing = syncing.catch(() => []).then(registerPermissions)
  return syncing
}
async function registerPermissions(): Promise<string[]> {
  const { origins = [] } = await chrome.permissions.getAll()

  const scripts = await chrome.scripting.getRegisteredContentScripts()

  const owned = scripts.filter(script => script.id.startsWith('trace-site-'))

  if (owned.length)
    await chrome.scripting.unregisterContentScripts({ ids: owned.map(script => script.id) })

  const matches = origins.filter(origin => /^https?:\/\//.test(origin))

  if (matches.length)
    await chrome.scripting.registerContentScripts([{ id: 'trace-site-collector', matches, js: ['content.js'], allFrames: false, runAt: 'document_start', persistAcrossSessions: true }])

  return matches
}
