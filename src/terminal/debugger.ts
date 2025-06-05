/**
 * @module debugger
 * @description File-based logging for terminal debugging without interfering with console output
 */

import { ensureDir } from '@std/fs'
import { format } from '@std/datetime'
import type { Terminal } from './mod.ts'

interface DebugState {
  isActive: boolean
  currentLogFile: string | null
  currentDate: string | null
  originalMethods: {
    log?: (msg: string, ...args: unknown[]) => void
    info?: (msg: string, ...args: unknown[]) => void
    debug?: (msg: string, ...args: unknown[]) => void
    error?: (msg: string, ...args: unknown[]) => void
    warn?: (msg: string, ...args: unknown[]) => void
  }
}

const state: DebugState = {
  isActive: false,
  currentLogFile: null,
  currentDate: null,
  originalMethods: {},
}

const LOG_DIR = 'logs'

function getCurrentDate(): string {
  return format(new Date(), 'yyyy-MM-dd')
}

function getCurrentLogFile(): string {
  const date = getCurrentDate()
  return `${LOG_DIR}/${date}.log`
}

function formatTimestamp(): string {
  return new Date().toISOString()
}

async function writeToLog(
  level: string,
  msg: string,
  args: unknown[],
): Promise<void> {
  const date = getCurrentDate()

  // Check if we need to rotate to a new log file
  if (state.currentDate !== date) {
    state.currentDate = date
    state.currentLogFile = getCurrentLogFile()

    // Ensure log directory exists
    await ensureDir(LOG_DIR)
  }

  if (!state.currentLogFile) return

  const timestamp = formatTimestamp()
  const formattedArgs = args.length > 0
    ? ` ${
      args.map((arg) => typeof arg === 'string' ? arg : Deno.inspect(arg)).join(
        ' ',
      )
    }`
    : ''

  const logLine =
    `[${timestamp}] ${level.toUpperCase()}: ${msg}${formattedArgs}\n`

  try {
    await Deno.writeTextFile(state.currentLogFile, logLine, { append: true })
  } catch (error) {
    // Fallback to console if file writing fails
    console.error('Failed to write to log file:', error)
  }
}

function createLogMethod(
  level: string,
  originalMethod: (msg: string, ...args: unknown[]) => void,
) {
  return async (msg: string, ...args: unknown[]) => {
    await writeToLog(level, msg, args)
    // Still call original method for any side effects, but suppress output
    // by temporarily redirecting stdout if needed
  }
}

/**
 * Start file-based debugging by redirecting terminal logging methods to files
 * Must be called BEFORE terminal.start() to work properly
 */
export async function start(terminal: Terminal): Promise<void> {
  if (state.isActive) return

  // Initialize current date and log file
  state.currentDate = getCurrentDate()
  state.currentLogFile = getCurrentLogFile()

  // Ensure log directory exists
  await ensureDir(LOG_DIR)

  // Store original methods
  state.originalMethods = {
    log: terminal.log.bind(terminal),
    info: terminal.info.bind(terminal),
    debug: terminal.debug.bind(terminal),
    error: terminal.error.bind(terminal),
    warn: terminal.warn.bind(terminal),
  }

  // Replace methods with file-logging versions
  if (state.originalMethods.log) {
    terminal.log = createLogMethod('log', state.originalMethods.log)
  }
  if (state.originalMethods.info) {
    terminal.info = createLogMethod('info', state.originalMethods.info)
  }
  if (state.originalMethods.debug) {
    terminal.debug = createLogMethod('debug', state.originalMethods.debug)
  }
  if (state.originalMethods.error) {
    terminal.error = createLogMethod('error', state.originalMethods.error)
  }
  if (state.originalMethods.warn) {
    terminal.warn = createLogMethod('warn', state.originalMethods.warn)
  }

  state.isActive = true

  // Log that debugging has started
  await writeToLog('system', 'File-based debugging started', [])
}

/**
 * Stop file-based debugging and restore original terminal logging methods
 */
export async function stop(terminal: Terminal): Promise<void> {
  if (!state.isActive) return

  // Log that debugging is stopping
  await writeToLog('system', 'File-based debugging stopped', [])

  // Restore original methods
  if (state.originalMethods.log) terminal.log = state.originalMethods.log
  if (state.originalMethods.info) terminal.info = state.originalMethods.info
  if (state.originalMethods.debug) terminal.debug = state.originalMethods.debug
  if (state.originalMethods.error) terminal.error = state.originalMethods.error
  if (state.originalMethods.warn) terminal.warn = state.originalMethods.warn

  // Clear state
  state.isActive = false
  state.currentLogFile = null
  state.currentDate = null
  state.originalMethods = {}
}

/**
 * Check if file-based debugging is currently active
 */
export function isActive(): boolean {
  return state.isActive
}

/**
 * Get the current log file path
 */
export function getCurrentLogFilePath(): string | null {
  return state.currentLogFile
}
