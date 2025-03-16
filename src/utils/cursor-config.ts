import { join, resolve } from '@std/path'

/**
 * Executes the remote cursor config setup script from GitHub
 *
 * This fetches and executes the script from:
 * https://raw.githubusercontent.com/zackiles/cursor-config/main/install.sh
 *
 * @param {string} workspaceDir - Optional workspace directory. If not provided, uses current working directory.
 * @returns {Promise<boolean>} - True if successful, false otherwise
 */
export async function setupOrUpdateCursorConfig(workspaceDir?: string): Promise<boolean> {
  console.log('🔄 Setting up Cursor AI configuration...')

  // Get the absolute path of the workspace directory
  const targetDir = resolve(workspaceDir || Deno.cwd())
  const scriptPath = join(targetDir, 'cursor-config-install.sh')

  try {
    // Fetch the script content
    console.log('🔄 Fetching cursor-config installation script...')
    const response = await fetch(
      'https://raw.githubusercontent.com/zackiles/cursor-config/main/install.sh',
    )

    if (!response.ok) {
      throw new Error(`Failed to fetch script: ${response.status} ${response.statusText}`)
    }

    const scriptContent = await response.text()

    // Write the script to a file
    await Deno.writeTextFile(scriptPath, scriptContent)

    // Make the script executable on Unix-like systems
    if (Deno.build.os !== 'windows') {
      await Deno.chmod(scriptPath, 0o755)
    }

    // Execute the script
    console.log(`🔄 Executing cursor-config installation script in ${targetDir}...`)

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
    console.log(textDecoder.decode(output.stdout))

    const stderrOutput = textDecoder.decode(output.stderr)
    if (stderrOutput && !output.success) {
      console.error(stderrOutput)
      return false
    }

    console.log('✅ Cursor AI configuration setup completed successfully')
    return true
  } catch (error) {
    console.warn(
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
        console.log('🧹 Cleaned up temporary installation script')
      }
    } catch {
      // Ignore errors if file doesn't exist or can't be removed
    }
  }
}
