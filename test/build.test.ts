import { assert } from '@std/assert'
import { dirname, fromFileUrl, join } from '@std/path'
import { exists } from '@std/fs'
import terminal, { LogLevelEnum } from '../src/terminal/mod.ts'
import { decompress } from '../src/utils/compression.ts'

// Configure terminal for test environment
terminal.setConfig({
  environment: 'test',
  colors: false,
  level: LogLevelEnum.INFO,
})
terminal.start()
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
  const logFn = forcePrint
    ? terminal.print.bind(terminal)
    : (isError ? terminal.error.bind(terminal) : terminal.print.bind(terminal))

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
  const tempTemplatesDir = await Deno.makeTempDir()

  try {
    // Build the binary (will use bin/ directory by default now)
    const buildProcess = new Deno.Command(Deno.execPath(), {
      args: ['run', '-A', './scripts/build.ts'],
      stdout: 'piped',
      stderr: 'piped',
      cwd: projectRoot,
      env: { DENO_KIT_ENV: 'test' },
    }).spawn()

    // Run the process and stream its output
    const [_buildStdout, _buildStderr, status] = await runWithOutput(
      buildProcess,
      true,
    )
    assert(status.success, 'Build process failed')

    // Use 'deno-kit' as the binary name since that's what build.ts uses
    const binaryName = 'deno-kit'

    // Get appropriate platform for current OS
    let currentPlatform: string
    if (Deno.build.os === 'windows') {
      currentPlatform = 'windows-x86_64'
    } else if (Deno.build.os === 'darwin') {
      currentPlatform = Deno.build.arch === 'aarch64'
        ? 'macos-aarch64'
        : 'macos-x86_64'
    } else if (Deno.build.os === 'linux') {
      currentPlatform = Deno.build.arch === 'aarch64'
        ? 'linux-aarch64'
        : 'linux-x86_64'
    } else {
      // Default to macos-x86_64 for other platforms
      currentPlatform = 'macos-x86_64'
    }

    // In test mode, only the current platform binary is built (no zip files)
    // Just verify the binary exists
    const currentBinaryPath = join(
      binDir,
      `${binaryName}-${currentPlatform}${
        currentPlatform.includes('windows') ? '.exe' : ''
      }`,
    )
    const binaryExists = await exists(currentBinaryPath)
    assert(binaryExists, `Binary not found at ${currentBinaryPath}`)

    // In test mode, copy the binary directly instead of extracting from zip
    const extractedBinaryPath = join(
      tempBinaryDir,
      `${binaryName}-${currentPlatform}${
        currentPlatform.includes('windows') ? '.exe' : ''
      }`,
    )

    terminal.log(`Copying binary from: ${currentBinaryPath}`)
    await Deno.copyFile(currentBinaryPath, extractedBinaryPath)

    // Make sure binary is executable
    if (Deno.build.os !== 'windows') {
      await Deno.chmod(extractedBinaryPath, 0o755)
    }

    terminal.log('\n=== Debug: Checking binary directory contents ===')
    for await (const entry of Deno.readDir(tempBinaryDir)) {
      const filePath = join(tempBinaryDir, entry.name)
      const fileInfo = await Deno.stat(filePath)
      terminal.log(`- ${entry.name} (${fileInfo.size} bytes)`)
    }
    terminal.log('=== End Debug ===\n')

    // Define the path to the templates.zip created by the build and extract it
    const templatesZipPath = join(binDir, 'templates.zip')
    const templatesZipExists = await exists(templatesZipPath)
    assert(
      templatesZipExists,
      `templates.zip should exist at ${templatesZipPath} after build`,
    )

    // Extract templates.zip to the temporary templates directory
    await decompress(templatesZipPath, tempTemplatesDir)

    terminal.log('\n=== Debug: Checking extracted templates directory ===')
    for await (const entry of Deno.readDir(tempTemplatesDir)) {
      terminal.log(`- ${entry.name}`)
    }
    terminal.log('=== End Debug ===\n')

    // Setup environment variables for the test
    const testEnv: Record<string, string> = {
      DENO_KIT_TEMPLATES_PATH: tempTemplatesDir, // Use extracted templates path
      DENO_KIT_TEMPLATE_PACKAGE_NAME: '@test/project',
      DENO_KIT_TEMPLATE_PACKAGE_VERSION: '0.1.0',
      DENO_KIT_ENV: 'test',
      DENO_KIT_TEMPLATE_PACKAGE_AUTHOR_NAME: 'Test User',
      DENO_KIT_TEMPLATE_PACKAGE_AUTHOR_EMAIL: 'test@example.com',
      DENO_KIT_TEMPLATE_PACKAGE_DESCRIPTION: 'Test project description',
      DENO_KIT_TEMPLATE_PACKAGE_GITHUB_USER: 'test-org',
      DENO_KIT_TEMPLATE_PROJECT_TYPE: 'cli',
      DENO_KIT_TEMPLATE_CREATE_GITHUB_REPO: 'false',
      DENO_KIT_TEMPLATE_GITHUB_REPO_PUBLIC: 'false',
    }

    // Run the init command with workspace flag
    const initProcess = new Deno.Command(extractedBinaryPath, {
      args: ['init', '--workspace-path', tempWorkspaceDir],
      stdout: 'piped',
      stderr: 'piped',
      env: testEnv,
    }).spawn()

    // Run the init process and stream its output
    const [_initStdout, initStderr, initStatus] = await runWithOutput(
      initProcess,
      true,
    )
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
      await Deno.remove(tempWorkspaceDir, { recursive: true })
      await Deno.remove(tempBinaryDir, { recursive: true })
      await Deno.remove(tempTemplatesDir, { recursive: true })
    } catch (error) {
      terminal.warn(`Failed to clean up temporary directories: ${error}`)
    }
  }
})
