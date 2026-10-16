import tailwindcss from '@tailwindcss/vite'

export default defineNuxtConfig({
  srcDir: 'src/',
  ssr: false,
  modules: ['@nuxt/eslint'],
  devtools: {
    enabled: false,
  },

  eslint: {
    config: {
      autoInit: false,
      standalone: false,
    },
  },

  css: ['~/assets/panel.css'],

  app: {
    buildAssetsDir: '/assets/',
    head: {
      title: 'Agent Trace · Live Preview',
      htmlAttrs: {
        lang: 'en',
      },
      meta: [
        { charset: 'utf-8' },
        { name: 'viewport', content: 'width=device-width, initial-scale=1' },
        { name: 'description', content: 'Agent Trace live UI preview' },
      ],
    },
  },
  nitro: {
    preset: 'static',
    output: {
      publicDir: 'dist',
    },
  },
  experimental: {
    appManifest: false,
  },
  vite: {
    plugins: [tailwindcss()],
    optimizeDeps: {
      exclude: ['@trace-script/vue-components'],
    },
  },
})
