import { assertEquals, assertExists, assertFalse } from '@std/assert'
import { dirname, join } from '@std/path'
import { TEMPLATE_MAPPINGS } from '../src/commands/setup.ts'

// Dynamically generate expected files from TEMPLATE_MAPPINGS
// This way the test automatically updates when new templates are added
async function getExpectedFiles(): Promise<string[]> {
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
  // Create a temporary directory for testing
  const tempDir = await Deno.makeTempDir({ prefix: 'deno-kit-test-' })
  const originalCwd = Deno.cwd()

  try {
    // Store original environment variables
    const originalEnv = { ...Deno.env.toObject() }

    // Set environment variables for automated responses
    Deno.env.set('DENO_KIT_TEST_MODE', 'true')
    Deno.env.set('DENO_KIT_PACKAGE_NAME', '@test/example')
    Deno.env.set('DENO_KIT_VERSION', '0.0.2')
    Deno.env.set('DENO_KIT_AUTHOR_NAME', 'Test Author')
    Deno.env.set('DENO_KIT_AUTHOR_EMAIL', 'test@example.com')
    Deno.env.set('DENO_KIT_DESCRIPTION', 'A test package')
    Deno.env.set('DENO_KIT_GITHUB_USER', 'testorg')
    Deno.env.set('DENO_KIT_WORKSPACE', tempDir)

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
      for (const file of await getExpectedFiles()) {
        const filePath = join(tempDir, file)

        // Verify directory structure
        const fileDir = dirname(filePath)
        const dirInfo = await Deno.stat(fileDir)
        assertExists(dirInfo, `Directory ${fileDir} should exist`)
        assertEquals(
          dirInfo.isDirectory,
          true,
          `${fileDir} should be a directory`,
        )

        const fileInfo = await Deno.stat(filePath)
        assertExists(fileInfo, `File ${file} should exist`)
        assertEquals(fileInfo.isFile, true, `${file} should be a file`)

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
      // Restore original environment
      for (const key of Object.keys(Deno.env.toObject())) {
        if (!originalEnv[key]) {
          Deno.env.delete(key)
        } else {
          Deno.env.set(key, originalEnv[key])
        }
      }
    }
  } finally {
    // Clean up: remove temporary directory
    await Deno.remove(tempDir, { recursive: true })
  }
}

Deno.test('setup command creates all template files (using workspace flag)', async () => {
  await runTestScenario(true)
})

Deno.test('setup command creates all template files (changing directory)', async () => {
  await runTestScenario(false)
})
