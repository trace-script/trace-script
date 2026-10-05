import { execFileSync } from 'node:child_process'
import { mkdir, rm } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { version } from '../package.json'

const artifactDirectory = new URL('../artifacts/', import.meta.url)
await mkdir(artifactDirectory, { recursive: true })
const archivePath = fileURLToPath(new URL(`trace-script-chrome-${version}.zip`, artifactDirectory))
await rm(archivePath, { force: true })

execFileSync('zip', ['-q', '-r', archivePath, '.'], {
  cwd: fileURLToPath(new URL('../dist/', import.meta.url)),
  stdio: 'inherit',
})

console.log(`Chrome archive written to ${archivePath}`)
