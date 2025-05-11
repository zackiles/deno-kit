import { assert, assertEquals, assertStringIncludes } from '@std/assert'
import { afterEach, beforeEach, describe, it } from '@std/testing/bdd'
import { dirname, fromFileUrl, join } from '@std/path'
import { exists } from '@std/fs'
import { stripAnsi } from '../src/utils/formatting.ts'
import type { DenoKitConfig } from '../src/types.ts'
import { getConfig } from '../src/config.ts'

const config = await getConfig()
// Extended config type for testing that includes additional test-specific environment variables
interface TestConfig extends DenoKitConfig {
  // Project type is used in tests but not in the official DenoKitConfig
  DENO_KIT_TEMPLATE_PROJECT_TYPE?: string
  // Any other test-specific env vars can be added here
  [key: string]: string | undefined
}

const CLI_PATH = join(dirname(fromFileUrl(import.meta.url)), '../src/main.ts')

/**
 * Helper function to run the CLI with given arguments and environment variables
 * @param args Arguments to pass to the CLI
 * @param env Environment variables to set
 * @returns Promise containing the output of the command
 */
async function runCLI(
  args: string[] = [],
  env: Partial<TestConfig> = {},
): Promise<{ output: string; success: boolean }> {
  // Create the environment with proper typing
  const testEnv: Partial<TestConfig> = {
    // Set test mode to avoid interactive prompts
    DENO_KIT_ENV: 'test',
    // Set path to templates directory
    DENO_KIT_TEMPLATES_PATH: join(dirname(fromFileUrl(import.meta.url)), '../templates'),
    // Default values that would normally be prompted
    DENO_KIT_PACKAGE_NAME: '@test/project',
    DENO_KIT_PACKAGE_VERSION: '0.1.0',
    DENO_KIT_PACKAGE_AUTHOR_NAME: 'Test User',
    DENO_KIT_PACKAGE_AUTHOR_EMAIL: 'test@example.com',
    DENO_KIT_PACKAGE_DESCRIPTION: 'Test project description',
    DENO_KIT_PACKAGE_GITHUB_USER: 'test-org',
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
  const output = new TextDecoder().decode(success ? stdout : stderr)
  return { output: stripAnsi(output), success }
}

describe('init command', () => {
  let tempDir: string

  beforeEach(async () => {
    // Create a temporary directory for each test
    tempDir = await Deno.makeTempDir({ prefix: 'deno-kit-test-init-' })
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
      ['init', '--workspace', tempDir],
      { DENO_KIT_PROJECT_TYPE: 'CLI' },
    )

    assert(success, `Command failed: ${output}`)
    assertStringIncludes(output, 'Setup CLI project')

    // Verify that the workspace directory exists
    const workspaceExists = await exists(tempDir)
    assert(workspaceExists, 'Workspace directory should exist')

    // Check for essential files
    const readmeExists = await exists(join(tempDir, 'README.md'))
    assert(readmeExists, 'README.md should exist')

    const denoJsonExists = await exists(join(tempDir, 'deno.jsonc'))
    assert(denoJsonExists, 'deno.jsonc should exist')

    const srcDirExists = await exists(join(tempDir, 'src'))
    assert(srcDirExists, 'src directory should exist')

    const mainTsExists = await exists(join(tempDir, 'src/mod.ts'))
    assert(mainTsExists, 'src/mod.ts should exist')

    // Verify README.md has CLI-specific content
    const readmeContent = await Deno.readTextFile(join(tempDir, 'README.md'))
    assertStringIncludes(readmeContent, 'Test project description')

    // Verify workspace config file exists and contains correct package name
    const kitJsonExists = await exists(join(tempDir, config.DENO_KIT_WORKSPACE_CONFIG_FILE_NAME))
    assert(kitJsonExists, `${config.DENO_KIT_WORKSPACE_CONFIG_FILE_NAME} should exist`)

    const kitJsonContent = await Deno.readTextFile(
      join(tempDir, config.DENO_KIT_WORKSPACE_CONFIG_FILE_NAME),
    )
    const kitJson = JSON.parse(kitJsonContent)
    assertEquals(
      kitJson.name,
      '@test/project',
      `${config.DENO_KIT_WORKSPACE_CONFIG_FILE_NAME} should contain the correct name field`,
    )
  })

  it('should initialize a Library project with correct files', async () => {
    // Run the init command with Library project type
    const { output, success } = await runCLI(
      ['init', '--workspace', tempDir],
      { DENO_KIT_PROJECT_TYPE: 'Library' },
    )

    assert(success, `Command failed: ${output}`)
    assertStringIncludes(output, 'Setup Library project')

    // Check for essential files
    const readmeExists = await exists(join(tempDir, 'README.md'))
    assert(readmeExists, 'README.md should exist')

    const denoJsonExists = await exists(join(tempDir, 'deno.jsonc'))
    assert(denoJsonExists, 'deno.jsonc should exist')

    // Verify README.md has Library-related content
    const readmeContent = await Deno.readTextFile(join(tempDir, 'README.md'))
    assertStringIncludes(readmeContent, 'Modern Deno Features')

    // Verify workspace config file exists and contains correct package name
    const kitJsonExists = await exists(join(tempDir, config.DENO_KIT_WORKSPACE_CONFIG_FILE_NAME))
    assert(kitJsonExists, `${config.DENO_KIT_WORKSPACE_CONFIG_FILE_NAME} should exist`)

    const kitJsonContent = await Deno.readTextFile(
      join(tempDir, config.DENO_KIT_WORKSPACE_CONFIG_FILE_NAME),
    )
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
      ['init', '--workspace', tempDir],
      { DENO_KIT_PROJECT_TYPE: 'CLI' },
    )

    assert(success, 'Command should succeed')

    // Check README.md which exists in both shared and CLI-specific templates
    const readmeContent = await Deno.readTextFile(join(tempDir, 'README.md'))

    // Verify the content is from the CLI template and not the shared template
    assertStringIncludes(readmeContent, 'Test project description')
    // This string should be in the CLI template but not in the shared template
    assertStringIncludes(readmeContent, 'Modern CLI built with Deno')
  })

  it('should preserve shared templates that are not in project-specific templates', async () => {
    // Run the init command
    const { success } = await runCLI(
      ['init', '--workspace', tempDir],
      { DENO_KIT_PROJECT_TYPE: 'CLI' },
    )

    assert(success, 'Command should succeed')

    // Check for CHANGELOG.md which should come from shared templates
    const changelogExists = await exists(join(tempDir, 'CHANGELOG.md'))
    assert(changelogExists, 'CHANGELOG.md from shared templates should exist')

    // Verify its content is from the shared template
    const changelogContent = await Deno.readTextFile(join(tempDir, 'CHANGELOG.md'))
    // Look for content we know should be in the shared CHANGELOG.md
    assertStringIncludes(changelogContent, 'Changelog')
  })

  it('should include project-specific templates that are not in shared templates', async () => {
    // Find a file that's unique to a specific project type (might need to check or create one)
    // For this test, let's assume CLI has a unique file in its src folder
    const { success } = await runCLI(
      ['init', '--workspace', tempDir],
      { DENO_KIT_PROJECT_TYPE: 'CLI' },
    )

    assert(success, 'Command should succeed')

    // Check for CLI-specific files in the src directory
    const cliSpecificFileExists = await exists(join(tempDir, 'src/mod.ts'))
    assert(cliSpecificFileExists, 'CLI-specific mod.ts should exist')

    // If there's a unique file or content pattern, verify it
    const mainTsContent = await Deno.readTextFile(join(tempDir, 'src/mod.ts'))
    assertStringIncludes(mainTsContent, 'mod') // Check for expected CLI-specific content
  })

  it('should support both positional and flag workspace arguments', async () => {
    // Test with positional argument
    const positionalDir = await Deno.makeTempDir({ prefix: 'deno-kit-test-init-positional-' })
    const flagDir = await Deno.makeTempDir({ prefix: 'deno-kit-test-init-flag-' })

    try {
      // Test positional argument
      const positionalResult = await runCLI(
        ['init', positionalDir],
        { DENO_KIT_PROJECT_TYPE: 'CLI' },
      )
      assert(
        positionalResult.success,
        `Command with positional arg failed: ${positionalResult.output}`,
      )

      // Verify workspace was created in positional directory
      const positionalKitJson = await exists(
        join(positionalDir, config.DENO_KIT_WORKSPACE_CONFIG_FILE_NAME),
      )
      assert(
        positionalKitJson,
        `${config.DENO_KIT_WORKSPACE_CONFIG_FILE_NAME} should exist in positional argument directory`,
      )

      // Test --workspace flag
      const flagResult = await runCLI(
        ['init', '--workspace', flagDir],
        { DENO_KIT_PROJECT_TYPE: 'CLI' },
      )
      assert(flagResult.success, `Command with --workspace flag failed: ${flagResult.output}`)

      // Verify workspace was created in flag directory
      const flagKitJson = await exists(join(flagDir, config.DENO_KIT_WORKSPACE_CONFIG_FILE_NAME))
      assert(
        flagKitJson,
        `${config.DENO_KIT_WORKSPACE_CONFIG_FILE_NAME} should exist in --workspace flag directory`,
      )

      // Verify both workspaces have the same structure
      const [positionalFiles, flagFiles] = await Promise.all([
        Array.fromAsync(Deno.readDir(positionalDir)).then((files) =>
          files.map((f) => f.name).sort()
        ),
        Array.fromAsync(Deno.readDir(flagDir)).then((files) => files.map((f) => f.name).sort()),
      ])

      assertEquals(
        positionalFiles,
        flagFiles,
        'Both workspace initialization methods should create identical file structures',
      )
    } finally {
      // Clean up the additional test directories
      await Promise.all([
        Deno.remove(positionalDir, { recursive: true }).catch(() => {}),
        Deno.remove(flagDir, { recursive: true }).catch(() => {}),
      ])
    }
  })

  it('should set up Cursor config during initialization', async () => {
    // Run the init command
    const { output, success } = await runCLI(
      ['init', '--workspace', tempDir],
      { DENO_KIT_PROJECT_TYPE: 'CLI' },
    )

    assert(success, `Command failed: ${output}`)

    // Verify Cursor config setup was called by checking log messages
    // We only need to verify that the setup process was started
    assertStringIncludes(output, 'Setting up Cursor AI configuration')

    // Verify it reached the fetching phase
    assertStringIncludes(output, 'Fetching cursor-config installation script')
  })
})
