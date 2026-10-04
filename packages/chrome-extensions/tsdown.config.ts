import { defineConfig } from 'tsdown'
import { assembleExtension } from './scripts/build.ts'

export default defineConfig((options) => {
  const mode = process.env.TRACE_SCRIPT_BUILD_MODE === 'development' ? 'development' : 'production'

  return {
    entry: {
      background: 'extension/background/index.ts',
      content: 'extension/content/index.ts',
      devtools: 'extension/devtools/index.ts',
    },
    outDir: '.build/extension',
    platform: 'browser',
    target: 'chrome120',
    format: 'esm',
    outExtensions: () => ({ js: '.js' }),
    dts: false,
    clean: true,
    watch: options.watch ? ['extension', 'panel/app', 'panel/nuxt.config.ts'] : false,
    hooks: {
      'build:done': () => assembleExtension(mode),
    },
  }
})
