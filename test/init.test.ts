import { assertStringIncludes, assert, assertEquals } from '@std/assert'
import { describe, it, beforeEach, afterEach } from '@std/testing/bdd'
import { dirname, fromFileUrl, join } from '@std/path'
import { stripAnsiCode } from '@std/fmt/colors'
import { exists } from '@std/fs'

const CLI_PATH = join(dirname(fromFileUrl(import.meta.url)), '../src/main.ts')

/**
 * Helper function to run the CLI with given arguments and environment variables
 * @param args Arguments to pass to the CLI
 * @param env Environment variables to set
 * @returns Promise containing the output of the command
 */
async function runCLI(
  args: string[] = [],
  env: Record<string, string> = {}
): Promise<{ output: string; success: boolean }> {
  const command = new Deno.Command(Deno.execPath(), {
    args: ['run', '--allow-read', '--allow-write', '--allow-env', '--allow-run', CLI_PATH, ...args],
    stdout: 'piped',
    stderr: 'piped',
    env: {
      // Set test mode to avoid interactive prompts
      DENO_KIT_ENV: 'test',
      // Default values that would normally be prompted
      DENO_KIT_PACKAGE_NAME: '@test/project',
      DENO_KIT_PACKAGE_VERSION: '0.1.0',
      DENO_KIT_PACKAGE_AUTHOR_NAME: 'Test User',
      DENO_KIT_PACKAGE_AUTHOR_EMAIL: 'test@example.com',
      DENO_KIT_PACKAGE_DESCRIPTION: 'Test project description',
      DENO_KIT_PACKAGE_GITHUB_USER: 'test-org',
      ...env,
    },
  })

  const { success, stdout, stderr } = await command.output()
  const output = new TextDecoder().decode(success ? stdout : stderr)
  return { output: stripAnsiCode(output), success }
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
      { DENO_KIT_PROJECT_TYPE: 'CLI' }
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

    const mainTsExists = await exists(join(tempDir, 'src/main.ts'))
    assert(mainTsExists, 'src/main.ts should exist')

    // Verify README.md has CLI-specific content
    const readmeContent = await Deno.readTextFile(join(tempDir, 'README.md'))
    assertStringIncludes(readmeContent, 'A CLI application built with Deno')

    // Verify kit.json exists and contains correct package name
    const kitJsonExists = await exists(join(tempDir, 'kit.json'))
    assert(kitJsonExists, 'kit.json should exist')

    const kitJsonContent = await Deno.readTextFile(join(tempDir, 'kit.json'))
    const kitJson = JSON.parse(kitJsonContent)
    assertEquals(kitJson.name, '@test/project', 'kit.json should contain the correct name field')
  })

  it('should initialize a Library project with correct files', async () => {
    // Run the init command with Library project type
    const { output, success } = await runCLI(
      ['init', '--workspace', tempDir],
      { DENO_KIT_PROJECT_TYPE: 'Library' }
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

    // Verify kit.json exists and contains correct package name
    const kitJsonExists = await exists(join(tempDir, 'kit.json'))
    assert(kitJsonExists, 'kit.json should exist')

    const kitJsonContent = await Deno.readTextFile(join(tempDir, 'kit.json'))
    const kitJson = JSON.parse(kitJsonContent)
    assertEquals(kitJson.name, '@test/project', 'kit.json should contain the correct name field')
  })

  it('should verify template loading priority - project templates override shared templates', async () => {
    // Run the init command with CLI project type to test template overriding
    const { success } = await runCLI(
      ['init', '--workspace', tempDir],
      { DENO_KIT_PROJECT_TYPE: 'CLI' }
    )

    assert(success, 'Command should succeed')

    // Check README.md which exists in both shared and CLI-specific templates
    const readmeContent = await Deno.readTextFile(join(tempDir, 'README.md'))

    // Verify the content is from the CLI template and not the shared template
    assertStringIncludes(readmeContent, 'A CLI application built with Deno')
    // This string should be in the CLI template but not in the shared template
    assertStringIncludes(readmeContent, 'Modern CLI built with Deno')
  })

  it('should preserve shared templates that are not in project-specific templates', async () => {
    // Run the init command
    const { success } = await runCLI(
      ['init', '--workspace', tempDir],
      { DENO_KIT_PROJECT_TYPE: 'CLI' }
    )

    assert(success, 'Command should succeed')

    // Check for CONTRIBUTING.md which should come from shared templates
    const contributingExists = await exists(join(tempDir, 'CONTRIBUTING.md'))
    assert(contributingExists, 'CONTRIBUTING.md from shared templates should exist')

    // Verify its content is from the shared template
    const contributingContent = await Deno.readTextFile(join(tempDir, 'CONTRIBUTING.md'))
    // Look for content we know should be in the shared CONTRIBUTING.md
    assertStringIncludes(contributingContent, 'Contributing to')
  })

  it('should include project-specific templates that are not in shared templates', async () => {
    // Find a file that's unique to a specific project type (might need to check or create one)
    // For this test, let's assume CLI has a unique file in its src folder
    const { success } = await runCLI(
      ['init', '--workspace', tempDir],
      { DENO_KIT_PROJECT_TYPE: 'CLI' }
    )

    assert(success, 'Command should succeed')

    // Check for CLI-specific files in the src directory
    const cliSpecificFileExists = await exists(join(tempDir, 'src/main.ts'))
    assert(cliSpecificFileExists, 'CLI-specific main.ts should exist')

    // If there's a unique file or content pattern, verify it
    const mainTsContent = await Deno.readTextFile(join(tempDir, 'src/main.ts'))
    assertStringIncludes(mainTsContent, 'main') // Check for expected CLI-specific content
  })
})
