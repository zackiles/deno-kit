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
 * Checks if a directory has write access permission
 *
 * First attempts to check Unix file permissions directly,
 * then falls back to writing a test file if needed
 *
 * @param {string} path - Directory path to check for write access
 * @returns {Promise<boolean>} - True if the directory is writable, false otherwise
 */
async function checkDirectoryWriteAccess(path: string): Promise<boolean> {
  const absPath = resolve(path)

  // Verify it's a valid directory first
  const directoryInfo = await Deno.lstat(absPath).catch(() => null)
  if (!directoryInfo?.isDirectory) return false

  // Try checking permissions directly on Unix systems
  if (Deno.build.os !== 'windows') {
    try {
      const uid = Deno.uid()
      const gid = Deno.gid()
      const fileMode = directoryInfo.mode ?? 0
      const fileUid = 'uid' in directoryInfo ? directoryInfo.uid : undefined
      const fileGid = 'gid' in directoryInfo ? directoryInfo.gid : undefined

      const hasWriteAccess = (fileUid === uid && (fileMode & 0o200) !== 0) || // User write
        (fileGid === gid && (fileMode & 0o020) !== 0) || // Group write
        (fileMode & 0o002) !== 0 // Others write

      if (hasWriteAccess) return true
    } catch {
      // Fall through to file writing test
    }
  }

  // Fallback: Test by writing a temporary file
  const testFileName = join(absPath, `.write-test-${crypto.randomUUID()}`)
  const cleanupTestFile = () =>
    Deno.stat(testFileName)
      .then(() => Deno.remove(testFileName))
      .catch(() => {})

  try {
    await Deno.writeTextFile(testFileName, '')
    return true
  } catch {
    return false
  } finally {
    await cleanupTestFile()
  }
}

/**
 * Finds the most common base directory path from a collection of file paths
 *
 * @param paths - An array of absolute file paths
 * @returns The absolute path to the most common base directory
 * @throws Error if the array is empty or if there's a tie for the most common base path
 * @example
 * ```ts
 * const filePaths = [
 *   '/users/data/file1.txt',
 *   '/users/data/docs/file2.txt',
 *   '/users/data/file3.txt',
 * ];
 * const basePath = getCommonBasePath(filePaths); // '/users/data'
 * ```
 */
function getCommonBasePath(paths: string[]): string {
  if (!paths.length) {
    throw new Error('Cannot determine common base path: input array is empty')
  }

  // Normalize all paths
  const normalizedPaths = paths.map((path) => resolve(path))

  // Count occurrences of each parent directory
  const basePathCounts = new Map<string, number>()

  for (const path of normalizedPaths) {
    // Get all parent directories
    let current = path
    while (current !== dirname(current)) {
      current = dirname(current)
      basePathCounts.set(current, (basePathCounts.get(current) || 0) + 1)
    }
  }

  // Find the most common base path
  let maxPath = ''
  let maxCount = 0
  let tieDetected = false

  for (const [path, count] of basePathCounts) {
    if (count > maxCount) {
      maxPath = path
      maxCount = count
      tieDetected = false
    } else if (count === maxCount) {
      tieDetected = true
    }
  }

  if (!maxPath) {
    throw new Error('Could not determine a common base path')
  }

  if (tieDetected) {
    throw new Error(
      `Base path tie detected for path "${maxPath}" and others with ${maxCount} occurrences`,
    )
  }

  return maxPath
}

/**
 * Validates that all file paths are located within the specified base path
 *
 * @param filePaths - An array of file paths to validate
 * @param basePath - The base directory path that should contain all file paths
 * @throws Error if any file path is not within the base path or if the base path is not writable
 * @returns true if all paths are valid
 */
function validateCommonBasePath(
  filePaths: string[],
  basePath: string,
): boolean {
  // Normalize the base path
  const normalizedBasePath = resolve(basePath)

  // Normalize all file paths
  const normalizedFilePaths = filePaths.map((path) => resolve(path))

  // Check if each file path is within the base path
  const invalidPaths = normalizedFilePaths.filter((path) => !path.startsWith(normalizedBasePath))

  if (invalidPaths.length > 0) {
    throw new Error(
      `The following paths are not located within the base path "${normalizedBasePath}":\n${
        invalidPaths.map((path) => `- ${path}`).join('\n')
      }`,
    )
  }

  return true
}

/**
 * Recursively read all files in a directory and return a map of file paths to contents
 *
 * @param directoryPath The directory to read files from
 * @returns A map of file paths to file contents
 * @throws Error if the directory cannot be read or accessed
 * @note Failed file reads are logged as warnings and skipped
 */
async function readFilesRecursively(
  directoryPath: string,
): Promise<Map<string, string>> {
  const files = new Map<string, string>()
  const absolutePath = Deno.realPathSync(directoryPath)

  const readFileContent = async (path: string) => {
    try {
      const content = await Deno.readTextFile(path)
      files.set(path, content)
    } catch (error) {
      console.warn(
        `Failed to read file ${path}: ${error instanceof Error ? error.message : String(error)}`,
      )
    }
  }

  const processDirectory = async (dirPath: string): Promise<void> => {
    const entries = Deno.readDir(dirPath)
    for await (const entry of entries) {
      const entryPath = join(dirPath, entry.name)
      await (entry.isDirectory ? processDirectory(entryPath) : readFileContent(entryPath))
    }
  }

  await processDirectory(absolutePath)
  return files
}

export {
  checkDirectoryWriteAccess,
  getCommonBasePath,
  getPackageForPath,
  PACKAGE_CONFIG_FILES,
  readFilesRecursively,
  validateCommonBasePath,
}
