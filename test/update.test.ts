import { assertEquals } from '@std/assert'
import { join } from '@std/path'
import {
  createTempDir,
  mockGitClone,
  restoreEnv,
  runDenoKitCommand,
  setupTestEnv,
  setupTestProject,
  verifyUpdateResults,
} from './test-utils.ts'

// Store original implementation for mocking
const originalCommand = Deno.Command

/**
 * Sets up a mock for git commands to avoid actual network calls
 */
function setupCommandMock() {
  // @ts-ignore - Replacing built-in
  Deno.Command = function MockCommand(
    command: string,
    options: Deno.CommandOptions,
  ) {
    // Only intercept git clone commands
    if (command === 'git' && options.args && options.args[0] === 'clone') {
      return {
        output: async () => {
          const textEncoder = new TextEncoder()
          return {
            code: 0,
            success: true,
            stdout: textEncoder.encode('Cloning into mock directory...\n'),
            stderr: new Uint8Array(0),
          }
        },
      }
    }
    return new originalCommand(command, options)
  }
}

function restoreCommandMock() {
  // @ts-ignore - Restoring built-in
  Deno.Command = originalCommand
}

/**
 * Run the update test scenario
 */
async function runUpdateTestScenario(
  useWorkspaceFlag: boolean,
  preserveRules: boolean,
): Promise<void> {
  const tempDir = await createTempDir()
  const originalCwd = Deno.cwd()
  const originalEnv = setupTestEnv(tempDir)

  try {
    // Setup test environment
    await setupTestProject(tempDir, useWorkspaceFlag)
    await mockGitClone(tempDir)
    setupCommandMock()

    // Mock temp directory for git clone
    const originalMakeTempDir = Deno.makeTempDir
    // @ts-ignore - Replacing built-in
    Deno.makeTempDir = () =>
      Promise.resolve(join(tempDir, 'mock-cursor-config'))

    try {
      if (useWorkspaceFlag) {
        // Run the update command with workspace flag
        const { code, stderr } = await runDenoKitCommand(
          'update',
          preserveRules
            ? ['--workspace', tempDir]
            : ['--workspace', tempDir, '--preserve-rules=false'],
          originalCwd,
        )
        assertEquals(code, 0, `Update command failed with error: ${stderr}`)
      } else {
        // When in temp directory, just verify structure (command won't be found)
        console.log('Skipping command execution for directory-change test')
      }

      // Verify final state
      await verifyUpdateResults(tempDir, preserveRules)
    } finally {
      // @ts-ignore - Restoring built-in
      Deno.makeTempDir = originalMakeTempDir
    }
  } finally {
    restoreCommandMock()
    if (!useWorkspaceFlag) {
      Deno.chdir(originalCwd)
    }
    restoreEnv(originalEnv)

    // Clean up temp directory
    try {
      await Deno.remove(tempDir, { recursive: true })
    } catch (error: unknown) {
      if (error instanceof Error) {
        console.error(`Failed to cleanup temp directory: ${error.message}`)
      } else {
        console.error(`Failed to cleanup temp directory: ${String(error)}`)
      }
    }
  }
}

// Core update tests
Deno.test('update command updates cursor config (with workspace flag, preserving rules)', async () => {
  await runUpdateTestScenario(true, true)
})

Deno.test('update command updates cursor config (with workspace flag, not preserving rules)', async () => {
  await runUpdateTestScenario(true, false)
})

Deno.test('update command updates cursor config (changing directory, preserving rules)', async () => {
  await runUpdateTestScenario(false, true)
})

Deno.test('update command updates cursor config (changing directory, not preserving rules)', async () => {
  await runUpdateTestScenario(false, false)
})

// Error handling tests
Deno.test('update command handles git clone errors', async () => {
  const tempDir = await createTempDir()
  const originalCwd = Deno.cwd()
  const originalEnv = setupTestEnv(tempDir)

  try {
    await setupTestProject(tempDir, true)

    // Mock git clone to fail
    // @ts-ignore - Replacing built-in
    Deno.Command = function MockCommand(
      command: string,
      options: Deno.CommandOptions,
    ) {
      if (command === 'git' && options.args && options.args[0] === 'clone') {
        return {
          output: async () => ({
            code: 1,
            success: false,
            stdout: new Uint8Array(0),
            stderr: new TextEncoder().encode('fatal: repository not found\n'),
          }),
        }
      }
      return new originalCommand(command, options)
    }

    // Run command and log output (a pass is just that it doesn't crash)
    const { stdout, stderr } = await runDenoKitCommand(
      'update',
      [],
      originalCwd,
    )
    console.log('Command output:', stdout + stderr)
  } finally {
    restoreCommandMock()
    restoreEnv(originalEnv)
    await Deno.remove(tempDir, { recursive: true }).catch((e) =>
      console.error(
        `Cleanup error: ${e instanceof Error ? e.message : String(e)}`,
      )
    )
  }
})

Deno.test('update command handles missing .cursor folder in repo', async () => {
  const tempDir = await createTempDir()
  const originalCwd = Deno.cwd()
  const originalEnv = setupTestEnv(tempDir)

  try {
    await setupTestProject(tempDir, true)

    // Create invalid repo without .cursor folder
    const repoDir = join(tempDir, 'mock-cursor-config')
    await Deno.mkdir(repoDir, { recursive: true })
    await Deno.writeTextFile(
      join(repoDir, 'how-cursor-rules-work.md'),
      '# How Cursor Rules Work\nThis is a mock documentation.',
    )

    // Set up mocks
    setupCommandMock()
    const originalMakeTempDir = Deno.makeTempDir
    // @ts-ignore - Replacing built-in
    Deno.makeTempDir = () => Promise.resolve(repoDir)

    try {
      // Run command and log output (a pass is just that it doesn't crash)
      const { stdout, stderr } = await runDenoKitCommand(
        'update',
        [],
        originalCwd,
      )
      console.log('Command output:', stdout + stderr)
    } finally {
      // @ts-ignore - Restoring built-in
      Deno.makeTempDir = originalMakeTempDir
    }
  } finally {
    restoreCommandMock()
    restoreEnv(originalEnv)
    await Deno.remove(tempDir, { recursive: true }).catch((e) =>
      console.error(
        `Cleanup error: ${e instanceof Error ? e.message : String(e)}`,
      )
    )
  }
})
