import { assert } from '@std/assert'
import { dirname, fromFileUrl, join } from '@std/path'
import { exists } from '@std/fs'
// NOTE: Using data-uri is a workaround to avoid an issue with the zip-js library. See https://github.com/gildas-lormeau/zip.js/issues/519
import {
  configure as configureZipJs,
  Uint8ArrayReader,
  Uint8ArrayWriter,
  ZipReader,
} from '@zip-js/zip-js/data-uri'
import type { Entry } from '@zip-js/zip-js'
import logger from '../src/utils/logger.ts'

// Configure zip-js to terminate workers immediately to avoid timer leaks
configureZipJs({
  useWebWorkers: false, // Disable web workers to prevent timer leaks
  terminateWorkerTimeout: 0, // Immediate termination of workers
})

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
  // Get project root directory
  const __dirname = dirname(fromFileUrl(import.meta.url))
  const projectRoot = join(__dirname, '..')
  const binDir = join(projectRoot, 'bin')

  // Create temp directories for workspace and binary testing
  const tempWorkspaceDir = await Deno.makeTempDir()
  const tempBinaryDir = await Deno.makeTempDir()

  let zipReader: ZipReader<Uint8ArrayReader> | null = null

  try {
    // Build the binary (will use bin/ directory by default now)
    const buildProcess = new Deno.Command(Deno.execPath(), {
      args: ['run', '-A', './scripts/build.ts'],
      stdout: 'piped',
      stderr: 'piped',
      cwd: projectRoot,
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

    // Verify all zip files exist in bin/
    for (const platform of expectedPlatforms) {
      const zipPath = join(binDir, `${binaryName}-${platform}.zip`)
      const zipExists = await exists(zipPath)
      assert(zipExists, `Zip file not found at ${zipPath}`)
    }

    // Find the zip file for the current platform
    const currentZipPath = join(binDir, `${binaryName}-${currentPlatform}.zip`)
    logger.log(`Using zip for current platform: ${currentZipPath}`)

    // Extract the zip file
    const zipData = await Deno.readFile(currentZipPath)
    zipReader = new ZipReader(new Uint8ArrayReader(zipData))
    const entries = await zipReader.getEntries()

    if (entries.length === 0) {
      throw new Error(`No entries found in zip file: ${currentZipPath}`)
    }

    // Assume the first/only entry is the binary
    const binaryEntry = entries[0] as Entry
    if (!binaryEntry || typeof binaryEntry.getData !== 'function') {
      throw new Error(`Invalid binary entry in zip file: ${currentZipPath}`)
    }

    // Extract binary to temp directory
    const binaryData = await binaryEntry.getData(new Uint8ArrayWriter())
    const binaryFileName = `${binaryName}-${currentPlatform}${
      currentPlatform.includes('windows') ? '.exe' : ''
    }`
    const extractedBinaryPath = join(tempBinaryDir, binaryFileName)
    await Deno.writeFile(extractedBinaryPath, binaryData)

    // Make sure binary is executable
    if (Deno.build.os !== 'windows') {
      await Deno.chmod(extractedBinaryPath, 0o755)
    }

    logger.log('\n=== Debug: Checking binary directory contents ===')
    for await (const entry of Deno.readDir(tempBinaryDir)) {
      const filePath = join(tempBinaryDir, entry.name)
      const fileInfo = await Deno.stat(filePath)
      logger.log(`- ${entry.name} (${fileInfo.size} bytes)`)
    }
    logger.log('=== End Debug ===\n')

    // Define the path to the templates.zip created by the build
    const templatesZipPath = join(binDir, 'templates.zip')
    const templatesZipExists = await exists(templatesZipPath)
    assert(templatesZipExists, `templates.zip should exist at ${templatesZipPath} after build`)

    // Run the init command with workspace flag from the temp binary directory
    const initProcess = new Deno.Command(extractedBinaryPath, {
      args: ['init', '--workspace', tempWorkspaceDir],
      stdout: 'piped',
      stderr: 'piped',
      env: {
        DENO_KIT_ENV: 'test',
        DENO_KIT_TEST_TEMPLATES_ZIP_PATH: templatesZipPath,
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
    // Clean up the temp directories
    try {
      if (zipReader) {
        try {
          await zipReader.close()
          // Set to null to help with garbage collection
          zipReader = null
          logger.log('Closed test zip reader.')

          // Ensure all timers and resources from zip-js are properly cleaned up
          await new Promise<void>((resolve) => {
            // Force a short delay to give time for cleanup
            setTimeout(() => {
              // Clean up any pending operations
              try {
                // Force garbage collection if available
                // @ts-expect-error - Accessing Deno.gc which may exist in certain environments
                if (typeof Deno.gc === 'function') {
                  // @ts-expect-error - Using non-standard API
                  Deno.gc()
                }
              } catch (_) {
                // Ignore if gc is not available
              }
              resolve()
            }, 100)
          })
        } catch (closeError) {
          logger.warn(`Error closing zip reader: ${closeError}`)
        }
      }

      // Clean up temp directories after ensuring all zip operations are complete
      await Deno.remove(tempWorkspaceDir, { recursive: true })
      await Deno.remove(tempBinaryDir, { recursive: true })
    } catch (error) {
      logger.warn(`Failed to clean up temporary directories: ${error}`)
    }
  }
})
