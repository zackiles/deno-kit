#!/usr/bin/env -S deno run --allow-all

import { emptyDir, ensureDir, walk } from '@std/fs'
import { basename, join } from '@std/path'
import { parseArgs as parse } from '@std/cli'

// GitHub repository containing the cursor config files
const CURSOR_CONFIG_REPO = 'https://github.com/zackiles/cursor-config'

interface UpdateOptions {
  /** Whether to preserve existing files in .cursor/rules that don't exist in the repo */
  preserveExistingRules?: boolean
}

/**
 * Fetches and copies the .cursor folder from the cursor-config GitHub repository
 */
async function update(options: UpdateOptions = {}): Promise<void> {
  console.log('🔄 Fetching and copying Cursor configuration from GitHub...')

  const tempDir = await Deno.makeTempDir({
    prefix: 'deno-kit',
  })

  try {
    // Clone the repository
    console.log(`📥 Cloning ${CURSOR_CONFIG_REPO} into temporary directory...`)
    const cloneCommand = new Deno.Command('git', {
      args: ['clone', '--depth', '1', CURSOR_CONFIG_REPO, tempDir],
      stdout: 'piped',
      stderr: 'piped',
    })

    const cloneOutput = await cloneCommand.output()
    if (!cloneOutput.success) {
      const textDecoder = new TextDecoder()
      console.error(
        '❌ Failed to clone repository:',
        textDecoder.decode(cloneOutput.stderr),
      )
      return
    }

    // Check if .cursor folder exists in the cloned repository
    const sourceCursorFolder = join(tempDir, '.cursor')
    try {
      await Deno.stat(sourceCursorFolder)
    } catch (error) {
      if (error instanceof Deno.errors.NotFound) {
        console.error('❌ .cursor folder not found in the cloned repository')
        return
      }
      throw error
    }

    const targetCursorFolder = './.cursor'
    const targetRulesFolder = join(targetCursorFolder, 'rules')
    const sourceRulesFolder = join(sourceCursorFolder, 'rules')

    // Create .cursor and .cursor/rules folders if they don't exist
    await ensureDir(targetRulesFolder)

    // Copy the documentation file to .cursor directory
    const sourceDocsFile = join(tempDir, 'how-cursor-rules-work.md')
    const targetDocsFile = join(targetCursorFolder, 'how-cursor-rules-work.md')
    try {
      await Deno.copyFile(sourceDocsFile, targetDocsFile)
      console.log('📝 Copied documentation file to .cursor directory')
    } catch (error) {
      console.error('⚠️ Failed to copy documentation file:', error)
    }

    // Copy files based on the preservation strategy
    if (options.preserveExistingRules) {
      // Copy all non-rules files and folders first
      for await (const entry of walk(sourceCursorFolder, { maxDepth: 1 })) {
        if (entry.isFile && basename(entry.path) !== 'rules') {
          await Deno.copyFile(
            entry.path,
            join(targetCursorFolder, basename(entry.path)),
          )
        }
      }

      // Copy rules files, preserving existing ones
      for await (const entry of walk(sourceRulesFolder)) {
        if (entry.isFile) {
          const relativePath = entry.path.substring(
            sourceRulesFolder.length + 1,
          )
          const targetPath = join(targetRulesFolder, relativePath)
          await ensureDir(
            join(
              targetRulesFolder,
              relativePath.split('/').slice(0, -1).join('/'),
            ),
          )
          await Deno.copyFile(entry.path, targetPath)
        }
      }
    } else {
      // Remove existing .cursor folder and copy everything
      await emptyDir(targetCursorFolder)
      await Deno.remove(targetCursorFolder, { recursive: true })

      const copyCommand = new Deno.Command('cp', {
        args: ['-r', sourceCursorFolder, './'],
        stdout: 'piped',
        stderr: 'piped',
      })

      const copyOutput = await copyCommand.output()
      if (!copyOutput.success) {
        const textDecoder = new TextDecoder()
        console.error(
          '❌ Failed to copy .cursor folder:',
          textDecoder.decode(copyOutput.stderr),
        )
        return
      }

      // Copy documentation file after recreating the .cursor folder
      try {
        await Deno.copyFile(sourceDocsFile, targetDocsFile)
        console.log('📝 Copied documentation file to .cursor directory')
      } catch (error) {
        console.error('⚠️ Failed to copy documentation file:', error)
      }
    }

    console.log('✅ Successfully copied .cursor folder to project root')
  } catch (error) {
    console.error('❌ Error fetching and copying cursor configuration:', error)
  } finally {
    // Clean up - remove temporary directory
    try {
      await Deno.remove(tempDir, { recursive: true })
      console.log('🧹 Cleaned up temporary files')
    } catch (error) {
      console.error('⚠️ Error cleaning up temporary directory:', error)
    }
  }
}

if (import.meta.main) {
  const flags = parse(Deno.args, {
    boolean: ['preserve-rules'],
    default: { 'preserve-rules': true },
  })

  await update({
    preserveExistingRules: flags['preserve-rules'],
  })
}

export { update }
export type { UpdateOptions }
