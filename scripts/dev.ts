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

// Make cleanup idempotent to prevent double execution
let isCleaningUp = false
const safeCleanup = async (path: string) => {
  if (isCleaningUp) {
    log.info('Cleanup already in progress, skipping...')
    return
  }
  isCleaningUp = true
  log.info(`Starting cleanup of ${path}...`)
  try {
    await Deno.remove(path, { recursive: true })
    log.info(`Removed temporary workspace: ${path}`)
  } catch (error) {
    log.info(
      `Cleanup failed or path already removed: ${
        error instanceof Error ? error.message : error
      }`,
    )
  }
  log.info('Cleanup completed')
}

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

  // Exit code 130 is standard for SIGINT (Ctrl+C) and should not be treated as an error
  if (!success && code !== 130) {
    const error = new Error(`Process exited with code ${code}`)
    error.message += `\nCommand: ${Deno.execPath()} ${args.join(' ')}`
    error.message += `\nWorkspace path: ${workspacePath}`
    error.message += '\nEnvironment: development'
    throw error
  }

  // Log successful Ctrl+C exit
  if (code === 130) {
    log.info('Process exited gracefully via Ctrl+C (code 130)')
  }

  return code
}

async function main() {
  const tempPath = await Deno.makeTempDir({ prefix: 'dk-dev-' })
  const workspacePath = resolve(tempPath)

  // Remove competing signal handlers - let the main app handle graceful shutdown

  try {
    const args = buildArgs(Deno.args, workspacePath)
    const exitCode = await runDenoKit(args, workspacePath)

    // If we get code 130 (Ctrl+C), just clean up and exit gracefully
    if (exitCode === 130) {
      log.info('Main process exited with Ctrl+C, cleaning up...')
      await safeCleanup(workspacePath)
      log.info('Development session cancelled via Ctrl+C')
      log.info('Dev script exiting with code 130...')

      // Force exit immediately - don't wait for any background operations
      setTimeout(() => {
        console.log('[FORCE EXIT] Dev script timed out, force killing process')
        Deno.exit(130)
      }, 50)

      Deno.exit(130)
    }

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
        await safeCleanup(workspacePath)
        Deno.exit(1)
      }
    }

    const shouldCleanup = promptCleanup()

    if (shouldCleanup) {
      await safeCleanup(workspacePath)
    } else {
      log.info(`Workspace preserved at: ${workspacePath}`)
    }

    Deno.exit(exitCode)
  } catch (error) {
    log.error(error instanceof Error ? error.message : String(error))
    // 🤖 Print full stack trace for debugging
    if (error instanceof Error && error.stack) {
      console.error('\nFull stack trace:')
      console.error(error.stack)
    }
    await safeCleanup(tempPath)
    Deno.exit(1)
  }
}

if (import.meta.main) {
  await main()
}
