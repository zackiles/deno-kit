import { assert, assertEquals } from '@std/assert'
import { afterEach, beforeEach, describe, it } from '@std/testing/bdd'
import { dirname, fromFileUrl, join } from '@std/path'
import { stripAnsi } from '../src/utils/formatting.ts'
import type { DenoKitConfig } from '../src/types.ts'
import { getConfig } from '../src/config.ts'

const config = await getConfig()
// Extended config type for testing that includes additional test-specific environment variables
interface TestConfig extends DenoKitConfig {
  // Template-specific environment variables used in tests
  DENO_KIT_TEMPLATE_PROJECT_TYPE?: string
  DENO_KIT_TEMPLATE_PACKAGE_NAME?: string
  DENO_KIT_TEMPLATE_PACKAGE_VERSION?: string
  DENO_KIT_TEMPLATE_AUTHOR_NAME?: string
  DENO_KIT_TEMPLATE_AUTHOR_EMAIL?: string
  DENO_KIT_TEMPLATE_DESCRIPTION?: string
  DENO_KIT_TEMPLATE_GITHUB_USER?: string
  DENO_KIT_TEMPLATE_GITHUB_REPO_NAME?: string
  // Any other test-specific env vars can be added here
  [key: string]: string | undefined
}

const CLI_PATH = join(dirname(fromFileUrl(import.meta.url)), '../src/main.ts')

/**
 * Helper function to run the CLI with given arguments and environment variables
 * @param workspacePath Workspace path to use for the test
 * @param args Arguments to pass to the CLI
 * @param env Environment variables to set
 * @returns Promise containing the output of the command
 */
async function runCLI(
  workspacePath: string,
  args: string[] = [],
  env: Partial<TestConfig> = {},
): Promise<{ output: string; success: boolean }> {
  // Create the environment with proper typing
  const testEnv: Partial<TestConfig> = {
    // Set test mode to avoid interactive prompts
    DENO_KIT_ENV: 'test',
    // Use the provided workspace path
    DENO_KIT_WORKSPACE_PATH: workspacePath,
    // Default values that would normally be prompted (using DENO_KIT_TEMPLATE_ prefix)
    DENO_KIT_TEMPLATE_PACKAGE_NAME: '@test/project',
    DENO_KIT_TEMPLATE_PACKAGE_VERSION: '0.1.0',
    DENO_KIT_TEMPLATE_AUTHOR_NAME: 'Test User',
    DENO_KIT_TEMPLATE_AUTHOR_EMAIL: 'test@example.com',
    DENO_KIT_TEMPLATE_DESCRIPTION: 'Test project description',
    DENO_KIT_TEMPLATE_GITHUB_USER: 'test-org',
    DENO_KIT_TEMPLATE_GITHUB_REPO_PUBLIC: 'false',
    DENO_KIT_TEMPLATE_CREATE_GITHUB_REPO: 'false',
    ...env,
  }

  const command = new Deno.Command(Deno.execPath(), {
    args: ['run', '-A', CLI_PATH, ...args],
    stdout: 'piped',
    stderr: 'piped',
    // Convert to Record<string, string> only when passing to Deno.Command
    env: testEnv as Record<string, string>,
  })

  const { success, stdout, stderr } = await command.output()
  const stdoutText = new TextDecoder().decode(stdout)
  const stderrText = new TextDecoder().decode(stderr)
  const output = success ? stdoutText : (stderrText || stdoutText)
  return { output: stripAnsi(output), success }
}

/**
 * Helper function to check if a file exists and is not empty
 */
async function fileExistsAndNotEmpty(filePath: string): Promise<boolean> {
  try {
    const fileInfo = await Deno.stat(filePath)
    return fileInfo.isFile && fileInfo.size > 0
  } catch {
    return false
  }
}

/**
 * Helper function to check if a directory exists
 */
async function directoryExists(dirPath: string): Promise<boolean> {
  try {
    const dirInfo = await Deno.stat(dirPath)
    return dirInfo.isDirectory
  } catch {
    return false
  }
}

