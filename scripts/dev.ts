#!/usr/bin/env -S deno run -A

/**
 * @module dev
 *
 * This script facilitates a development workflow by:
 * 1. Creating a temporary directory to act as a workspace.
 * 2. Executing the main Deno-Kit application (`src/main.ts`) within this temporary workspace.
 *    - It passes along existing command-line arguments and environment variables.
 *    - It injects the `--workspace-path` argument, pointing to the temporary directory.
 * 3. After the application finishes, it prompts the user to decide whether to open
 *    the new workspace in Cursor or VS Code (if available) and then whether to delete the temporary workspace or keep it.
 *
 * This is useful for testing the `init` command or other functionalities in an isolated environment
 * without affecting the main project or other existing workspaces.
 *
 * @example
 * ```bash
 * # Run the dev script, which will then execute 'deno-kit init' in a temporary workspace
 * deno task dev-script init
 *
 * # Run the dev script, passing 'help' to deno-kit
 * deno task dev-script help
 *
 * # Run with a specific command and an additional flag for deno-kit
 * deno task dev-script init --project-name my-temp-project
 * ```
 */

import { resolve } from '@std/path'
import { fromFileUrl } from '@std/path/from-file-url'
import { bold, cyan, dim, green, red, yellow } from '@std/fmt/colors'
import { promptSelect } from '@std/cli/unstable-prompt-select'

/**
 * Check if a command is available in the system PATH
 */
async function isCommandAvailable(command: string): Promise<boolean> {
  try {
    const process = new Deno.Command(command, {
      args: ['--version'],
      stdout: 'null',
      stderr: 'null',
    })
    const { success } = await process.output()
    return success
  } catch {
    return false
  }
}

/**
 * Open workspace in specified editor
 */
async function openInEditor(
  editor: 'cursor' | 'code',
  workspacePath: string,
): Promise<boolean> {
  try {
    const editorCommand = new Deno.Command(editor, {
      args: [workspacePath],
      stdout: 'inherit',
      stderr: 'inherit',
    })
    const output = await editorCommand.output()
    if (!output.success) {
      console.error(
        red(bold('[ERROR]')),
        `${
          editor === 'cursor' ? 'Cursor' : 'VS Code'
        } command exited with non-zero code: ${output.code}.`,
      )
      return false
    }
    console.log(
      green(
        `${
          editor === 'cursor' ? 'Cursor' : 'VS Code'
        } command executed successfully.`,
      ),
    )
    return true
  } catch (error) {
    console.error(
      red(bold('[ERROR]')),
      `Failed to open ${editor === 'cursor' ? 'Cursor' : 'VS Code'}. Error: ${
        error instanceof Error ? error.message : String(error)
      }`,
    )
    return false
  }
}

/**
 * Cleanup function to remove temporary directory
 */
async function cleanup(tempDirPath: string) {
  if (!tempDirPath) return

  try {
    await Deno.remove(tempDirPath, { recursive: true })
    console.log(
      yellow(bold('[CLEANUP]')),
      `Successfully removed temporary directory: ${tempDirPath}`,
    )
  } catch (cleanupError) {
    // Only log error if the directory still exists
    if (
      !(cleanupError instanceof Error &&
        cleanupError.message.includes('No such file or directory'))
    ) {
      console.error(
        red(bold('[CLEANUP_ERROR]')),
        `Failed to remove temporary directory ${tempDirPath}:`,
        cleanupError instanceof Error
          ? cleanupError.message
          : String(cleanupError),
      )
    }
  }
}

