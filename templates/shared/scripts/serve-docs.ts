import { serveDir } from '@std/http'
import { getAvailablePort } from '@std/net'

const port = getAvailablePort()
const url = `http://localhost:${port}/all_symbols.html`

const cmdMap: Record<string, string> = {
  darwin: 'open',
  linux: 'xdg-open',
  windows: 'cmd /c start',
}

queueMicrotask(async () => {
  const cmd = cmdMap[Deno.build.os]
  if (!cmd) {
    throw new Error(
      `Failed to open docs at '${url}. Unsupported platform: ${Deno.build.os}`,
    )
  }
  const [bin, ...args] = [...cmd.split(' '), url]
  const { success, code } = await new Deno.Command(bin, { args }).output()
  if (!success) {
    throw new Error(`Failed to open docs at '${url}' (exit ${code})`)
  }
})
Deno.addSignalListener('SIGINT', () => {
  console.log('Shutting docs server down...')
  Deno.exit()
})

Deno.serve(
  { port },
  (req) =>
    serveDir(req, {
      fsRoot: './docs/{PROJECT_NAME}',
      showIndex: true,
      quiet: true,
    }),
)
console.clear()
console.log(`Docs are available at ${url}. Press Ctrl+C to stop serving them.`)
