/**
 * @module package-info
 * Utilities for reading and interpreting package configuration files (like deno.json, package.json)
 * from local file systems or remote URLs. Provides functions to find package files,
 * extract metadata (name, version, exports), and resolve main export paths.
 */
import { parse as parseJsonc } from '@std/jsonc'
import { dirname, fromFileUrl, join } from '@std/path'
import { exists } from '@std/fs/exists'
import { stat as statFile } from '@std/fs/unstable-stat'
import { readTextFile } from '@std/fs/unstable-read-text-file'
import { readDir } from '@std/fs/unstable-read-dir'

/**
 * Standard package configuration file names searched for in order.
 */
const PACKAGE_CONFIG_FILES = [
  'deno.json',
  'deno.jsonc',
  'package.json',
  'package.jsonc',
  'jsr.json',
] as const

/**
 * Directories to skip when traversing for package files.
 * These typically contain dependencies, build artifacts, or tooling-specific files
 * that would create noise in package searches or are unlikely to contain relevant
 * package configuration files.
 */
const DIRS_TO_SKIP = [
  // Package managers and dependency directories
  'node_modules',
  '.npm',
  'npm-cache',
  '.pnpm-store',
  '.yarn',
  '.deno',
  'deno_modules', // Non-standard but sometimes used
  '.bun',
  '.cache',
  '.parcel-cache',
  '.next',
  '.nuxt',
  '.svelte-kit',
  '.output',
  '.vite',
  '.webpack',

  // Test and coverage directories
  'coverage',
  '.nyc_output',

  // Version control
  '.git',
  '.svn',
  '.hg',

  // IDE and editor directories
  '.idea',
  '.vscode',
  '.vs',

  // Other common directories to skip
  '.github',
  '.gitlab',
  'vendor',
  'temp',
  'tmp',

  // OS-specific
  '.DS_Store',
  'Thumbs.db',
] as const

/**
 * Determines the type of path provided (remote URL, file URL, or local path).
 *
 * @param {string | undefined} path The path to check, defaults to import.meta.url if not provided
 * @returns {{specifier: string, isFileUrl: boolean, isRemoteUrl: boolean, isLocal: boolean}} An object with the normalized specifier and boolean flags for path types
 */
const determinePathType = (path?: string) => {
  const specifier = path ?? import.meta.url
  const isFileUrl = specifier.startsWith('file:')
  const isRemoteUrl = specifier.startsWith('http://') || specifier.startsWith('https://')
  // isLocal is derived, so it's clear.
  return { specifier, isFileUrl, isRemoteUrl, isLocal: !isFileUrl && !isRemoteUrl }
}

/**
 * Searches for a package file in a remote URL path.
 *
 * @async
 * @param {URL} url The URL to start searching from
 * @param {ReadonlyArray<string>} [configFiles=PACKAGE_CONFIG_FILES] Optional array of package config filenames to search for
 * @param {boolean} [traverseUp=true] If true, search upwards from the given URL. If false, only check current level.
 * @returns {Promise<string>} URL to the found config file, or an empty string if none is found
 */
const findRemotePackagePath = async (
  url: URL,
  configFiles: ReadonlyArray<string> = PACKAGE_CONFIG_FILES,
  traverseUp = true,
): Promise<string> => {
  const checkUrl = async (fileUrl: string): Promise<string> => {
    try {
      const headResponse = await fetch(fileUrl, { method: 'HEAD' })
      return headResponse.ok ? fileUrl : ''
    } catch {
      return ''
    }
  }

  const currentUrl = new URL(url.href) // Use currentUrl to avoid modifying the input 'url' parameter directly

  // Adjust currentUrl to point to a directory for consistent processing
  if (!currentUrl.pathname.endsWith('/') && !currentUrl.pathname.includes('.')) {
    // If it's not a root-like path and doesn't seem to be a file, ensure it ends with /
    currentUrl.pathname += '/'
  } else if (!currentUrl.pathname.endsWith('/')) {
    // If it seems like a file path, move to its parent directory
    const pathParts = currentUrl.pathname.split('/')
    pathParts.pop()
    currentUrl.pathname = `${pathParts.join('/')}/`
  }

  if (traverseUp) {
    let iterationUrl = new URL(currentUrl.href)
    while (true) {
      for (const file of configFiles) {
        const fileUrl = new URL(file, iterationUrl).href
        const found = await checkUrl(fileUrl)
        if (found) return found
      }

      const parentUrl = new URL('..', iterationUrl)
      if (iterationUrl.href === parentUrl.href) break // Reached root
      iterationUrl = parentUrl
    }
  } else {
    // Downward traversal for remote: only check current level
    for (const file of configFiles) {
      const fileUrl = new URL(file, currentUrl).href
      const found = await checkUrl(fileUrl)
      if (found) return found
    }
  }

  return ''
}

