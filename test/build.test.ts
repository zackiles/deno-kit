import { assert, assertEquals } from '@std/assert'
import { dirname, fromFileUrl, join } from '@std/path'
import { exists } from '@std/fs'

Deno.test('Build and run kit binary', async () => {
  // Create a temp directory for the binary
  const tempBinaryDir = await Deno.makeTempDir()
  // Create a separate temp directory for the workspace
  const tempWorkspaceDir = await Deno.makeTempDir()

  try {
    const outputPath = join(tempBinaryDir, 'kit')

    // Build the binary with the temporary directory as the output
    const buildProcess = new Deno.Command(Deno.execPath(), {
      args: ['task', 'build', tempBinaryDir],
      stdout: 'piped',
      stderr: 'piped',
    })
    const buildOutput = await buildProcess.output()

    // Capture and print the build logs
    const buildStdout = new TextDecoder().decode(buildOutput.stdout)
    const buildStderr = new TextDecoder().decode(buildOutput.stderr)
    console.log('Build stdout:', buildStdout)
    console.log('Build stderr:', buildStderr)
    assert(buildOutput.success, 'Build process failed')

    // Add a delay before checking for the binary's existence
    await new Promise((resolve) => setTimeout(resolve, 100))

    // Check if the binary exists
    const binaryExists = await exists(outputPath)
    assert(binaryExists, 'Binary was not created')

    // Run the init command with workspace flag
    const initProcess = new Deno.Command(outputPath, {
      args: ['init', '--workspace', tempWorkspaceDir],
      stdout: 'piped',
      stderr: 'piped',
      cwd: tempBinaryDir,
      env: {
        DENO_KIT_ENV: 'test',
        DENO_KIT_PACKAGE_NAME: '@test/project',
        DENO_KIT_PACKAGE_VERSION: '0.1.0',
        DENO_KIT_PACKAGE_AUTHOR_NAME: 'Test User',
        DENO_KIT_PACKAGE_AUTHOR_EMAIL: 'test@example.com',
        DENO_KIT_PACKAGE_DESCRIPTION: 'Test project description',
        DENO_KIT_PACKAGE_GITHUB_USER: 'test-org',
      },
    })
    const initOutput = await initProcess.output()
    const initStdout = new TextDecoder().decode(initOutput.stdout)
    const initStderr = new TextDecoder().decode(initOutput.stderr)
    console.log('Init stdout:', initStdout)
    console.log('Init stderr:', initStderr)
    assert(initOutput.success, `Init command failed with stderr: ${initStderr}`)

    // Verify project creation in the workspace directory
    const readmeExists = await exists(join(tempWorkspaceDir, 'README.md'))
    assert(readmeExists, 'README.md should exist in workspace')

    const denoJsonExists = await exists(join(tempWorkspaceDir, 'deno.jsonc'))
    assert(denoJsonExists, 'deno.jsonc should exist in workspace')

    const srcDirExists = await exists(join(tempWorkspaceDir, 'src'))
    assert(srcDirExists, 'src directory should exist in workspace')
  } finally {
    // Clean up both temp directories
    try {
      await Deno.remove(tempBinaryDir, { recursive: true })
      await Deno.remove(tempWorkspaceDir, { recursive: true })
    } catch (error) {
      console.warn(`Failed to clean up temporary directories: ${error}`)
    }
  }
})
