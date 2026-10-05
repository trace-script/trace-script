import tailwindcss from '@tailwindcss/vite'
import { defineNuxtConfig } from 'nuxt/config'
import { version } from '../package.json'

export default defineNuxtConfig({
  compatibilityDate: '2026-10-04',
  ssr: false,
  pages: false,
  devtools: { enabled: false },
  buildId: `trace-script-${version}`,
  modules: ['shadcn-nuxt'],
  css: ['~/assets/css/tailwind.css'],
  app: {
    buildAssetsDir: '_nuxt/',
    head: {
      title: 'Agent Trace',
      htmlAttrs: { lang: 'en', class: 'dark' },
    },
  },
  experimental: {
    appManifest: false,
    entryImportMap: false,
  },
  shadcn: {
    prefix: 'Ui',
    componentDir: '~/components/ui',
  },
  vite: {
    plugins: [tailwindcss()],
    build: { target: 'chrome120' },
  },
})