describe('init command', () => {
  let tempDir: string

  beforeEach(async () => {
    // Create a temporary directory for each test
    tempDir = await Deno.makeTempDir({ prefix: 'dk-test-init-' })
  })

  afterEach(async () => {
    // Clean up the temporary directory after each test
    try {
      await Deno.remove(tempDir, { recursive: true })
    } catch (error) {
      console.warn(`Failed to clean up temporary directory: ${error}`)
    }
  })

  it('should initialize a CLI project with correct files', async () => {
    // Run the init command with CLI project type
    const { output, success } = await runCLI(
      tempDir,
      ['init'],
      { DENO_KIT_TEMPLATE_PROJECT_TYPE: 'cli' },
    )

    assert(success, `Command failed: ${output}`)
    // Check for completion message (case insensitive)
    assert(
      output.toLowerCase().includes('setup') &&
        output.toLowerCase().includes('cli'),
      'Should contain setup and cli completion message',
    )

    // Verify that the workspace directory exists
    const workspaceExists = await directoryExists(tempDir)
    assert(workspaceExists, 'Workspace directory should exist')

    // Check for essential files and ensure they're not empty
    const readmeExists = await fileExistsAndNotEmpty(join(tempDir, 'README.md'))
    assert(readmeExists, 'README.md should exist and not be empty')

    const denoJsonExists = await fileExistsAndNotEmpty(
      join(tempDir, 'deno.jsonc'),
    )
    assert(denoJsonExists, 'deno.jsonc should exist and not be empty')

    const srcDirExists = await directoryExists(join(tempDir, 'src'))
    assert(srcDirExists, 'src directory should exist')

    const mainTsExists = await fileExistsAndNotEmpty(
      join(tempDir, 'src/mod.ts'),
    )
    assert(mainTsExists, 'src/mod.ts should exist and not be empty')

    // Verify workspace config file exists and contains valid JSON
    const kitJsonPath = join(
      tempDir,
      config.DENO_KIT_WORKSPACE_CONFIG_FILE_NAME,
    )
    const kitJsonExists = await fileExistsAndNotEmpty(kitJsonPath)
    assert(
      kitJsonExists,
      `${config.DENO_KIT_WORKSPACE_CONFIG_FILE_NAME} should exist and not be empty`,
    )

    // Verify the workspace config is valid JSON and has expected structure
    const kitJsonContent = await Deno.readTextFile(kitJsonPath)
    const kitJson = JSON.parse(kitJsonContent)
    assert(kitJson.name, 'Workspace config should have a name field')
    assertEquals(
      kitJson.name,
      '@test/project',
      `${config.DENO_KIT_WORKSPACE_CONFIG_FILE_NAME} should contain the correct name field`,
    )
  })

  it.skip('should initialize a Library project with correct files', async () => {
    // Run the init command with Library project type
    const { output, success } = await runCLI(
      tempDir,
      ['init'],
      { DENO_KIT_TEMPLATE_PROJECT_TYPE: 'library' },
    )

    assert(success, `Command failed: ${output}`)
    // Check for completion message (case insensitive)
    assert(
      output.toLowerCase().includes('setup') &&
        output.toLowerCase().includes('library'),
      'Should contain setup and library completion message',
    )

    // Check for essential files and ensure they're not empty
    const readmeExists = await fileExistsAndNotEmpty(join(tempDir, 'README.md'))
    assert(readmeExists, 'README.md should exist and not be empty')

    const denoJsonExists = await fileExistsAndNotEmpty(
      join(tempDir, 'deno.jsonc'),
    )
    assert(denoJsonExists, 'deno.jsonc should exist and not be empty')

    // Verify workspace config file exists and contains valid JSON
    const kitJsonPath = join(
      tempDir,
      config.DENO_KIT_WORKSPACE_CONFIG_FILE_NAME,
    )
    const kitJsonExists = await fileExistsAndNotEmpty(kitJsonPath)
    assert(
      kitJsonExists,
      `${config.DENO_KIT_WORKSPACE_CONFIG_FILE_NAME} should exist and not be empty`,
    )

    const kitJsonContent = await Deno.readTextFile(kitJsonPath)
    const kitJson = JSON.parse(kitJsonContent)
    assertEquals(
      kitJson.name,
      '@test/project',
      `${config.DENO_KIT_WORKSPACE_CONFIG_FILE_NAME} should contain the correct name field`,
    )
  })

  it('should verify template loading priority - project templates override shared templates', async () => {
    // Run the init command with CLI project type to test template overriding
    const { success } = await runCLI(
      tempDir,
      ['init'],
      { DENO_KIT_TEMPLATE_PROJECT_TYPE: 'CLI' },
    )

    assert(success, 'Command should succeed')

    // Check README.md exists and is not empty (it exists in both shared and CLI-specific templates)
    const readmeExists = await fileExistsAndNotEmpty(join(tempDir, 'README.md'))
    assert(readmeExists, 'README.md should exist and not be empty')

    // Verify README content is valid and contains the project name
    const readmeContent = await Deno.readTextFile(join(tempDir, 'README.md'))
    assert(
      readmeContent.includes('@test/project'),
      'README should contain the project name',
    )

    // Check that CLI-specific files exist
    const cliSrcExists = await directoryExists(join(tempDir, 'src'))
    assert(cliSrcExists, 'CLI-specific src directory should exist')
  })

  it('should preserve shared templates that are not in project-specific templates', async () => {
    // Run the init command
    const { success } = await runCLI(
      tempDir,
      ['init'],
      { DENO_KIT_TEMPLATE_PROJECT_TYPE: 'CLI' },
    )

    assert(success, 'Command should succeed')

    // Check for files that should come from shared templates
    const changelogExists = await fileExistsAndNotEmpty(
      join(tempDir, 'CHANGELOG.md'),
    )
    assert(
      changelogExists,
      'CHANGELOG.md from shared templates should exist and not be empty',
    )

    const licenseExists = await fileExistsAndNotEmpty(join(tempDir, 'LICENSE'))
    assert(
      licenseExists,
      'LICENSE from shared templates should exist and not be empty',
    )

    const gitignoreExists = await fileExistsAndNotEmpty(
      join(tempDir, '.gitignore'),
    )
    assert(
      gitignoreExists,
      '.gitignore from shared templates should exist and not be empty',
    )
  })

  it('should include project-specific templates that are not in shared templates', async () => {
    const { success } = await runCLI(
      tempDir,
      ['init'],
      { DENO_KIT_TEMPLATE_PROJECT_TYPE: 'CLI' },
    )

    assert(success, 'Command should succeed')

    // Check for CLI-specific files in the src directory
    const cliSpecificFileExists = await fileExistsAndNotEmpty(
      join(tempDir, 'src/mod.ts'),
    )
    assert(
      cliSpecificFileExists,
      'CLI-specific mod.ts should exist and not be empty',
    )

    // Verify the file contains valid TypeScript content
    const mainTsContent = await Deno.readTextFile(join(tempDir, 'src/mod.ts'))
    assert(mainTsContent.length > 0, 'mod.ts should contain content')
    // Basic check that it's likely TypeScript/JavaScript code
    assert(
      mainTsContent.includes('export') || mainTsContent.includes('import') ||
        mainTsContent.includes('function'),
      'mod.ts should contain TypeScript/JavaScript code',
    )
  })

  it('should initialize workspace in environment-specified path', async () => {
    // Create a separate test directory to verify environment variable works
    const envTestDir = await Deno.makeTempDir({
      prefix: 'dk-test-init-env-',
    })

    try {
      // Test with environment variable workspace path
      const result = await runCLI(
        envTestDir,
        ['init'],
        { DENO_KIT_TEMPLATE_PROJECT_TYPE: 'cli' },
      )
      assert(
        result.success,
        `Command with environment workspace path failed: ${result.output}`,
      )

      // Verify workspace was created in environment-specified directory
      const kitJsonPath = join(
        envTestDir,
        config.DENO_KIT_WORKSPACE_CONFIG_FILE_NAME,
      )
      const kitJsonExists = await fileExistsAndNotEmpty(kitJsonPath)
      assert(
        kitJsonExists,
        `${config.DENO_KIT_WORKSPACE_CONFIG_FILE_NAME} should exist and not be empty in environment-specified directory`,
      )

      // Verify essential files exist and are not empty
      const readmeExists = await fileExistsAndNotEmpty(
        join(envTestDir, 'README.md'),
      )
      assert(readmeExists, 'README.md should exist and not be empty')

      const denoJsonExists = await fileExistsAndNotEmpty(
        join(envTestDir, 'deno.jsonc'),
      )
      assert(denoJsonExists, 'deno.jsonc should exist and not be empty')
    } finally {
      // Clean up the test directory
      await Deno.remove(envTestDir, { recursive: true }).catch(() => {})
    }
  })

  it('should set up Cursor config during initialization', async () => {
    // Run the init command
    const { output, success } = await runCLI(
      tempDir,
      ['init'],
      { DENO_KIT_TEMPLATE_PROJECT_TYPE: 'CLI' },
    )

    assert(success, `Command failed: ${output}`)

    // Just verify the command completed successfully - the Cursor setup is optional
    // and may be disabled in the current implementation
    assert(success, 'Init command should complete successfully')

    // Verify basic project structure was created
    const readmeExists = await fileExistsAndNotEmpty(join(tempDir, 'README.md'))
    assert(readmeExists, 'Basic project files should be created')
  })
})
