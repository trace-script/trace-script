import { readFile } from 'node:fs/promises'
import { createServer } from 'node:http'

const routes = new Map([
  ['/', ['index.html', 'text/html; charset=utf-8']],
  ['/index.html', ['index.html', 'text/html; charset=utf-8']],
  ['/chatgpt-demo.js', ['chatgpt-demo.js', 'text/javascript; charset=utf-8']],
])
const server = createServer(async (request, response) => {
  const pathname = new URL(request.url, 'http://127.0.0.1').pathname
  if (pathname === '/favicon.ico') {
    response.writeHead(204).end()
    return
  }
  const route = routes.get(pathname)
  if (!route) {
    response.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }).end('Not found')
    return
  }
  try {
    const body = await readFile(new URL(`./page/${route[0]}`, import.meta.url))
    response.writeHead(200, { 'Content-Type': route[1], 'Cache-Control': 'no-store' }).end(body)
  }
  catch (error) {
    console.error(error)
    response.writeHead(500).end('Failed to read demo file')
  }
})
server.on('error', (error) => {
  console.error(`Demo server: ${error.message}`)
  process.exitCode = 1
})
server.listen(4173, '127.0.0.1', () => {
  console.info('ChatGPT Trace Demo: http://127.0.0.1:4173')
})
