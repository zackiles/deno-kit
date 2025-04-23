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
 *   2. Current working directory (fallback)
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

// Module state
let values: Record<string, string> = {}
let configProxy: Record<string, string> | null = null
let initialized = false
let parsedArgs: Record<string, unknown> = {}

const getWorkspace = (): string => {
  const { workspace: workspaceArg, w } = parsedArgs
  return (workspaceArg as string) ?? (w as string) ?? Deno.cwd()
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
      .filter(([, value]) => value !== null && value !== undefined && value !== ''),
  ) as Record<string, string>

/**
 * Creates a proxy that provides direct property access to config values
 * including the workspace property
 */
const createConfigProxy = (): Record<string, string> => {
  if (!configProxy) {
    configProxy = new Proxy(values, {
      get: (target, prop) => {
        if (prop === 'workspace') return getWorkspace()
        return typeof prop === 'string' ? target[prop] ?? undefined : undefined
      },
    })
  }

  return configProxy
}

/**
 * Loads configuration and returns an object for direct access to values.
 * Subsequent calls return the cached configuration.
 */
async function loadConfig(): Promise<Record<string, string>> {
  if (initialized) return createConfigProxy()

  parsedArgs = parseArgs(Deno.args, {
    string: ['workspace', 'w', 'config', 'c'],
    alias: { w: 'workspace', c: 'config' },
  })
  const { config: configArg, c } = parsedArgs

  const envPath = (configArg as string) ?? (c as string) ?? '.env'
  const hasConfigArg = configArg || c

  values = filterEmptyValues(await loadEnv({ envPath, export: false }))

  // Set default DENO_ENV to development if not already set
  values.DENO_ENV ??= 'development'

  if (hasConfigArg) {
    const filteredArgs = Deno.args.filter(arg =>
      !arg.startsWith('config=') && !arg.startsWith('-c=')
    )
    patchDenoArgs(filteredArgs)
  }

  initialized = true
  return createConfigProxy()
}

export default loadConfig
