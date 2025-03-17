import { parse as parseJsonc } from '@std/jsonc'
import { dirname, fromFileUrl, join, resolve } from '@std/path'

/**
 * Package configuration file names
 */
const PACKAGE_CONFIG_FILES = [
  'deno.json',
  'deno.jsonc',
  'package.json',
  'package.jsonc',
  'jsr.json',
] as const

/**
 * Finds the nearest package configuration file by traversing up from the given path
 *
 * @param path - Optional file or directory path to start the search from
 * @param options - Configuration options for the search
 * @param options.packageConfigFiles - Optional array of package config filenames to search for (defaults to PACKAGE_CONFIG_FILES)
 * @returns Promise resolving to the absolute path to the found config file, or empty string if none found
 */
async function getPackageForPath(
  path?: string,
  options: { packageConfigFiles?: string[] } = {},
): Promise<string> {
  const configFiles = options.packageConfigFiles || PACKAGE_CONFIG_FILES

  // Determine starting directory
  let startDir = path ? resolve(path) : dirname(fromFileUrl(import.meta.url))

  // Check if path is a file and get its directory if needed
  if (path) {
    const stat = await Deno.stat(startDir).catch(() => null)
    if (stat && !stat.isDirectory) startDir = dirname(startDir)
  }

  // Traverse up from starting directory
  let currentDir = startDir
  while (true) {
    // Find first matching config file
    for (const file of configFiles) {
      const filePath = join(currentDir, file)
      const exists = await Deno.stat(filePath).then(() => true).catch(() => false)
      if (exists) return filePath
    }

    const parentDir = dirname(currentDir)
    if (parentDir === currentDir) break
    currentDir = parentDir
  }

  return ''
}

/**
 * Retrieves the package name and version from deno.json
 * @returns An object containing the package name and version
 * @throws Error if deno.json cannot be read or is missing required fields
 */
function getPackageInfo(): { name: string; version: string } {
  try {
    const content = Deno.readTextFileSync('./deno.jsonc')
    const data = parseJsonc(content) as Record<string, unknown>

    if (!data?.name || !data?.version) {
      throw new Error(
        'Missing required fields in deno.json: name and version must be defined',
      )
    }

    return { name: String(data.name), version: String(data.version) }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    throw new Error(
      `Failed to load package information from deno.json: ${message}`,
    )
  }
}

/**
 * Validates a package name to ensure it's in the format @scope/name
 *
 * @param {string} packageName - The package name to validate
 * @returns {boolean} True if the package name is valid, false otherwise
 */
function isValidPackageName(packageName: string): boolean {
  return /^@[a-z0-9-]+\/[a-z0-9-]+$/.test(packageName)
}

/**
 * Extracts the scope from a package name
 *
 * @param {string} packageName - The package name to extract the scope from
 * @returns {string} The scope (including @) or empty string if not found
 */
function extractScope(packageName: string): string {
  const match = packageName.match(/^(@[a-z0-9-]+)\/[a-z0-9-]+$/)
  return match ? match[1] : ''
}

/**
 * Extracts the project name from a package name (without scope)
 *
 * @param {string} packageName - The package name to extract the project name from
 * @returns {string} The project name (without scope) or the original package name
 */
function extractProjectName(packageName: string): string {
  const match = packageName.match(/^@[a-z0-9-]+\/([a-z0-9-]+)$/)
  return match ? match[1] : packageName
}

export {
  extractProjectName,
  extractScope,
  getPackageForPath,
  getPackageInfo,
  isValidPackageName,
  PACKAGE_CONFIG_FILES,
}
