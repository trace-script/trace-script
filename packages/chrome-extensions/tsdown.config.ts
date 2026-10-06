import { defineConfig } from 'tsdown'
import { assembleExtension } from './scripts/build'

export default defineConfig((options) => {
  const mode = process.env.TRACE_SCRIPT_BUILD_MODE === 'development' ? 'development' : 'production'

  return {
    entry: {
      background: 'apps/extension/background/index.ts',
      content: 'apps/extension/content/index.ts',
      devtools: 'apps/extension/devtools/index.ts',
    },
    outDir: '.build/extension',
    platform: 'browser',
    target: 'chrome120',

    outExtensions: () => ({ js: '.js' }),
    dts: false,
    clean: true,
    watch: options.watch ? ['apps/extension', 'apps/panel/app', 'apps/panel/nuxt.config.ts'] : false,
    hooks: {
      'build:done': () => assembleExtension(mode),
    },
  }
})
