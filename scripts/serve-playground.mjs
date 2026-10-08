import { readFile } from 'node:fs/promises'
import { createServer } from 'node:http'
import { extname, resolve } from 'node:path'

const root = resolve('packages/playground/dist')
createServer(async (request, response) => {
  const path = resolve(root, `.${decodeURIComponent(new URL(request.url ?? '/', 'http://localhost').pathname)}`)

  if (!path.startsWith(`${root}/`) && path !== root) {
    response.writeHead(403).end()

    return
  }

  try {
    const file = path === root || path.endsWith('/') ? `${path}/index.html` : path

    const data = await readFile(file)

    response.setHeader('Content-Type', { '.html': 'text/html', '.mjs': 'application/javascript', '.js': 'application/javascript', '.css': 'text/css' }[extname(file)] ?? 'application/octet-stream')

    response.end(data)
  }
  catch {
    response.writeHead(404).end('Not found')
  }
}).listen(4317, '127.0.0.1', () => console.log('Playground ready on http://127.0.0.1:4317'))