/**
 * Searches for a package file in a local file path by traversing up or down.
 *
 * @async
 * @param {string} initialPath Local file path to start searching from
 * @param {ReadonlyArray<string>} [configFiles=PACKAGE_CONFIG_FILES] Optional array of package config filenames to search for
 * @param {boolean} [traverseUp=true] If true, search upwards from the given path. If false, search downwards.
 * @param {number} [maxDepth=Number.POSITIVE_INFINITY] For downward searches, limits recursion depth
 * @returns {Promise<string>} Absolute path to the found config file, or an empty string if none is found
 */
const findLocalPackagePath = async (
  initialPath: string,
  configFiles: ReadonlyArray<string> = PACKAGE_CONFIG_FILES,
  traverseUp = true,
  maxDepth = Number.POSITIVE_INFINITY,
): Promise<string> => {
  const getStartDir = async (path: string): Promise<string> => {
    try {
      const pathInfo = await statFile(path)
      return pathInfo.isDirectory ? path : dirname(path)
    } catch {
      // If stat fails (e.g., path doesn't exist or is a file in a non-existent dir),
      // assume it's a file path and try to get its dirname.
      return dirname(path)
    }
  }

  const startDir = await getStartDir(initialPath)

  if (traverseUp) {
    let currentDir = startDir
    // Loop invariant: currentDir is an absolute path.
    // Check currentDir and then move to its parent, until root is reached.
    // The root directory's dirname is itself.
    while (true) {
      for (const file of configFiles) {
        const filePath = join(currentDir, file)
        if (await exists(filePath, { isFile: true })) return filePath
      }
      const parentDir = dirname(currentDir)
      if (currentDir === parentDir) break // Reached the root
      currentDir = parentDir
    }
    return '' // Not found after traversing up to the root
  }

  // Downward traversal logic
  const findLocalRecursiveDown = async (
    currentPath: string,
    currentDepth: number,
  ): Promise<string> => {
    // Check for package files in current directory
    for (const file of configFiles) {
      const filePath = join(currentPath, file)
      if (await exists(filePath, { isFile: true })) return filePath
    }

    if (currentDepth >= maxDepth) return '' // Stop recursion if maxDepth reached

    try {
      for await (const entry of readDir(currentPath)) {
        if (!entry.isDirectory) continue

        const dirName = entry.name
        // Skip hidden directories and directories in DIRS_TO_SKIP
        if (
          dirName.startsWith('.') || DIRS_TO_SKIP.includes(dirName as typeof DIRS_TO_SKIP[number])
        ) {
          continue
        }

        const subDirPath = join(currentPath, dirName)
        const result = await findLocalRecursiveDown(subDirPath, currentDepth + 1)
        if (result) return result
      }
    } catch { /* Ignore errors reading directory, e.g. permission denied */ }

    return ''
  }

  return findLocalRecursiveDown(startDir, 0)
}

