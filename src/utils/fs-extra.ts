import { dirname, join, resolve } from '@std/path'
import { getPackageForPath, PACKAGE_CONFIG_FILES } from './package-info.ts'

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
    throw new Error('Cannot determine common base path. No paths were provided')
  }

  // Special case: If only one path is provided
  if (paths.length === 1) {
    const resolvedPath = resolve(paths[0])

    try {
      // Check if the path is a directory
      const stat = Deno.statSync(resolvedPath)
      if (stat.isDirectory) {
        return resolvedPath // Return the directory path as-is
      }
    } catch {
      // If stat fails (e.g., path doesn't exist), fall back to getting dirname
    }

    // For files or non-existent paths, return the parent directory
    return dirname(resolvedPath)
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

  for (const [path, count] of basePathCounts) {
    if (count > maxCount) {
      maxPath = path
      maxCount = count
    } else if (count === maxCount) {
      // If we have a tie, choose the deeper path in the directory structure
      // (More specific path is preferable)
      if (path.length > maxPath.length) {
        maxPath = path
      }
    }
  }

  if (!maxPath) {
    throw new Error('Could not determine a common base path')
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
