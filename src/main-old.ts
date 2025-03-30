#!/usr/bin/env -S deno run --allow-all
import { join } from '@std/path'
import { parseArgs } from '@std/cli/parse-args'
import { blue, bold, cyan, dim, green, red, yellow } from '@std/fmt/colors'

const KIT_NAME = 'deno kit'

const config = {
  //kitDir: Deno.cwd(), // Path to the kit installation directory
  //kitArgs: Deno.args, // Command-line arguments
  //projectArgs: Deno.args, // Project-specific arguments
  workspaceDir: Deno.env.get('DENO_KIT_WORKSPACE') || Deno.cwd(), // Current workspace directory
  //env: {}, // Environment variables from .env file
  templatesDir: join(Deno.cwd(), 'templates'), // Path to templates
  backupsDir: join(Deno.env.get('DENO_KIT_WORKSPACE') || Deno.cwd(), '.deno-kit', 'backups'), // Path to backup files
}

// Create a logger for the main process with colored output
const logger = {
  info: (msg: string, ...args: unknown[]) =>
    console.log(`${bold(green(`[${KIT_NAME}]`))} ${msg}`, ...args),
  error: (msg: string, ...args: unknown[]) =>
    console.error(`${bold(red(`[${KIT_NAME}] ❌`))} ${msg}`, ...args),
  debug: (msg: string, ...args: unknown[]) =>
    console.debug(`${bold(blue(`[${KIT_NAME}]`))} ${msg}`, ...args),
  warn: (msg: string, ...args: unknown[]) =>
    console.warn(`${bold(yellow(`[${KIT_NAME}] ⚠`))} ${msg}`, ...args),
  // Help menu specific methods
  helpTitle: (title: string) => console.log(`\n${bold(cyan(title))}`),
  helpUsage: (usage: string) => console.log(`${dim(usage)}`),
  helpSection: (title: string) => console.log(`\n${bold(blue(title))}`),
  helpCommand: (command: string, description: string, padding: number) => {
    const paddingSpaces = ' '.repeat(padding - command.length + 2)
    console.log(`  ${bold(green(command))}${paddingSpaces}${dim(description)}`)
  },
  helpNote: (note: string) => console.log(`\n${dim(note)}`),
}

/**
 * Map of commands to their corresponding configuration
 * Commands handled locally (like "help") are not included
 */
const COMMAND_MAP: Record<string, {
  commandPath: string
  commandDescription: string
}> = {
  'setup': {
    commandPath: 'commands/setup.ts',
    commandDescription: 'Setup a new Deno project',
  },
  'reset': {
    commandPath: 'commands/reset.ts',
    commandDescription: 'Restore original project files from backups',
  },
  'publish': {
    commandPath: '', // Currently disabled
    commandDescription: 'Publish your module to JSR',
  },
  'remove': {
    commandPath: '', // Currently disabled
    commandDescription: 'Remove the Deno-Kit files and CLI from the project',
  },
  'update': {
    commandPath: 'commands/update.ts',
    commandDescription: 'Update the Cursor configuration from GitHub',
  },
  'run-server': {
    commandPath: '', // Currently disabled
    commandDescription: 'Start the auto-generated HTTP and WebSocket server for your module',
  },
  'run-cli': {
    commandPath: 'commands/run-cli.ts',
    commandDescription: 'Run the auto-generated CLI interface for your module',
  },
} as const

/**
 * Set up signal handlers for graceful shutdown
 * @returns A cleanup function to remove the signal handlers
 */
function setupSignalHandlers(childProcess?: Deno.ChildProcess): () => void {
  const signals: Deno.Signal[] = ['SIGINT', 'SIGTERM', 'SIGHUP']
  const handlers: { signal: Deno.Signal; handler: () => void }[] = []

  for (const signal of signals) {
    const handler = () => {
      logger.info(`Received ${signal}, initiating graceful shutdown...`)

      // If we have a child process, let it handle the signal
      // The signal will be automatically propagated to the child
      if (childProcess) {
        logger.debug('Waiting for child process to handle signal...')
      } else {
        // If no child process, exit gracefully
        logger.info('No child process, exiting gracefully...')
        Deno.exit(0)
      }
    }

    try {
      Deno.addSignalListener(signal, handler)
      handlers.push({ signal, handler })
    } catch (error) {
      logger.error(`Failed to set up ${signal} handler:`, error)
    }
  }

  // Return cleanup function
  return () => {
    for (const { signal, handler } of handlers) {
      try {
        Deno.removeSignalListener(signal, handler)
      } catch (_) {
        // Ignore errors when removing signal handlers
      }
    }
  }
}

