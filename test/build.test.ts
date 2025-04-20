import { assert } from '@std/assert'
import { join } from '@std/path'
import { exists } from '@std/fs'
import { Uint8ArrayReader, Uint8ArrayWriter, ZipReader } from '@zip-js/zip-js'
import type { Entry } from '@zip-js/zip-js'
import logger from '../src/utils/logger.ts'

/**
 * Streams process output and collects it into a string
 * @param stream - ReadableStream to process
 * @param isError - Whether this is an error stream (for output)
 * @param forcePrint - Whether to force using print regardless of stream type
 * @returns Promise that resolves to the collected output
 */
async function streamOutput(
  stream: ReadableStream<Uint8Array>,
  isError = false,
  forcePrint = false,
): Promise<string> {
  let output = ''
  const decoder = new TextDecoder()
  const logFn = forcePrint ? logger.print : (isError ? logger.error : logger.print)

  for await (const chunk of stream) {
    const text = decoder.decode(chunk)
    output += text
    logFn(text)
  }

  return output
}

/**
 * Runs a command and streams its output in real-time
 * @param process - Spawned Deno.ChildProcess
 * @param forcePrintAll - Whether to force all output to use print
 * @returns Promise resolving to [stdout, stderr, status]
 */
async function runWithOutput(
  process: Deno.ChildProcess,
  forcePrintAll = false,
): Promise<[string, string, Deno.CommandStatus]> {
  // Process both streams concurrently and wait for completion
  const [stdout, stderr] = await Promise.all([
    streamOutput(process.stdout, false, forcePrintAll),
    streamOutput(process.stderr, true, forcePrintAll),
  ])

  // Wait for process to finish and return all results
  const status = await process.status
  return [stdout, stderr, status]
}

Deno.test('Build and run kit binary', async () => {
  // Create a temp directory for the binary
  const tempBinaryDir = await Deno.makeTempDir()
  // Create a separate temp directory for the workspace
  const tempWorkspaceDir = await Deno.makeTempDir()
  // Create a temp directory for extracting the zip
  const tempExtractDir = await Deno.makeTempDir()

  try {
    // Build the binary with the temporary directory as the output
    // This overrides the default 'bin' directory in the build script
    const buildProcess = new Deno.Command(Deno.execPath(), {
      args: ['run', '-A', './scripts/build.ts', tempBinaryDir],
      stdout: 'piped',
      stderr: 'piped',
    }).spawn()

    // Run the process and stream its output
    const [_buildStdout, _buildStderr, status] = await runWithOutput(buildProcess, true)
    assert(status.success, 'Build process failed')

    // Use 'deno-kit' as the binary name since that's what build.ts uses
    const binaryName = 'deno-kit'

    // Check that all platform zip files were created
    const expectedPlatforms = [
      'windows-x86_64',
      'macos-x86_64',
      'macos-aarch64',
      'linux-x86_64',
      'linux-aarch64',
    ]

    // Get appropriate platform for current OS
    let currentPlatform: string
    if (Deno.build.os === 'windows') {
      currentPlatform = 'windows-x86_64'
    } else if (Deno.build.os === 'darwin') {
      currentPlatform = Deno.build.arch === 'aarch64' ? 'macos-aarch64' : 'macos-x86_64'
    } else if (Deno.build.os === 'linux') {
      currentPlatform = Deno.build.arch === 'aarch64' ? 'linux-aarch64' : 'linux-x86_64'
    } else {
      // Default to macos-x86_64 for other platforms
      currentPlatform = 'macos-x86_64'
    }

    // Verify all zip files exist
    for (const platform of expectedPlatforms) {
      const zipPath = join(tempBinaryDir, `${binaryName}-${platform}.zip`)
      const zipExists = await exists(zipPath)
      assert(zipExists, `Zip file not found at ${zipPath}`)
    }

    // Find the zip file for the current platform and extract it
    const currentZipPath = join(tempBinaryDir, `${binaryName}-${currentPlatform}.zip`)
    logger.log(`Extracting zip for current platform: ${currentZipPath}`)

    // Extract the zip file
    const zipData = await Deno.readFile(currentZipPath)
    const zipReader = new ZipReader(new Uint8ArrayReader(zipData))
    const entries = await zipReader.getEntries()

    if (entries.length === 0) {
      throw new Error(`No entries found in zip file: ${currentZipPath}`)
    }

    // Extract the first entry (should be the binary)
    const entry = entries[0] as Entry

    if (!entry || typeof entry.getData !== 'function') {
      throw new Error(`Invalid entry in zip file: ${currentZipPath}`)
    }

    const binaryData = await entry.getData(new Uint8ArrayWriter())
    const extractedBinaryPath = join(tempExtractDir, entry.filename)
    await Deno.writeFile(extractedBinaryPath, binaryData)

    // Make sure it's executable
    if (Deno.build.os !== 'windows') {
      await Deno.chmod(extractedBinaryPath, 0o755)
    }

    logger.log(`Extracted binary to: ${extractedBinaryPath}`)

    // Run the init command with workspace flag
    const initProcess = new Deno.Command(extractedBinaryPath, {
      args: ['init', '--workspace', tempWorkspaceDir],
      stdout: 'piped',
      stderr: 'piped',
      cwd: tempExtractDir,
      env: {
        DENO_KIT_ENV: 'test',
        DENO_KIT_PACKAGE_NAME: '@test/project',
        DENO_KIT_PACKAGE_VERSION: '0.1.0',
        DENO_KIT_PACKAGE_AUTHOR_NAME: 'Test User',
        DENO_KIT_PACKAGE_AUTHOR_EMAIL: 'test@example.com',
        DENO_KIT_PACKAGE_DESCRIPTION: 'Test project description',
        DENO_KIT_PACKAGE_GITHUB_USER: 'test-org',
      },
    }).spawn()

    // Run the init process and stream its output
    const [_initStdout, initStderr, initStatus] = await runWithOutput(initProcess, true)
    assert(initStatus.success, `Init command failed with stderr: ${initStderr}`)

    // Verify project creation in the workspace directory
    const readmeExists = await exists(join(tempWorkspaceDir, 'README.md'))
    assert(readmeExists, 'README.md should exist in workspace')

    const denoJsonExists = await exists(join(tempWorkspaceDir, 'deno.jsonc'))
    assert(denoJsonExists, 'deno.jsonc should exist in workspace')

    const srcDirExists = await exists(join(tempWorkspaceDir, 'src'))
    assert(srcDirExists, 'src directory should exist in workspace')
  } finally {
    // Clean up all temp directories
    try {
      await Deno.remove(tempBinaryDir, { recursive: true })
      await Deno.remove(tempWorkspaceDir, { recursive: true })
      await Deno.remove(tempExtractDir, { recursive: true })
    } catch (error) {
      logger.warn(`Failed to clean up temporary directories: ${error}`)
    }
  }
})