/**
 * Finds the absolute local or remote path to the nearest package configuration file
 * by traversing up or down from the given path.
 *
 * The function handles three types of paths:
 * 1. Local file system paths - traverses directories looking for package files
 * 2. Remote URLs (http/https) - traverses URL paths checking for package files
 * 3. File URLs (file://) - converts to local path and searches from there
 *
 * Package files are searched in the order specified by PACKAGE_CONFIG_FILES.
 * For example, if both deno.json and package.json exist in the same directory,
 * deno.json will be returned as it appears first in PACKAGE_CONFIG_FILES.
 *
 * @param {string | undefined} path Optional file or directory path to start the search from.
 *   If not provided, defaults to the current module's URL (`import.meta.url`).
 *   For file URLs, must use three forward slashes (file:///) for absolute paths.
 * @param {ReadonlyArray<string>} [configFiles=PACKAGE_CONFIG_FILES] Optional array of package config filenames to search for.
 *   Defaults to `PACKAGE_CONFIG_FILES`.
 * @param {boolean} [traverseUp=true] If true, search upwards from the given path. If false, search downwards.
 *   Defaults to true (upward traversal).
 * @param {number} [maxDepth=Number.POSITIVE_INFINITY] For downward searches (traverseUp: false), limits recursion depth.
 *   Defaults to Number.POSITIVE_INFINITY (unlimited depth).
 * @returns {Promise<string>} Absolute path to the found config file, or an empty string if none is found.
 * @async
 * @example
 * ```ts
 * // Upward traversal (default)
 * const path1 = await findPackagePathFromPath("/path/to/project/src/file.ts")
 * // Downward traversal
 * const path2 = await findPackagePathFromPath("/path/to/project", undefined, false)
 * // Remote URL with upward traversal
 * const path3 = await findPackagePathFromPath("https://example.com/project/src/file.ts")
 * // File URL with downward traversal and custom depth
 * const path4 = await findPackagePathFromPath("file:///path/to/project", undefined, false, 5)
 * ```
 */
async function findPackagePathFromPath(
  path?: string,
  configFiles: ReadonlyArray<string> = PACKAGE_CONFIG_FILES,
  traverseUp = true,
  maxDepth = Number.POSITIVE_INFINITY,
): Promise<string> {
  const { specifier, isFileUrl, isRemoteUrl } = determinePathType(path)

  if (isRemoteUrl) {
    return await findRemotePackagePath(new URL(specifier), configFiles, traverseUp)
  }

  if (isFileUrl) {
    return await findPackagePathFromPath(fromFileUrl(specifier), configFiles, traverseUp, maxDepth)
  }

  return await findLocalPackagePath(specifier, configFiles, traverseUp, maxDepth)
}

/**
 * Finds the absolute local or remote path to the nearest package directory
 * by traversing up or down from the given path.
 *
 * @param {string | undefined} path Optional file or directory path to start the search from.
 *   If not provided, defaults to the current module's URL (`import.meta.url`).
 *   For file URLs, must use three forward slashes (file:///) for absolute paths.
 * @param {ReadonlyArray<string>} [configFiles=PACKAGE_CONFIG_FILES] Optional array of package config filenames to search for.
 *   Defaults to `PACKAGE_CONFIG_FILES`.
 * @param {boolean} [traverseUp=true] If true, search upwards from the given path. If false, search downwards.
 *   Defaults to true (upward traversal).
 * @param {number} [maxDepth=Number.POSITIVE_INFINITY] For downward searches (traverseUp: false), limits recursion depth.
 *   Defaults to Number.POSITIVE_INFINITY (unlimited depth).
 * @returns {Promise<string>} Absolute path to the found config file, or an empty string if none is found.
 * @async
 */
async function findPackageDirectoryFromPath(
  path?: string,
  configFiles: ReadonlyArray<string> = PACKAGE_CONFIG_FILES,
  traverseUp = true,
  maxDepth = Number.POSITIVE_INFINITY,
): Promise<string> {
  const packageDirectory = await findPackagePathFromPath(path, configFiles, traverseUp, maxDepth)
  return dirname(packageDirectory)
}

/**
 * Finds and returns the full package object from a package configuration file.
 *
 * @param {string | undefined} initialPath Optional path to a package file or a directory containing one.
 *   If not provided, searches from the current module's location.
 * @param {ReadonlyArray<string>} [packageNames=PACKAGE_CONFIG_FILES] Optional array of package config filenames to search for.
 *   Defaults to `PACKAGE_CONFIG_FILES`.
 * @param {boolean} [traverseUp=true] If true, search upwards from the given path. If false, search downwards.
 *   Defaults to true (upward traversal).
 * @param {number} [maxDepth=Number.POSITIVE_INFINITY] For downward searches (traverseUp: false), limits recursion depth.
 *   Defaults to Number.POSITIVE_INFINITY (unlimited depth).
 * @returns {Promise<Record<string, unknown> & { path: string }>} The complete package object with all properties, plus a "path" property
 *   containing the file path from which the package was loaded.
 * @throws {Error} If no package file is found, or if the file can't be read or parsed.
 * @async
 */
