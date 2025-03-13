import { assertEquals, assertExists } from '@std/assert'
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

/**
 * Run the test scenario with either the workspace flag or by changing directory
 */
async function runTestScenario(useWorkspaceFlag: boolean) {
  // Create a temporary directory for testing
  const tempDir = await Deno.makeTempDir({ prefix: 'deno-kit-test-' })
  const originalCwd = Deno.cwd()

  try {
    // Create the .deno-kit/backups directory structure in the temp directory
    const backupsDir = join(tempDir, '.deno-kit', 'backups')
    await Deno.mkdir(backupsDir, { recursive: true })

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

    try {
      // Create original files with known content
      for (const file of await getExpectedFiles()) {
        const filePath = join(tempDir, file)
        await Deno.mkdir(
          join(tempDir, file.split('/').slice(0, -1).join('/')),
          { recursive: true },
        )
        // For deno.jsonc, create a valid JSON file
        const content = file === 'deno.jsonc'
          ? JSON.stringify({ name: 'test-project' }, null, 2)
          : `Original content for ${file}`
        await Deno.writeTextFile(filePath, content)
      }

      // Store original file contents for later comparison
      const originalContents = new Map<string, string>()
      for (const file of await getExpectedFiles()) {
        const filePath = join(tempDir, file)
        originalContents.set(file, await Deno.readTextFile(filePath))
      }

      // If not using workspace flag, change to the temporary directory
      if (!useWorkspaceFlag) {
        Deno.chdir(tempDir)
      }

      // Run setup command which should create backups and new files from templates
      const setupCommand = new Deno.Command(Deno.execPath(), {
        args: [
          'run',
          '--allow-all',
          join(originalCwd, 'src', 'main.ts'),
          'setup',
          ...(useWorkspaceFlag ? ['--workspace', tempDir] : []),
        ],
        env: Deno.env.toObject(),
      })

      const setupResult = await setupCommand.output()
      assertEquals(
        setupResult.code,
        0,
        'Setup command should exit with code 0',
      )

      // Verify backups were created and contain original content
      for (const file of await getExpectedFiles()) {
        // Verify backup directory structure
        const backupPath = join(backupsDir, `${file}.backup`)
        const backupDir = dirname(backupPath)
        const backupDirInfo = await Deno.stat(backupDir)
        assertExists(backupDirInfo, `Directory ${backupDir} should exist`)
        assertEquals(
          backupDirInfo.isDirectory,
          true,
          `${backupDir} should be a directory`,
        )

        const backupInfo = await Deno.stat(backupPath)
        assertExists(backupInfo, `Backup file for ${file} should exist`)
        assertEquals(backupInfo.isFile, true, `${backupPath} should be a file`)

        // Verify backup content matches original
        const backupContent = await Deno.readTextFile(backupPath)
        assertEquals(
          backupContent,
          originalContents.get(file),
          `Backup content should match original for ${file}`,
        )

        // Verify the file was replaced with template content and is in the correct directory
        const currentPath = join(tempDir, file)
        const currentDir = dirname(currentPath)
        const currentDirInfo = await Deno.stat(currentDir)
        assertExists(currentDirInfo, `Directory ${currentDir} should exist`)
        assertEquals(
          currentDirInfo.isDirectory,
          true,
          `${currentDir} should be a directory`,
        )

        const currentInfo = await Deno.stat(currentPath)
        assertExists(currentInfo, `File ${file} should exist after setup`)
        assertEquals(
          currentInfo.isFile,
          true,
          `${currentPath} should be a file`,
        )

        const currentContent = await Deno.readTextFile(currentPath)
        // Content should be different from original since it's from template
        if (currentContent === originalContents.get(file)) {
          throw new Error(
            `File ${file} should have been replaced with template content`,
          )
        }
      }

      // Run reset command which should restore original files
      const resetCommand = new Deno.Command(Deno.execPath(), {
        args: [
          'run',
          '--allow-all',
          join(originalCwd, 'src', 'main.ts'),
          'reset',
          ...(useWorkspaceFlag ? ['--workspace', tempDir] : []),
        ],
        env: Deno.env.toObject(),
      })

      const resetResult = await resetCommand.output()
      assertEquals(
        resetResult.code,
        0,
        'Reset command should exit with code 0',
      )

      // Verify files were restored to their original content
      for (const file of await getExpectedFiles()) {
        const filePath = join(tempDir, file)
        const restoredContent = await Deno.readTextFile(filePath)
        assertEquals(
          restoredContent,
          originalContents.get(file),
          `File ${file} should be restored to original content`,
        )
      }

      // Verify backup files were removed after reset
      for (const file of await getExpectedFiles()) {
        const backupPath = join(backupsDir, `${file}.backup`)
        try {
          await Deno.stat(backupPath)
          throw new Error(`Backup file ${backupPath} should have been removed`)
        } catch (error) {
          assertEquals(
            error instanceof Deno.errors.NotFound,
            true,
            `Backup file ${backupPath} should not exist after reset`,
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

Deno.test('reset command restores original files from backups (using workspace flag)', async () => {
  await runTestScenario(true)
})

Deno.test('reset command restores original files from backups (changing directory)', async () => {
  await runTestScenario(false)
})
