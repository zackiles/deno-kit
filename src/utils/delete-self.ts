import { logger } from './logger.ts'

async function deleteSelf(): Promise<void> {
  const selfPath = new URL(Deno.mainModule).pathname
  const isScript = selfPath.endsWith('.ts') ||
    selfPath.endsWith('.js') ||
    selfPath.endsWith('.mjs') ||
    selfPath.endsWith('.cjs')
  const isWindows = Deno.build.os === 'windows'

  if (isScript) {
    throw new Error(
      'Self-deletion of source scripts is not allowed on any platform.',
    )
  }

  if (isWindows) {
    const batScript = `
      @echo off
      ping -n 2 127.0.0.1 >nul
      del "${selfPath.replace(/\//g, '\\')}"
    `
    const batPath = await Deno.makeTempFile({ suffix: '.bat' })
    await Deno.writeTextFile(batPath, batScript)

    const proc = new Deno.Command('cmd', {
      args: ['/c', batPath],
      stderr: 'null',
      stdout: 'null',
      stdin: 'null',
      windowsRawArguments: true,
    }).spawn()
    proc.unref()
    logger.log(`${selfPath} has been uninstalled successfully!`)
    Deno.exit(0)
  } else {
    await Deno.remove(selfPath)
  }
}

export { deleteSelf }
