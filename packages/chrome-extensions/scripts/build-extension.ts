import { execFileSync } from 'node:child_process'
import { readdir, readFile, rename, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { build } from 'vite'
import { createManifest } from './create-manifest'
import { externalizeNuxtPage, resolveEntryAlias } from './extension-page'

const packageDirectory = fileURLToPath(new URL('..', import.meta.url))
const sourceDirectory = join(packageDirectory, 'src')
const development = process.argv.includes('--development')
const mode = development ? 'development' : 'production'
const outputDirectoryName = development ? 'dist-dev' : 'dist'
const outputDirectory = join(packageDirectory, outputDirectoryName)

await rm(outputDirectory, { recursive: true, force: true })
execFileSync('nuxt', ['generate'], {
  cwd: packageDirectory,
  env: {
    ...process.env,
    EXTENSION_OUTPUT_DIRECTORY: outputDirectoryName,
  },
  stdio: 'inherit',
})

const generatedPanelPage = join(outputDirectory, 'index.html')
const panelPage = join(outputDirectory, 'panel.html')
await rename(generatedPanelPage, panelPage)
await Promise.all([
  rm(join(outputDirectory, '200.html')),
  rm(join(outputDirectory, '404.html')),
])

const panelAssets = externalizeNuxtPage(await readFile(panelPage, 'utf8'))
await writeFile(panelPage, panelAssets.html)
await writeFile(join(outputDirectory, '_nuxt/nuxt-config.js'), panelAssets.runtimeConfig)

const assetDirectory = join(outputDirectory, '_nuxt')
const assetFiles = await readdir(assetDirectory)
await Promise.all(assetFiles
  .filter(file => file.endsWith('.js'))
  .map(async (file) => {
    const path = join(assetDirectory, file)
    const source = await readFile(path, 'utf8')
    await writeFile(path, resolveEntryAlias(source, panelAssets.entryFile))
  }))

await build({
  configFile: false,
  mode,
  resolve: {
    alias: {
      '@': sourceDirectory,
    },
  },
  build: {
    outDir: outputDirectory,
    emptyOutDir: false,
    rollupOptions: {
      input: {
        background: join(sourceDirectory, 'entry/background.ts'),
        content: join(sourceDirectory, 'entry/content.ts'),
        devtools: join(sourceDirectory, 'entry/devtools.ts'),
      },
      output: {
        entryFileNames: '[name].js',
        chunkFileNames: 'assets/[name]-[hash].js',
        assetFileNames: 'assets/[name]-[hash][extname]',
      },
    },
  },
})

await writeFile(
  join(outputDirectory, 'manifest.json'),
  `${JSON.stringify(createManifest(mode), null, 2)}\n`,
)
