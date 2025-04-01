#!/usr/bin/env -S deno run --allow-all

import { dirname, join } from '@std/path'
import { ensureDir } from '@std/fs'
import { getConfig } from '../config-old.ts'

// Get configuration to access kitDir and backupsDir
const config = await getConfig()

/**
 * Recursively finds all backup files in a directory
 *
 * @param {string} dir - The directory to search in
 * @returns {Promise<string[]>} Array of backup file paths
 */
async function findBackupFiles(dir: string): Promise<string[]> {
  const backupFiles: string[] = []

  for await (const entry of Deno.readDir(dir)) {
    const path = join(dir, entry.name)
    if (entry.isDirectory) {
      backupFiles.push(...await findBackupFiles(path))
    } else if (entry.isFile && entry.name.endsWith('.backup')) {
      backupFiles.push(path)
    }
  }

  return backupFiles
}

/**
 * Restores all backup files to their original locations and then removes the backup files
 */
async function reset(): Promise<void> {
  console.log('🔄 Restoring backup files...')

  try {
    // Ensure backups directory exists
    try {
      await Deno.stat(config.backupsDir)
    } catch (error) {
      if (error instanceof Deno.errors.NotFound) {
        console.log('❓ No backup directory found. Nothing to restore.')
        return
      }
      throw error
    }

    // Find all backup files recursively
    const backupPaths = await findBackupFiles(config.backupsDir)
    let restoredCount = 0

    // Process each file
    for (const backupPath of backupPaths) {
      // Get the relative path from the backups directory
      const relativePath = backupPath.slice(config.backupsDir.length + 1)
      // Remove the .backup extension
      const originalPath = relativePath.slice(0, -7)
      const targetPath = workspaceDir ? join(workspaceDir, originalPath) : `./${originalPath}`

      try {
        // Ensure target directory exists
        await ensureDir(dirname(targetPath))
        // Copy backup to original location
        await Deno.copyFile(backupPath, targetPath)
        console.log(`✅ Restored ${targetPath} from ${backupPath}`)
        restoredCount++
      } catch (error) {
        console.error(`❌ Failed to restore ${targetPath}:`, error)
      }
    }

    if (restoredCount === 0) {
      console.log('❓ No backup files found to restore.')
    } else {
      console.log(`🎉 Restored ${restoredCount} file(s) from backups.`)

      // Remove backup files after successful restoration
      console.log('🧹 Removing backup files...')
      let removedCount = 0

      for (const backupFile of backupPaths) {
        try {
          await Deno.remove(backupFile)
          console.log(`🗑️ Removed ${backupFile}`)
          removedCount++
        } catch (error) {
          console.error(`❌ Failed to remove ${backupFile}:`, error)
        }
      }

      console.log(`🎉 Removed ${removedCount} backup file(s).`)
    }
  } catch (error) {
    console.error('❌ Error restoring backup files:', error)
  }
}

// Get workspace directory from environment if set
const workspaceDir = Deno.env.get('DENO_KIT_WORKSPACE')

// Run the script if it's the main module
if (import.meta.main) {
  await reset()
}

// Export the function at the bottom of the file
export { reset }
