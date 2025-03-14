import { assertEquals, assertExists, assertFalse } from '@std/assert'
import { join } from '@std/path'
import {
  createTempDir,
  getExpectedFiles,
  restoreEnv,
  setupTestEnv,
} from './test-utils.ts'

// List of template variables that should be replaced
const TEMPLATE_VARIABLES = [
  'PACKAGE_NAME',
  'PACKAGE_SCOPE',
  'PACKAGE_VERSION',
  'PACKAGE_AUTHOR_NAME',
  'PACKAGE_AUTHOR_EMAIL',
  'PACKAGE_DESCRIPTION',
  'PACKAGE_GITHUB_USER',
  'YEAR',
  'PROJECT_NAME',
]

/**
 * Run the test scenario with either the workspace flag or by changing directory
 */
async function runTestScenario(useWorkspaceFlag: boolean) {
  const tempDir = await createTempDir()
  const originalCwd = Deno.cwd()
  const originalEnv = setupTestEnv(tempDir)

  try {
    // If not using workspace flag, change to the temporary directory
    if (!useWorkspaceFlag) {
      Deno.chdir(tempDir)
    }

    // Create a subprocess to run the setup command
    const command = new Deno.Command(Deno.execPath(), {
      args: [
        'run',
        '--allow-all',
        join(originalCwd, 'src', 'main.ts'),
        'setup',
        ...(useWorkspaceFlag ? ['--workspace', tempDir] : []),
      ],
      env: Deno.env.toObject(),
    })

    const { code } = await command.output()
    assertEquals(code, 0, 'Setup command should exit with code 0')

    // Verify each expected file exists and check its contents
    const expectedFiles = await getExpectedFiles()
    for (const file of expectedFiles) {
      const filePath = join(tempDir, file)

      // Verify file exists
      const fileInfo = await Deno.stat(filePath)
      assertExists(fileInfo, `File ${file} should exist`)

      // Read the file content
      const content = await Deno.readTextFile(filePath)

      // Check for any remaining template variables
      for (const variable of TEMPLATE_VARIABLES) {
        const templatePattern = new RegExp(`{${variable}}`, 'g')
        assertFalse(
          templatePattern.test(content),
          `Template variable {${variable}} was not replaced in ${file}`,
        )
      }
    }
  } finally {
    // If we changed directory, change back
    if (!useWorkspaceFlag) {
      Deno.chdir(originalCwd)
    }

    restoreEnv(originalEnv)

    // Clean up: remove temporary directory
    await Deno.remove(tempDir, { recursive: true }).catch((e) =>
      console.error(
        `Cleanup error: ${e instanceof Error ? e.message : String(e)}`,
      )
    )
  }
}

Deno.test('setup command creates all template files (using workspace flag)', async () => {
  await runTestScenario(true)
})

Deno.test('setup command creates all template files (changing directory)', async () => {
  await runTestScenario(false)
})
