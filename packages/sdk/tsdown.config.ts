import { defineConfig } from 'tsdown'

export default defineConfig({
  deps: {
    alwaysBundle: ['@trace-script/core', '@trace-script/metadata', 'zod'],
    dts: {
      neverBundle: ['zod'],
    },
  },
})