async function findPackageFromPath(
  initialPath?: string,
  packageNames = PACKAGE_CONFIG_FILES,
  traverseUp = true,
  maxDepth = Number.POSITIVE_INFINITY,
): Promise<Record<string, unknown>> {
  const readPackageFile = async (pkgPath: string): Promise<Record<string, unknown>> => {
    const isRemote = pkgPath.startsWith('http://') || pkgPath.startsWith('https://')
    let content: string
    try {
      content = isRemote
        ? await fetch(pkgPath).then(async (res) => {
          if (!res.ok) {
            throw new Error(`Failed to fetch ${pkgPath}: ${res.status} ${res.statusText}`)
          }
          return await res.text()
        })
        : await readTextFile(pkgPath)
    } catch (error) {
      throw new Error(
        `Failed to read package file: ${pkgPath}. ${(error instanceof Error
          ? error.message
          : String(error))}`,
      )
    }

    try {
      const data = parseJsonc(content) as Record<string, unknown>
      // Decorate with path for context
      data.path = pkgPath
      return data
    } catch (error) {
      throw new Error(
        `Failed to parse package file: ${pkgPath}. ${(error instanceof Error
          ? error.message
          : String(error))}`,
      )
    }
  }

  const validateAndFindPath = async (pathToValidate?: string): Promise<string> => {
    // 1. Undefined path: Search from current module's URL
    if (!pathToValidate) {
      const found = await findPackagePathFromPath(
        import.meta.url,
        packageNames,
        traverseUp,
        maxDepth,
      )
      if (!found) throw new Error('No package configuration file found (searched from module URL)')
      return found
    }

    const { specifier, isFileUrl, isRemoteUrl, isLocal } = determinePathType(pathToValidate)

    // 2. Remote URL
    if (isRemoteUrl) {
      const isDirectFileUrl = packageNames.some((cfgFile) => specifier.endsWith(`/${cfgFile}`)) ||
        specifier.endsWith('.json') || specifier.endsWith('.jsonc')
      if (isDirectFileUrl) {
        try {
          const headResponse = await fetch(specifier, { method: 'HEAD' })
          if (headResponse.ok) return specifier // Direct hit
        } catch { /* Network error, fall through to broader search */ }
      }
      // General remote search
      const found = await findPackagePathFromPath(specifier, packageNames, traverseUp, maxDepth)
      if (!found) {
        throw new Error(
          `No package configuration file found (searched from remote URL: ${specifier})`,
        )
      }
      return found
    }

    // 3. File URL: Convert to local path and delegate
    if (isFileUrl) {
      const localPath = fromFileUrl(specifier)
      // Delegate to avoid re-implementing local logic; this will re-enter validateAndFindPath as a local path
      return validateAndFindPath(localPath)
    }

    // 4. Local path
    if (isLocal) {
      try {
        const fileInfo = await statFile(specifier)

        if (fileInfo.isFile) {
          const fileName = specifier.split('/').pop() ?? ''
          const isValidPkgFile = packageNames.some((name) =>
            fileName === name ||
            (name.includes('.') && fileName.endsWith(name.substring(name.indexOf('.'))))
          )
          if (isValidPkgFile) return specifier
          throw new Error(
            `Invalid package configuration file: ${specifier}. Must be one of: ${
              packageNames.join(', ')
            }`,
          )
        }

        if (fileInfo.isDirectory) {
          // Check for package files directly inside the directory
          for (const configFile of packageNames) {
            const fullPath = join(specifier, configFile)
            if (await exists(fullPath, { isFile: true })) return fullPath
          }

          // Logic for "special" directories preventing upward search
          if (traverseUp) {
            const dirName = specifier.split('/').pop() ?? ''
            const isEmpty = async (p: string): Promise<boolean> => {
              try {
                for await (const _ of readDir(p)) return false
                return true
              } catch {
                return false
              } // Assume not empty on error
            }
            const isSpecialDir = dirName.startsWith('.') ||
              DIRS_TO_SKIP.includes(dirName as typeof DIRS_TO_SKIP[number]) ||
              dirName.includes('empty') || // Legacy check from original code
              await isEmpty(specifier)

            if (isSpecialDir) {
              throw new Error(
                `No package configuration file found (special directory: ${specifier})`,
              )
            }
          }

          // If not found directly or not a special dir, delegate to general search from this directory
          const foundInDir = await findPackagePathFromPath(
            specifier,
            packageNames,
            traverseUp,
            maxDepth,
          )
          if (foundInDir) return foundInDir
          throw new Error(
            `No package configuration file found (searched from directory: ${specifier})`,
          )
        }

        // Path is not a file or directory (e.g., symlink to nowhere)
        throw new Error(
          `Path '${specifier}' is not a file or directory suitable for package search.`,
        )
      } catch (error) {
        // Re-throw specific, known errors from the try block
        if (
          error instanceof Error && (
            error.message.includes('Invalid package configuration file:') ||
            error.message.startsWith('No package configuration file found') ||
            error.message.startsWith('Path ')
          )
        ) {
          throw error
        }
        // For other errors (e.g., statFile fails for non-existent path), try general search
        const found = await findPackagePathFromPath(specifier, packageNames, traverseUp, maxDepth)
        if (found) return found
        // If general search also fails, or for original error if it was not one of the re-thrown ones
        throw new Error(
          `No package configuration file found for "${specifier}". Original error: ${
            error instanceof Error ? error.message : String(error)
          }`,
        )
      }
    }
    // Should not be reached if all path types are handled
    throw new Error(`Unhandled path type for: ${pathToValidate}`)
  }

  const packagePath = await validateAndFindPath(initialPath)
  return readPackageFile(packagePath)
}

