#!/usr/bin/env -S deno run --allow-all
import { getConfig } from './config.ts'
import { join } from '@std/path'
import {
  blue,
  bold,
  cyan,
  dim,
  green,
  red,
  yellow,
} from 'jsr:@std/fmt@1/colors'

const KIT_NAME = 'deno kit'

const config = await getConfig()

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
  'server': {
    commandPath: '', // Currently disabled
    commandDescription:
      'Start the auto-generated HTTP and WebSocket server for your module',
  },
  'cli': {
    commandPath: 'commands/run-cli.ts',
    commandDescription: 'Run the auto-generated CLI interface for your module',
  },
}

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

  // Find the command in args to know where to start slicing from
  // Handle both 'cli' and 'run-cli' as valid command names
  const baseCommand = scriptName.replace('.ts', '')
  const shortCommand = baseCommand.replace('run-', '')
  const commandIndex = Deno.args.findIndex((arg) =>
    arg === baseCommand || arg === shortCommand
  )

  // Extract workspace flag if present
  const workspaceIndex = Deno.args.findIndex((arg) => arg === '--workspace')
  const workspaceDir = workspaceIndex >= 0
    ? Deno.args[workspaceIndex + 1]
    : undefined

  // Filter out workspace flag and value from command args
  const commandArgs = commandIndex >= 0
    ? Deno.args
      .slice(commandIndex + 1)
      .filter((_, i, _arr) =>
        i !== workspaceIndex - (commandIndex + 1) &&
        i !== (workspaceIndex + 1) - (commandIndex + 1)
      )
    : []

  // Debug logging
  logger.debug('Running command with:', {
    scriptName,
    scriptPath,
    baseCommand,
    shortCommand,
    originalArgs: Deno.args,
    commandIndex,
    commandArgs,
    workspaceDir,
  })

  // Create the command with the same permissions
  const command = new Deno.Command(denoExecutable, {
    args: [
      'run',
      '--allow-all',
      scriptPath,
      ...commandArgs,
    ],
    stdout: 'inherit',
    stderr: 'inherit',
    env: {
      ...Deno.env.toObject(), // Pass through all environment variables
      FORCE_COLOR: '1', // Ensure colors work in child process
      ...(workspaceDir ? { DENO_KIT_WORKSPACE: workspaceDir } : {}), // Pass workspace dir if specified
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
      // Instead of throwing an error, exit with the same code
      // This propagates the exit code up to the parent process
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
      KIT_NAME.split(' ').map((word) =>
        word.charAt(0).toUpperCase() + word.slice(1)
      ).join(' ')
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

  // Display all commands from COMMAND_MAP
  for (const [command, config] of Object.entries(COMMAND_MAP)) {
    logger.helpCommand(command, config.commandDescription, maxCommandLength)
  }

  // Display help command (handled locally)
  logger.helpCommand('help', 'Display this help message', maxCommandLength)

  logger.helpNote(
    'If no command is provided, the "help" command will be executed.',
  )
}

/**
 * Main function that dispatches to the appropriate command handler
 */
export async function main(): Promise<void> {
  // Set up signal handlers for the main process
  const cleanupSignalHandlers = setupSignalHandlers()

  try {
    // Get the command from arguments
    const command = Deno.args[0]?.toLowerCase() || 'help'

    // Handle local commands first
    if (command === 'help') {
      displayHelp()
      return
    }

    // Check if the command exists in our map
    if (command in COMMAND_MAP) {
      await runCommand(COMMAND_MAP[command].commandPath)
      return
    }

    // Handle unknown commands
    logger.error(`Unknown command: ${command}`)
    displayHelp()
    Deno.exit(1)
  } finally {
    // Clean up signal handlers
    cleanupSignalHandlers()
  }
}

// Run the script if it's the main module
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
