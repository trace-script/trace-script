interface LocalScript {
  filename: string
  source: string
}

export function preparePanelHtml(source: string, prefix = 'bootstrap') {
  const scripts: LocalScript[] = []
  let html = source

  for (const match of source.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)) {
    const [element = '', attributes = '', body = ''] = match
    if (/\bsrc\s*=/i.test(attributes)
      || /\btype\s*=\s*["']application\/(?:ld\+)?json["']/i.test(attributes)) {
      continue
    }

    if (/\btype\s*=\s*["']importmap["']/i.test(attributes)) {
      throw new Error('Inline import maps are incompatible with extension CSP. Disable Nuxt entryImportMap.')
    }

    if (body.trim().length === 0) {
      html = html.replace(element, '')
      continue
    }

    const filename = `${prefix}-${scripts.length}.js`
    scripts.push({ filename, source: body })
    html = html.replace(element, `<script${attributes} src="./${filename}"></script>`)
  }

  return { html, scripts }
}
