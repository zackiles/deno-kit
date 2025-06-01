/**
 * @module cursor-config
 *
 * Utility module for setting up and updating Cursor AI configuration.
 * This module provides functionality to fetch and execute the setup script
 * from the cursor-config repository.
 *
 * @example
 * ```ts
 * import { setupOrUpdateCursorConfig } from "./utils/cursor-config.ts"
 *
 * // Set up Cursor AI config in current directory
 * await setupOrUpdateCursorConfig()
 *
 * // Or specify a custom workspace directory
 * await setupOrUpdateCursorConfig("/path/to/project")
 * ```
 */
import { join, resolve } from '@std/path'
import logger from './logger.ts'

/**
 * Executes the remote cursor config setup script from GitHub
 *
 * This fetches and executes the script from:
 * https://raw.githubusercontent.com/zackiles/cursor-config/main/install.sh
 *
 * @param {string} workspaceDir - Optional workspace directory. If not provided, uses current working directory.
 * @returns {Promise<boolean>} - True if successful, false otherwise
 */
async function setupOrUpdateCursorConfig(
  workspaceDir?: string,
): Promise<boolean> {
  logger.log('🔄 Setting up Cursor AI configuration...')

  // Get the absolute path of the workspace directory
  const targetDir = resolve(workspaceDir || Deno.cwd())
  const scriptPath = join(targetDir, 'cursor-config-install.sh')

  try {
    // Fetch the script content
    logger.log('🔄 Fetching cursor-config installation script...')
    const response = await fetch(
      'https://raw.githubusercontent.com/zackiles/cursor-config/main/install.sh',
    )

    if (!response.ok) {
      throw new Error(
        `Failed to fetch script: ${response.status} ${response.statusText}`,
      )
    }

    const scriptContent = await response.text()

    // Write the script to a file
    await Deno.writeTextFile(scriptPath, scriptContent)

    // Make the script executable on Unix-like systems
    if (Deno.build.os !== 'windows') {
      await Deno.chmod(scriptPath, 0o755)
    }

    // Execute the script
    logger.log(
      `🔄 Executing cursor-config installation script in ${targetDir}...`,
    )

    const command = new Deno.Command(
      Deno.build.os === 'windows' ? 'bash' : 'sh',
      {
        args: [scriptPath],
        stdout: 'piped',
        stderr: 'piped',
        cwd: targetDir,
      },
    )

    const output = await command.output()

    const textDecoder = new TextDecoder()
    logger.log(textDecoder.decode(output.stdout))

    const stderrOutput = textDecoder.decode(output.stderr)
    if (stderrOutput && !output.success) {
      logger.error(stderrOutput)
      return false
    }

    logger.log('✅ Cursor AI configuration setup completed successfully')
    return true
  } catch (error) {
    logger.warn(
      '⚠️ Failed to set up Cursor AI configuration:',
      error instanceof Error ? error.message : String(error),
    )
    return false
  } finally {
    // Clean up the temporary script file
    try {
      const fileInfo = await Deno.stat(scriptPath)
      if (fileInfo.isFile) {
        await Deno.remove(scriptPath)
        logger.log('🧹 Cleaned up temporary installation script')
      }
    } catch {
      // Ignore errors if file doesn't exist or can't be removed
    }
  }
}

export { setupOrUpdateCursorConfig }
export default setupOrUpdateCursorConfig