/**
 * Run a command as a separate process using Deno.command
 * This function executes the specified script with the same permissions as the parent process
 * @param scriptName The name of the script to run (without .ts extension)
 * @returns Promise that resolves when the process completes
 */
async function runCommand(scriptName: string): Promise<void> {
  // Get the current executable and flags
  const denoExecutable = Deno.execPath()

  // Get the full path to the script using config.kitDir
  const scriptPath = join(config.kitDir, scriptName)

  // Parse args to extract workspace flag and command arguments
  const parsedArgs = parseArgs(Deno.args)
  const workspaceDir = typeof parsedArgs.workspace === 'string'
    ? parsedArgs.workspace
    : config.workspaceDir

  // Get positional args (excluding the command itself)
  const baseCommand = scriptName.replace('.ts', '')

  // Map any parsed positional args to strings for command execution
  const commandArgs = parsedArgs._.slice(
    parsedArgs._.findIndex((arg) => arg === baseCommand) + 1,
  ).map((arg) => String(arg))

  // Debug logging
  logger.debug('Running command with:', {
    scriptName,
    scriptPath,
    baseCommand,
    originalArgs: Deno.args,
    parsedArgs,
    commandArgs,
    workspaceDir,
  })

  const command = new Deno.Command(denoExecutable, {
    args: [
      'run',
      '-A',
      scriptPath,
      ...commandArgs,
    ],
    stdout: 'inherit',
    stderr: 'inherit',
    env: {
      ...Deno.env.toObject(),
      FORCE_COLOR: '1',
      ...(workspaceDir ? { DENO_KIT_WORKSPACE: workspaceDir } : {}),
    },
  })

  // Log the full command being executed
  logger.debug('Executing command:', {
    executable: denoExecutable,
    fullArgs: ['run', '--allow-all', scriptPath, ...commandArgs],
  })

  // Spawn the process
  const process = command.spawn()

  // Set up signal handlers that will wait for the child to exit
  const cleanupSignalHandlers = setupSignalHandlers(process)

  try {
    // Wait for the process to complete and get its status
    const status = await process.status

    // If the command failed, exit with the same code
    if (status.code !== 0) {
      logger.error(`Command exited with code ${status.code}`)
      Deno.exit(status.code)
    }
  } finally {
    // Always clean up signal handlers
    cleanupSignalHandlers()
  }
}

/**
 * Display help message showing available commands
 */
function displayHelp(): void {
  logger.helpTitle(
    `${
      KIT_NAME.split(' ').map((word) => word.charAt(0).toUpperCase() + word.slice(1)).join(' ')
    } - Usage:`,
  )
  logger.helpUsage(
    `  ${KIT_NAME} [command] [options]`,
  )

  logger.helpSection('Commands:')

  // Find the longest command name for proper padding
  const maxCommandLength = Math.max(
    ...Object.keys(COMMAND_MAP).map((cmd) => cmd.length),
    4, // length of "help"
  )

  for (const [command, config] of Object.entries(COMMAND_MAP)) {
    logger.helpCommand(command, config.commandDescription, maxCommandLength)
  }

  logger.helpCommand('help', 'Display this help message', maxCommandLength)

  logger.helpNote(
    'If no command is provided, the "help" command will be executed.',
  )
}

/**
 * Main function that dispatches to the appropriate command handler
 */
export async function main(): Promise<void> {
  const cleanupSignalHandlers = setupSignalHandlers()

  try {
    const command = Deno.args[0]?.toLowerCase() || 'help'

    if (command === 'help') {
      displayHelp()
      return
    }

    if (command in COMMAND_MAP) {
      await runCommand(COMMAND_MAP[command].commandPath)
      return
    }

    logger.error(`Unknown command: ${command}`)
    displayHelp()
    Deno.exit(1)
  } finally {
    cleanupSignalHandlers()
  }
}

if (import.meta.main) {
  try {
    await main()
  } catch (error: unknown) {
    logger.error(
      `Error: ${error instanceof Error ? error.message : String(error)}`,
    )
    Deno.exit(1)
  }
}
