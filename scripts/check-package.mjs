import { readdir, readFile } from 'node:fs/promises'
import { extname, resolve } from 'node:path'

const root = resolve('packages/chrome-extensions/dist')
const manifest = JSON.parse(await readFile(`${root}/manifest.json`, 'utf8'))
const pkg = JSON.parse(await readFile('packages/chrome-extensions/package.json', 'utf8'))
if (manifest.version !== pkg.version || manifest.manifest_version !== 3)
  throw new Error('Manifest version mismatch')
if (manifest.host_permissions?.length || manifest.web_accessible_resources?.length)
  throw new Error('Unexpected broad access')
if (manifest.content_security_policy.extension_pages !== 'script-src \'self\'; object-src \'self\'')
  throw new Error('Unexpected CSP')
/** @param {string} directory */
async function check(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = `${directory}/${entry.name}`

    if (entry.isDirectory()) {
      await check(path)

      continue
    }

    if (path.endsWith('.map'))
      throw new Error(`Source map shipped: ${path}`)

    if (extname(path) === '.html') {
      const html = await readFile(path, 'utf8')

      for (const script of html.matchAll(/<script([^>]*)>([\s\S]*?)<\/script>/gi)) {
        if (!/type=["']application\/json/.test(script[1] ?? '') && !/src=/.test(script[1] ?? '') && (script[2] ?? '').trim())
          throw new Error(`Inline executable script in ${path}`)

        if (/src=["']https?:/.test(script[1] ?? ''))
          throw new Error(`Remote executable script in ${path}`)
      }
    }
  }
}
await check(root)
for (const asset of [manifest.devtools_page, manifest.background.service_worker, ...Object.values(manifest.icons), 'content.js', 'panel/index.html']) await readFile(`${root}/${asset}`)
console.log('Production manifest, local entry assets, CSP and source-map checks passed')
