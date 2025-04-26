/**
 * @module config
 *
 * Configuration module that provides a singleton for managing environment variables.
 * By default, loads from '.env' in the current directory, but allows specifying
 * a different environment file using '--config' or '-c' argument:
 * ```
 * deno run -c=staging.env script.ts     // Load from staging.env
 * deno run --config=prod.env script.ts  // Load from prod.env
 * ```
 *
 * The returned config object provides:
 * - Direct access to environment variables as properties
 * - A workspace property that returns the workspace path based on:
 *   1. Command line args (--workspace or -w)
 *   2. DENO_KIT_WORKSPACE environment variable
 *   3. Current working directory (fallback)
 * - DENO_ENV will default to "development" if not set
 *
 * @example
 * import loadConfig from './config.ts';
 *
 * const config = await loadConfig();
 * const apiKey = config.API_KEY;
 * const workspacePath = config.workspace;
 */

import { load as loadEnv } from '@std/dotenv'
import { parseArgs } from '@std/cli'
import { dirname, join } from '@std/path' // Import path functions
import logger from './utils/logger.ts' // Import logger for debug

// Module state
let values: Record<string, string> = {}
let configProxy: Record<string, string> | null = null
let initialized = false
let parsedArgs: Record<string, unknown> = {}

const getWorkspace = (): string => {
  const { workspace: workspaceArg, w, _: positionalArgs } = parsedArgs

  // Check for positional argument after "init"
  const initCommand = Array.isArray(positionalArgs) && positionalArgs[0] === 'init'
  const positionalWorkspace = initCommand && positionalArgs.length > 1
    ? String(positionalArgs[1])
    : undefined

  return (workspaceArg as string) ??
    (w as string) ??
    positionalWorkspace ??
    values.DENO_KIT_WORKSPACE ??
    Deno.cwd()
}

/**
 * Replaces global Deno.args with a filtered version that excludes config arguments
 */
const patchDenoArgs = (filteredArgs: string[]): void => {
  const originalDeno = globalThis.Deno
  globalThis.Deno = new Proxy(originalDeno, {
    get: (target, prop) => prop === 'args' ? filteredArgs : Reflect.get(target, prop),
  })
}

/**
 * Removes empty strings, null, and undefined values from configuration
 */
const filterEmptyValues = (
  config: Record<string, string | null | undefined>,
): Record<string, string> =>
  Object.fromEntries(
    Object.entries(config)
      .filter(([_, value]) => value !== null && value !== undefined && value !== ''),
  ) as Record<string, string>

/**
 * Creates a proxy that provides direct property access to config values
 * including the workspace property
 */
const createConfigProxy = (): Record<string, string> => {
  if (configProxy) return configProxy

  configProxy = new Proxy(values, {
    get(target, prop) {
      if (prop === 'workspace') {
        return getWorkspace()
      }
      return target[prop as string]
    },
  })

  return configProxy
}

/**
 * Loads configuration and returns an object for direct access to values.
 * Subsequent calls return the cached configuration unless force=true.
 */
async function loadConfig(force = false): Promise<Record<string, string>> {
  if (initialized && !force) return createConfigProxy()

  // Determine executable directory for reliable .env loading
  let execDir = '.' // Default to current dir
  try {
    const execPath = Deno.execPath()
    if (execPath) {
      execDir = dirname(execPath)
    }
  } catch (e) {
    logger.warn(`Could not determine executable path: ${e}. Falling back to cwd for .env.`)
  }

  parsedArgs = parseArgs(Deno.args, {
    string: ['workspace', 'w', 'config', 'c'],
    alias: { w: 'workspace', c: 'config' },
    unknown: (arg: string) => {
      // Allow positional arguments
      return true
    },
  })
  const { config: configArg, c } = parsedArgs

  // Look for .env relative to executable first, then cwd as fallback
  const envPathExec = join(execDir, '.env')
  const envPathCwd = '.env' // Default path checked by loadEnv
  let finalEnvPath = envPathCwd // Default to cwd
  let loadedFrom = 'cwd (default)'

  try {
    // Check if .env exists next to executable
    await Deno.stat(envPathExec)
    finalEnvPath = envPathExec
    loadedFrom = 'executable directory'
  } catch (e) {
    if (!(e instanceof Deno.errors.NotFound)) {
      logger.warn(`Error checking for .env near executable: ${e}`)
    }
    // If not found near executable, loadEnv will try cwd by default
  }

  // Load env vars using the determined path or fallback to loadEnv's default (.env in cwd)
  values = filterEmptyValues(await loadEnv({ envPath: finalEnvPath, export: false }))

  // Set default DENO_ENV to development if not already set after loading
  if (!values.DENO_ENV) {
    values.DENO_ENV = 'development'
  }

  if (configArg || c) {
    const filteredArgs = Deno.args.filter((arg) =>
      !arg.startsWith('config=') && !arg.startsWith('-c=')
    )
    patchDenoArgs(filteredArgs)
  }

  initialized = true
  configProxy = null // Reset proxy to pick up new values
  return createConfigProxy()
}

export default loadConfig
