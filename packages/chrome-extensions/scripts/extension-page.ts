export interface ExtensionPageAssets {
  html: string
  entryFile: string
  runtimeConfig: string
}

export function externalizeNuxtPage(html: string): ExtensionPageAssets {
  const importMap = html.match(/<script type="importmap">\{"imports":\{"#entry":"\/_nuxt\/([^"]+)"\}\}<\/script>/)
  const entryFile = importMap?.[1]
  if (!importMap || !entryFile)
    throw new Error('Nuxt output did not contain the expected entry import map.')

  const runtimeScript = html.match(/<script>(window\.__NUXT__=.*?)<\/script>/)
  const runtimeConfig = runtimeScript?.[1]
  if (!runtimeScript || !runtimeConfig)
    throw new Error('Nuxt output did not contain the expected runtime configuration.')

  return {
    html: html
      .replace(importMap[0], '')
      .replace(runtimeScript[0], '<script src="/_nuxt/nuxt-config.js"></script>'),
    entryFile,
    runtimeConfig: `${runtimeConfig}\n`,
  }
}

export function resolveEntryAlias(source: string, entryFile: string): string {
  return source.replace(/from(["'])#entry\1/g, `from$1./${entryFile}$1`)
}
