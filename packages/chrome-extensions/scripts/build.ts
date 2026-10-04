import type { ExtensionBuildMode } from '../extension/manifest/create-manifest.ts'
import { execFileSync } from 'node:child_process'
import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { createManifest } from '../extension/manifest/create-manifest.ts'
import { preparePanelHtml } from './prepare-panel-html.ts'

export async function assembleExtension(mode: ExtensionBuildMode) {
  const packageDirectory = fileURLToPath(new URL('../', import.meta.url))
  const outputDirectory = new URL(mode === 'development' ? '../dist-dev/' : '../dist/', import.meta.url)
  const packageJson = await readFile(new URL('../package.json', import.meta.url), 'utf8')
  const packageVersionMatch = packageJson.match(/"version"\s*:\s*"([^"]+)"/)
  const version = packageVersionMatch?.[1]

  if (!version) {
    throw new Error('The extension package must declare a version.')
  }

  execFileSync('nuxt', ['generate', 'panel'], {
    cwd: packageDirectory,
    stdio: 'inherit',
    env: { ...process.env, NUXT_APP_BASE_URL: './' },
  })

  await rm(outputDirectory, { recursive: true, force: true })
  await mkdir(outputDirectory, { recursive: true })
  await cp(new URL('../.build/extension/', import.meta.url), outputDirectory, { recursive: true })
  await cp(new URL('../panel/.output/public/', import.meta.url), new URL('panel/', outputDirectory), { recursive: true })
  await cp(new URL('../extension/devtools/devtools.html', import.meta.url), new URL('devtools.html', outputDirectory))

  for (const filename of ['index.html', '200.html', '404.html']) {
    const htmlFile = new URL(`panel/${filename}`, outputDirectory)
    const prepared = preparePanelHtml(await readFile(htmlFile, 'utf8'), `bootstrap-${filename.replace('.html', '')}`)
    await writeFile(htmlFile, prepared.html)
    for (const script of prepared.scripts) {
      await writeFile(new URL(`panel/${script.filename}`, outputDirectory), script.source)
    }
  }

  await writeFile(new URL('manifest.json', outputDirectory), `${JSON.stringify(createManifest(version, mode), null, 2)}\n`)
  console.log(`Extension assembled in ${fileURLToPath(outputDirectory)}`)
}
