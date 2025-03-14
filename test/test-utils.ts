import { dirname, join } from '@std/path'
import { assertEquals, assertExists } from '@std/assert'
import { TEMPLATE_MAPPINGS } from '../src/commands/setup.ts'

/**
 * Dynamically generate expected files from TEMPLATE_MAPPINGS
 * This ensures the test automatically updates when new templates are added
 */
export async function getExpectedFiles(): Promise<string[]> {
  const expectedFiles: string[] = []

  // Extract destination paths from TEMPLATE_MAPPINGS
  for (const destPath of Object.values(TEMPLATE_MAPPINGS) as string[]) {
    // Remove leading './' if present
    const normalizedPath = destPath.startsWith('./')
      ? destPath.slice(2)
      : destPath
    expectedFiles.push(normalizedPath)
  }

  return expectedFiles
}

/**
 * Creates and returns a temporary directory for testing
 * @param prefix Prefix for the temp directory name
 */
export async function createTempDir(
  prefix = 'deno-kit-test-',
): Promise<string> {
  return await Deno.makeTempDir({ prefix })
}

/**
 * Sets up test environment variables
 * @param tempDir Path to the temporary test directory
 * @returns Object containing original environment variables
 */
export function setupTestEnv(tempDir: string): Record<string, string> {
  // Store original environment variables
  const originalEnv = { ...Deno.env.toObject() }

  // Set environment variables for automated responses
  Deno.env.set('DENO_KIT_TEST_MODE', 'true')
  Deno.env.set('DENO_KIT_PACKAGE_NAME', '@test/example')
  Deno.env.set('DENO_KIT_VERSION', '0.1.0')
  Deno.env.set('DENO_KIT_AUTHOR_NAME', 'Test Author')
  Deno.env.set('DENO_KIT_AUTHOR_EMAIL', 'test@example.com')
  Deno.env.set('DENO_KIT_DESCRIPTION', 'A test package')
  Deno.env.set('DENO_KIT_GITHUB_USER', 'testorg')
  Deno.env.set('DENO_KIT_WORKSPACE', tempDir)

  return originalEnv
}

/**
 * Restores original environment variables
 * @param originalEnv Original environment variables to restore
 */
export function restoreEnv(originalEnv: Record<string, string>): void {
  for (const key of Object.keys(Deno.env.toObject())) {
    if (!originalEnv[key]) {
      Deno.env.delete(key)
    } else {
      Deno.env.set(key, originalEnv[key])
    }
  }
}

/**
 * Runs the deno-kit command with specified command and arguments
 * @param command The deno-kit command to run
 * @param args Additional arguments to pass to the command
 * @param cwd The current working directory to run the command from
 * @returns The result code and output from the command
 */
export async function runDenoKitCommand(
  command: string,
  args: string[] = [],
  cwd: string = Deno.cwd(),
): Promise<{ code: number; stdout: string; stderr: string }> {
  // Always use the absolute path to the command file from the current Deno.cwd()
  // This ensures we find the file regardless of which directory we're in
  const commandPath = join(Deno.cwd(), 'src', 'commands', `${command}.ts`)

  const cmd = new Deno.Command(Deno.execPath(), {
    args: [
      'run',
      '--allow-all',
      commandPath,
      ...args,
    ],
    env: Deno.env.toObject(),
    cwd, // We still run the command in the specified directory
    stdout: 'piped',
    stderr: 'piped',
  })

  const output = await cmd.output()
  const textDecoder = new TextDecoder()

  return {
    code: output.code,
    stdout: textDecoder.decode(output.stdout),
    stderr: textDecoder.decode(output.stderr),
  }
}

/**
 * Setup a basic project structure in the given directory
 * This includes running the setup command and preparing for update testing
 * @param tempDir The temporary directory to setup
 * @param useWorkspaceFlag Whether to use the workspace flag or change directory
 */
