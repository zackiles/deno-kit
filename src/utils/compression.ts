/**
 * @module compression
 * @description Utilities for handling compression and decompression operations
 *
 * This module provides a consistent API for compressing/decompressing files and directories
 * to be used throughout the codebase. It handles ZIP file operations using the zip.js library.
 */

import { dirname, join } from '@std/path'
import { ensureDir } from '@std/fs'
// Using data-uri is a workaround to avoid an issue with the zip-js library. See https://github.com/gildas-lormeau/zip.js/issues/519
import {
  configure as configureZipJs,
  Uint8ArrayReader,
  Uint8ArrayWriter,
  ZipReader,
  ZipWriter,
} from '@zip-js/zip-js/data-uri'
import type { Entry } from '@zip-js/zip-js'
import logger from './logger.ts'

// Configure zip-js to terminate workers immediately to avoid timer leaks
configureZipJs({
  useWebWorkers: false,
  terminateWorkerTimeout: 0,
})

/**
 * Decompresses a zip file to a target directory
 *
 * @param source Source file path or URL
 * @param targetDir Directory to extract contents to
 * @param options Additional options for extraction
 * @returns Promise resolving when extraction is complete
 */
async function decompress(
  source: string | URL,
  targetDir: string,
  options: {
    isUrl?: boolean
    filter?: (entry: Entry) => boolean
    transformPath?: (path: string) => string | null
  } = {},
): Promise<void> {
  const { isUrl = false, filter, transformPath } = options

  try {
    const zipData = isUrl
      ? new Uint8Array(await (await fetch(source.toString())).arrayBuffer())
      : await Deno.readFile(source.toString())

    logger.debug(
      `Successfully read ${zipData.byteLength} bytes from ${
        isUrl ? 'URL' : 'file'
      }`,
    )

    const zipReader = new ZipReader(new Uint8ArrayReader(zipData))

    try {
      const entries = await zipReader.getEntries()
      logger.debug(`Found ${entries.length} entries in zip file`)
      await ensureDir(targetDir)

      for (const entry of entries) {
        if (entry.directory || !entry.getData) continue

        if (filter && !filter(entry)) continue

        let targetPath = join(targetDir, entry.filename)

        if (transformPath) {
          const transformedPath = transformPath(entry.filename)
          if (transformedPath === null) {
            logger.debug(
              `Skipping entry due to transformPath: ${entry.filename}`,
            )
            continue // Skip this entry
          }
          targetPath = join(targetDir, transformedPath)
        }

        await ensureDir(dirname(targetPath))

        const fileData = await entry.getData(new Uint8ArrayWriter())
        await Deno.writeFile(targetPath, fileData)
      }

      logger.debug(`Extracted zip contents to ${targetDir}`)
    } finally {
      await zipReader.close().catch(() => {})
    }
  } catch (error) {
    const errorType = isUrl ? 'download' : 'read'
    const message = error instanceof Error ? error.message : String(error)
    throw new Error(
      `Failed to ${errorType} or extract from ${source}: ${message}`,
    )
  }
}

/**
 * Helper function to add files to a zip archive recursively
 */
async function addFilesToZip(
  zipWriter: ZipWriter<unknown>,
  dir: string,
  baseDir: string,
): Promise<void> {
  for await (const entry of Deno.readDir(dir)) {
    const entryPath = join(dir, entry.name)
    const relativePath = entryPath.slice(baseDir.length + 1)

    if (entry.isDirectory) {
      await addFilesToZip(zipWriter, entryPath, baseDir)
    } else {
      const fileData = await Deno.readFile(entryPath)
      await zipWriter.add(relativePath, new Uint8ArrayReader(fileData))
    }
  }
}

/**
 * Compresses a file or directory into a zip file
 *
 * @param sourcePath Path to the file or directory to compress
 * @param targetPath Path where the zip file will be created
 * @returns Promise resolving when zip is created
 */
async function compress(
  sourcePath: string,
  targetPath: string,
): Promise<void> {
  const sourceInfo = await Deno.stat(sourcePath)

  if (sourceInfo.isFile) {
    const [fileData, fileName] = await Promise.all([
      Deno.readFile(sourcePath),
      Promise.resolve(join(sourcePath).split(/[\\/]/).pop() || 'binary'),
    ])

    const zipWriter = new ZipWriter(new Uint8ArrayWriter())
    await zipWriter.add(fileName, new Uint8ArrayReader(fileData))

    const zipData = await zipWriter.close()
    await Deno.writeFile(targetPath, zipData)

    logger.debug(`Created zip file at ${targetPath} from file ${sourcePath}`)
  } else if (sourceInfo.isDirectory) {
    const zipWriter = new ZipWriter(new Uint8ArrayWriter())

    await addFilesToZip(zipWriter, sourcePath, sourcePath)
    const zipData = await zipWriter.close()
    await Deno.writeFile(targetPath, zipData)

    logger.debug(
      `Created zip file at ${targetPath} from directory ${sourcePath}`,
    )
  } else {
    throw new Error(
      `Source path ${sourcePath} is neither a file nor a directory`,
    )
  }
}

export { compress, decompress }
