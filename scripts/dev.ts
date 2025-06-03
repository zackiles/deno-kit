#!/usr/bin/env -S deno run -A

/**
 * @module dev
 *
 * Development script that creates a temporary workspace, compiles templates to, and runs deno-kit init command.
 * Offers to open the result in an editor and cleanup afterwards so they can check the compiled project
 *
 * @example
 * ```bash
 * deno task dev-script init
 * deno task dev-script help
 * deno task dev-script init --project-name my-temp-project
 * ```
 */

import { resolve } from '@std/path'
import { fromFileUrl } from '@std/path/from-file-url'
import { bold, cyan, green, red, yellow } from '@std/fmt/colors'
import { promptSelect } from '@std/cli/unstable-prompt-select'

const EDITORS = [
  { name: 'Cursor', cmd: 'cursor' },
  { name: 'VS Code', cmd: 'code' },
  { name: 'Windsurf', cmd: 'windsurf' },
]

const log = {
  info: (msg: string) => console.log(cyan(bold('[INFO]')), msg),
  success: (msg: string) => console.log(green(bold('[SUCCESS]')), msg),
  error: (msg: string) => console.error(red(bold('[ERROR]')), msg),
}

const run = (cmd: string, args: string[], options = {}) =>
  new Deno.Command(cmd, { args, stdout: 'null', stderr: 'null', ...options })
    .output()

const hasCommand = async (cmd: string) => {
  try {
    const result = await new Deno.Command(cmd, {
      args: ['--version'],
      stdout: 'null',
      stderr: 'null',
    }).output()
    return result.success
  } catch {
    // Command not found or permission denied
    return false
  }
}

const hasFiles = async (path: string) => {
  try {
    for await (const _ of Deno.readDir(path)) return true
    return false
  } catch {
    return false
  }
}

const openEditor = async (cmd: string, path: string) => {
  const { success } = await run(cmd, [path], {
    stdout: 'inherit',
    stderr: 'inherit',
  })
  if (!success) {
    log.error(`Failed to open ${cmd}`)
    return false
  }
  return true
}

const cleanup = (path: string) =>
  Deno.remove(path, { recursive: true })
    .then(() => log.info(`Removed temporary workspace: ${path}`))
    .catch(() => {})

const getAvailableEditors = async () => {
  const available = await Promise.all(
    EDITORS.map(async ({ name, cmd }) => {
      const isAvailable = await hasCommand(cmd)
      log.info(
        `Editor ${name} (${cmd}): ${isAvailable ? 'detected' : 'not found'}`,
      )
      return {
        name,
        cmd,
        available: isAvailable,
      }
    }),
  )
  return available.filter(({ available }) => available)
}

const promptEditor = (editors: Array<{ name: string; cmd: string }>) => {
  if (!editors.length) {
    log.info('No editors detected. Skipping editor opening.')
    return null
  }

  const options = [...editors.map(({ name }) => name), 'Skip']
  const choice = promptSelect('Open workspace in editor?', options, {
    clear: true,
  })

  if (choice === 'Skip') return null

  const selectedEditor = editors.find(({ name }) => name === choice)
  return selectedEditor ? selectedEditor.cmd : null
}

const promptCleanup = () => {
  const choice = promptSelect('Delete temporary workspace?', [
    'Yes',
    'No',
  ], { clear: true })
  return choice === 'Yes'
}

const buildArgs = (originalArgs: string[], workspacePath: string) => {
  const mainPath = resolve(fromFileUrl(Deno.mainModule))
  const args = originalArgs.slice()

  if (args.length > 0 && resolve(Deno.cwd(), args[0]) === mainPath) {
    args.shift()
  }

  return [
    'run',
    '-A',
    '--no-check',
    'src/main.ts',
    'init',
    ...args,
    `--workspace-path=${workspacePath}`,
  ]
}

const runDenoKit = async (args: string[], workspacePath: string) => {
  const { code, success } = await new Deno.Command(Deno.execPath(), {
    args,
    env: {
      ...Deno.env.toObject(),
      DENO_KIT_ENV: 'development',
      DENO_KIT_LOG_LEVEL: 'info',
      DENO_KIT_WORKSPACE_PATH: workspacePath,
    },
    stdin: 'inherit',
    stdout: 'inherit',
    stderr: 'inherit',
  }).output()

  if (!success) throw new Error(`Process exited with code ${code}`)
  return code
}

async function main() {
  const tempPath = await Deno.makeTempDir({ prefix: 'dk-dev-' })
  const workspacePath = resolve(tempPath)

  const signalCleanup = () => cleanup(tempPath).then(() => Deno.exit(0))
  const signals: Deno.Signal[] = ['SIGINT', 'SIGTERM', 'SIGQUIT']
  for (const signal of signals) {
    Deno.addSignalListener(signal, signalCleanup)
  }

  try {
    const args = buildArgs(Deno.args, workspacePath)
    const exitCode = await runDenoKit(args, workspacePath)

    if (!await hasFiles(workspacePath)) {
      throw new Error('No files created in workspace')
    }

    log.success('Deno-kit completed successfully')
    log.info(yellow(`\nWorkspace: ${workspacePath}\n`))

    const editors = await getAvailableEditors()
    const selectedEditorCmd = promptEditor(editors)

    if (selectedEditorCmd) {
      const opened = await openEditor(selectedEditorCmd, workspacePath)
      if (!opened) {
        await cleanup(workspacePath)
        Deno.exit(1)
      }
    }

    const shouldCleanup = promptCleanup()

    if (shouldCleanup) {
      await cleanup(workspacePath)
    } else {
      log.info(`Workspace preserved at: ${workspacePath}`)
    }

    for (const signal of signals) {
      Deno.removeSignalListener(signal, signalCleanup)
    }
    Deno.exit(exitCode)
  } catch (error) {
    log.error(error instanceof Error ? error.message : String(error))
    await cleanup(tempPath)
    for (const signal of signals) {
      Deno.removeSignalListener(signal, signalCleanup)
    }
    Deno.exit(1)
  }
}

if (import.meta.main) {
  await main()
}