/**
 * Gets the absolute path to the main export of a package.
 *
 * @param {string} path Path to a package file or directory containing one
 * @param {boolean} [traverseUp=true] If true, search upwards from the given path. If false, search downwards.
 *   Defaults to true (upward traversal).
 * @param {number} [maxDepth=Number.POSITIVE_INFINITY] For downward searches (traverseUp: false), limits recursion depth.
 *   Defaults to Number.POSITIVE_INFINITY (unlimited depth).
 * @returns {Promise<string>} The absolute path to the main export (referenced by '.' in exports)
 * @throws {Error} If no package is found or if the package has no main export
 * @async
 */
async function getMainExportPath(
  path: string,
  traverseUp = true,
  maxDepth = Number.POSITIVE_INFINITY,
): Promise<string> {
  const packageData = await findPackageFromPath(path, undefined, traverseUp, maxDepth)
  const packageFilePath = packageData.path
  if (typeof packageFilePath !== 'string') {
    throw new Error(`Package data for path "${path}" did not contain a valid file path.`)
  }
  const packageFileDir = dirname(packageFilePath)

  const exportsField = packageData.exports as Record<string, unknown> | undefined
  const mainExport = exportsField?.['.']

  if (typeof mainExport !== 'string' || !mainExport) {
    throw new Error(`No main export found for package at: ${packageFilePath}`)
  }

  return join(packageFileDir, mainExport)
}

/**
 * Validates if a package name conforms to the standard '@scope/name' format.
 *
 * @param {string} packageName The package name to validate
 * @returns {boolean} true if the name follows the '@scope/name' pattern, false otherwise
 */
function isValidPackageName(packageName: string): boolean {
  return /^@[a-z0-9-]+\/[a-z0-9-]+$/.test(packageName)
}

/**
 * Extracts the scope (e.g., '@my-scope') from a full package name.
 *
 * @param {string} packageName The package name to extract from (e.g., '@scope/name')
 * @returns {string} The scope including the '@' symbol, or an empty string if not found
 */
function extractScope(packageName: string): string {
  return packageName.match(/^(@[a-z0-9-]+)\/[a-z0-9-]+$/)?.[1] ?? ''
}

/**
 * Extracts the project name from a full package name, removing any scope prefix.
 *
 * @param {string} packageName The package name (e.g., '@scope/my-project' or 'my-project')
 * @returns {string} The project name without the scope, or the original if no scope exists
 */
function extractProjectName(packageName: string): string {
  return packageName.match(/^@[a-z0-9-]+\/([a-z0-9-]+)$/)?.[1] ?? packageName
}

export {
  DIRS_TO_SKIP,
  extractProjectName,
  extractScope,
  findPackageDirectoryFromPath,
  findPackageFromPath,
  findPackagePathFromPath,
  getMainExportPath,
  isValidPackageName,
  PACKAGE_CONFIG_FILES,
}