export async function setupTestProject(
  tempDir: string,
  useWorkspaceFlag = true,
): Promise<void> {
  const originalCwd = Deno.cwd()

  try {
    // For testing purposes, we'll create a minimum .cursor directory structure
    // instead of running the actual setup command which adds complexity
    const cursorDir = join(tempDir, '.cursor')
    await Deno.mkdir(join(cursorDir, 'rules'), { recursive: true })

    // Create a test rule file to verify preservation
    const testRulePath = join(cursorDir, 'rules', 'test-rule.mdc')
    await Deno.writeTextFile(testRulePath, 'Test rule content')

    // Create a basic documentation file
    await Deno.writeTextFile(
      join(cursorDir, 'how-cursor-rules-work.md'),
      '# How Cursor Rules Work\nOriginal documentation.',
    )
  } finally {
    // Restore original working directory if needed
    if (!useWorkspaceFlag && Deno.cwd() !== originalCwd) {
      Deno.chdir(originalCwd)
    }
  }
}

/**
 * Mock git command for testing without actual GitHub access
 * @param tempDir The temporary directory where to create the mocked content
 */
export async function mockGitClone(tempDir: string): Promise<void> {
  // Create a mock cursor-config repository structure
  const repoDir = join(tempDir, 'mock-cursor-config')
  const cursorDir = join(repoDir, '.cursor')
  const rulesDir = join(cursorDir, 'rules')

  await Deno.mkdir(rulesDir, { recursive: true })

  // Create mock files
  await Deno.writeTextFile(
    join(repoDir, 'how-cursor-rules-work.md'),
    '# How Cursor Rules Work\nThis is a mock documentation.',
  )

  // Create some mock rules
  await Deno.writeTextFile(
    join(rulesDir, 'sample-rule.mdc'),
    'This is a sample rule content.',
  )

  await Deno.writeTextFile(
    join(rulesDir, 'another-rule.mdc'),
    'This is another rule content.',
  )

  // Create a nested rule for testing subdirectories
  await Deno.mkdir(join(rulesDir, 'nested'), { recursive: true })
  await Deno.writeTextFile(
    join(rulesDir, 'nested', 'nested-rule.mdc'),
    'This is a nested rule content.',
  )
}

/**
 * Verify that the update process worked correctly
 * @param tempDir The temporary directory where the update was performed
 * @param preserveRules Whether preserving rules was enabled
 */
export async function verifyUpdateResults(
  tempDir: string,
  preserveRules = true,
): Promise<void> {
  const cursorDir = join(tempDir, '.cursor')
  const rulesDir = join(cursorDir, 'rules')

  try {
    // Verify .cursor directory exists
    const cursorDirInfo = await Deno.stat(cursorDir)
    assertExists(cursorDirInfo, '.cursor directory should exist')
    assertEquals(
      cursorDirInfo.isDirectory,
      true,
      '.cursor should be a directory',
    )

    // Verify rules directory exists
    const rulesDirInfo = await Deno.stat(rulesDir)
    assertExists(rulesDirInfo, '.cursor/rules directory should exist')
    assertEquals(
      rulesDirInfo.isDirectory,
      true,
      '.cursor/rules should be a directory',
    )

    // If preserving rules, check that test-rule.mdc still exists
    if (preserveRules) {
      const testRulePath = join(rulesDir, 'test-rule.mdc')
      try {
        const testRuleInfo = await Deno.stat(testRulePath)
        assertExists(
          testRuleInfo,
          'test-rule.mdc should still exist when preserving rules',
        )
        assertEquals(
          testRuleInfo.isFile,
          true,
          'test-rule.mdc should be a file',
        )

        const content = await Deno.readTextFile(testRulePath)
        assertEquals(
          content,
          'Test rule content',
          'test-rule.mdc should have original content',
        )
      } catch (error) {
        if (error instanceof Deno.errors.NotFound) {
          throw new Error('test-rule.mdc was not preserved')
        }
        throw error
      }
    }

    // Verify docs file exists
    const docsFilePath = join(cursorDir, 'how-cursor-rules-work.md')
    try {
      const docsFileInfo = await Deno.stat(docsFilePath)
      assertExists(docsFileInfo, 'Documentation file should exist')
      assertEquals(
        docsFileInfo.isFile,
        true,
        'Documentation file should be a file',
      )
    } catch (error) {
      if (error instanceof Deno.errors.NotFound) {
        throw new Error('Documentation file was not found')
      }
      throw error
    }
  } catch (error) {
    console.error(
      `Error during verification: ${
        error instanceof Error ? error.message : String(error)
      }`,
    )
    throw error
  }
}
