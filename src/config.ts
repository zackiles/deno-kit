/**
 * @module config
 *
 * Configuration module that provides a singleton for managing environment variables.
 * It loads variables from a .env file or from a custom file specified via command line arguments.
 *
 * @example
 * // Import the configuration loader function
 * import loadConfig from './config.ts';
 *
 * // Load and access the configuration
 * const config = await loadConfig();
 *
 * // Access a configuration value directly
 * const apiKey = config.API_KEY;
 */

import { load as loadEnv } from '@std/dotenv'
import { parseArgs } from '@std/cli'

// Module state
let values: Record<string, string> = {}
let configProxy: Record<string, string> | null = null
let initialized = false

/**
 * Replace the global Deno.args with a filtered version
 * @param {string[]} filteredArgs - The filtered arguments to replace Deno.args with
 */
const patchDenoArgs = (filteredArgs: string[]): void => {
  const originalDeno = globalThis.Deno

  globalThis.Deno = new Proxy(originalDeno, {
    get: (target, prop) => prop === 'args' ? filteredArgs : Reflect.get(target, prop),
  })
}

/**
 * Filter out empty strings, null, and undefined values from configuration
 * @param {Record<string, string | null | undefined>} config - Raw configuration object
 * @returns {Record<string, string>} Filtered configuration object
 */
const filterEmptyValues = (
  config: Record<string, string | null | undefined>,
): Record<string, string> =>
  Object.fromEntries(
    Object.entries(config)
      .filter(([_, value]) => value !== null && value !== undefined && value !== ''),
  ) as Record<string, string>

/**
 * Create a proxy for direct property access to config values
 * @returns {Record<string, string>} Proxy for accessing config values
 */
const createConfigProxy = (): Record<string, string> => {
  if (!configProxy) {
    configProxy = new Proxy(values, {
      get: (target, prop) => typeof prop === 'string' ? (target[prop] || undefined) : undefined,
    })
  }

  return configProxy
}

/**
 * Load the configuration and return it as an object for direct access
 * @returns {Promise<Record<string, string>>} Configuration values with direct property access
 */
async function loadConfig(): Promise<Record<string, string>> {
  // Return existing config if already initialized
  if (initialized) return createConfigProxy()

  const { config: configArg, c } = parseArgs(Deno.args)

  // Determine config file path from args
  const envPath = (configArg as string) ?? (c as string) ?? '.env'
  const hasConfigArg = configArg || c

  // Load environment variables and filter out empty values
  values = filterEmptyValues(await loadEnv({ envPath, export: false }))

  // Patch Deno.args if config args were found
  if (hasConfigArg) {
    const filteredArgs = Deno.args.filter((arg) =>
      !arg.startsWith('config=') && !arg.startsWith('-c=')
    )
    patchDenoArgs(filteredArgs)
  }

  initialized = true
  return createConfigProxy()
}

export default loadConfig