async function main() {
  let tempDirPath = ''
  let isCleaningUp = false

  // Setup signal handlers for cleanup
  const signals: Deno.Signal[] = ['SIGINT', 'SIGTERM', 'SIGQUIT']
  const signalCleanup = async () => {
    if (tempDirPath && !isCleaningUp) {
      isCleaningUp = true
      await cleanup(tempDirPath)
      Deno.exit(0)
    } else {
      Deno.exit(0)
    }
  }

  for (const signal of signals) {
    Deno.addSignalListener(signal, signalCleanup)
  }

  try {
    tempDirPath = await Deno.makeTempDir({ prefix: 'dk-dev-' })
    const absoluteTempDirPath = resolve(tempDirPath)

    const originalArgs = Deno.args.slice() // Create a mutable copy
    const mainModulePath = resolve(fromFileUrl(Deno.mainModule))

    // If the script is called directly (e.g., `deno run -A scripts/dev.ts init`),
    // Deno.args[0] will be the script path. We need to remove it.
    // If called via `deno task dev-script init`, Deno.args[0] will be `init`.
    if (
      originalArgs.length > 0 &&
      resolve(Deno.cwd(), originalArgs[0]) === mainModulePath
    ) {
      originalArgs.shift()
    }

    const mainAppArgs = [
      'run',
      '-A',
      '--no-check',
      'src/main.ts',
      'init',
      ...originalArgs,
      `--workspace-path=${absoluteTempDirPath}`,
      '--env=development',
      '--log-level=debug',
    ]

    console.log(
      cyan(bold('[INFO]')),
      `Executing Deno-Kit in temporary workspace: ${
        yellow(absoluteTempDirPath)
      }`,
    )
    console.log(dim(`   └── Deno command: deno ${mainAppArgs.join(' ')}
`))

    const command = new Deno.Command(Deno.execPath(), {
      args: mainAppArgs,
      env: {
        ...Deno.env.toObject(),
      },
      stdin: 'inherit',
      stdout: 'inherit',
      stderr: 'inherit',
    })

    const { code, success } = await command.output() // Use output() to wait for completion

    if (!success) {
      console.error(
        red(bold('[ERROR]')),
        `Deno-Kit process exited with code ${code}.`,
      )
    } else {
      console.log(
        green(bold('[SUCCESS]')),
        'Deno-Kit process completed.',
      )
    }

    console.log(yellow(`
Temporary Deno-Kit workspace available at: ${absoluteTempDirPath}
`))

    // Check for available editors
    const isCursorAvailable = await isCommandAvailable('cursor')
    const isVSCodeAvailable = await isCommandAvailable('code')

    if (isCursorAvailable || isVSCodeAvailable) {
      const editorOptions = []
      if (isCursorAvailable) {
        editorOptions.push({ name: 'Open in Cursor', value: 'cursor' })
      }
      if (isVSCodeAvailable) {
        editorOptions.push({ name: 'Open in VS Code', value: 'code' })
      }
      editorOptions.push({ name: 'Skip', value: 'skip' })

      const selectedEditor = await promptSelect(
        'Would you like to open this temporary workspace in an editor?',
        editorOptions.map((opt) => opt.name),
      )

      if (selectedEditor && selectedEditor !== 'Skip') {
        const editor = editorOptions.find((opt) => opt.name === selectedEditor)
          ?.value as 'cursor' | 'code'
        const openSuccess = await openInEditor(editor, absoluteTempDirPath)

        if (!openSuccess) {
          // Clean up and exit if editor fails to open
          await cleanup(absoluteTempDirPath)
          Deno.exit(1)
        }
      }
    }

    const yesNoOptions = [
      { name: 'Yes', value: 'yes' },
      { name: 'No', value: 'no' },
    ]
    const optionLabels = yesNoOptions.map((opt) => opt.name)
    const defaultValue = 'yes'

    const selectedDestroyWorkspaceLabel = await promptSelect(
      'Would you like to destroy this temporary workspace?',
      optionLabels,
    )
    // Handle default selection and map label to value
    const destroyWorkspaceValue = selectedDestroyWorkspaceLabel
      ? yesNoOptions.find((opt) => opt.name === selectedDestroyWorkspaceLabel)
        ?.value
      : defaultValue

    if (destroyWorkspaceValue === 'yes') {
      console.log(
        cyan(bold('[INFO]')),
        `Removing temporary workspace: ${absoluteTempDirPath}`,
      )
      isCleaningUp = true
      await Deno.remove(absoluteTempDirPath, { recursive: true })
      console.log(green('Temporary workspace removed.'))
    } else {
      console.log(
        cyan(bold('[INFO]')),
        `Temporary workspace kept at: ${absoluteTempDirPath}`,
      )
    }

    // Remove signal handlers before exiting
    for (const signal of signals) {
      Deno.removeSignalListener(signal, signalCleanup)
    }

    Deno.exit(code) // Exit with the code from the Deno-Kit process
  } catch (error) {
    console.error(
      red(bold('[ERROR]')),
      'An error occurred in the dev script:',
      error instanceof Error ? error.message : String(error),
    )

    if (!isCleaningUp) {
      isCleaningUp = true
      await cleanup(tempDirPath)
    }

    // Remove signal handlers before exiting
    for (const signal of signals) {
      Deno.removeSignalListener(signal, signalCleanup)
    }

    Deno.exit(1)
  }
}

if (import.meta.main) {
  main()
}
